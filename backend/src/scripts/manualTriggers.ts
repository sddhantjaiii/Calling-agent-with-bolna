/**
 * Manual Trigger Functions for Admin Panel
 * 
 * These functions are used by the admin API to manually:
 * 1. Trigger OpenAI analysis for an existing call (by execution_id)
 * 2. Simulate a Bolna webhook (processing completed payload through full flow)
 */

import Call from '../models/Call';
import Transcript from '../models/Transcript';
import { openaiExtractionService } from '../services/openaiExtractionService';
import { leadAnalyticsService } from '../services/leadAnalyticsService';
import { UserModel } from '../models/User';
import { webhookService } from '../services/webhookService';
import { logger } from '../utils/logger';

export interface TriggerAnalysisResult {
  success: boolean;
  message: string;
  data?: {
    call_id: string;
    execution_id: string;
    transcript_id: string;
    individual_analysis?: any;
    complete_analysis?: any;
  };
  error?: string;
}

export interface SimulateWebhookResult {
  success: boolean;
  message: string;
  stages_processed: string[];
  data?: {
    execution_id: string;
    call_id?: string;
    transcript_saved?: boolean;
    analysis_triggered?: boolean;
  };
  error?: string;
}

/**
 * Manually trigger OpenAI analysis for an existing call
 * Used when transcript exists but analysis was skipped
 */
export async function triggerAnalysisForCall(executionId: string): Promise<TriggerAnalysisResult> {
  logger.info('🔧 Manual trigger: Starting analysis', { execution_id: executionId });

  try {
    // Find the call
    const call = await Call.findByExecutionId(executionId);
    if (!call) {
      return {
        success: false,
        message: 'Call not found',
        error: `No call found with execution_id: ${executionId}`
      };
    }

    logger.info('✅ Call found', {
      call_id: call.id,
      user_id: call.user_id,
      phone_number: call.phone_number,
      transcript_id: call.transcript_id
    });

    if (!call.transcript_id) {
      return {
        success: false,
        message: 'No transcript available',
        error: 'Call does not have a transcript_id. Transcript may not have been saved.'
      };
    }

    // Get transcript
    const transcript = await Transcript.findById(call.transcript_id);
    if (!transcript) {
      return {
        success: false,
        message: 'Transcript not found',
        error: `Transcript with id ${call.transcript_id} not found in database`
      };
    }

    logger.info('✅ Transcript found', {
      transcript_id: transcript.id,
      content_length: transcript.content?.length || 0
    });

    // Get user for custom prompts
    const userModel = new UserModel();
    const user = await userModel.findById(call.user_id);

    logger.info('🤖 Running OpenAI Individual Analysis');

    // Extract individual analysis
    const individualData = await openaiExtractionService.extractIndividualCallData(
      transcript.content,
      executionId,
      call.phone_number,
      user?.openai_individual_prompt_id
    );

    logger.info('✅ Individual Analysis completed', {
      total_score: individualData.total_score,
      lead_status_tag: individualData.lead_status_tag
    });

    // Get previous calls for complete analysis
    const previousCalls = await Call.findByPhoneNumberAllUsers(call.phone_number);
    const previousCallsCount = previousCalls.filter(c => c.id !== call.id).length;

    let completeData;

    if (previousCallsCount === 0) {
      logger.info('📊 No previous calls - using individual analysis for complete analysis');
      completeData = {
        ...individualData,
        extraction: {
          ...individualData.extraction,
          smartnotification: null
        }
      };
    } else {
      logger.info(`📊 Found ${previousCallsCount} previous calls - running complete analysis`);
      
      const previousAnalyses = await leadAnalyticsService.getIndividualAnalysesByContact(
        call.user_id,
        call.phone_number
      );

      const previousTranscripts: string[] = [];
      for (const prevCall of previousCalls.filter(c => c.id !== call.id)) {
        if (prevCall.transcript_id) {
          const prevTranscript = await Transcript.findById(prevCall.transcript_id);
          if (prevTranscript) {
            previousTranscripts.push(prevTranscript.content);
          }
        }
      }

      completeData = await openaiExtractionService.extractCompleteAnalysis(
        transcript.content,
        previousTranscripts,
        previousAnalyses,
        call.user_id,
        call.phone_number,
        user?.openai_complete_prompt_id
      );

      if (completeData.extraction) {
        completeData.extraction.smartnotification = null;
      }
    }

    logger.info('💾 Saving to lead_analytics');

    // Save individual analysis
    await leadAnalyticsService.createIndividualAnalysis(
      individualData,
      call.id,
      call.user_id,
      call.phone_number
    );

    // Save complete analysis
    await leadAnalyticsService.upsertCompleteAnalysis(
      completeData,
      call.id,
      call.user_id,
      call.phone_number,
      previousCallsCount
    );

    logger.info('✅ Analysis saved successfully');

    return {
      success: true,
      message: 'OpenAI analysis completed and saved successfully',
      data: {
        call_id: call.id,
        execution_id: executionId,
        transcript_id: call.transcript_id,
        individual_analysis: {
          total_score: individualData.total_score,
          lead_status_tag: individualData.lead_status_tag,
          intent_level: individualData.intent_level,
          demo_book_datetime: individualData.demo_book_datetime,
          extraction: individualData.extraction
        },
        complete_analysis: {
          total_score: completeData.total_score,
          lead_status_tag: completeData.lead_status_tag
        }
      }
    };

  } catch (error) {
    logger.error('❌ Manual trigger failed', {
      execution_id: executionId,
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      success: false,
      message: 'Analysis failed',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Simulate a Bolna webhook by processing a completed payload
 * This processes through both call-disconnected (for transcript) and completed (for analysis) stages
 */
export async function simulateBolnaWebhook(payload: any): Promise<SimulateWebhookResult> {
  const executionId = payload.id || payload.execution_id;
  const stagesProcessed: string[] = [];
  
  logger.info('🔧 Manual trigger: Simulating Bolna webhook', { 
    execution_id: executionId,
    has_transcript: !!payload.transcript,
    has_recording: !!payload.telephony_data?.recording_url,
    original_status: payload.status
  });

  try {
    // Validate payload has required fields
    if (!executionId) {
      return {
        success: false,
        message: 'Invalid payload',
        stages_processed: [],
        error: 'Payload must have id or execution_id field'
      };
    }

    if (!payload.agent_id) {
      return {
        success: false,
        message: 'Invalid payload',
        stages_processed: [],
        error: 'Payload must have agent_id field'
      };
    }

    // Check if call already exists
    const existingCall = await Call.findByExecutionId(executionId);
    
    if (existingCall) {
      logger.info('📞 Existing call found', { 
        call_id: existingCall.id,
        current_status: existingCall.status,
        has_transcript_id: !!existingCall.transcript_id
      });

      // If call exists but no transcript, process call-disconnected first
      if (!existingCall.transcript_id && payload.transcript) {
        logger.info('📝 Processing call-disconnected stage to save transcript');
        await webhookService.processWebhook(payload, 'call-disconnected');
        stagesProcessed.push('call-disconnected');
      }

      // Then process completed stage for analysis
      logger.info('✅ Processing completed stage for analysis');
      await webhookService.processWebhook(payload, 'completed');
      stagesProcessed.push('completed');

    } else {
      // Call doesn't exist - need to create it
      // Process through the full flow
      
      // Stage 1: Initiated - Create the call record
      logger.info('📞 Processing initiated stage to create call');
      await webhookService.processWebhook(payload, 'initiated');
      stagesProcessed.push('initiated');

      // Stage 4: Call Disconnected - Save transcript
      if (payload.transcript) {
        logger.info('📝 Processing call-disconnected stage to save transcript');
        await webhookService.processWebhook(payload, 'call-disconnected');
        stagesProcessed.push('call-disconnected');
      }

      // Stage 5: Completed - Run analysis and finalize
      logger.info('✅ Processing completed stage for analysis');
      await webhookService.processWebhook(payload, 'completed');
      stagesProcessed.push('completed');
    }

    // Fetch final call state
    const finalCall = await Call.findByExecutionId(executionId);

    return {
      success: true,
      message: `Webhook simulation completed. Processed ${stagesProcessed.length} stages.`,
      stages_processed: stagesProcessed,
      data: {
        execution_id: executionId,
        call_id: finalCall?.id,
        transcript_saved: !!finalCall?.transcript_id,
        analysis_triggered: stagesProcessed.includes('completed')
      }
    };

  } catch (error) {
    logger.error('❌ Webhook simulation failed', {
      execution_id: executionId,
      stages_processed: stagesProcessed,
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      success: false,
      message: 'Webhook simulation failed',
      stages_processed: stagesProcessed,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
