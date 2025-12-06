import Call, { CallInterface } from '../models/Call';
import Transcript, { TranscriptInterface } from '../models/Transcript';
import LeadAnalytics, { LeadAnalyticsInterface } from '../models/LeadAnalytics';
import { bolnaService, BolnaCallRequest, BolnaCallResponse } from './bolnaService';
import Agent from '../models/Agent';
import PhoneNumber from '../models/PhoneNumber';
import Contact, { ContactInterface } from '../models/Contact';
import { ConcurrencyManager } from './ConcurrencyManager';
import crypto from 'crypto';
import * as Sentry from '@sentry/node';
import { hashPhoneNumber, hashUserId } from '../utils/sentryHelpers';

import { logger } from '../utils/logger';

/**
 * Build user_data object for Bolna API calls
 * Uses standardized field names: lead_name, business_name, email
 */
function buildUserData(contact: ContactInterface | null, queueUserData?: Record<string, any>): Record<string, any> {
  // If we have queue user_data (from campaign), use it but transform field names
  if (queueUserData) {
    return {
      lead_name: queueUserData.name || queueUserData.lead_name || '',
      business_name: queueUserData.company || queueUserData.business_name || '',
      email: queueUserData.email || ''
    };
  }
  
  // If we have contact data, build user_data from it
  if (contact) {
    return {
      lead_name: contact.name || '',
      business_name: contact.company || '',
      email: contact.email || ''
    };
  }
  
  // Return empty user_data if no data available
  return {
    lead_name: '',
    business_name: '',
    email: ''
  };
}

// Create singleton instance of ConcurrencyManager
const concurrencyManager = new ConcurrencyManager();

export interface CallSearchFilters {
  search?: string;
  status?: CallInterface['status'];
  agentId?: string;
  agentName?: string;
  phoneNumber?: string;
  contactName?: string;
  startDate?: Date;
  endDate?: Date;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
  hasTranscript?: boolean;
  hasAnalytics?: boolean;
  minScore?: number;
  maxScore?: number;
  leadStatus?: string;
  leadTag?: string;
}

export interface CallListOptions {
  limit?: number;
  offset?: number;
  sortBy?: 'created_at' | 'duration_seconds' | 'duration_minutes' | 'total_score' | 'contact_name' | 'phone_number';
  sortOrder?: 'ASC' | 'DESC';
}

export interface FilteredCallsResult {
  calls: CallWithDetails[];
  total: number;
  hasMore: boolean;
}

export interface CallInitiationRequest {
  agentId: string;
  phoneNumber: string;
  userId: string;
  contactId?: string;
  callerPhoneNumberId?: string; // Optional: user-selected phone number to call from
  metadata?: any;
}

export interface CallInitiationResponse {
  executionId: string;
  status: string;
  callId: string;
}

export interface CallWithDetails extends CallInterface {
  agent_name?: string;
  contact_name?: string;
  transcript?: TranscriptInterface;
  lead_analytics?: LeadAnalyticsInterface;
}

// Call service - business logic for call and transcript management
export class CallService {
  /**
   * Get calls for a user
   */
  static async getUserCalls(userId: string): Promise<CallWithDetails[]> {
    try {
      logger.info(`Fetching calls for user ${userId}`);
      const calls = await Call.findByUserId(userId);
      logger.info(`Retrieved ${calls.length} calls for user ${userId}`);
      return calls;
    } catch (error) {
      logger.error('Error fetching user calls:', error);
      throw new Error('Failed to fetch calls');
    }
  }

  /**
   * Get a specific call with full details
   */
  static async getCallDetails(
    callId: string,
    userId: string
  ): Promise<CallWithDetails | null> {
    try {
      // Verify ownership
      const hasAccess = await Call.verifyOwnership(callId, userId);
      if (!hasAccess) {
        logger.warn(`User ${userId} attempted to access call ${callId} without permission`);
        return null;
      }

      const call = await Call.findById(callId);
      if (!call) {
        return null;
      }

      // Get transcript if exists
      const transcript = await Transcript.findByCallId(callId);
      if (transcript) {
        (call as any).transcript = transcript;
      }

      // Get lead analytics if exists
      const analytics = await LeadAnalytics.findByCallId(callId);
      if (analytics) {
        (call as any).lead_analytics = analytics;
      }

      logger.info(`Retrieved call details for call ${callId}`);
      return call as CallWithDetails;
    } catch (error) {
      logger.error(`Error fetching call details for ${callId}:`, error);
      throw new Error('Failed to fetch call details');
    }
  }

  /**
   * Get calls by phone number
   */
  static async getCallsByPhone(phoneNumber: string, userId: string): Promise<CallWithDetails[]> {
    try {
      logger.info(`Fetching calls for phone ${phoneNumber} and user ${userId}`);
      const calls = await Call.findByPhoneNumber(phoneNumber, userId);
      logger.info(`Retrieved ${calls.length} calls for phone ${phoneNumber}`);
      return calls;
    } catch (error) {
      logger.error('Error fetching calls by phone:', error);
      throw new Error('Failed to fetch calls by phone');
    }
  }

  /**
   * Get calls by email address
   */
  static async getCallsByEmail(email: string, userId: string): Promise<CallWithDetails[]> {
    try {
      logger.info(`Fetching calls for email ${email} and user ${userId}`);
      const calls = await Call.findByEmail(email, userId);
      logger.info(`Retrieved ${calls.length} calls for email ${email}`);
      return calls;
    } catch (error) {
      logger.error('Error fetching calls by email:', error);
      throw new Error('Failed to fetch calls by email');
    }
  }

  /**
   * Get call transcript
   */
  static async getCallTranscript(
    callId: string,
    userId: string
  ): Promise<TranscriptInterface | null> {
    try {
      // Verify ownership
      const hasAccess = await Call.verifyOwnership(callId, userId);
      if (!hasAccess) {
        logger.warn(`User ${userId} attempted to access transcript for call ${callId} without permission`);
        return null;
      }

      const transcript = await Transcript.findByCallId(callId);
      
      if (transcript) {
        logger.info(`Retrieved transcript for call ${callId}`);
      }

      return transcript;
    } catch (error) {
      logger.error(`Error fetching transcript for call ${callId}:`, error);
      throw new Error('Failed to fetch transcript');
    }
  }

  /**
   * Get call recording URL (validates ownership)
   */
  static async getCallRecording(
    callId: string,
    userId: string
  ): Promise<{ recording_url: string } | null> {
    try {
      // Verify ownership and get call
      const call = await this.getCallDetails(callId, userId);
      
      if (!call || !call.recording_url) {
        return null;
      }

      logger.info(`Retrieved recording URL for call ${callId}`);
      return { recording_url: call.recording_url };
    } catch (error) {
      logger.error(`Error fetching recording for call ${callId}:`, error);
      throw new Error('Failed to fetch recording');
    }
  }

  /**
   * Search transcripts within calls
   */
  static async searchTranscripts(
    userId: string,
    searchTerm: string,
    options: any = {}
  ): Promise<{
    results: (CallWithDetails & { transcript_matches?: any[] })[];
    total: number;
  }> {
    try {
      logger.info(`Searching transcripts for user ${userId}`, { searchTerm });

      // Use the existing Call model method for calls with analytics
      const calls = await Call.getCallsWithAnalytics(userId, {
        limit: options.limit || 50,
        offset: options.offset || 0
      });

      // Filter calls that have transcripts matching the search term
      const results: any[] = [];
      
      for (const call of calls) {
        const transcript = await Transcript.findByCallId(call.id);
        if (transcript && transcript.content.toLowerCase().includes(searchTerm.toLowerCase())) {
          results.push({
            ...call,
            transcript,
            transcript_matches: []
          });
        }
      }

      logger.info(`Found ${results.length} transcript matches for user ${userId}`);

      return {
        results,
        total: results.length
      };
    } catch (error) {
      logger.error('Error searching transcripts:', error);
      throw new Error('Failed to search transcripts');
    }
  }

  /**
   * Get call statistics for dashboard
   */
  static async getCallStatistics(
    userId: string,
    period?: 'day' | 'week' | 'month'
  ): Promise<{
    totalCalls: number;
    completedCalls: number;
    failedCalls: number;
    notConnectedCalls: number;
    totalMinutes: number;
    totalCreditsUsed: number;
    averageCallDuration: number;
    averageLeadScore?: number;
    topPerformingAgent?: string;
  }> {
    try {
      const stats = await Call.getCallStats(userId, period);
      return stats;
    } catch (error) {
      logger.error('Error fetching call statistics:', error);
      throw new Error('Failed to fetch call statistics');
    }
  }

  /**
   * Get recent calls for dashboard
   */
  static async getRecentCalls(
    userId: string,
    limit: number = 10
  ): Promise<CallWithDetails[]> {
    try {
      const calls = await Call.getRecentCalls(userId, limit);
      
      logger.info(`Retrieved ${calls.length} recent calls for user ${userId}`);
      return calls;
    } catch (error) {
      logger.error('Error fetching recent calls:', error);
      throw new Error('Failed to fetch recent calls');
    }
  }

  /**
   * Process call webhook data (called by webhook service)
   */
  static async processCallWebhook(_webhookData: any): Promise<void> {
    // This method is called by the webhook service
    // The actual processing is handled in webhookService.processCallCompletedWebhook
    logger.info('Call webhook processing delegated to webhook service');
  }

  /**
   * Get filtered calls with database-level filtering, searching, sorting, and pagination
   */
  static async getFilteredCalls(
    userId: string,
    filters: CallSearchFilters,
    options: CallListOptions
  ): Promise<FilteredCallsResult> {
    try {
      logger.info(`Getting filtered calls for user ${userId} with filters:`, filters);
      
      // Use the Call model's new method for database-level filtering
      const result = await Call.findFilteredCalls(userId, filters, options);
      
      logger.info(`Retrieved ${result.calls.length} calls out of ${result.total} total for user ${userId}`);
      return result;
    } catch (error) {
      logger.error('Error fetching filtered calls:', error);
      throw new Error('Failed to fetch filtered calls');
    }
  }

  /**
   * Initiate a call using Bolna.ai API with atomic concurrency management
   */
  static async initiateCall(callRequest: CallInitiationRequest): Promise<CallInitiationResponse> {
    // Start Sentry span for call initiation monitoring
    return await Sentry.startSpan(
      {
        op: 'call.initiate',
        name: 'Initiate Call',
        attributes: {
          userIdHash: hashUserId(callRequest.userId),
          agentId: callRequest.agentId,
          phoneNumberHash: hashPhoneNumber(callRequest.phoneNumber),
          hasContactId: !!callRequest.contactId
        }
      },
      async () => {
        try {
          logger.info(`Initiating call for user ${callRequest.userId} to ${callRequest.phoneNumber}`);

          // Add breadcrumb for debugging
          Sentry.addBreadcrumb({
            category: 'call',
            message: 'Starting call initiation',
            level: 'info',
            data: {
              userId: callRequest.userId,
              agentId: callRequest.agentId,
              hasPreReservedId: !!callRequest.metadata?.preReservedCallId
            }
          });

          // Check if a call ID is already pre-reserved (from CallController)
          let preReservedCallId = callRequest.metadata?.preReservedCallId;
          let reservationResult;

          if (preReservedCallId) {
            // ID already reserved by CallController, no need to reserve again
            logger.info(`Using pre-reserved call slot with ID: ${preReservedCallId}`);
            
            Sentry.addBreadcrumb({
              category: 'call',
              message: 'Using pre-reserved call slot',
              level: 'info',
              data: { callId: preReservedCallId }
            });
            
            reservationResult = { success: true };
          } else {
            // Generate a unique call ID and reserve slot
            preReservedCallId = crypto.randomUUID();

            // **CRITICAL: Reserve slot atomically BEFORE external API call**
            reservationResult = await concurrencyManager.atomicReserveDirectCallSlot(
              callRequest.userId,
              preReservedCallId
            );

            if (!reservationResult.success) {
              logger.warn(`Call rejected - concurrency limit reached: ${reservationResult.reason}`);
              
              // This is an expected business error (not a bug), so just log to Sentry with lower severity
              Sentry.captureMessage('Call rejected - concurrency limit reached', {
                level: 'warning',
                tags: {
                  error_type: 'concurrency_limit',
                  user_id_hash: hashUserId(callRequest.userId)
                },
                contexts: {
                  call_details: {
                    userIdHash: hashUserId(callRequest.userId),
                    agentId: callRequest.agentId,
                    reason: reservationResult.reason
                  }
                }
              });
              
              throw new Error(reservationResult.reason || 'Concurrency limit reached');
            }

            logger.info(`Reserved call slot with ID: ${preReservedCallId}`);
            
            Sentry.addBreadcrumb({
              category: 'call',
              message: 'Reserved new call slot',
              level: 'info',
              data: { callId: preReservedCallId }
            });
          }

          try {
            // Get agent details
            const agent = await Agent.findById(callRequest.agentId);
            if (!agent) {
              const error = new Error('Agent not found');
              
              // Agent not found is a critical error - should not happen
              Sentry.captureException(error, {
                tags: {
                  error_type: 'agent_not_found',
                  user_id_hash: hashUserId(callRequest.userId)
                },
                contexts: {
                  call_details: {
                    userIdHash: hashUserId(callRequest.userId),
                    agentId: callRequest.agentId,
                    callId: preReservedCallId
                  }
                }
              });
              
              throw error;
            }
            
            // Verify agent ownership
            if (agent.user_id !== callRequest.userId) {
              const error = new Error('Agent does not belong to user');
              
              // Security issue - user trying to use someone else's agent
              Sentry.captureException(error, {
                tags: {
                  error_type: 'unauthorized_agent_access',
                  user_id_hash: hashUserId(callRequest.userId),
                  severity: 'high'
                },
                contexts: {
                  call_details: {
                    userIdHash: hashUserId(callRequest.userId),
                    agentId: callRequest.agentId,
                    agentOwnerIdHash: hashUserId(agent.user_id),
                    callId: preReservedCallId
                  }
                }
              });
              
              throw error;
            }
            
            if (!agent.bolna_agent_id) {
              const error = new Error('Agent is not configured for Bolna.ai');
              
              Sentry.captureException(error, {
                tags: {
                  error_type: 'agent_not_configured',
                  user_id_hash: hashUserId(callRequest.userId)
                },
                contexts: {
                  call_details: {
                    userIdHash: hashUserId(callRequest.userId),
                    agentId: callRequest.agentId,
                    callId: preReservedCallId
                  }
                }
              });
              
              throw error;
            }
            
            Sentry.addBreadcrumb({
              category: 'call',
              message: 'Agent validated successfully',
              level: 'info',
              data: {
                agentId: callRequest.agentId,
                bolnaAgentId: agent.bolna_agent_id
              }
            });
            
            // Fetch contact data if contactId is provided (for direct calls)
            let contactData: ContactInterface | null = null;
            if (callRequest.contactId) {
              contactData = await Contact.findById(callRequest.contactId);
              
              // Verify contact ownership
              if (contactData && contactData.user_id !== callRequest.userId) {
                const error = new Error('Contact does not belong to user');
                Sentry.captureException(error, {
                  tags: {
                    error_type: 'unauthorized_contact_access',
                    user_id_hash: hashUserId(callRequest.userId),
                    severity: 'high'
                  }
                });
                throw error;
              }
              
              if (contactData) {
                logger.info(`Fetched contact data for call: ${contactData.name}`);
              }
            }
            
            // Determine which phone number to use for the call
            let callerPhoneNumber: any = null;
            
            // Priority 1: Use user-selected phone number if provided
            if (callRequest.callerPhoneNumberId) {
              callerPhoneNumber = await PhoneNumber.findById(callRequest.callerPhoneNumberId);
              
              // Verify the phone number belongs to the user
              if (callerPhoneNumber && callerPhoneNumber.user_id !== callRequest.userId) {
                const error = new Error('Selected phone number does not belong to user');
                Sentry.captureException(error, {
                  tags: {
                    error_type: 'unauthorized_phone_number_access',
                    user_id_hash: hashUserId(callRequest.userId),
                    severity: 'high'
                  }
                });
                throw error;
              }
              
              Sentry.addBreadcrumb({
                category: 'call',
                message: 'Using user-selected phone number',
                level: 'info',
                data: {
                  phoneNumberId: callerPhoneNumber?.id,
                  phoneNumberName: callerPhoneNumber?.name
                }
              });
            } else {
              // Priority 2: Fallback to agent's assigned phone number (if any)
              callerPhoneNumber = await PhoneNumber.findByAgentId(callRequest.agentId);
              
              if (callerPhoneNumber) {
                Sentry.addBreadcrumb({
                  category: 'call',
                  message: 'Using agent assigned phone number',
                  level: 'info',
                  data: {
                    phoneNumberId: callerPhoneNumber.id,
                    phoneNumberName: callerPhoneNumber.name
                  }
                });
              } else {
                // Priority 3: Fallback to any phone number belonging to user (newest first)
                callerPhoneNumber = await PhoneNumber.findAnyByUserId(callRequest.userId);
                
                if (callerPhoneNumber) {
                  Sentry.addBreadcrumb({
                    category: 'call',
                    message: 'Using fallback phone number from user pool',
                    level: 'info',
                    data: {
                      phoneNumberId: callerPhoneNumber.id,
                      phoneNumberName: callerPhoneNumber.name
                    }
                  });
                  logger.info(`Using fallback phone number for call: ${callerPhoneNumber.name} (${callerPhoneNumber.phone_number})`);
                }
              }
            }
            
            // Prepare Bolna.ai call request
            const bolnaCallData: BolnaCallRequest = {
              agent_id: agent.bolna_agent_id,
              recipient_phone_number: callRequest.phoneNumber,
              webhook_url: process.env.BOLNA_WEBHOOK_URL || undefined,
              user_data: buildUserData(contactData),
              metadata: {
                user_id: callRequest.userId,
                agent_id: callRequest.agentId,
                contact_id: callRequest.contactId,
                caller_phone_number_id: callRequest.callerPhoneNumberId,
                ...callRequest.metadata
              }
            };

            // Add from_phone_number if a phone number is available
            if (callerPhoneNumber && callerPhoneNumber.phone_number) {
              bolnaCallData.from_phone_number = callerPhoneNumber.phone_number;
              logger.info(`Call will use from_phone_number: ${callerPhoneNumber.phone_number} (${callerPhoneNumber.name})`);
            } else {
              logger.warn(`No phone number available for call - Bolna will use default or fail`, {
                userId: callRequest.userId,
                agentId: callRequest.agentId,
                requestedPhoneNumberId: callRequest.callerPhoneNumberId
              });
            }
            
            Sentry.addBreadcrumb({
              category: 'call',
              message: callerPhoneNumber ? 'Phone number configured' : 'No phone number - using Bolna default',
              level: callerPhoneNumber ? 'info' : 'warning',
              data: {
                hasPhoneNumber: !!callerPhoneNumber,
                phoneNumberId: callerPhoneNumber?.id
              }
            });
            
            Sentry.addBreadcrumb({
              category: 'call',
              message: 'Calling Bolna.ai API',
              level: 'info'
            });
            
            // Make the call via Bolna.ai
            const bolnaResponse = await bolnaService.makeCall(bolnaCallData);
            
            Sentry.addBreadcrumb({
              category: 'call',
              message: 'Bolna.ai call successful',
              level: 'info',
              data: {
                executionId: bolnaResponse.execution_id
              }
            });
            
            // Update active_calls with execution_id immediately
            await concurrencyManager.updateActiveCallWithExecutionId(
              preReservedCallId, 
              bolnaResponse.execution_id
            );
            
            // Create call record in database using pre-reserved ID
            const callRecord = await Call.createCall({
              id: preReservedCallId, // Use pre-reserved ID
              agent_id: callRequest.agentId,
              user_id: callRequest.userId,
              contact_id: callRequest.contactId,
              bolna_execution_id: bolnaResponse.execution_id,
              phone_number: callRequest.phoneNumber,
              call_source: 'phone',
              status: 'in_progress',
              metadata: {
                bolna_execution_id: bolnaResponse.execution_id,
                initiated_at: new Date().toISOString(),
                ...callRequest.metadata
              }
            });
            
            logger.info(`Call initiated successfully. Execution ID: ${bolnaResponse.execution_id}, Call ID: ${callRecord.id}`);
            
            return {
              executionId: bolnaResponse.execution_id,
              status: 'initiated',
              callId: callRecord.id
            };

          } catch (apiError) {
            // **CRITICAL: Release reserved slot if external API fails**
            // Only release if we reserved it ourselves (not if pre-reserved by controller)
            if (!callRequest.metadata?.preReservedCallId) {
              logger.error(`Bolna API call failed, releasing reserved slot ${preReservedCallId}:`, apiError);
              
              // Capture Bolna.ai API failure with full context
              Sentry.captureException(apiError, {
                tags: {
                  error_type: 'bolna_api_failure',
                  user_id_hash: hashUserId(callRequest.userId),
                  severity: 'critical'
                },
                contexts: {
                  call_details: {
                    userIdHash: hashUserId(callRequest.userId),
                    agentId: callRequest.agentId,
                    phoneNumberHash: hashPhoneNumber(callRequest.phoneNumber),
                    callId: preReservedCallId,
                    contactId: callRequest.contactId
                  },
                  bolna_api: {
                    endpoint: 'makeCall',
                    error_message: apiError instanceof Error ? apiError.message : 'Unknown error'
                  }
                }
              });
              
              await concurrencyManager.releaseCallSlot(preReservedCallId);
            } else {
              logger.error(`Bolna API call failed for pre-reserved slot ${preReservedCallId}, controller will handle cleanup:`, apiError);
              
              Sentry.captureException(apiError, {
                tags: {
                  error_type: 'bolna_api_failure_prereserved',
                  user_id_hash: hashUserId(callRequest.userId)
                },
                contexts: {
                  call_details: {
                    userIdHash: hashUserId(callRequest.userId),
                    agentId: callRequest.agentId,
                    callId: preReservedCallId,
                    note: 'Pre-reserved slot, controller handles cleanup'
                  }
                }
              });
            }
            
            throw apiError;
          }

        } catch (error) {
          logger.error('Failed to initiate call:', error);
          
          // Capture any other unexpected errors
          if (error instanceof Error && !error.message.includes('concurrency limit')) {
            Sentry.captureException(error, {
              tags: {
                error_type: 'call_initiation_failed',
                user_id_hash: hashUserId(callRequest.userId)
              },
              contexts: {
                call_details: {
                  userIdHash: hashUserId(callRequest.userId),
                  agentId: callRequest.agentId,
                  phoneNumberHash: hashPhoneNumber(callRequest.phoneNumber),
                  contactId: callRequest.contactId
                }
              }
            });
          }
          
          throw error;
        }
      }
    );
  }
  
  /**
   * Initiate a campaign call with pre-reserved slot (for QueueProcessor)
   */
  static async initiateCampaignCall(
    callRequest: CallInitiationRequest,
    preReservedCallId: string
  ): Promise<CallInitiationResponse> {
    try {
      logger.info(`Initiating campaign call for user ${callRequest.userId} to ${callRequest.phoneNumber} with pre-reserved ID ${preReservedCallId}`);

      // Get agent details
      const agent = await Agent.findById(callRequest.agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }
      
      // Verify agent ownership
      if (agent.user_id !== callRequest.userId) {
        throw new Error('Agent does not belong to user');
      }
      
      if (!agent.bolna_agent_id) {
        throw new Error('Agent is not configured for Bolna.ai');
      }
      
      // Determine which phone number to use for campaign call
      let callerPhoneNumber: any = null;
      
      // Priority 1: Agent's assigned phone number
      callerPhoneNumber = await PhoneNumber.findByAgentId(callRequest.agentId);
      
      if (!callerPhoneNumber) {
        // Priority 2: Fallback to any phone number belonging to user (newest first)
        callerPhoneNumber = await PhoneNumber.findAnyByUserId(callRequest.userId);
        
        if (callerPhoneNumber) {
          logger.info(`Campaign call using fallback phone number from user pool: ${callerPhoneNumber.name} (${callerPhoneNumber.phone_number})`);
        }
      } else {
        logger.info(`Campaign call using agent assigned phone number: ${callerPhoneNumber.name} (${callerPhoneNumber.phone_number})`);
      }
      
      // Prepare Bolna.ai call request
      // Extract user_data from queue item metadata (built by CallCampaignService.addContactsToQueue)
      const queueUserData = callRequest.metadata?.user_data;
      const bolnaCallData: BolnaCallRequest = {
        agent_id: agent.bolna_agent_id,
        recipient_phone_number: callRequest.phoneNumber,
        webhook_url: process.env.BOLNA_WEBHOOK_URL || undefined,
        user_data: buildUserData(null, queueUserData),
        metadata: {
          user_id: callRequest.userId,
          agent_id: callRequest.agentId,
          contact_id: callRequest.contactId,
          ...callRequest.metadata
        }
      };

      // Add from_phone_number if a phone number is available
      if (callerPhoneNumber && callerPhoneNumber.phone_number) {
        bolnaCallData.from_phone_number = callerPhoneNumber.phone_number;
        logger.info(`Campaign call will use from_phone_number: ${callerPhoneNumber.phone_number} (${callerPhoneNumber.name})`);
      } else {
        logger.warn(`No phone number available for campaign call - Bolna will use default or fail`, {
          userId: callRequest.userId,
          agentId: callRequest.agentId,
          campaignId: callRequest.metadata?.campaign_id
        });
      }
      
      // CRITICAL FIX: Create call record FIRST in 'pending' state before making Bolna API call
      // This ensures the FK constraint on call_queue.call_id is satisfied when updateStatus is called
      const callRecord = await Call.createCall({
        id: preReservedCallId, // Use pre-reserved ID
        agent_id: callRequest.agentId,
        user_id: callRequest.userId,
        contact_id: callRequest.contactId,
        campaign_id: callRequest.metadata?.campaign_id, // Pass campaign_id from metadata
        bolna_execution_id: 'pending', // Will be updated after Bolna responds
        phone_number: callRequest.phoneNumber,
        call_source: 'phone',
        status: 'in_progress', // Mark as in_progress immediately
        metadata: {
          initiated_at: new Date().toISOString(),
          call_source: 'campaign', // Mark as campaign call
          ...callRequest.metadata
        }
      });
      
      logger.info(`Created pending call record with ID: ${callRecord.id}`);
      
      // Make the call via Bolna.ai
      let bolnaResponse;
      try {
        bolnaResponse = await bolnaService.makeCall(bolnaCallData);
      } catch (bolnaError) {
        // Bolna API failed - mark call record as failed and release concurrency slot
        logger.error(`Bolna API call failed for call ${callRecord.id}:`, bolnaError);
        
        // CRITICAL: Release the pre-reserved concurrency slot
        await concurrencyManager.releaseCallSlot(preReservedCallId);
        logger.info(`Released concurrency slot for failed Bolna API call`, {
          call_id: preReservedCallId,
          user_id: callRequest.userId
        });
        
        await Call.updateCall(callRecord.id, {
          status: 'failed',
          metadata: {
            ...callRecord.metadata,
            error: bolnaError instanceof Error ? bolnaError.message : 'Bolna API call failed'
          }
        });
        throw bolnaError;
      }
      
      // Update active_calls with execution_id immediately
      await concurrencyManager.updateActiveCallWithExecutionId(
        preReservedCallId, 
        bolnaResponse.execution_id
      );
      
      // Update call record with Bolna execution ID
      await Call.updateCall(callRecord.id, {
        bolna_execution_id: bolnaResponse.execution_id,
        metadata: {
          ...callRecord.metadata,
          bolna_execution_id: bolnaResponse.execution_id
        }
      });
      
      logger.info(`Campaign call initiated successfully. Execution ID: ${bolnaResponse.execution_id}, Call ID: ${callRecord.id}`);
      
      return {
        executionId: bolnaResponse.execution_id,
        status: 'initiated',
        callId: callRecord.id
      };

    } catch (error) {
      logger.error('Failed to initiate campaign call:', error);
      throw error;
    }
  }
  
  /**
   * Stop an active call using Bolna.ai API
   */
  static async stopCall(executionId: string, userId: string): Promise<void> {
    try {
      logger.info(`Stopping call with execution ID: ${executionId}`);
      
      // Find the call record
      const call = await Call.findByConversationId(executionId);
      if (!call) {
        throw new Error('Call not found');
      }
      
      // Verify ownership
      if (call.user_id !== userId) {
        throw new Error('Call does not belong to user');
      }
      
      // Stop the call via Bolna.ai
      await bolnaService.stopCall(executionId);
      
      // Update call status
      await Call.updateCall(call.id, {
        status: 'cancelled',
        metadata: {
          ...call.metadata,
          stopped_at: new Date().toISOString(),
          stopped_by_user: true
        }
      });
      
      logger.info(`Call ${executionId} stopped successfully`);
    } catch (error) {
      logger.error('Error stopping call:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to stop call: ${errorMessage}`);
    }
  }
  
  /**
   * Get call status from Bolna.ai API
   */
  static async getCallStatus(executionId: string, userId: string): Promise<any> {
    try {
      logger.info(`Getting status for call execution ID: ${executionId}`);
      
      // Find the call record for ownership verification
      const call = await Call.findByConversationId(executionId);
      if (!call) {
        throw new Error('Call not found');
      }
      
      // Verify ownership
      if (call.user_id !== userId) {
        throw new Error('Call does not belong to user');
      }
      
      // Get status from Bolna.ai
      const status = await bolnaService.getCallStatus(executionId);
      
      logger.info(`Retrieved status for call ${executionId}`);
      return {
        executionId,
        callId: call.id,
        status: status,
        databaseStatus: call.status
      };
    } catch (error) {
      logger.error('Error getting call status:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get call status: ${errorMessage}`);
    }
  }
}