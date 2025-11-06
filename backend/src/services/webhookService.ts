import Call from '../models/Call';
import Agent from '../models/Agent';
import Transcript from '../models/Transcript';
import CallQueue from '../models/CallQueue';
import { BillingService } from './billingService';
import { ContactAutoCreationService } from './contactAutoCreationService';
import { openaiExtractionService } from './openaiExtractionService';
import { leadAnalyticsService } from './leadAnalyticsService';
import { userService } from './userService';
import { concurrencyManager } from './ConcurrencyManager';
import { notificationService } from './notificationService';
import { BolnaWebhookPayload } from '../types/webhook';
import { logger } from '../utils/logger';
import database from '../config/database';
import * as Sentry from '@sentry/node';

/**
 * Clean Webhook Service for Bolna.ai Integration
 * 
 * Handles all 5 webhook stages through a single unified method
 * Optimized for high throughput (no signature validation, no rate limiting)
 * 
 * Webhook Stages:
 * 1. initiated - Call started
 * 2. ringing - Phone ringing
 * 3. in-progress - Call answered
 * 4. call-disconnected - Call ended, TRANSCRIPT AVAILABLE
 * 5. completed - Processing complete, RECORDING URL AVAILABLE
 */

/**
 * Normalize phone number format to [ISD code] [space] [rest of the number]
 */
function normalizePhoneNumber(phoneNumber: string): string {
  const cleaned = phoneNumber.replace(/[^\d+]/g, '');
  const digitsOnly = cleaned.replace(/^\+/, '');
  
  if (digitsOnly.length < 10) {
    throw new Error('Invalid phone number format');
  }
  
  const mainNumber = digitsOnly.slice(-10);
  const isdCode = digitsOnly.slice(0, -10) || '91';
  
  return `+${isdCode} ${mainNumber}`;
}

/**
 * Parse transcript string into speaker segments
 * Format: "speaker: message\nspeaker: message"
 */
function parseTranscriptToSegments(transcript: string): any[] {
  if (!transcript) return [];
  
  const segments: any[] = [];
  const lines = transcript.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    const match = line.match(/^(assistant|user):\s*(.+)$/i);
    if (match) {
      const speaker = match[1].toLowerCase() === 'assistant' ? 'agent' : 'user';
      const text = match[2].trim();
      segments.push({
        speaker,
        text,
        timestamp: Date.now()
      });
    }
  }
  
  return segments;
}

class WebhookService {
  private billingService: BillingService;
  private contactService: ContactAutoCreationService;

  constructor() {
    this.billingService = new BillingService();
    this.contactService = new ContactAutoCreationService();
  }

  /**
   * UNIFIED WEBHOOK PROCESSOR
   * Handles all webhook stages based on status field
   */
  async processWebhook(payload: BolnaWebhookPayload, status: string): Promise<void> {
    const executionId = payload.id || payload.execution_id;
    
    logger.info('🔄 Processing webhook', {
      execution_id: executionId,
      status,
      agent_id: payload.agent_id
    });

    try {
      switch (status) {
        case 'initiated':
          await this.handleInitiated(payload);
          break;
        
        case 'ringing':
          await this.handleRinging(payload);
          break;
        
        case 'in-progress':
          await this.handleInProgress(payload);
          break;
        
        case 'call-disconnected':
          await this.handleCallDisconnected(payload);
          break;
        
        case 'completed':
          await this.handleCompleted(payload);
          break;
        
        case 'busy':
        case 'no-answer':
          await this.handleFailed(payload, status);
          break;
        
        default:
          logger.warn('⚠️  Unknown webhook status', { status, execution_id: executionId });
      }
    } catch (error) {
      logger.error('❌ Webhook processing error', {
        execution_id: executionId,
        status,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Capture webhook processing failure in Sentry
      Sentry.captureException(error, {
        level: 'error',
        tags: {
          error_type: 'webhook_processing_failed',
          execution_id: executionId,
          webhook_status: status,
          severity: 'critical'
        },
        contexts: {
          webhook_processing: {
            execution_id: executionId,
            status: status,
            agent_id: payload.agent_id,
            operation: 'process_webhook'
          }
        }
      });
      
      throw error;
    }
  }

  /**
   * Stage 1: Call Initiated
   * Create initial call record
   */
  private async handleInitiated(payload: BolnaWebhookPayload): Promise<void> {
    const executionId = payload.id;
    const agentId = payload.agent_id;
    
    logger.info('1️⃣ Handling initiated event', { execution_id: executionId });

    // Find agent
    const agent = await Agent.findByBolnaId(agentId);
    if (!agent) {
      throw new Error(`Agent not found for Bolna ID: ${agentId}`);
    }

    // Check if call already exists
    const existingCall = await Call.findByExecutionId(executionId);
    if (existingCall) {
      logger.info('Call already exists, updating status', { execution_id: executionId });
      await Call.updateByExecutionId(executionId, {
        call_lifecycle_status: 'initiated'
      });
      return;
    }

    // Get phone number from context_details or telephony_data
    const phoneNumber = payload.context_details?.recipient_phone_number || 
                       payload.telephony_data?.to_number;
    
    if (!phoneNumber) {
      throw new Error('Phone number not found in payload');
    }

    // Create call record
    await Call.create({
      agent_id: agent.id,
      user_id: agent.user_id,
      bolna_conversation_id: executionId,
      bolna_execution_id: executionId,
      phone_number: normalizePhoneNumber(phoneNumber),
      call_source: 'phone',
      status: 'in_progress',
      call_lifecycle_status: 'initiated',
      lead_type: payload.telephony_data?.call_type || 'outbound',
      duration_seconds: 0,
      duration_minutes: 0,
      credits_used: 0,
      metadata: {
        initiated_at: new Date().toISOString(),
        provider: payload.telephony_data?.provider || payload.provider
      }
    });

    logger.info('✅ Call record created', { execution_id: executionId });
  }

  /**
   * Stage 2: Ringing
   * Update lifecycle status
   */
  private async handleRinging(payload: BolnaWebhookPayload): Promise<void> {
    const executionId = payload.id;
    
    logger.info('2️⃣ Handling ringing event', { execution_id: executionId });

    await Call.updateByExecutionId(executionId, {
      call_lifecycle_status: 'ringing',
      ringing_started_at: new Date()
    });

    logger.info('✅ Ringing status updated', { execution_id: executionId });
  }

  /**
   * Stage 3: In Progress
   * Call answered
   */
  private async handleInProgress(payload: BolnaWebhookPayload): Promise<void> {
    const executionId = payload.id;
    
    logger.info('3️⃣ Handling in-progress event', { execution_id: executionId });

    await Call.updateByExecutionId(executionId, {
      call_lifecycle_status: 'in-progress',
      call_answered_at: new Date()
    });

    logger.info('✅ In-progress status updated', { execution_id: executionId });
  }

  /**
   * Stage 4: Call Disconnected
   * ✅ TRANSCRIPT IS AVAILABLE HERE
   * Save transcript to transcripts table and link to call
   */
  private async handleCallDisconnected(payload: BolnaWebhookPayload): Promise<void> {
    const executionId = payload.id;
    
    logger.info('4️⃣ Handling call-disconnected event', { 
      execution_id: executionId,
      has_transcript: !!payload.transcript
    });

    // Get call record
    const call = await Call.findByExecutionId(executionId);
    if (!call) {
      logger.warn('Call not found, skipping transcript save', { execution_id: executionId });
      return;
    }

    const updateData: any = {
      status: 'completed', // Set final call status
      call_lifecycle_status: 'call-disconnected',
      call_disconnected_at: new Date(),
      duration_seconds: Math.floor(payload.conversation_duration || 0) // Convert float to integer
    };

    // Save hangup information
    if (payload.telephony_data) {
      updateData.hangup_by = payload.telephony_data.hangup_by;
      updateData.hangup_reason = payload.telephony_data.hangup_reason;
      updateData.hangup_provider_code = payload.telephony_data.hangup_provider_code;
    }

    // ✅ SAVE TRANSCRIPT - This is the first webhook where transcript appears
    if (payload.transcript) {
      logger.info('💾 Saving transcript', { 
        execution_id: executionId,
        transcript_length: payload.transcript.length 
      });

      try {
        // Parse transcript into segments
        const segments = parseTranscriptToSegments(payload.transcript);
        
        // Create transcript record
        const transcriptRecord = await Transcript.createTranscript({
          call_id: call.id,
          content: payload.transcript,
          speaker_segments: segments
        });

        // Link transcript to call
        updateData.transcript_id = transcriptRecord.id;
        
        logger.info('✅ Transcript saved', { 
          execution_id: executionId,
          transcript_id: transcriptRecord.id,
          segments_count: segments.length
        });
      } catch (error) {
        logger.error('❌ Failed to save transcript', {
          execution_id: executionId,
          error: error instanceof Error ? error.message : String(error)
        });
        
        // Capture transcript save failure in Sentry (critical - data loss)
        Sentry.captureException(error, {
          level: 'error',
          tags: {
            error_type: 'transcript_save_failed',
            execution_id: executionId,
            severity: 'high',
            data_loss: 'true'
          },
          contexts: {
            transcript_details: {
              execution_id: executionId,
              transcript_length: payload.transcript?.length || 0,
              has_transcript_data: !!payload.transcript,
              operation: 'save_transcript'
            }
          }
        });
        
        // Don't fail webhook if transcript save fails
      }
    }

    // Critical database update - wrap both call and queue updates in transaction to prevent race conditions
    try {
      await database.transaction(async (client) => {
        // Update call record with all disconnect data
        await client.query(`
          UPDATE calls 
          SET 
            status = $1,
            duration_seconds = $2,
            recording_url = $3,
            hangup_by = $4,
            hangup_reason = $5,
            hangup_provider_code = $6,
            transcript_id = $7,
            updated_at = CURRENT_TIMESTAMP
          WHERE bolna_execution_id = $8
        `, [
          updateData.status,
          updateData.duration_seconds,
          updateData.recording_url || null,
          updateData.hangup_by || null,
          updateData.hangup_reason || null,
          updateData.hangup_provider_code || null,
          updateData.transcript_id || null,
          executionId
        ]);

        // Update queue item status if this call was part of a campaign (within same transaction)
        const queueItemResult = await client.query(`
          SELECT id, user_id, campaign_id, call_id 
          FROM call_queue 
          WHERE call_id = $1
        `, [call.id]);

        if (queueItemResult.rows.length > 0) {
          const queueItem = queueItemResult.rows[0];
          
          await client.query(`
            UPDATE call_queue
            SET 
              status = 'completed',
              completed_at = NOW(),
              updated_at = NOW()
            WHERE id = $1 AND user_id = $2
          `, [queueItem.id, queueItem.user_id]);

          logger.info('📋 Queue item marked as completed (transactional)', {
            queue_item_id: queueItem.id,
            call_id: call.id,
            campaign_id: queueItem.campaign_id
          });

          // Best-effort: send campaign summary email if feature enabled (outside transaction)
          if (process.env.EMAIL_CAMPAIGN_SUMMARY_ENABLED === 'true' && queueItem.campaign_id) {
            // Use setImmediate to run after transaction commits
            setImmediate(() => {
              this.maybeSendCampaignSummary(queueItem.campaign_id, queueItem.user_id).catch((e: any) => {
                logger.error('Failed to send campaign summary email', { error: e?.message || String(e) });
              });
            });
          }
        }
      });

      logger.info('✅ Call disconnected status updated (transactional)', { execution_id: executionId });
    } catch (error) {
      logger.error('❌ Failed to update call status', {
        execution_id: executionId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Capture critical database update failure in Sentry
      Sentry.captureException(error, {
        level: 'error',
        tags: {
          error_type: 'call_status_update_failed',
          execution_id: executionId,
          severity: 'critical',
          data_loss: 'true'
        },
        contexts: {
          database_update: {
            execution_id: executionId,
            operation: 'updateByExecutionId',
            update_fields: Object.keys(updateData).join(','),
            call_id: call?.id
          }
        }
      });
      
      // Re-throw to fail webhook processing (critical update failed)
      throw error;
    }
  }

  /**
   * Stage 5: Completed
   * ✅ RECORDING URL IS AVAILABLE HERE
   * Run OpenAI analysis and finalize call
   */
  private async handleCompleted(payload: BolnaWebhookPayload): Promise<void> {
    const executionId = payload.id;
    
    logger.info('5️⃣ Handling completed event', { 
      execution_id: executionId,
      has_recording: !!payload.telephony_data?.recording_url
    });

    // Get call record
    const call = await Call.findByExecutionId(executionId);
    if (!call) {
      logger.warn('Call not found for completion', { execution_id: executionId });
      return;
    }

    // Get agent for billing
    const agent = await Agent.findById(call.agent_id);
    if (!agent) {
      throw new Error(`Agent not found: ${call.agent_id}`);
    }

    const updateData: any = {
      call_lifecycle_status: 'completed',
      status: 'completed',
      completed_at: new Date()
    };

    // ✅ SAVE RECORDING URL - This is where it appears
    if (payload.telephony_data?.recording_url) {
      updateData.recording_url = payload.telephony_data.recording_url;
      logger.info('💾 Recording URL saved', { 
        execution_id: executionId,
        recording_url: payload.telephony_data.recording_url
      });
    }

    // Calculate billing
    const durationSeconds = Math.floor(payload.conversation_duration || 0); // Convert float to integer
    const durationMinutes = Math.ceil(durationSeconds / 60);
    const creditsUsed = durationMinutes;

    updateData.duration_seconds = durationSeconds;
    updateData.duration_minutes = durationMinutes;
    updateData.credits_used = creditsUsed;

    // Update final hangup info if provided
    if (payload.telephony_data) {
      updateData.hangup_by = payload.telephony_data.hangup_by || updateData.hangup_by;
      updateData.hangup_reason = payload.telephony_data.hangup_reason || updateData.hangup_reason;
      updateData.hangup_provider_code = payload.telephony_data.hangup_provider_code;
    }

    // Update call
    await Call.updateByExecutionId(executionId, updateData);

    // 🔄 RE-FETCH call to get latest data including transcript_id
    // Small delay to ensure call-disconnected transaction has committed
    // (webhooks arrive within 1 second of each other, causing race condition)
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // This ensures we have the transcript_id that was saved in call-disconnected stage
    const updatedCall = await Call.findByExecutionId(executionId);
    if (!updatedCall) {
      logger.error('❌ Failed to re-fetch updated call', { execution_id: executionId });
      return;
    }

    // Process billing - deduct credits after call completion
    try {
      if (creditsUsed > 0) {
        // Get previous credits for monitoring
        const previousCredits = await userService.getUserCredits(call.user_id) || 0;
        
        const result = await BillingService.processCallCredits(
          call.user_id,
          call.id,
          durationSeconds,
          call.phone_number
        );
        
        logger.info('💰 Credits deducted successfully', {
          executionId,
          userId: call.user_id,
          creditsUsed: result.creditsUsed,
          newBalance: result.user.credits,
          callId: call.id
        });

        // Trigger credit monitoring event
        try {
          const { creditMonitoringService } = await import('./creditMonitoringService');
          await creditMonitoringService.recordCreditEvent({
            type: 'credit_deducted',
            userId: call.user_id,
            previousCredits,
            currentCredits: result.user.credits,
            amount: result.creditsUsed,
            source: 'call_completion',
            metadata: {
              callId: call.id,
              executionId,
              durationSeconds,
              phoneNumber: call.phone_number
            },
            timestamp: new Date()
          });
        } catch (monitoringError) {
          logger.error('Failed to record credit monitoring event:', monitoringError);
        }

        // Check if user has hit negative credits and send notification
        if (result.user.credits <= 0) {
          logger.warn('⚠️ User credits have gone negative/zero', {
            userId: call.user_id,
            credits: result.user.credits
          });
          
          // Import and trigger credit notification service
          const { CreditNotificationService } = await import('./creditNotificationService');
          CreditNotificationService.checkAndSendNotifications(call.user_id).catch((error: Error) => {
            logger.error('Failed to send credit notification:', error);
          });
        }
      }
    } catch (error) {
      logger.error('❌ Failed to deduct credits', {
        executionId,
        userId: call.user_id,
        creditsUsed,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Don't fail webhook - log for manual review
    }

    // TODO: Auto-create contact (need to check method)
    // this.contactService.autoCreateFromCall(call.id, call.user_id, call.phone_number)

    // Run OpenAI analysis if transcript exists (async, don't block)
    // Use updatedCall to ensure we have the latest transcript_id
    if (updatedCall.transcript_id) {
      logger.info('🤖 Running OpenAI analysis', { 
        execution_id: executionId,
        transcript_id: updatedCall.transcript_id 
      });
      
      // Get user's OpenAI prompt configuration
      const User = (await import('../models/User')).UserModel;
      const userModel = new User();
      const user = await userModel.findById(updatedCall.user_id);
      
      // Get transcript content
      Transcript.findById(updatedCall.transcript_id)
        .then(async (transcript) => {
          if (!transcript) {
            logger.warn('Transcript not found', { transcript_id: updatedCall.transcript_id });
            return;
          }

          try {
            // Extract individual analysis (with user's custom prompt or system default)
            const individualData = await openaiExtractionService.extractIndividualCallData(
              transcript.content,
              executionId,
              updatedCall.phone_number,
              user?.openai_individual_prompt_id
            );

            // Get previous calls for complete analysis
            const previousCalls = await Call.findByPhoneNumberAllUsers(updatedCall.phone_number);
            const previousCallsCount = previousCalls.filter(c => c.id !== updatedCall.id).length;

            // Get previous individual analyses for complete analysis context
            // This provides historical context from all previous calls for this contact
            const previousAnalyses = await leadAnalyticsService.getIndividualAnalysesByContact(
              updatedCall.user_id,
              updatedCall.phone_number
            );

            logger.info('📊 Fetched previous analyses for complete analysis', {
              execution_id: executionId,
              user_id: updatedCall.user_id,
              phone_number: updatedCall.phone_number,
              previous_analyses_count: previousAnalyses.length,
              previous_calls_count: previousCallsCount
            });

            // Extract complete analysis (with user's custom prompt or system default)
            const completeData = await openaiExtractionService.extractCompleteAnalysis(
              transcript.content,
              previousAnalyses,
              updatedCall.user_id,
              updatedCall.phone_number,
              user?.openai_complete_prompt_id
            );

            // Process dual analysis
            await leadAnalyticsService.processDualAnalysis(
              individualData,
              completeData,
              updatedCall.id,
              updatedCall.user_id,
              updatedCall.phone_number,
              previousCallsCount
            );

            logger.info('✅ OpenAI analysis completed', { execution_id: executionId });
          } catch (error) {
            logger.error('❌ OpenAI analysis failed', {
              execution_id: executionId,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        })
        .catch((error: any) => {
          logger.error('❌ Failed to load transcript', {
            execution_id: executionId,
            error: error instanceof Error ? error.message : String(error)
          });
        });
    } else {
      logger.warn('⚠️  No transcript found, skipping OpenAI analysis', { 
        execution_id: executionId,
        call_id: updatedCall.id,
        transcript_id: updatedCall.transcript_id
      });
    }

    logger.info('✅ Call completed successfully', { 
      execution_id: executionId,
      duration_minutes: durationMinutes,
      credits_used: creditsUsed
    });

    // Release concurrency slot now that call is completed
    try {
      await concurrencyManager.releaseCallSlot(call.id);
      logger.info('🔓 Released concurrency slot for completed call', { 
        execution_id: executionId,
        call_id: call.id
      });
    } catch (error) {
      logger.error('❌ Failed to release concurrency slot', {
        execution_id: executionId,
        call_id: call.id,
        error: error instanceof Error ? error.message : String(error)
      });
      // Continue - this is not critical for webhook processing
    }

    // Update queue item status if this call was part of a campaign
    await this.updateQueueItemStatus(call.id, 'completed');
  }

  /**
   * Handle failed call states (busy, no-answer)
   */
  private async handleFailed(payload: BolnaWebhookPayload, status: string): Promise<void> {
    const executionId = payload.id;
    
    logger.info('❌ Handling failed call', { execution_id: executionId, status });

    const call = await Call.findByExecutionId(executionId);
    
    await Call.updateByExecutionId(executionId, {
      call_lifecycle_status: status,
      status: 'failed',
      hangup_by: 'system',
      hangup_reason: status,
      hangup_provider_code: payload.telephony_data?.hangup_provider_code?.toString()
    });

    logger.info('✅ Failed status updated', { execution_id: executionId, status });

    // Release concurrency slot for failed call
    if (call) {
      try {
        await concurrencyManager.releaseCallSlot(call.id);
        logger.info('🔓 Released concurrency slot for failed call', { 
          execution_id: executionId,
          call_id: call.id,
          status
        });
      } catch (error) {
        logger.error('❌ Failed to release concurrency slot', {
          execution_id: executionId,
          call_id: call.id,
          error: error instanceof Error ? error.message : String(error)
        });
        // Continue - this is not critical for webhook processing
      }
    }

    // Update queue item as failed if this call was part of a campaign
    if (call) {
      await this.updateQueueItemStatus(call.id, 'failed', `Call ended with status: ${status}`);
    }
  }

  /**
   * Update queue item status when call completes
   * Releases queue slot for next call allocation
   */
  private async updateQueueItemStatus(
    callId: string, 
    finalStatus: 'completed' | 'failed',
    failureReason?: string
  ): Promise<void> {
    try {
      const queueItem = await CallQueue.findByCallId(callId);
      
      if (!queueItem) {
        // Not a campaign call, skip queue update
        return;
      }

      if (finalStatus === 'completed') {
        await CallQueue.markAsCompleted(queueItem.id, queueItem.user_id, callId);
        logger.info('📋 Queue item marked as completed', {
          queue_item_id: queueItem.id,
          call_id: callId,
          campaign_id: queueItem.campaign_id
        });

        // Best-effort: if campaign has fully completed, send a summary email (feature-gated)
        if (process.env.EMAIL_CAMPAIGN_SUMMARY_ENABLED === 'true' && queueItem.campaign_id) {
          this.maybeSendCampaignSummary(queueItem.campaign_id, queueItem.user_id).catch((e: any) => {
            logger.error('Failed to send campaign summary email', { error: e?.message || String(e) });
          });
        }
      } else {
        await CallQueue.markAsFailed(
          queueItem.id, 
          queueItem.user_id, 
          failureReason || 'Call failed'
        );
        logger.info('📋 Queue item marked as failed', {
          queue_item_id: queueItem.id,
          call_id: callId,
          campaign_id: queueItem.campaign_id,
          reason: failureReason
        });
      }
    } catch (error) {
      logger.error('❌ Failed to update queue item', {
        call_id: callId,
        error: error instanceof Error ? error.message : String(error)
      });
      // Don't throw - queue update failure shouldn't block webhook processing
    }
  }

  // Fire-and-forget best-effort summary sender when a campaign completes
  private async maybeSendCampaignSummary(campaignId: string, userId: string): Promise<void> {
    try {
      // Check if system-level feature is enabled
      if (process.env.EMAIL_CAMPAIGN_SUMMARY_ENABLED !== 'true') {
        logger.info('Campaign summary emails disabled by system configuration');
        return;
      }

      const { CallCampaignModel } = await import('../models/CallCampaign');
      const analytics = await CallCampaignModel.getAnalytics(campaignId, userId);
      if (!analytics) return;

      // Check completion heuristics
      const total = parseInt(String((analytics as any).total_contacts || 0));
      const completed = parseInt(String((analytics as any).completed_calls || 0));
      const inProgress = parseInt(String((analytics as any).processing_calls || (analytics as any).in_progress || 0));
      const queued = parseInt(String((analytics as any).queued_calls || (analytics as any).queued || 0));
      if (!total || completed < total || inProgress > 0 || queued > 0) return;

      // Gather top hot leads for this campaign
      const { pool } = await import('../config/database');
      const topLeadsResult = await pool.query(
        `SELECT 
           COALESCE(q.contact_name, q.phone_number) AS name,
           q.phone_number as phone,
           la.total_score as score
         FROM lead_analytics la
         JOIN call_queue q ON q.call_id = la.call_id
         WHERE q.campaign_id = $1 
           AND la.total_score IS NOT NULL
           AND (la.lead_status_tag ILIKE 'hot%' OR la.lead_status_tag = 'Hot' OR la.lead_status_tag = 'Hot Lead')
         ORDER BY la.total_score DESC
         LIMIT 5`,
        [campaignId]
      );
      const topLeads = topLeadsResult.rows.map((r: any) => ({
        name: r.name || r.phone,
        phone: r.phone,
        score: parseInt(String(r.score || 0))
      }));

      // Optional CSV of all hot leads (score >= 80)
      const csvResult = await pool.query(
        `SELECT 
           COALESCE(q.contact_name, q.phone_number) AS name,
           q.phone_number as phone,
           la.total_score as score
         FROM lead_analytics la
         JOIN call_queue q ON q.call_id = la.call_id
         WHERE q.campaign_id = $1 
           AND la.total_score IS NOT NULL
           AND (la.lead_status_tag ILIKE 'hot%' OR la.lead_status_tag = 'Hot' OR la.lead_status_tag = 'Hot Lead')
         ORDER BY la.total_score DESC`,
        [campaignId]
      );
      let csv: string | undefined = undefined;
      if (csvResult.rows.length > 0) {
        const header = 'name,phone,score';
        const lines = csvResult.rows.map((r: any) => {
          const safe = (s: any) => {
            const v = (s ?? '').toString();
            return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
          };
          return `${safe(r.name || r.phone)},${safe(r.phone)},${safe(r.score)}`;
        });
        csv = [header, ...lines].join('\n');
      }

      // Fetch user email/name
      const User = (await import('../models/User')).UserModel;
      const userModel = new User();
      const user = await userModel.findById(userId);
      if (!user || !user.email) return;

      const avgSeconds = Number((analytics as any).average_call_duration || (analytics as any).avg_call_duration_seconds || 0);
      const avgMinutes = avgSeconds > 0 ? avgSeconds / 60.0 : 0;
      const successRate = Number((analytics as any).success_rate || 0);
      const campaignName = String((analytics as any).name || (analytics as any).campaign_name || (analytics as any).id || (analytics as any).campaign_id || 'Campaign');

      // Generate idempotency key
      const idempotencyKey = `${userId}:campaign_summary:${campaignId}`;

      // Send notification via unified notification system (handles preferences and idempotency)
      await notificationService.sendNotification({
        userId,
        email: user.email,
        notificationType: 'campaign_summary',
        relatedCampaignId: campaignId,
        idempotencyKey,
        notificationData: {
          userName: user.name,
          campaignName,
          stats: {
            totalContacts: total,
            completedCalls: completed,
            successRate: successRate,
            avgCallMinutes: avgMinutes,
          },
          hotLeads: topLeads,
          csvBuffer: csv
        }
      });
    } catch (e) {
      // swallow errors
    }
  }
}

export const webhookService = new WebhookService();
export { WebhookService };
