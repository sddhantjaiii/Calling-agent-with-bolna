import { Request, Response } from 'express';
import { webhookService } from '../services/webhookService';
import { logger } from '../utils/logger';
import * as Sentry from '@sentry/node';
import { sanitizeMetadata } from '../utils/sentryHelpers';
import * as fs from 'fs';
import * as path from 'path';

export class WebhookController {
  /**
   * UNIFIED WEBHOOK HANDLER
   * Handles ALL webhook stages from Bolna.ai in a single endpoint
   * 
   * Stages (determined by payload.status):
   * 1. initiated - Call started
   * 2. ringing - Phone ringing
   * 3. in-progress - Call answered
   * 4. call-disconnected - Call ended, TRANSCRIPT AVAILABLE
   * 5. completed - Processing complete, RECORDING URL AVAILABLE
   * 
   * Failed states: busy, no-answer
   * 
   * Design: Optimized for high throughput (many webhooks/second)
   */
  async handleWebhook(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    const requestId = (req as any).requestId;
    
    // Save payload for debugging (useful for analyzing production webhooks)
    const payload = req.body;
    this.saveDebugPayload(req);

    // Start Sentry span for webhook processing
    return await Sentry.startSpan(
      {
        op: 'webhook.process',
        name: 'Process Bolna Webhook',
        attributes: {
          request_id: requestId,
          status: payload?.status || 'unknown',
          execution_id: payload?.id || payload?.execution_id
        }
      },
      async () => {
        try {
          // Quick validation
          if (!payload) {
            logger.error('❌ Empty payload received', { request_id: requestId });
            
            Sentry.captureMessage('Webhook received with empty payload', {
              level: 'error',
              tags: {
                error_type: 'empty_webhook_payload',
                request_id: requestId
              }
            });
            
            res.status(400).json({
              success: false,
              error: 'Empty payload',
              request_id: requestId
            });
            return;
          }

          // Extract status to determine webhook stage
          const status = payload.status || 'unknown';
          const executionId = payload.id || payload.execution_id;
          const agentId = payload.agent_id;

          // Add context to Sentry (sanitize payload to remove PII)
          Sentry.setContext('webhook_details', {
            status,
            execution_id: executionId,
            agent_id: agentId,
            request_id: requestId,
            has_transcript: !!payload.transcript,
            has_recording: !!payload.telephony_data?.recording_url,
            // Sanitize payload before sending to Sentry (removes PII fields)
            sanitized_payload: sanitizeMetadata(payload)
          });

          logger.info('📥 Webhook received', {
            request_id: requestId,
            status,
            execution_id: executionId,
            agent_id: agentId,
            has_transcript: !!payload.transcript,
            has_recording: !!payload.telephony_data?.recording_url
          });

          Sentry.addBreadcrumb({
            category: 'webhook',
            message: `Webhook received: ${status}`,
            level: 'info',
            data: {
              status,
              execution_id: executionId,
              has_transcript: !!payload.transcript
            }
          });

          // Validate required fields
          if (!executionId) {
            logger.error('❌ Missing execution_id', { request_id: requestId, payload });
            
            Sentry.captureException(new Error('Webhook missing execution_id'), {
              tags: {
                error_type: 'missing_execution_id',
                request_id: requestId,
                webhook_status: status
              },
              contexts: {
                webhook_payload: {
                  status,
                  agent_id: agentId,
                  has_id: !!payload.id,
                  has_execution_id: !!payload.execution_id,
                  // Sanitize full payload before sending to Sentry
                  sanitized_payload: sanitizeMetadata(payload)
                }
              }
            });
            
            res.status(400).json({
              success: false,
              error: 'Missing execution_id or id field',
              request_id: requestId
            });
            return;
          }

          // Process webhook based on status
          await webhookService.processWebhook(payload, status);

          const processingTime = Date.now() - startTime;
          logger.info('✅ Webhook processed successfully', {
            request_id: requestId,
            status,
            execution_id: executionId,
            processing_time_ms: processingTime
          });

          Sentry.addBreadcrumb({
            category: 'webhook',
            message: 'Webhook processed successfully',
            level: 'info',
            data: {
              processing_time_ms: processingTime,
              status
            }
          });

          // Return fast response (don't block)
          res.status(200).json({
            success: true,
            message: `Webhook processed (${status})`,
            processing_time_ms: processingTime,
            request_id: requestId
          });

        } catch (error) {
          const processingTime = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          
          logger.error('❌ Webhook processing failed', {
            request_id: requestId,
            error: errorMessage,
            execution_id: payload?.id || payload?.execution_id,
            status: payload?.status,
            processing_time_ms: processingTime,
            stack: error instanceof Error ? error.stack : undefined
          });

          // Capture webhook processing error with full context
          Sentry.captureException(error, {
            tags: {
              error_type: 'webhook_processing_failed',
              request_id: requestId,
              webhook_status: payload?.status || 'unknown',
              severity: 'high'
            },
            contexts: {
              webhook_details: {
                execution_id: payload?.id || payload?.execution_id,
                agent_id: payload?.agent_id,
                status: payload?.status,
                processing_time_ms: processingTime,
                has_transcript: !!payload?.transcript,
                has_recording: !!payload?.telephony_data?.recording_url,
                // Sanitize payload before sending to Sentry (removes PII)
                sanitized_payload: sanitizeMetadata(payload)
              },
              error_details: {
                message: errorMessage,
                name: error instanceof Error ? error.name : 'Unknown'
              }
            }
          });

          // Still return 200 to prevent retries (log error but don't fail webhook)
          res.status(200).json({
            success: false,
            error: errorMessage,
            processing_time_ms: processingTime,
            request_id: requestId
          });
        }
      }
    );
  }

  /**
   * Health check endpoint
   */
  async handleHealthCheck(req: Request, res: Response): Promise<void> {
    res.status(200).json({
      status: 'healthy',
      service: 'webhook',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Save debug payload to file system for analysis
   * Useful for debugging production webhooks
   */
  private saveDebugPayload(req: Request): void {
    try {
      const payload = req.body;
      const executionId = payload?.id || payload?.execution_id || 'unknown';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const debugFileName = `webhook_${executionId}_${timestamp}.json`;
      
      // Create debug directory
      const debugDir = path.join(process.cwd(), '..', 'debug');
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }
      
      const debugPath = path.join(debugDir, debugFileName);
      const debugData = {
        ...payload,
        __meta: {
          timestamp: new Date().toISOString(),
          request_id: (req as any).requestId,
          path: req.path,
          method: req.method,
          ip: req.ip
        }
      };
      
      fs.writeFileSync(debugPath, JSON.stringify(debugData, null, 2), 'utf8');
      logger.debug('📁 Debug payload saved', { path: debugPath });
    } catch (error) {
      // Don't fail webhook if debug saving fails
      logger.warn('⚠️  Failed to save debug payload', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }
}

export const webhookController = new WebhookController();
