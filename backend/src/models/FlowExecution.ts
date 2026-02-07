import { pool } from '../config/database';
import { FlowExecution, FlowActionLog, ExecutionStatus, ActionLogStatus } from '../types/autoEngagement';

/**
 * Model for Flow Executions
 * Tracks execution instances of flows
 */
export class FlowExecutionModel {
  /**
   * Find execution by ID
   */
  static async findById(id: string, userId?: string): Promise<FlowExecution | null> {
    let query = `SELECT * FROM flow_executions WHERE id = $1`;
    const params: any[] = [id];

    if (userId) {
      query += ` AND user_id = $2`;
      params.push(userId);
    }

    const result = await pool.query(query, params);
    return result.rows[0] || null;
  }

  /**
   * Find executions by flow ID
   */
  static async findByFlowId(
    flowId: string,
    userId: string,
    options?: {
      status?: ExecutionStatus;
      limit?: number;
      offset?: number;
    }
  ): Promise<FlowExecution[]> {
    let query = `
      SELECT * FROM flow_executions 
      WHERE flow_id = $1 AND user_id = $2
    `;
    const params: any[] = [flowId, userId];
    let paramCount = 2;

    if (options?.status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(options.status);
    }

    query += ' ORDER BY triggered_at DESC';

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
   * Find executions by contact ID
   */
  static async findByContactId(
    contactId: string,
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<FlowExecution[]> {
    let query = `
      SELECT fe.*, aef.name as flow_name
      FROM flow_executions fe
      JOIN auto_engagement_flows aef ON fe.flow_id = aef.id
      WHERE fe.contact_id = $1 AND fe.user_id = $2
      ORDER BY fe.triggered_at DESC
    `;
    const params: any[] = [contactId, userId];
    let paramCount = 2;

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
   * Find all executions for user
   */
  static async findByUserId(
    userId: string,
    options?: {
      status?: ExecutionStatus;
      flowId?: string;
      limit?: number;
      offset?: number;
      testRunsOnly?: boolean;
    }
  ): Promise<FlowExecution[]> {
    let query = `
      SELECT fe.*, aef.name as flow_name, c.name as contact_name, c.phone_number as contact_phone
      FROM flow_executions fe
      JOIN auto_engagement_flows aef ON fe.flow_id = aef.id
      JOIN contacts c ON fe.contact_id = c.id
      WHERE fe.user_id = $1
    `;
    const params: any[] = [userId];
    let paramCount = 1;

    if (options?.status) {
      paramCount++;
      query += ` AND fe.status = $${paramCount}`;
      params.push(options.status);
    }

    if (options?.flowId) {
      paramCount++;
      query += ` AND fe.flow_id = $${paramCount}`;
      params.push(options.flowId);
    }

    if (options?.testRunsOnly) {
      query += ` AND fe.is_test_run = true`;
    }

    query += ' ORDER BY fe.triggered_at DESC';

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
   * Create a new execution
   */
  static async create(
    flowId: string,
    contactId: string,
    userId: string,
    metadata: any = {},
    isTestRun: boolean = false
  ): Promise<FlowExecution> {
    const result = await pool.query(
      `INSERT INTO flow_executions (
        flow_id, contact_id, user_id, metadata, is_test_run
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [flowId, contactId, userId, JSON.stringify(metadata), isTestRun]
    );
    return result.rows[0];
  }

  /**
   * Update execution status
   */
  static async updateStatus(
    id: string,
    status: ExecutionStatus,
    errorMessage?: string | null
  ): Promise<FlowExecution | null> {
    const result = await pool.query(
      `UPDATE flow_executions 
       SET status = $1, 
           error_message = $2,
           completed_at = CASE WHEN $1::VARCHAR IN ('completed', 'failed', 'cancelled', 'skipped') THEN CURRENT_TIMESTAMP ELSE completed_at END
       WHERE id = $3
       RETURNING *`,
      [status, errorMessage || null, id]
    );
    return result.rows[0] || null;
  }

  /**
   * Update current action step
   */
  static async updateCurrentStep(id: string, step: number): Promise<FlowExecution | null> {
    const result = await pool.query(
      `UPDATE flow_executions 
       SET current_action_step = $1
       WHERE id = $2
       RETURNING *`,
      [step, id]
    );
    return result.rows[0] || null;
  }

  /**
   * Cancel a running execution
   */
  static async cancel(id: string, userId: string): Promise<FlowExecution | null> {
    const result = await pool.query(
      `UPDATE flow_executions 
       SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND status = 'running'
       RETURNING *`,
      [id, userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get execution statistics
   */
  static async getStatistics(userId: string, flowId?: string): Promise<any> {
    let query = `
      SELECT 
        COUNT(*) as total_executions,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'running') as running,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        COUNT(*) FILTER (WHERE status = 'skipped') as skipped
      FROM flow_executions
      WHERE user_id = $1
    `;
    const params: any[] = [userId];

    if (flowId) {
      query += ` AND flow_id = $2`;
      params.push(flowId);
    }

    const result = await pool.query(query, params);
    return result.rows[0];
  }

  /**
   * Check if flow has been executed for contact recently
   */
  static async hasRecentExecution(
    flowId: string,
    contactId: string,
    withinMinutes: number
  ): Promise<boolean> {
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM flow_executions 
       WHERE flow_id = $1 AND contact_id = $2 
       AND triggered_at > NOW() - INTERVAL '1 minute' * $3`,
      [flowId, contactId, withinMinutes]
    );
    return parseInt(result.rows[0].count) > 0;
  }
}

/**
 * Model for Flow Action Logs
 * Tracks individual action execution results
 */
export class FlowActionLogModel {
  /**
   * Find logs by execution ID
   */
  static async findByExecutionId(executionId: string): Promise<FlowActionLog[]> {
    const result = await pool.query(
      `SELECT * FROM flow_action_logs 
       WHERE flow_execution_id = $1 
       ORDER BY action_order`,
      [executionId]
    );
    return result.rows;
  }

  /**
   * Find log by ID
   */
  static async findById(id: string): Promise<FlowActionLog | null> {
    const result = await pool.query(
      `SELECT * FROM flow_action_logs WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Create a new action log
   */
  static async create(
    executionId: string,
    actionId: string,
    actionType: string,
    actionOrder: number
  ): Promise<FlowActionLog> {
    const result = await pool.query(
      `INSERT INTO flow_action_logs (
        flow_execution_id, action_id, action_type, action_order
      ) VALUES ($1, $2, $3, $4)
      RETURNING *`,
      [executionId, actionId, actionType, actionOrder]
    );
    return result.rows[0];
  }

  /**
   * Update action log status
   */
  static async updateStatus(
    id: string,
    status: ActionLogStatus,
    resultData?: any,
    errorMessage?: string | null,
    skipReason?: string | null
  ): Promise<FlowActionLog | null> {
    const result = await pool.query(
      `UPDATE flow_action_logs 
       SET status = $1,
           result_data = $2,
           error_message = $3,
           skip_reason = $4,
           completed_at = CASE WHEN $1::VARCHAR IN ('success', 'failed', 'skipped') THEN CURRENT_TIMESTAMP ELSE completed_at END
       WHERE id = $5
       RETURNING *`,
      [
        status,
        resultData ? JSON.stringify(resultData) : null,
        errorMessage || null,
        skipReason || null,
        id
      ]
    );
    return result.rows[0] || null;
  }

  /**
   * Mark action as running
   */
  static async markAsRunning(id: string): Promise<FlowActionLog | null> {
    const result = await pool.query(
      `UPDATE flow_action_logs 
       SET status = 'running'
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Get action statistics for a flow
   */
  static async getStatisticsByFlow(flowId: string, userId: string): Promise<any> {
    const result = await pool.query(
      `SELECT 
        fal.action_type,
        COUNT(*) as total_executions,
        COUNT(*) FILTER (WHERE fal.status = 'success') as successful,
        COUNT(*) FILTER (WHERE fal.status = 'failed') as failed,
        COUNT(*) FILTER (WHERE fal.status = 'skipped') as skipped
      FROM flow_action_logs fal
      JOIN flow_executions fe ON fal.flow_execution_id = fe.id
      WHERE fe.flow_id = $1 AND fe.user_id = $2
      GROUP BY fal.action_type`,
      [flowId, userId]
    );
    return result.rows;
  }

  /**
   * Delete logs for an execution
   */
  static async deleteByExecutionId(executionId: string): Promise<number> {
    const result = await pool.query(
      `DELETE FROM flow_action_logs WHERE flow_execution_id = $1`,
      [executionId]
    );
    return result.rowCount || 0;
  }
}
