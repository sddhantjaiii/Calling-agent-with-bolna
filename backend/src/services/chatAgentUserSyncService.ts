import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../utils/logger';
import { databaseService } from './databaseService';

/**
 * Chat Agent User Sync Service
 * 
 * Syncs user creation from main dashboard to Chat Agent Server (WhatsApp microservice)
 * Implements retry logic: immediate → 60 minutes → 12 hours
 * 
 * Architecture:
 * User Registration (authService) → This Service → Chat Agent Server (port 4000)
 */

const CHAT_AGENT_SERVER_URL = process.env.CHAT_AGENT_SERVER_URL || 'http://localhost:4000';

// Retry intervals in milliseconds
const RETRY_INTERVALS = {
  FIRST: 0,                    // Immediate (attempt 1)
  SECOND: 60 * 60 * 1000,      // 60 minutes (attempt 2)
  THIRD: 12 * 60 * 60 * 1000,  // 12 hours (attempt 3)
};

interface CreateUserRequest {
  user_id: string;
  email: string;
}

interface SyncResult {
  success: boolean;
  error?: string;
  shouldRetry?: boolean;
}

class ChatAgentUserSyncService {
  private client: AxiosInstance;
  private retryCheckInterval: NodeJS.Timeout | null = null;
  private readonly RETRY_CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes for pending retries

  constructor() {
    this.client = axios.create({
      baseURL: CHAT_AGENT_SERVER_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('📤 Chat Agent Server Request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          baseURL: config.baseURL,
        });
        return config;
      },
      (error) => {
        logger.error('❌ Chat Agent Server Request Error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('📥 Chat Agent Server Response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error: AxiosError) => {
        logger.error('❌ Chat Agent Server Response Error', {
          status: error.response?.status,
          url: error.config?.url,
          error: error.response?.data || error.message,
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Initialize the service - start retry check interval
   */
  initialize(): void {
    if (!process.env.CHAT_AGENT_SERVER_URL) {
      logger.warn('⚠️ CHAT_AGENT_SERVER_URL not configured, Chat Agent user sync disabled');
      return;
    }

    logger.info('🚀 Initializing Chat Agent User Sync Service');
    
    // Start periodic retry check
    this.retryCheckInterval = setInterval(() => {
      this.processRetryQueue().catch(error => {
        logger.error('❌ Error processing user sync retry queue', { error: error.message });
      });
    }, this.RETRY_CHECK_INTERVAL);

    // Run immediately on startup
    this.processRetryQueue().catch(error => {
      logger.error('❌ Error processing user sync retry queue on startup', { error: error.message });
    });

    logger.info('✅ Chat Agent User Sync Service initialized', {
      retryCheckInterval: `${this.RETRY_CHECK_INTERVAL / 60000} minutes`,
    });
  }

  /**
   * Stop the service
   */
  stop(): void {
    if (this.retryCheckInterval) {
      clearInterval(this.retryCheckInterval);
      this.retryCheckInterval = null;
    }
    logger.info('🛑 Chat Agent User Sync Service stopped');
  }

  /**
   * Sync a newly registered user to Chat Agent Server
   * Called from authService.register()
   */
  async syncNewUser(userId: string, email: string): Promise<SyncResult> {
    if (!process.env.CHAT_AGENT_SERVER_URL) {
      logger.warn('⚠️ CHAT_AGENT_SERVER_URL not configured, skipping user sync', { userId });
      return { success: false, error: 'CHAT_AGENT_SERVER_URL not configured', shouldRetry: false };
    }

    logger.info('🔄 Syncing new user to Chat Agent Server', { userId, email });

    // Try immediate sync
    const result = await this.attemptSync(userId, email);
    
    if (result.success) {
      logger.info('✅ User synced to Chat Agent Server successfully', { userId });
      return result;
    }

    // If failed, schedule for retry
    logger.warn('⚠️ Failed to sync user to Chat Agent Server, scheduling retry', { 
      userId, 
      error: result.error 
    });
    
    await this.scheduleRetry(userId, email, 1, result.error);
    
    return result;
  }

  /**
   * Attempt to create user in Chat Agent Server
   */
  private async attemptSync(userId: string, email: string): Promise<SyncResult> {
    try {
      const requestBody: CreateUserRequest = {
        user_id: userId,
        email: email,
      };

      const response = await this.client.post('/api/v1/users', requestBody);

      if (response.data?.success) {
        return { success: true };
      }

      return { 
        success: false, 
        error: response.data?.message || 'Unknown error',
        shouldRetry: true 
      };
    } catch (error: any) {
      const statusCode = error.response?.status;
      
      // 409 Conflict means user already exists - that's fine
      if (statusCode === 409) {
        logger.info('ℹ️ User already exists in Chat Agent Server', { userId });
        return { success: true };
      }

      // 4xx errors (except 409) - don't retry, it's a client error
      if (statusCode && statusCode >= 400 && statusCode < 500) {
        return { 
          success: false, 
          error: error.response?.data?.message || error.message,
          shouldRetry: false 
        };
      }

      // 5xx errors or network errors - retry
      return { 
        success: false, 
        error: error.message || 'Network error',
        shouldRetry: true 
      };
    }
  }

  /**
   * Schedule a user sync for retry
   */
  private async scheduleRetry(
    userId: string, 
    email: string, 
    attemptNumber: number,
    lastError?: string
  ): Promise<void> {
    if (attemptNumber > 3) {
      logger.error('❌ Max retries exceeded for user sync', { userId, attemptNumber });
      return;
    }

    // Calculate next retry time
    let retryDelay: number;
    switch (attemptNumber) {
      case 1:
        retryDelay = RETRY_INTERVALS.SECOND; // 60 minutes
        break;
      case 2:
        retryDelay = RETRY_INTERVALS.THIRD;  // 12 hours
        break;
      default:
        return; // No more retries
    }

    const nextRetryAt = new Date(Date.now() + retryDelay);

    try {
      // Upsert into pending_user_syncs table
      await databaseService.query(`
        INSERT INTO pending_user_syncs (user_id, email, attempt_number, next_retry_at, last_error)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          attempt_number = $3,
          next_retry_at = $4,
          last_error = $5,
          updated_at = NOW()
      `, [userId, email, attemptNumber, nextRetryAt, lastError]);

      logger.info('📅 Scheduled user sync retry', { 
        userId, 
        attemptNumber, 
        nextRetryAt: nextRetryAt.toISOString() 
      });
    } catch (error: any) {
      logger.error('❌ Failed to schedule user sync retry', { 
        userId, 
        error: error.message 
      });
    }
  }

  /**
   * Process the retry queue - called periodically
   */
  async processRetryQueue(): Promise<void> {
    try {
      // Get all pending syncs that are due
      const result = await databaseService.query(`
        SELECT user_id, email, attempt_number, last_error
        FROM pending_user_syncs
        WHERE next_retry_at <= NOW()
        ORDER BY next_retry_at ASC
        LIMIT 50
      `);

      if (result.rows.length === 0) {
        return;
      }

      logger.info(`🔄 Processing ${result.rows.length} pending user syncs`);

      for (const row of result.rows) {
        const { user_id, email, attempt_number } = row;
        
        const syncResult = await this.attemptSync(user_id, email);
        
        if (syncResult.success) {
          // Remove from pending queue
          await this.removePendingSync(user_id);
          logger.info('✅ Retry successful for user sync', { userId: user_id });
        } else if (syncResult.shouldRetry && attempt_number < 3) {
          // Schedule next retry
          await this.scheduleRetry(user_id, email, attempt_number + 1, syncResult.error);
        } else {
          // Max retries reached or shouldn't retry
          await this.markAsFailed(user_id, syncResult.error);
          logger.error('❌ User sync failed after max retries', { 
            userId: user_id, 
            error: syncResult.error 
          });
        }
      }
    } catch (error: any) {
      logger.error('❌ Error processing user sync retry queue', { error: error.message });
    }
  }

  /**
   * Remove a pending sync after successful completion
   */
  private async removePendingSync(userId: string): Promise<void> {
    await databaseService.query(`
      DELETE FROM pending_user_syncs WHERE user_id = $1
    `, [userId]);
  }

  /**
   * Mark a sync as permanently failed
   */
  private async markAsFailed(userId: string, error?: string): Promise<void> {
    await databaseService.query(`
      UPDATE pending_user_syncs 
      SET status = 'failed', 
          last_error = $2,
          updated_at = NOW()
      WHERE user_id = $1
    `, [userId, error]);
  }

  /**
   * Get sync status for a user (for admin/debugging)
   */
  async getSyncStatus(userId: string): Promise<{
    synced: boolean;
    pending?: boolean;
    failed?: boolean;
    attemptNumber?: number;
    nextRetryAt?: Date;
    lastError?: string;
  }> {
    const result = await databaseService.query(`
      SELECT attempt_number, next_retry_at, last_error, status
      FROM pending_user_syncs
      WHERE user_id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return { synced: true };
    }

    const row = result.rows[0];
    return {
      synced: false,
      pending: row.status !== 'failed',
      failed: row.status === 'failed',
      attemptNumber: row.attempt_number,
      nextRetryAt: row.next_retry_at,
      lastError: row.last_error,
    };
  }

  /**
   * Get stats about pending syncs (for monitoring)
   */
  async getStats(): Promise<{
    pending: number;
    failed: number;
    nextRetryDue: Date | null;
  }> {
    const result = await databaseService.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        MIN(next_retry_at) FILTER (WHERE status = 'pending') as next_retry_due
      FROM pending_user_syncs
    `);

    const row = result.rows[0];
    return {
      pending: parseInt(row.pending || '0'),
      failed: parseInt(row.failed || '0'),
      nextRetryDue: row.next_retry_due,
    };
  }

  /**
   * Manually retry a failed sync (for admin use)
   */
  async retryFailedSync(userId: string): Promise<SyncResult> {
    const statusResult = await databaseService.query(`
      SELECT email FROM pending_user_syncs WHERE user_id = $1
    `, [userId]);

    if (statusResult.rows.length === 0) {
      // Check if user exists in main DB
      const userResult = await databaseService.query(`
        SELECT email FROM users WHERE id = $1
      `, [userId]);

      if (userResult.rows.length === 0) {
        return { success: false, error: 'User not found' };
      }

      return this.syncNewUser(userId, userResult.rows[0].email);
    }

    const email = statusResult.rows[0].email;
    
    // Reset to attempt 1 and try again
    await databaseService.query(`
      UPDATE pending_user_syncs 
      SET attempt_number = 0, 
          status = 'pending',
          next_retry_at = NOW(),
          updated_at = NOW()
      WHERE user_id = $1
    `, [userId]);

    return this.attemptSync(userId, email);
  }
}

// Export singleton instance
export const chatAgentUserSyncService = new ChatAgentUserSyncService();
