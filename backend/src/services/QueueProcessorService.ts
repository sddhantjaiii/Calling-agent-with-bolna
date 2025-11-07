import { CallQueueModel } from '../models/CallQueue';
import { CallCampaignModel } from '../models/CallCampaign';
import { userService } from './userService';
import { concurrencyManager } from './ConcurrencyManager';
import database from '../config/database';
import crypto from 'crypto';
import * as Sentry from '@sentry/node';
import { hashPhoneNumber, hashUserId } from '../utils/sentryHelpers';

// Global lock to prevent multiple QueueProcessorService instances from processing simultaneously
let globalProcessingLock = false;

export class QueueProcessorService {
  private systemConcurrentLimit: number;
  private defaultUserLimit: number;
  private isProcessing: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.systemConcurrentLimit = parseInt(
      process.env.SYSTEM_CONCURRENT_CALLS_LIMIT || '10'
    );
    this.defaultUserLimit = parseInt(
      process.env.DEFAULT_USER_CONCURRENT_CALLS_LIMIT || '2'
    );
  }

  /**
   * Start the queue processor
   */
  start(): void {
    const interval = parseInt(process.env.QUEUE_PROCESSOR_INTERVAL || '10000');
    
    console.log(`[QueueProcessor] Starting with interval: ${interval}ms`);
    console.log(`[QueueProcessor] System limit: ${this.systemConcurrentLimit}, Default user limit: ${this.defaultUserLimit}`);

    this.intervalId = setInterval(() => {
      this.processQueue().catch((error) => {
        console.error('[QueueProcessor] Error processing queue:', error);
      });
    }, interval);

    // Run immediately on start
    this.processQueue().catch((error) => {
      console.error('[QueueProcessor] Error processing queue:', error);
    });
  }

  /**
   * Stop the queue processor
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[QueueProcessor] Stopped');
    }
  }

  /**
   * Main queue processing logic
   * 
   * CRITICAL: Uses bulletproof async error handling to guarantee lock release
   * The immediately-invoked async function ensures that ANY promise rejection
   * (handled or unhandled) is caught, preventing permanent lock situations.
   */
  async processQueue(): Promise<void> {
    // Check global lock first (prevents multiple instances from processing)
    if (globalProcessingLock) {
      console.log('[QueueProcessor] Global lock active, another instance is processing...');
      return;
    }
    
    if (this.isProcessing) {
      console.log('[QueueProcessor] Already processing, skipping...');
      return;
    }

    // Acquire global lock
    globalProcessingLock = true;
    this.isProcessing = true;

    try {
      // Wrap ALL async logic in immediately-invoked async function
      // This guarantees that promise rejections are caught by the catch block
      await (async () => {
        // Step 1: Check system-wide limit
        const systemActiveCalls = await CallQueueModel.countSystemActiveCalls();
        
        if (systemActiveCalls >= this.systemConcurrentLimit) {
          console.log(`[QueueProcessor] System limit reached: ${systemActiveCalls}/${this.systemConcurrentLimit}`);
          return;
        }

        console.log(`[QueueProcessor] System calls: ${systemActiveCalls}/${this.systemConcurrentLimit}`);

        // Step 2: Get users with pending calls
        const usersWithPendingCalls = await this.getUsersWithPendingCalls();
        
        if (usersWithPendingCalls.length === 0) {
          console.log('[QueueProcessor] No pending calls in queue');
          return;
        }

        console.log(`[QueueProcessor] Found ${usersWithPendingCalls.length} users with pending calls`);

        // Step 3: Round-robin allocation
        for (const user of usersWithPendingCalls) {
          // Check if we've hit system limit
          const currentSystemCalls = await CallQueueModel.countSystemActiveCalls();
          if (currentSystemCalls >= this.systemConcurrentLimit) {
            console.log('[QueueProcessor] System limit reached during allocation');
            break;
          }

          // Check user's limit
          const userActiveCalls = await CallQueueModel.countActiveCalls(user.user_id);
          const userLimit = user.concurrent_calls_limit || this.defaultUserLimit;

          if (userActiveCalls >= userLimit) {
            console.log(`[QueueProcessor] User ${user.user_id} at limit: ${userActiveCalls}/${userLimit}`);
            continue;
          }

          // Allocate next call for this user
          const availableSlots = Math.min(
            userLimit - userActiveCalls,
            this.systemConcurrentLimit - currentSystemCalls
          );

          console.log(`[QueueProcessor] Allocating ${availableSlots} call(s) for user ${user.user_id}`);
          
          for (let i = 0; i < availableSlots; i++) {
            const allocated = await this.allocateNextCall(user.user_id);
            if (!allocated) break; // No more queued calls for this user
          }
        }
      })();
    } catch (error) {
      // This catch block will ALWAYS execute for any error, including unhandled promise rejections
      console.error('[QueueProcessor] CRITICAL: Error in processQueue, releasing locks', error);
    } finally {
      // GUARANTEED to execute - releases locks under ALL circumstances
      this.isProcessing = false;
      globalProcessingLock = false;
    }
  }

  /**
   * Get users who have pending calls in queue
   */
  private async getUsersWithPendingCalls(): Promise<Array<{
    user_id: string;
    concurrent_calls_limit: number;
    pending_count: number;
  }>> {
    const result = await database.query(`
      SELECT 
        u.id as user_id,
        u.concurrent_calls_limit,
        COUNT(q.id)::int as pending_count
      FROM users u
      INNER JOIN call_queue q ON q.user_id = u.id
      LEFT JOIN call_campaigns c ON q.campaign_id = c.id
      WHERE q.status = 'queued'
        AND q.scheduled_for <= NOW()
        AND (
          -- Direct calls (no campaign requirement)
          q.call_type = 'direct'
          OR
          -- Campaign calls (must have active campaign)
          (q.call_type = 'campaign' AND c.status = 'active')
        )
      GROUP BY u.id, u.concurrent_calls_limit
      ORDER BY MIN(q.last_system_allocation_at) NULLS FIRST, MIN(q.created_at) ASC
    `);

    return result.rows;
  }

  /**
   * Allocate next call for a user
   */
  private async allocateNextCall(userId: string): Promise<boolean> {
    // First check if user has credits available
    const user = await userService.getUserProfile(userId);
    if (!user || user.credits <= 0) {
      console.log(`[QueueProcessor] User ${userId} has insufficient credits (${user?.credits || 0}), pausing campaigns`);
      
      // Pause all active campaigns for this user
      await this.pauseCampaignsForInsufficientCredits(userId);
      
      return false;
    }

    // Get next queued call using the database function
    const queueItem = await CallQueueModel.getNextQueued(userId);
    
    if (!queueItem) {
      console.log(`[QueueProcessor] No queued calls for user ${userId}`);
      return false;
    }

    console.log(`[QueueProcessor] Allocating call for user ${userId}, queue_id: ${queueItem.id}, credits: ${user.credits}`);

    try {
      // Mark as processing
      await CallQueueModel.markAsProcessing(queueItem.id, userId);

      // Update round-robin allocation timestamp
      await CallQueueModel.updateRoundRobinAllocation(queueItem.id);

      // Initiate the call
      await this.initiateCall(queueItem);

      return true;
    } catch (error) {
      console.error(`[QueueProcessor] Error allocating call:`, error);
      
      // Mark as failed
      await CallQueueModel.markAsFailed(
        queueItem.id,
        userId,
        error instanceof Error ? error.message : 'Unknown error'
      );

      return false;
    }
  }

  /**
   * Initiate a call from the queue using atomic concurrency management
   * Supports both direct and campaign calls with priority handling
   */
  private async initiateCall(queueItem: any): Promise<void> {
    // Generate unique call ID first
    const callId = crypto.randomUUID();

    // Determine call type (direct calls have no campaign_id)
    const isDirectCall = !queueItem.campaign_id;
    const callType = isDirectCall ? 'direct' : 'campaign';

    console.log(`[QueueProcessor] Processing ${callType} call from queue:`, {
      queue_id: queueItem.id,
      user_id: queueItem.user_id,
      call_type: callType,
      priority: queueItem.priority
    });

    // Start Sentry span for campaign call monitoring
    return await Sentry.startSpan(
      {
        op: 'queue.initiate_call',
        name: `Initiate ${callType} Call from Queue`,
        attributes: {
          queue_id: queueItem.id,
          user_id_hash: hashUserId(queueItem.user_id),
          call_type: callType,
          campaign_id: queueItem.campaign_id || 'none',
          priority: queueItem.priority
        }
      },
      async () => {
        Sentry.addBreadcrumb({
          category: 'queue',
          message: `Processing ${callType} call from queue`,
          level: 'info',
          data: {
            queue_id: queueItem.id,
            user_id_hash: hashUserId(queueItem.user_id),
            phone_number_hash: hashPhoneNumber(queueItem.phone_number || '')
          }
        });

        // **Use appropriate atomic slot reservation based on call type**
        const reservationResult = isDirectCall
          ? await concurrencyManager.atomicReserveDirectCallSlot(queueItem.user_id, callId)
          : await concurrencyManager.atomicReserveCampaignCallSlot(queueItem.user_id, callId);
        
        if (!reservationResult.success) {
          console.log(`[QueueProcessor] ${callType} call blocked for user ${queueItem.user_id}: ${reservationResult.reason}`);
          
          // This is expected behavior when limits are reached
          Sentry.addBreadcrumb({
            category: 'queue',
            message: `${callType} call blocked - concurrency limit`,
            level: 'info',
            data: {
              reason: reservationResult.reason,
              user_id_hash: hashUserId(queueItem.user_id)
            }
          });
          
          // Keep item in queue but add failure reason for tracking
          await CallQueueModel.updateStatus(queueItem.id, queueItem.user_id, 'queued', {
            failure_reason: `Concurrency limit: ${reservationResult.reason}`
          });
          
          return;
        }

        console.log(`[QueueProcessor] Reserved ${callType} call slot ${callId} for user ${queueItem.user_id}`);

        Sentry.addBreadcrumb({
          category: 'queue',
          message: `Reserved ${callType} call slot`,
          level: 'info',
          data: {
            call_id: callId,
            user_id_hash: hashUserId(queueItem.user_id)
          }
        });

        try {
          // Import call service dynamically to avoid circular dependencies
          const { CallService } = await import('./callService');

          if (isDirectCall) {
            // **Direct call path**
            const callResponse = await CallService.initiateCall({
              userId: queueItem.user_id,
              agentId: queueItem.agent_id,
              contactId: queueItem.contact_id || undefined,
              phoneNumber: queueItem.phone_number,
              metadata: {
                preReservedCallId: callId, // Pass pre-reserved ID
                queue_id: queueItem.id,
                call_source: 'direct_queue' // Mark as queued direct call
              }
            });

            // Update queue item with call_id
            await CallQueueModel.updateStatus(queueItem.id, queueItem.user_id, 'processing', {
              call_id: callResponse.callId
            });

            console.log(`[QueueProcessor] Direct call initiated from queue: ${callResponse.callId} for queue_id: ${queueItem.id}`);
            
            Sentry.addBreadcrumb({
              category: 'queue',
              message: 'Direct call initiated successfully',
              level: 'info',
              data: {
                call_id: callResponse.callId,
                queue_id: queueItem.id
              }
            });
          } else {
            // **Campaign call path** (existing logic)
            const callResponse = await CallService.initiateCampaignCall({
              userId: queueItem.user_id,
              agentId: queueItem.agent_id,
              contactId: queueItem.contact_id,
              phoneNumber: queueItem.phone_number,
              metadata: {
                queue_id: queueItem.id,
                campaign_id: queueItem.campaign_id,
                user_data: queueItem.user_data,
                call_source: 'campaign' // Mark as campaign call
              }
            }, callId);

            // Update queue item with call_id
            await CallQueueModel.updateStatus(queueItem.id, queueItem.user_id, 'processing', {
              call_id: callResponse.callId
            });

            console.log(`[QueueProcessor] Campaign call initiated with atomic slot reservation: ${callResponse.callId} for queue_id: ${queueItem.id}`);
            
            Sentry.addBreadcrumb({
              category: 'queue',
              message: 'Campaign call initiated successfully',
              level: 'info',
              data: {
                call_id: callResponse.callId,
                campaign_id: queueItem.campaign_id,
                queue_id: queueItem.id
              }
            });
          }

        } catch (apiError) {
          // **CRITICAL: Release reserved slot if call initiation fails**
          console.error(`[QueueProcessor] ${callType} call initiation failed, releasing reserved slot ${callId}:`, apiError);
          
          // Capture campaign call failure with full context
          Sentry.captureException(apiError, {
            tags: {
              error_type: `${callType}_call_queue_failure`,
              user_id_hash: hashUserId(queueItem.user_id),
              campaign_id: queueItem.campaign_id || 'none',
              severity: 'high'
            },
            contexts: {
              queue_details: {
                queue_id: queueItem.id,
                user_id_hash: hashUserId(queueItem.user_id),
                agent_id: queueItem.agent_id,
                contact_id: queueItem.contact_id,
                phone_number_hash: hashPhoneNumber(queueItem.phone_number || ''),
                campaign_id: queueItem.campaign_id,
                call_type: callType,
                call_id: callId,
                priority: queueItem.priority
              },
              error_details: {
                message: apiError instanceof Error ? apiError.message : 'Unknown error',
                name: apiError instanceof Error ? apiError.name : 'Unknown',
                note: 'Slot released after failure'
              }
            }
          });
          
          await concurrencyManager.releaseCallSlot(callId);
          
          // Update queue item to failed status
          await CallQueueModel.updateStatus(queueItem.id, queueItem.user_id, 'failed', {
            failure_reason: `${callType} call initiation failed after slot reservation`
          });
        }
      }
    );
  }

  /**
   * Check if current time is within campaign's time window
   */
  private isWithinTimeWindow(firstCallTime: string, lastCallTime: string): boolean {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 8); // HH:MM:SS

    return currentTime >= firstCallTime && currentTime <= lastCallTime;
  }

  /**
   * Get system concurrency status
   */
  async getSystemStatus(): Promise<{
    system_active_calls: number;
    system_limit: number;
    available_slots: number;
    is_processing: boolean;
  }> {
    const activeСalls = await CallQueueModel.countSystemActiveCalls();
    
    return {
      system_active_calls: activeСalls,
      system_limit: this.systemConcurrentLimit,
      available_slots: Math.max(0, this.systemConcurrentLimit - activeСalls),
      is_processing: this.isProcessing
    };
  }

  /**
   * Get user's concurrency status
   */
  async getUserStatus(userId: string): Promise<{
    user_active_calls: number;
    user_limit: number;
    available_slots: number;
    queued_calls: number;
  }> {
    const activeCalls = await CallQueueModel.countActiveCalls(userId);
    
    // Get user's limit from database
    const userResult = await database.query(
      'SELECT concurrent_calls_limit FROM users WHERE id = $1',
      [userId]
    );
    const userLimit = userResult.rows[0]?.concurrent_calls_limit || this.defaultUserLimit;

    // Get queued calls count
    const queueResult = await database.query(
      `SELECT COUNT(*)::int as count 
       FROM call_queue 
       WHERE user_id = $1 AND status = 'queued'`,
      [userId]
    );
    const queuedCalls = queueResult.rows[0].count;

    return {
      user_active_calls: activeCalls,
      user_limit: userLimit,
      available_slots: Math.max(0, userLimit - activeCalls),
      queued_calls: queuedCalls
    };
  }

  /**
   * Pause all active campaigns for user when credits are insufficient
   */
  private async pauseCampaignsForInsufficientCredits(userId: string): Promise<void> {
    try {
      console.log(`[QueueProcessor] Pausing campaigns for user ${userId} due to insufficient credits`);
      
      // Update all active campaigns to 'paused' status
      await database.query(`
        UPDATE call_campaigns 
        SET status = 'paused',
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 
        AND status = 'active'
      `, [userId]);

      console.log(`[QueueProcessor] Campaigns paused for user ${userId}`);
    } catch (error) {
      console.error(`[QueueProcessor] Error pausing campaigns for user ${userId}:`, error);
    }
  }
}
