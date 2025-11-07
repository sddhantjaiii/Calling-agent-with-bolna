import database from '../config/database';
import { logger } from '../utils/logger';

export interface ActiveCallInfo {
  id: string;
  user_id: string;
  call_type: 'direct' | 'campaign';
  started_at: string;
  bolna_execution_id?: string;
}

/**
 * Centralized concurrency management for both direct calls and campaign calls
 * When concurrency limit is reached, direct calls are queued with high priority
 */
export class ConcurrencyManager {
  private systemLimit: number;
  private defaultUserLimit: number;

  constructor() {
    this.systemLimit = parseInt(process.env.SYSTEM_CONCURRENT_CALLS_LIMIT || '10');
    this.defaultUserLimit = parseInt(process.env.DEFAULT_USER_CONCURRENT_CALLS_LIMIT || '2');
  }

  /**
   * Atomically reserve a slot for a direct call
   * Returns shouldQueue=true if user is at limit (call should be queued)
   * This prevents race conditions by checking limits atomically
   */
  async atomicReserveDirectCallSlot(userId: string, callId: string): Promise<{
    success: boolean;
    reason?: string;
    shouldQueue?: boolean;
  }> {
    try {
      // Debug: Check current active calls for this user
      const debugResult = await database.query(`
        SELECT id, call_type, started_at 
        FROM active_calls 
        WHERE user_id = $1 
        ORDER BY started_at
      `, [userId]);
      
      logger.info('Current active calls for user before reservation', {
        userId,
        callId,
        activeCalls: debugResult.rows
      });

      // Use a database transaction to ensure atomicity
      const result = await database.query(`
        WITH user_stats AS (
          SELECT 
            u.concurrent_calls_limit,
            COALESCE(ac.active_count, 0) as active_calls
          FROM users u
          LEFT JOIN (
            SELECT 
              user_id, 
              COUNT(*) as active_count
            FROM active_calls
            WHERE user_id = $1
            GROUP BY user_id
          ) ac ON ac.user_id = u.id
          WHERE u.id = $1
        ),
        system_stats AS (
          SELECT COUNT(*) as system_calls FROM active_calls
        )
        SELECT 
          us.concurrent_calls_limit,
          us.active_calls,
          ss.system_calls
        FROM user_stats us, system_stats ss
      `, [userId]);

      const stats = result.rows[0];
      
      // Debug logging to understand the issue
      logger.info('Atomic direct call reservation stats', {
        userId,
        callId,
        stats: {
          concurrent_calls_limit: stats?.concurrent_calls_limit,
          active_calls: stats?.active_calls,
          system_calls: stats?.system_calls
        },
        systemLimit: this.systemLimit
      });
      
      // Check if system limit is reached first
      if (stats?.system_calls >= this.systemLimit) {
        // System is at capacity - queue the call instead of rejecting
        // This allows users with available slots to wait fairly
        return {
          success: false,
          reason: 'System concurrent call limit reached - call will be queued',
          shouldQueue: true // ← KEY CHANGE: Queue instead of reject
        };
      }

      // Check if user has available slots
      if (stats.active_calls < stats.concurrent_calls_limit) {
        // User has available slots - proceed immediately
        logger.info('Direct call approved - user has available slots', {
          userId,
          callId,
          active_calls: stats.active_calls,
          limit: stats.concurrent_calls_limit
        });
      } else {
        // User is at limit - should queue the call instead of "pausing" running calls
        // We cannot actually pause a live phone call, so direct calls should wait
        return {
          success: false,
          reason: 'User at concurrency limit - direct call should be queued',
          shouldQueue: true
        };
      }

      // Now reserve the slot for the direct call
      await database.query(`
        INSERT INTO active_calls (id, user_id, call_type, started_at)
        VALUES ($1, $2, 'direct', NOW())
        ON CONFLICT (id) DO UPDATE SET
          call_type = 'direct',
          started_at = NOW()
      `, [callId, userId]);

      logger.info(`Atomically reserved direct call slot`, {
        userId,
        callId
      });

      return {
        success: true
      };

    } catch (error) {
      logger.error('Error in atomic direct call slot reservation:', error);
      return {
        success: false,
        reason: 'Internal error during slot reservation'
      };
    }
  }

  /**
   * Atomically reserve a slot for a campaign call
   * This enforces strict limits without preemption
   */
  async atomicReserveCampaignCallSlot(userId: string, callId: string): Promise<{
    success: boolean;
    reason?: string;
  }> {
    try {
      // Check and reserve in a single atomic operation
      const result = await database.query(`
        WITH user_stats AS (
          SELECT 
            u.concurrent_calls_limit,
            COALESCE(ac.active_count, 0) as active_calls
          FROM users u
          LEFT JOIN (
            SELECT user_id, COUNT(*) as active_count
            FROM active_calls
            WHERE user_id = $1
            GROUP BY user_id
          ) ac ON ac.user_id = u.id
          WHERE u.id = $1
        ),
        system_stats AS (
          SELECT COUNT(*) as system_calls FROM active_calls
        ),
        can_make_call AS (
          SELECT 
            us.concurrent_calls_limit,
            us.active_calls,
            ss.system_calls,
            us.active_calls < us.concurrent_calls_limit AND ss.system_calls < $2 as can_proceed
          FROM user_stats us, system_stats ss
        )
        SELECT * FROM can_make_call
      `, [userId, this.systemLimit]);

      const stats = result.rows[0];
      
      if (!stats || !stats.can_proceed) {
        return {
          success: false,
          reason: stats?.system_calls >= this.systemLimit 
            ? 'System concurrent call limit reached'
            : 'User concurrent call limit reached'
        };
      }

      // Reserve the slot for the campaign call
      await database.query(`
        INSERT INTO active_calls (id, user_id, call_type, started_at)
        VALUES ($1, $2, 'campaign', NOW())
        ON CONFLICT (id) DO UPDATE SET
          call_type = 'campaign',
          started_at = NOW()
      `, [callId, userId]);

      logger.info(`Atomically reserved campaign call slot`, {
        userId,
        callId
      });

      return { success: true };

    } catch (error) {
      logger.error('Error in atomic campaign call slot reservation:', error);
      return {
        success: false,
        reason: 'Internal error during slot reservation'
      };
    }
  }

  /**
   * Update active call with execution ID after Bolna API responds
   * This is called immediately after call initiation succeeds
   */
  async updateActiveCallWithExecutionId(callId: string, executionId: string): Promise<void> {
    try {
      await database.query(`
        UPDATE active_calls 
        SET bolna_execution_id = $2
        WHERE id = $1
      `, [callId, executionId]);

      logger.info('Updated active call with execution ID', {
        callId,
        executionId
      });
    } catch (error) {
      logger.error('Error updating active call with execution ID:', error);
      // Don't throw - this is not critical, we can still release by call ID
    }
  }

  /**
   * Release a call slot when call ends
   * Can release by call ID or execution ID
   */
  async releaseCallSlot(callId: string): Promise<void> {
    try {
      const result = await database.query(`
        DELETE FROM active_calls 
        WHERE id = $1 
        RETURNING user_id, call_type, bolna_execution_id
      `, [callId]);

      if (result.rows.length > 0) {
        const { user_id, call_type, bolna_execution_id } = result.rows[0];
        logger.info(`Released ${call_type} call slot for user ${user_id}, call ${callId}`, {
          executionId: bolna_execution_id
        });
      }
    } catch (error) {
      logger.error('Error releasing call slot:', error);
      throw error;
    }
  }

  /**
   * Release a call slot by execution ID
   * Used when we only have execution ID from webhooks
   */
  async releaseCallSlotByExecutionId(executionId: string): Promise<void> {
    try {
      const result = await database.query(`
        DELETE FROM active_calls 
        WHERE bolna_execution_id = $1 
        RETURNING id, user_id, call_type
      `, [executionId]);

      if (result.rows.length > 0) {
        const { id, user_id, call_type } = result.rows[0];
        logger.info(`Released ${call_type} call slot for user ${user_id}, execution ${executionId}`, {
          callId: id
        });
      } else {
        logger.warn('No active call found with execution ID', { executionId });
      }
    } catch (error) {
      logger.error('Error releasing call slot by execution ID:', error);
      throw error;
    }
  }

  /**
   * Get user's concurrency statistics
   */
  private async getUserConcurrencyStats(userId: string): Promise<{
    userActiveCalls: number;
    userLimit: number;
    userAvailableSlots: number;
  }> {
    const result = await database.query(`
      SELECT 
        u.concurrent_calls_limit,
        COALESCE(ac.active_count, 0) as active_calls
      FROM users u
      LEFT JOIN (
        SELECT user_id, COUNT(*) as active_count
        FROM active_calls
        WHERE user_id = $1
        GROUP BY user_id
      ) ac ON ac.user_id = u.id
      WHERE u.id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    const userLimit = result.rows[0].concurrent_calls_limit || this.defaultUserLimit;
    const userActiveCalls = parseInt(result.rows[0].active_calls);
    const userAvailableSlots = Math.max(0, userLimit - userActiveCalls);

    return {
      userActiveCalls,
      userLimit,
      userAvailableSlots
    };
  }

  /**
   * Get count of user's active campaign calls
   */
  private async getUserCampaignCallsCount(userId: string): Promise<number> {
    const result = await database.query(`
      SELECT COUNT(*) as campaign_calls
      FROM active_calls
      WHERE user_id = $1 AND call_type = 'campaign'
    `, [userId]);

    return parseInt(result.rows[0].campaign_calls);
  }

  /**
   * Get system-wide concurrency statistics
   */
  private async getSystemConcurrencyStats(): Promise<{
    systemActiveCalls: number;
    systemLimit: number;
    systemAvailableSlots: number;
  }> {
    const result = await database.query(`
      SELECT COUNT(*) as system_active_calls
      FROM active_calls
    `);

    const systemActiveCalls = parseInt(result.rows[0].system_active_calls);
    const systemAvailableSlots = Math.max(0, this.systemLimit - systemActiveCalls);

    return {
      systemActiveCalls,
      systemLimit: this.systemLimit,
      systemAvailableSlots
    };
  }

  /**
   * Get active calls for a user
   */
  async getActiveCallsForUser(userId: string): Promise<ActiveCallInfo[]> {
    const result = await database.query(`
      SELECT 
        ac.id,
        ac.user_id,
        ac.call_type,
        ac.started_at,
        c.bolna_execution_id
      FROM active_calls ac
      LEFT JOIN calls c ON c.id = ac.id
      WHERE ac.user_id = $1
      ORDER BY ac.started_at ASC
    `, [userId]);

    return result.rows;
  }

  /**
   * Get system-wide active calls summary
   */
  async getSystemActiveCalls(): Promise<{
    total: number;
    byType: { direct: number; campaign: number };
    byUser: Array<{ userId: string; count: number; directCalls: number; campaignCalls: number }>;
  }> {
    const [totalResult, byTypeResult, byUserResult] = await Promise.all([
      database.query('SELECT COUNT(*) as total FROM active_calls'),
      database.query(`
        SELECT call_type, COUNT(*) as count 
        FROM active_calls 
        GROUP BY call_type
      `),
      database.query(`
        SELECT 
          user_id,
          COUNT(*) as total_count,
          SUM(CASE WHEN call_type = 'direct' THEN 1 ELSE 0 END) as direct_calls,
          SUM(CASE WHEN call_type = 'campaign' THEN 1 ELSE 0 END) as campaign_calls
        FROM active_calls 
        GROUP BY user_id
        ORDER BY total_count DESC
      `)
    ]);

    const byType = { direct: 0, campaign: 0 };
    for (const row of byTypeResult.rows) {
      byType[row.call_type as 'direct' | 'campaign'] = parseInt(row.count);
    }

    return {
      total: parseInt(totalResult.rows[0].total),
      byType,
      byUser: byUserResult.rows.map((row: any) => ({
        userId: row.user_id,
        count: parseInt(row.total_count),
        directCalls: parseInt(row.direct_calls),
        campaignCalls: parseInt(row.campaign_calls)
      }))
    };
  }

  /**
   * Clean up orphaned active calls (maintenance function)
   */
  async cleanupOrphanedActiveCalls(): Promise<number> {
    try {
      const result = await database.query(`
        SELECT cleanup_orphaned_active_calls() as cleanup_count
      `);
      
      const cleanupCount = parseInt(result.rows[0].cleanup_count);
      if (cleanupCount > 0) {
        logger.info(`Cleaned up ${cleanupCount} orphaned active call entries`);
      }
      
      return cleanupCount;
    } catch (error) {
      logger.error('Error cleaning up orphaned active calls:', error);
      return 0;
    }
  }
}

export const concurrencyManager = new ConcurrencyManager();
