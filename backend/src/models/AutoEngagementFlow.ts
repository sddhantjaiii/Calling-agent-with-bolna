import { pool } from '../config/database';
import {
  AutoEngagementFlow,
  FlowTriggerCondition,
  FlowAction,
  CreateFlowRequest,
  UpdateFlowRequest,
  FlowWithDetails
} from '../types/autoEngagement';

/**
 * Model for Auto Engagement Flows
 * Handles CRUD operations and business logic for automated engagement flows
 */
export class AutoEngagementFlowModel {
  /**
   * Find flow by ID with user isolation
   */
  static async findById(id: string, userId: string): Promise<AutoEngagementFlow | null> {
    const result = await pool.query(
      `SELECT * FROM auto_engagement_flows WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Find flow with full details (including triggers and actions)
   */
  static async findByIdWithDetails(id: string, userId: string): Promise<FlowWithDetails | null> {
    const flowResult = await pool.query(
      `SELECT * FROM auto_engagement_flows WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (flowResult.rows.length === 0) {
      return null;
    }

    const flow = flowResult.rows[0];

    // Fetch trigger conditions
    const conditionsResult = await pool.query(
      `SELECT * FROM flow_trigger_conditions WHERE flow_id = $1 ORDER BY created_at`,
      [id]
    );

    // Fetch actions
    const actionsResult = await pool.query(
      `SELECT * FROM flow_actions WHERE flow_id = $1 ORDER BY action_order`,
      [id]
    );

    return {
      ...flow,
      trigger_conditions: conditionsResult.rows,
      actions: actionsResult.rows
    };
  }

  /**
   * Find all flows for a user
   */
  static async findByUserId(
    userId: string,
    options?: {
      enabled_only?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<AutoEngagementFlow[]> {
    let query = `SELECT * FROM auto_engagement_flows WHERE user_id = $1`;
    const params: any[] = [userId];
    let paramCount = 1;

    if (options?.enabled_only) {
      query += ` AND is_enabled = true`;
    }

    query += ' ORDER BY priority ASC, created_at DESC';

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
    return result.rows;
  }

  /**
   * Find enabled flows for trigger matching
   */
  static async findEnabledFlowsForMatching(userId: string): Promise<FlowWithDetails[]> {
    // Get all enabled flows ordered by priority
    const flowsResult = await pool.query(
      `SELECT * FROM auto_engagement_flows 
       WHERE user_id = $1 AND is_enabled = true 
       ORDER BY priority ASC`,
      [userId]
    );

    const flows = flowsResult.rows;
    if (flows.length === 0) {
      return [];
    }

    // Get all trigger conditions for these flows
    const flowIds = flows.map(f => f.id);
    const conditionsResult = await pool.query(
      `SELECT * FROM flow_trigger_conditions WHERE flow_id = ANY($1::uuid[])`,
      [flowIds]
    );

    // Get all actions for these flows
    const actionsResult = await pool.query(
      `SELECT * FROM flow_actions WHERE flow_id = ANY($1::uuid[]) ORDER BY action_order`,
      [flowIds]
    );

    // Map conditions and actions to flows
    const conditionsByFlowId = conditionsResult.rows.reduce((acc, cond) => {
      if (!acc[cond.flow_id]) acc[cond.flow_id] = [];
      acc[cond.flow_id].push(cond);
      return acc;
    }, {} as Record<string, FlowTriggerCondition[]>);

    const actionsByFlowId = actionsResult.rows.reduce((acc, action) => {
      if (!acc[action.flow_id]) acc[action.flow_id] = [];
      acc[action.flow_id].push(action);
      return acc;
    }, {} as Record<string, FlowAction[]>);

    return flows.map(flow => ({
      ...flow,
      trigger_conditions: conditionsByFlowId[flow.id] || [],
      actions: actionsByFlowId[flow.id] || []
    }));
  }

  /**
   * Create a new flow
   */
  static async create(userId: string, data: CreateFlowRequest, createdBy: string): Promise<AutoEngagementFlow> {
    const result = await pool.query(
      `INSERT INTO auto_engagement_flows (
        user_id, name, description, is_enabled, priority,
        use_custom_business_hours, business_hours_start, business_hours_end, business_hours_timezone,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        userId,
        data.name,
        data.description || null,
        data.is_enabled !== undefined ? data.is_enabled : false,
        data.priority,
        data.use_custom_business_hours || false,
        data.business_hours_start || null,
        data.business_hours_end || null,
        data.business_hours_timezone || null,
        createdBy
      ]
    );
    return result.rows[0];
  }

  /**
   * Update a flow
   */
  static async update(id: string, userId: string, data: UpdateFlowRequest): Promise<AutoEngagementFlow | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    // Build dynamic update query
    if (data.name !== undefined) {
      paramCount++;
      fields.push(`name = $${paramCount}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      paramCount++;
      fields.push(`description = $${paramCount}`);
      values.push(data.description);
    }
    if (data.is_enabled !== undefined) {
      paramCount++;
      fields.push(`is_enabled = $${paramCount}`);
      values.push(data.is_enabled);
    }
    if (data.priority !== undefined) {
      paramCount++;
      fields.push(`priority = $${paramCount}`);
      values.push(data.priority);
    }
    if (data.use_custom_business_hours !== undefined) {
      paramCount++;
      fields.push(`use_custom_business_hours = $${paramCount}`);
      values.push(data.use_custom_business_hours);
    }
    if (data.business_hours_start !== undefined) {
      paramCount++;
      fields.push(`business_hours_start = $${paramCount}`);
      values.push(data.business_hours_start);
    }
    if (data.business_hours_end !== undefined) {
      paramCount++;
      fields.push(`business_hours_end = $${paramCount}`);
      values.push(data.business_hours_end);
    }
    if (data.business_hours_timezone !== undefined) {
      paramCount++;
      fields.push(`business_hours_timezone = $${paramCount}`);
      values.push(data.business_hours_timezone);
    }

    if (fields.length === 0) {
      return this.findById(id, userId);
    }

    paramCount++;
    values.push(id);
    const idParam = paramCount;

    paramCount++;
    values.push(userId);
    const userIdParam = paramCount;

    const query = `
      UPDATE auto_engagement_flows
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${idParam} AND user_id = $${userIdParam}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  /**
   * Delete a flow
   */
  static async delete(id: string, userId: string): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM auto_engagement_flows WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return (result.rowCount || 0) > 0;
  }

  /**
   * Toggle flow enabled status
   */
  static async toggleEnabled(id: string, userId: string, enabled: boolean): Promise<AutoEngagementFlow | null> {
    const result = await pool.query(
      `UPDATE auto_engagement_flows 
       SET is_enabled = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [enabled, id, userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Update flow priorities (bulk operation)
   */
  static async updatePriorities(userId: string, priorityMap: { id: string; priority: number }[]): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const { id, priority } of priorityMap) {
        await client.query(
          `UPDATE auto_engagement_flows 
           SET priority = $1, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $2 AND user_id = $3`,
          [priority, id, userId]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check if priority is available for user
   */
  static async isPriorityAvailable(userId: string, priority: number, excludeFlowId?: string): Promise<boolean> {
    let query = `SELECT COUNT(*) as count FROM auto_engagement_flows WHERE user_id = $1 AND priority = $2`;
    const params: any[] = [userId, priority];

    if (excludeFlowId) {
      query += ` AND id != $3`;
      params.push(excludeFlowId);
    }

    const result = await pool.query(query, params);
    return result.rows[0].count === '0';
  }

  /**
   * Get next available priority for user
   */
  static async getNextAvailablePriority(userId: string): Promise<number> {
    const result = await pool.query(
      `SELECT COALESCE(MAX(priority), -1) + 1 as next_priority 
       FROM auto_engagement_flows 
       WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0].next_priority;
  }

  /**
   * Count flows for user
   */
  static async count(userId: string, enabledOnly?: boolean): Promise<number> {
    let query = `SELECT COUNT(*) as count FROM auto_engagement_flows WHERE user_id = $1`;
    const params: any[] = [userId];

    if (enabledOnly) {
      query += ` AND is_enabled = true`;
    }

    const result = await pool.query(query, params);
    return parseInt(result.rows[0].count);
  }
}

export default AutoEngagementFlowModel;
