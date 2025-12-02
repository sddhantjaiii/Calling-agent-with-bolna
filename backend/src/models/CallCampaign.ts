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
    let query = `
      SELECT 
        cc.*,
        a.name as agent_name
      FROM call_campaigns cc
      LEFT JOIN agents a ON cc.agent_id = a.id
      WHERE cc.user_id = $1
    `;
    const params: any[] = [userId];
    let paramCount = 1;

    if (filters?.status) {
      paramCount++;
      if (Array.isArray(filters.status)) {
        query += ` AND cc.status = ANY($${paramCount})`;
        params.push(filters.status);
      } else {
        query += ` AND cc.status = $${paramCount}`;
        params.push(filters.status);
      }
    }

    if (filters?.agent_id) {
      paramCount++;
      query += ` AND cc.agent_id = $${paramCount}`;
      params.push(filters.agent_id);
    }

    query += ' ORDER BY cc.created_at DESC';

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
        first_call_time, last_call_time, status, start_date, end_date, started_at,
        campaign_timezone, use_custom_timezone, max_retries, retry_interval_minutes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
        new Date(),  // Set started_at to now
        data.campaign_timezone || null,
        data.use_custom_timezone || false,
        data.max_retries || 0,
        data.retry_interval_minutes || 1 // Default 1 min for testing
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
        c.id as campaign_id,
        c.name as campaign_name,
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
        
        -- Attempt Distribution based on call_lifecycle_status from calls table
        (SELECT COUNT(*) 
         FROM calls 
         WHERE campaign_id = c.id AND call_lifecycle_status = 'busy') as busy_count,
        
        (SELECT COUNT(*) 
         FROM calls 
         WHERE campaign_id = c.id AND call_lifecycle_status = 'no-answer') as no_answer_count,
        
        (SELECT COUNT(*) 
         FROM calls 
         WHERE campaign_id = c.id 
         AND call_lifecycle_status IN ('completed', 'in-progress')) as contacted_count,
        
        (SELECT COUNT(*) 
         FROM calls 
         WHERE campaign_id = c.id AND call_lifecycle_status = 'failed') as failed_count,
        
        -- Handled calls: any call with terminal outcome
        (SELECT COUNT(*) 
         FROM calls 
         WHERE campaign_id = c.id 
         AND call_lifecycle_status IN ('completed', 'no-answer', 'busy', 'failed', 'call-disconnected')) as handled_calls,
        
        -- Attempted calls: calls that left queue (have a call record)
        (SELECT COUNT(*) 
         FROM calls 
         WHERE campaign_id = c.id 
         AND call_lifecycle_status NOT IN ('initiated')) as attempted_calls,
        
        -- Average call duration from calls table (using duration_seconds column)
        (SELECT COALESCE(AVG(duration_seconds), 0)
         FROM calls 
         WHERE campaign_id = c.id AND call_lifecycle_status = 'completed') as avg_call_duration_seconds,
        
        -- Total credits used
        (SELECT COALESCE(SUM(credits_used), 0)
         FROM calls 
         WHERE campaign_id = c.id) as total_credits_used

      FROM call_campaigns c
      WHERE c.id = $1 AND c.user_id = $2`,
      [id, userId]
    );

    if (!result.rows[0]) return null;
    
    const row = result.rows[0];
    
    // Calculate metrics
    const totalContacts = row.total_contacts || 0;
    const handledCalls = parseInt(row.handled_calls) || 0;
    const attemptedCalls = parseInt(row.attempted_calls) || 0;
    const contactedCalls = parseInt(row.contacted_count) || 0;
    const busyCount = parseInt(row.busy_count) || 0;
    const noAnswerCount = parseInt(row.no_answer_count) || 0;
    const failedCount = parseInt(row.failed_count) || 0;
    const queuedCalls = parseInt(row.queued_calls) || 0;
    
    const progressPercentage = totalContacts > 0 
      ? (handledCalls / totalContacts * 100) 
      : 0;
    
    const callConnectionRate = attemptedCalls > 0 
      ? (contactedCalls / attemptedCalls * 100) 
      : 0;
    
    const successRate = row.completed_calls > 0 
      ? (row.successful_calls / row.completed_calls * 100) 
      : 0;

    return {
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      total_contacts: totalContacts,
      completed_calls: row.completed_calls || 0,
      successful_calls: row.successful_calls || 0,
      failed_calls: row.failed_calls || 0,
      in_progress: parseInt(row.processing_calls) || 0,
      queued: queuedCalls,
      
      // Progress metrics
      handled_calls: handledCalls,
      progress_percentage: progressPercentage,
      attempted_calls: attemptedCalls,
      contacted_calls: contactedCalls,
      call_connection_rate: callConnectionRate,
      
      // Success metrics
      success_rate: successRate,
      average_call_duration: parseFloat(row.avg_call_duration_seconds) || 0,
      total_credits_used: parseInt(row.total_credits_used) || 0,
      
      // Time metrics
      campaign_duration: 0, // TODO: Calculate from started_at to now/completed_at
      estimated_completion: '', // TODO: Calculate based on current pace
      
      // Attempt Distribution
      attempt_distribution: {
        busy: busyCount,
        no_answer: noAnswerCount,
        contacted: contactedCalls,
        failed: failedCount,
        not_attempted: queuedCalls
      },
      
      // Legacy outcomes (map from new structure)
      outcomes: {
        answered: contactedCalls,
        busy: busyCount,
        no_answer: noAnswerCount,
        failed: failedCount,
        voicemail: 0 // Not tracking voicemail separately
      },
      
      // Daily breakdown (empty for now, can be implemented later)
      daily_stats: []
    };
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
