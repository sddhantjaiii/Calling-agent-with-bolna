import { pool } from '../config/database';
import { 
  CallCampaign, 
  CampaignStatus,
  CreateCampaignRequest,
  UpdateCampaignRequest,
  CampaignAnalytics 
} from '../types/campaign';

export class CallCampaignModel {
  /**
   * Find campaign by ID (with user_id for data isolation)
   */
  static async findById(id: string, userId: string): Promise<CallCampaign | null> {
    const result = await pool.query(
      `SELECT * FROM call_campaigns WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Find all campaigns for a user
   */
  static async findByUserId(
    userId: string,
    filters?: {
      status?: CampaignStatus | CampaignStatus[];
      agent_id?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<CallCampaign[]> {
    let query = 'SELECT * FROM call_campaigns WHERE user_id = $1';
    const params: any[] = [userId];
    let paramCount = 1;

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

    if (filters?.agent_id) {
      paramCount++;
      query += ` AND agent_id = $${paramCount}`;
      params.push(filters.agent_id);
    }

    query += ' ORDER BY created_at DESC';

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
   * Create a new campaign
   */
  static async create(userId: string, data: CreateCampaignRequest): Promise<CallCampaign> {
    const result = await pool.query(
      `INSERT INTO call_campaigns (
        user_id, name, description, agent_id, next_action,
        first_call_time, last_call_time, status, start_date, end_date, started_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        userId,
        data.name,
        data.description || null,
        data.agent_id,
        data.next_action,
        data.first_call_time,
        data.last_call_time,
        'active',  // Changed from 'draft' to 'active'
        data.start_date,
        data.end_date || null,
        new Date()  // Set started_at to now
      ]
    );
    return result.rows[0];
  }

  /**
   * Update campaign
   */
  static async update(
    id: string, 
    userId: string, 
    updates: UpdateCampaignRequest
  ): Promise<CallCampaign | null> {
    const setClauses: string[] = [];
    const params: any[] = [];
    let paramCount = 0;

    // Build dynamic UPDATE query
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        paramCount++;
        setClauses.push(`${key} = $${paramCount}`);
        params.push(value);
      }
    });

    if (setClauses.length === 0) {
      return this.findById(id, userId);
    }

    // Always update updated_at
    paramCount++;
    setClauses.push(`updated_at = $${paramCount}`);
    params.push(new Date());

    // Add id and user_id to params
    paramCount++;
    params.push(id);
    paramCount++;
    params.push(userId);

    const query = `
      UPDATE call_campaigns 
      SET ${setClauses.join(', ')}
      WHERE id = $${paramCount - 1} AND user_id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, params);
    return result.rows[0] || null;
  }

  /**
   * Delete campaign (also deletes queue items via CASCADE)
   */
  static async delete(id: string, userId: string): Promise<boolean> {
    const result = await pool.query(
      'DELETE FROM call_campaigns WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rowCount! > 0;
  }

  /**
   * Update total contacts count
   */
  static async updateTotalContacts(campaignId: string, count: number): Promise<void> {
    await pool.query(
      'UPDATE call_campaigns SET total_contacts = total_contacts + $1 WHERE id = $2',
      [count, campaignId]
    );
  }

  /**
   * Update campaign status
   */
  static async updateStatus(
    id: string, 
    userId: string, 
    status: CampaignStatus,
    additionalData?: {
      started_at?: Date;
      completed_at?: Date;
    }
  ): Promise<CallCampaign | null> {
    const updates: any = { status };
    
    if (additionalData?.started_at) {
      updates.started_at = additionalData.started_at;
    }
    if (additionalData?.completed_at) {
      updates.completed_at = additionalData.completed_at;
    }

    return this.update(id, userId, updates);
  }

  /**
   * Get campaign statistics
   */
  static async getStatistics(id: string, userId: string): Promise<{
    total_contacts: number;
    completed_calls: number;
    successful_calls: number;
    failed_calls: number;
    queued_calls: number;
    processing_calls: number;
  } | null> {
    const result = await pool.query(
      `SELECT 
        c.total_contacts,
        c.completed_calls,
        c.successful_calls,
        c.failed_calls,
        (SELECT COUNT(*) FROM call_queue WHERE campaign_id = c.id AND status = 'queued') as queued_calls,
        (SELECT COUNT(*) FROM call_queue WHERE campaign_id = c.id AND status = 'processing') as processing_calls
      FROM call_campaigns c
      WHERE c.id = $1 AND c.user_id = $2`,
      [id, userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get campaign analytics (detailed breakdown)
   */
  static async getAnalytics(id: string, userId: string): Promise<CampaignAnalytics | null> {
    const result = await pool.query(
      `SELECT 
        c.id,
        c.name,
        c.status,
        c.total_contacts,
        c.completed_calls,
        c.successful_calls,
        c.failed_calls,
        c.created_at,
        c.started_at,
        c.completed_at,
        
        -- Queue breakdown
        (SELECT COUNT(*) FROM call_queue WHERE campaign_id = c.id AND status = 'queued') as queued_calls,
        (SELECT COUNT(*) FROM call_queue WHERE campaign_id = c.id AND status = 'processing') as processing_calls,
        (SELECT COUNT(*) FROM call_queue WHERE campaign_id = c.id AND status = 'cancelled') as cancelled_calls,
        (SELECT COUNT(*) FROM call_queue WHERE campaign_id = c.id AND status = 'skipped') as skipped_calls,
        
        -- Average call duration from calls table (using duration_seconds column)
        (SELECT COALESCE(AVG(duration_seconds), 0)
         FROM calls 
         WHERE id IN (SELECT call_id FROM call_queue WHERE campaign_id = c.id AND call_id IS NOT NULL)
        ) as avg_call_duration_seconds,
        
        -- Success rate
        CASE 
          WHEN c.completed_calls > 0 THEN (c.successful_calls::float / c.completed_calls::float * 100)
          ELSE 0
        END as success_rate,
        
        -- Completion rate
        CASE 
          WHEN c.total_contacts > 0 THEN (c.completed_calls::float / c.total_contacts::float * 100)
          ELSE 0
        END as completion_rate

      FROM call_campaigns c
      WHERE c.id = $1 AND c.user_id = $2`,
      [id, userId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get active campaigns (scheduled or active status)
   */
  static async getActiveCampaigns(userId: string): Promise<CallCampaign[]> {
    const result = await pool.query(
      `SELECT * FROM call_campaigns 
       WHERE user_id = $1 
       AND status IN ('scheduled', 'active')
       ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  /**
   * Count campaigns by status
   */
  static async countByStatus(userId: string): Promise<Record<CampaignStatus, number>> {
    const result = await pool.query(
      `SELECT status, COUNT(*)::int as count
       FROM call_campaigns
       WHERE user_id = $1
       GROUP BY status`,
      [userId]
    );

    const counts: any = {
      draft: 0,
      scheduled: 0,
      active: 0,
      paused: 0,
      completed: 0,
      cancelled: 0
    };

    result.rows.forEach((row: any) => {
      counts[row.status] = row.count;
    });

    return counts;
  }

  /**
   * Check if campaign can be started (validation)
   */
  static async canStart(id: string, userId: string): Promise<{
    can_start: boolean;
    reason?: string;
  }> {
    const campaign = await this.findById(id, userId);
    
    if (!campaign) {
      return { can_start: false, reason: 'Campaign not found' };
    }

    if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
      return { can_start: false, reason: `Cannot start campaign with status: ${campaign.status}` };
    }

    // Check if there are contacts in queue
    const queueResult = await pool.query(
      'SELECT COUNT(*)::int as count FROM call_queue WHERE campaign_id = $1',
      [id]
    );

    if (queueResult.rows[0].count === 0) {
      return { can_start: false, reason: 'No contacts in queue' };
    }

    return { can_start: true };
  }
}
