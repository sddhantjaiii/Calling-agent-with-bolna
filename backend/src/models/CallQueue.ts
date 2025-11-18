import { pool } from '../config/database';
import { 
  CallQueueItem, 
  QueueStatus
} from '../types/campaign';

export class CallQueueModel {
  /**
   * Find queue item by ID
   */
  static async findById(id: string, userId: string): Promise<CallQueueItem | null> {
    const result = await pool.query(
      'SELECT * FROM call_queue WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Find queue item by call ID
   */
  static async findByCallId(callId: string): Promise<CallQueueItem | null> {
    const result = await pool.query(
      'SELECT * FROM call_queue WHERE call_id = $1',
      [callId]
    );
    return result.rows[0] || null;
  }

  /**
   * Find queue items by campaign ID
   */
  static async findByCampaignId(
    campaignId: string, 
    userId: string,
    filters?: {
      status?: QueueStatus | QueueStatus[];
      limit?: number;
      offset?: number;
    }
  ): Promise<CallQueueItem[]> {
    let query = 'SELECT * FROM call_queue WHERE campaign_id = $1 AND user_id = $2';
    const params: any[] = [campaignId, userId];
    let paramCount = 2;

    if (filters?.status) {
      paramCount++;
      if (Array.isArray(filters.status)) {
        query += ` AND status = ANY($${paramCount})`;
        params.push(filters.status);
      } else {
        query += ` AND status = $${paramCount}`;
        params.push(filters.status);
      }
    }

    query += ' ORDER BY priority DESC, position ASC, created_at ASC';

    if (filters?.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(filters.limit);
    }

    if (filters?.offset) {
      paramCount++;
      query += ` OFFSET $${paramCount}`;
      params.push(filters.offset);
    }

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get next queued call for a user (uses helper function)
   */
  static async getNextQueued(userId: string): Promise<CallQueueItem | null> {
    const result = await pool.query(
      'SELECT * FROM get_next_queued_call($1)',
      [userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Create a single queue item
   */
  static async create(data: {
    user_id: string;
    campaign_id: string;
    agent_id: string;
    contact_id: string;
    phone_number: string;
    contact_name?: string;
    user_data: any;
    priority: number;
    position: number;
    scheduled_for: Date;
  }): Promise<CallQueueItem> {
    const result = await pool.query(
      `INSERT INTO call_queue (
        user_id, campaign_id, agent_id, contact_id,
        phone_number, contact_name, user_data, priority, position, scheduled_for
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        data.user_id,
        data.campaign_id,
        data.agent_id,
        data.contact_id,
        data.phone_number,
        data.contact_name || null,
        JSON.stringify(data.user_data),
        data.priority,
        data.position,
        data.scheduled_for
      ]
    );
    return result.rows[0];
  }

  /**
   * Create multiple queue items in bulk
   * Splits into batches to avoid PostgreSQL parameter limit (65535)
   */
  static async createBulk(items: Array<{
    user_id: string;
    campaign_id: string;
    agent_id: string;
    contact_id: string;
    phone_number: string;
    contact_name?: string;
    user_data: any;
    priority: number;
    position: number;
    scheduled_for: Date;
  }>): Promise<CallQueueItem[]> {
    if (items.length === 0) return [];

    // PostgreSQL has a parameter limit of ~65535
    // With 10 params per item, we can safely do 6000 items per batch
    const BATCH_SIZE = 6000;
    const allResults: CallQueueItem[] = [];

    for (let batchStart = 0; batchStart < items.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, items.length);
      const batch = items.slice(batchStart, batchEnd);

      const values: string[] = [];
      const params: any[] = [];
      let paramCount = 0;

      batch.forEach((item) => {
        const placeholders = [];
        for (let i = 0; i < 10; i++) {
          placeholders.push(`$${++paramCount}`);
        }
        values.push(`(${placeholders.join(', ')})`);
        
        params.push(
          item.user_id,
          item.campaign_id,
          item.agent_id,
          item.contact_id,
          item.phone_number,
          item.contact_name || null,
          JSON.stringify(item.user_data),
          item.priority,
          item.position,
          item.scheduled_for
        );
      });

      const query = `
        INSERT INTO call_queue (
          user_id, campaign_id, agent_id, contact_id,
          phone_number, contact_name, user_data, priority, position, scheduled_for
        ) VALUES ${values.join(', ')}
        RETURNING *
      `;

      const result = await pool.query(query, params);
      allResults.push(...result.rows);
    }

    return allResults;
  }

  /**
   * Update queue item status
   */
  static async updateStatus(
    id: string, 
    userId: string, 
    status: QueueStatus,
    additionalData?: {
      started_at?: Date;
      completed_at?: Date;
      call_id?: string;
      failure_reason?: string;
    }
  ): Promise<CallQueueItem | null> {
    const updates: string[] = ['status = $3', 'updated_at = CURRENT_TIMESTAMP'];
    const params: any[] = [id, userId, status];
    let paramCount = 3;

    if (additionalData?.started_at) {
      paramCount++;
      updates.push(`started_at = $${paramCount}`);
      params.push(additionalData.started_at);
    }

    if (additionalData?.completed_at) {
      paramCount++;
      updates.push(`completed_at = $${paramCount}`);
      params.push(additionalData.completed_at);
    }

    if (additionalData?.call_id) {
      paramCount++;
      updates.push(`call_id = $${paramCount}`);
      params.push(additionalData.call_id);
    }

    if (additionalData?.failure_reason) {
      paramCount++;
      updates.push(`failure_reason = $${paramCount}`);
      params.push(additionalData.failure_reason);
    }

    const query = `
      UPDATE call_queue
      SET ${updates.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;

    const result = await pool.query(query, params);
    return result.rows[0] || null;
  }

  /**
   * Mark queue item as processing (being called)
   */
  static async markAsProcessing(id: string, userId: string): Promise<CallQueueItem | null> {
    return this.updateStatus(id, userId, 'processing', {
      started_at: new Date(),
      call_id: undefined // Will be set when call is created
    });
  }

  /**
   * Mark queue item as completed and delete it immediately
   */
  static async markAsCompleted(
    id: string, 
    userId: string, 
    callId?: string
  ): Promise<CallQueueItem | null> {
    // Delete completed items immediately - call data already in calls table
    const result = await pool.query(
      `DELETE FROM call_queue 
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Mark queue item as failed and delete it immediately
   */
  static async markAsFailed(
    id: string, 
    userId: string, 
    reason: string
  ): Promise<CallQueueItem | null> {
    // Delete failed items immediately - no need to keep in queue
    const result = await pool.query(
      `DELETE FROM call_queue 
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Cancel queue item
   */
  static async cancel(id: string, userId: string): Promise<CallQueueItem | null> {
    return this.updateStatus(id, userId, 'cancelled', {
      completed_at: new Date()
    });
  }

  /**
   * Get queue statistics for user
   */
  static async getStatistics(userId: string): Promise<{
    total_queued: number;
    total_processing: number;
    total_completed: number;
    total_failed: number;
    total_cancelled: number;
    next_position: number;
  }> {
    const result = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'queued')::int as total_queued,
        COUNT(*) FILTER (WHERE status = 'processing')::int as total_processing,
        COUNT(*) FILTER (WHERE status = 'completed')::int as total_completed,
        COUNT(*) FILTER (WHERE status = 'failed')::int as total_failed,
        COUNT(*) FILTER (WHERE status = 'cancelled')::int as total_cancelled,
        COALESCE(MIN(position) FILTER (WHERE status = 'queued'), 0) as next_position
      FROM call_queue
      WHERE user_id = $1`,
      [userId]
    );

    const row = result.rows[0];
    return {
      total_queued: row.total_queued,
      total_processing: row.total_processing,
      total_completed: row.total_completed,
      total_failed: row.total_failed,
      total_cancelled: row.total_cancelled,
      next_position: row.next_position
    };
  }

  /**
   * Count active calls for user (uses helper function)
   */
  static async countActiveCalls(userId: string): Promise<number> {
    const result = await pool.query(
      'SELECT count_active_calls($1) as count',
      [userId]
    );
    return result.rows[0].count;
  }

  /**
   * Count system-wide active calls (uses helper function)
   */
  static async countSystemActiveCalls(): Promise<number> {
    const result = await pool.query('SELECT count_system_active_calls() as count');
    return result.rows[0].count;
  }

  /**
   * Delete queue items by contact ID
   */
  static async deleteByContact(contactId: string, userId: string): Promise<number> {
    const result = await pool.query(
      'DELETE FROM call_queue WHERE contact_id = $1 AND user_id = $2 AND status = $3',
      [contactId, userId, 'queued']
    );
    return result.rowCount || 0;
  }

  /**
   * Delete queue items by campaign ID
   */
  static async deleteByCampaign(campaignId: string, userId: string): Promise<number> {
    const result = await pool.query(
      'DELETE FROM call_queue WHERE campaign_id = $1 AND user_id = $2 AND status = $3',
      [campaignId, userId, 'queued']
    );
    return result.rowCount || 0;
  }

  /**
   * Get queue items scheduled for now (respects time windows)
   */
  static async getScheduledForNow(limit?: number): Promise<CallQueueItem[]> {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 8); // HH:MM:SS

    let query = `
      SELECT q.* 
      FROM call_queue q
      JOIN call_campaigns c ON q.campaign_id = c.id
      WHERE q.status = 'queued'
        AND q.scheduled_for <= $1
        AND c.status = 'active'
        AND c.first_call_time <= $2
        AND c.last_call_time >= $2
      ORDER BY q.priority DESC, q.position ASC, q.created_at ASC
    `;

    const params: any[] = [now, currentTime];

    if (limit) {
      query += ' LIMIT $3';
      params.push(limit);
    }

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Update round-robin allocation timestamp
   */
  static async updateRoundRobinAllocation(id: string): Promise<void> {
    await pool.query(
      'UPDATE call_queue SET last_system_allocation_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
  }

  /**
   * Get user's queue items with pagination
   */
  static async getUserQueue(
    userId: string,
    options?: {
      status?: QueueStatus[];
      limit?: number;
      offset?: number;
    }
  ): Promise<{ items: CallQueueItem[]; total: number }> {
    let whereClause = 'WHERE user_id = $1';
    const params: any[] = [userId];
    let paramCount = 1;

    if (options?.status && options.status.length > 0) {
      paramCount++;
      whereClause += ` AND status = ANY($${paramCount})`;
      params.push(options.status);
    }

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*)::int as total FROM call_queue ${whereClause}`,
      params
    );
    const total = countResult.rows[0].total;

    // Get items
    let query = `SELECT * FROM call_queue ${whereClause} ORDER BY priority DESC, position ASC, created_at ASC`;

    if (options?.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(options.limit);
    }

    if (options?.offset) {
      paramCount++;
      query += ` OFFSET $${paramCount}`;
      params.push(options.offset);
    }

    const result = await pool.query(query, params);

    return {
      items: result.rows,
      total
    };
  }

  /**
   * Add a direct call to queue with high priority
   */
  static async addDirectCallToQueue(data: {
    user_id: string;
    agent_id: string;
    contact_id: string;
    phone_number: string;
    contact_name?: string;
    priority?: number;
  }): Promise<CallQueueItem> {
    // Get next position for this user's direct calls
    const positionResult = await pool.query(
      `SELECT COALESCE(MAX(position), 0) + 1 as next_position 
       FROM call_queue 
       WHERE user_id = $1 AND call_type = 'direct'`,
      [data.user_id]
    );
    const position = positionResult.rows[0].next_position;

    const result = await pool.query(
      `INSERT INTO call_queue (
        user_id, campaign_id, agent_id, contact_id, 
        phone_number, contact_name, user_data, 
        call_type, priority, position, scheduled_for, status
      ) VALUES ($1, NULL, $2, $3, $4, $5, $6, 'direct', $7, $8, NOW(), 'queued')
      RETURNING *`,
      [
        data.user_id,
        data.agent_id,
        data.contact_id,
        data.phone_number,
        data.contact_name || null,
        JSON.stringify({ summary: 'Direct call', next_action: 'Make direct call' }),
        data.priority || 100, // Direct calls get high priority (100 vs campaign default 0)
        position
      ]
    );
    
    return result.rows[0];
  }

  /**
   * Get next direct call for a user
   */
  static async getNextDirectCall(userId: string): Promise<CallQueueItem | null> {
    const result = await pool.query(
      'SELECT * FROM get_next_direct_call_queued($1)',
      [userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Count direct calls in queue for a user
   */
  static async countDirectCallsInQueue(userId: string): Promise<number> {
    const result = await pool.query(
      'SELECT count_user_direct_calls_queued($1) as count',
      [userId]
    );
    return parseInt(result.rows[0].count);
  }

  /**
   * Get queue position for a specific call
   */
  static async getQueuePosition(queueId: string): Promise<number | null> {
    const result = await pool.query(
      'SELECT get_call_queue_position($1) as position',
      [queueId]
    );
    return result.rows[0].position;
  }

  /**
   * Get queue status by type (for monitoring)
   */
  static async getQueueStatusByType(userId: string): Promise<{
    direct: { queued: number; processing: number; total: number };
    campaign: { queued: number; processing: number; total: number };
  }> {
    const result = await pool.query(
      `SELECT 
        call_type,
        status,
        COUNT(*)::int as count
       FROM call_queue
       WHERE user_id = $1
       GROUP BY call_type, status`,
      [userId]
    );

    const stats = {
      direct: { queued: 0, processing: 0, total: 0 },
      campaign: { queued: 0, processing: 0, total: 0 }
    };

    result.rows.forEach((row: any) => {
      const type = row.call_type as 'direct' | 'campaign';
      const count = parseInt(row.count);
      
      stats[type].total += count;
      
      if (row.status === 'queued') {
        stats[type].queued = count;
      } else if (row.status === 'processing') {
        stats[type].processing = count;
      }
    });

    return stats;
  }
}

export default CallQueueModel;