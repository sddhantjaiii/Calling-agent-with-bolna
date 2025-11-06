import Call from '../models/Call';
import Agent from '../models/Agent';
import Transcript from '../models/Transcript';
import CallQueue from '../models/CallQueue';
import { BillingService } from './billingService';
import { ContactAutoCreationService } from './contactAutoCreationService';
import { openaiExtractionService } from './openaiExtractionService';
import { leadAnalyticsService } from './leadAnalyticsService';
import { BolnaWebhookPayload } from '../types/webhook';
import { logger } from '../utils/logger';

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
      call_lifecycle_status: 'call-disconnected',
      call_disconnected_at: new Date(),
      duration_seconds: payload.conversation_duration || 0
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
        // Don't fail webhook if transcript save fails
      }
    }

    await Call.updateByExecutionId(executionId, updateData);
    logger.info('✅ Call disconnected status updated', { execution_id: executionId });

    // Update queue item status if this call was part of a campaign
    await this.updateQueueItemStatus(call.id, 'completed');
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
    const durationSeconds = payload.conversation_duration || 0;
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

    // TODO: Process billing (need to check method signature)
    // BillingService.processCallCredits(call.user_id, creditsUsed, call.id)

    // TODO: Auto-create contact (need to check method)
    // this.contactService.autoCreateFromCall(call.id, call.user_id, call.phone_number)

    // Run OpenAI analysis if transcript exists (async, don't block)
    if (call.transcript_id) {
      logger.info('🤖 Running OpenAI analysis', { execution_id: executionId });
      
      // Get transcript content
      Transcript.findById(call.transcript_id)
        .then(async (transcript) => {
          if (!transcript) {
            logger.warn('Transcript not found', { transcript_id: call.transcript_id });
            return;
          }

          try {
            // Extract individual analysis
            const individualData = await openaiExtractionService.extractIndividualCallData(
              transcript.content,
              call.phone_number
            );

            // Get previous calls for complete analysis
            const previousCalls = await Call.findByPhoneNumberAllUsers(call.phone_number);
            const previousCallsCount = previousCalls.filter(c => c.id !== call.id).length;

            // Get previous analyses for complete analysis
            const previousAnalyses: any[] = []; // TODO: Implement fetching previous analyses

            // Extract complete analysis
            const completeData = await openaiExtractionService.extractCompleteAnalysis(
              transcript.content,
              previousAnalyses,
              call.user_id,
              call.phone_number
            );

            // Process dual analysis
            await leadAnalyticsService.processDualAnalysis(
              individualData,
              completeData,
              call.id,
              call.user_id,
              call.phone_number,
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
        execution_id: executionId 
      });
    }

    logger.info('✅ Call completed successfully', { 
      execution_id: executionId,
      duration_minutes: durationMinutes,
      credits_used: creditsUsed
    });

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
}

export const webhookService = new WebhookService();
export { WebhookService };
