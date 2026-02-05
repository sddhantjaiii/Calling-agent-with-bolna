import { pool } from '../config/database';
import { FlowTriggerCondition, FlowAction } from '../types/autoEngagement';

/**
 * Model for Flow Trigger Conditions
 * Manages trigger conditions that determine when a flow should execute
 */
export class FlowTriggerConditionModel {
  /**
   * Find all conditions for a flow
   */
  static async findByFlowId(flowId: string): Promise<FlowTriggerCondition[]> {
    const result = await pool.query(
      `SELECT * FROM flow_trigger_conditions WHERE flow_id = $1 ORDER BY created_at`,
      [flowId]
    );
    return result.rows;
  }

  /**
   * Create a new trigger condition
   */
  static async create(
    flowId: string,
    conditionType: string,
    conditionOperator: string,
    conditionValue: string | null
  ): Promise<FlowTriggerCondition> {
    const result = await pool.query(
      `INSERT INTO flow_trigger_conditions (flow_id, condition_type, condition_operator, condition_value)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [flowId, conditionType, conditionOperator, conditionValue]
    );
    return result.rows[0];
  }

  /**
   * Create multiple conditions in a transaction
   */
  static async createBatch(conditions: Array<{
    flowId: string;
    conditionType: string;
    conditionOperator: string;
    conditionValue: string | null;
  }>): Promise<FlowTriggerCondition[]> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const created: FlowTriggerCondition[] = [];
      for (const cond of conditions) {
        const result = await client.query(
          `INSERT INTO flow_trigger_conditions (flow_id, condition_type, condition_operator, condition_value)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [cond.flowId, cond.conditionType, cond.conditionOperator, cond.conditionValue]
        );
        created.push(result.rows[0]);
      }

      await client.query('COMMIT');
      return created;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete all conditions for a flow
   */
  static async deleteByFlowId(flowId: string): Promise<number> {
    const result = await pool.query(
      `DELETE FROM flow_trigger_conditions WHERE flow_id = $1`,
      [flowId]
    );
    return result.rowCount || 0;
  }

  /**
   * Replace all conditions for a flow
   */
  static async replaceConditions(
    flowId: string,
    conditions: Array<{
      conditionType: string;
      conditionOperator: string;
      conditionValue: string | null;
    }>
  ): Promise<FlowTriggerCondition[]> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete existing conditions
      await client.query(
        `DELETE FROM flow_trigger_conditions WHERE flow_id = $1`,
        [flowId]
      );

      // Insert new conditions
      const created: FlowTriggerCondition[] = [];
      for (const cond of conditions) {
        const result = await client.query(
          `INSERT INTO flow_trigger_conditions (flow_id, condition_type, condition_operator, condition_value)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [flowId, cond.conditionType, cond.conditionOperator, cond.conditionValue]
        );
        created.push(result.rows[0]);
      }

      await client.query('COMMIT');
      return created;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

/**
 * Model for Flow Actions
 * Manages the sequential actions that execute within a flow
 */
export class FlowActionModel {
  /**
   * Find all actions for a flow
   */
  static async findByFlowId(flowId: string): Promise<FlowAction[]> {
    const result = await pool.query(
      `SELECT * FROM flow_actions WHERE flow_id = $1 ORDER BY action_order`,
      [flowId]
    );
    return result.rows;
  }

  /**
   * Find action by ID
   */
  static async findById(id: string): Promise<FlowAction | null> {
    const result = await pool.query(
      `SELECT * FROM flow_actions WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Create a new action
   */
  static async create(
    flowId: string,
    actionOrder: number,
    actionType: string,
    actionConfig: any,
    conditionType?: string | null,
    conditionValue?: string | null
  ): Promise<FlowAction> {
    const result = await pool.query(
      `INSERT INTO flow_actions (
        flow_id, action_order, action_type, action_config, condition_type, condition_value
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [flowId, actionOrder, actionType, JSON.stringify(actionConfig), conditionType || null, conditionValue || null]
    );
    return result.rows[0];
  }

  /**
   * Create multiple actions in a transaction
   */
  static async createBatch(actions: Array<{
    flowId: string;
    actionOrder: number;
    actionType: string;
    actionConfig: any;
    conditionType?: string | null;
    conditionValue?: string | null;
  }>): Promise<FlowAction[]> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const created: FlowAction[] = [];
      for (const action of actions) {
        const result = await client.query(
          `INSERT INTO flow_actions (
            flow_id, action_order, action_type, action_config, condition_type, condition_value
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *`,
          [
            action.flowId,
            action.actionOrder,
            action.actionType,
            JSON.stringify(action.actionConfig),
            action.conditionType || null,
            action.conditionValue || null
          ]
        );
        created.push(result.rows[0]);
      }

      await client.query('COMMIT');
      return created;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update an action
   */
  static async update(
    id: string,
    data: {
      actionOrder?: number;
      actionType?: string;
      actionConfig?: any;
      conditionType?: string | null;
      conditionValue?: string | null;
    }
  ): Promise<FlowAction | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (data.actionOrder !== undefined) {
      paramCount++;
      fields.push(`action_order = $${paramCount}`);
      values.push(data.actionOrder);
    }
    if (data.actionType !== undefined) {
      paramCount++;
      fields.push(`action_type = $${paramCount}`);
      values.push(data.actionType);
    }
    if (data.actionConfig !== undefined) {
      paramCount++;
      fields.push(`action_config = $${paramCount}`);
      values.push(JSON.stringify(data.actionConfig));
    }
    if (data.conditionType !== undefined) {
      paramCount++;
      fields.push(`condition_type = $${paramCount}`);
      values.push(data.conditionType);
    }
    if (data.conditionValue !== undefined) {
      paramCount++;
      fields.push(`condition_value = $${paramCount}`);
      values.push(data.conditionValue);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    paramCount++;
    values.push(id);

    const query = `
      UPDATE flow_actions
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  /**
   * Delete an action
   */
  static async delete(id: string): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM flow_actions WHERE id = $1`,
      [id]
    );
    return (result.rowCount || 0) > 0;
  }

  /**
   * Delete all actions for a flow
   */
  static async deleteByFlowId(flowId: string): Promise<number> {
    const result = await pool.query(
      `DELETE FROM flow_actions WHERE flow_id = $1`,
      [flowId]
    );
    return result.rowCount || 0;
  }

  /**
   * Replace all actions for a flow
   */
  static async replaceActions(
    flowId: string,
    actions: Array<{
      actionOrder: number;
      actionType: string;
      actionConfig: any;
      conditionType?: string | null;
      conditionValue?: string | null;
    }>
  ): Promise<FlowAction[]> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete existing actions
      await client.query(
        `DELETE FROM flow_actions WHERE flow_id = $1`,
        [flowId]
      );

      // Insert new actions
      const created: FlowAction[] = [];
      for (const action of actions) {
        const result = await client.query(
          `INSERT INTO flow_actions (
            flow_id, action_order, action_type, action_config, condition_type, condition_value
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *`,
          [
            flowId,
            action.actionOrder,
            action.actionType,
            JSON.stringify(action.actionConfig),
            action.conditionType || null,
            action.conditionValue || null
          ]
        );
        created.push(result.rows[0]);
      }

      await client.query('COMMIT');
      return created;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reorder actions for a flow
   */
  static async reorderActions(flowId: string, actionIds: string[]): Promise<FlowAction[]> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update action_order for each action
      for (let i = 0; i < actionIds.length; i++) {
        await client.query(
          `UPDATE flow_actions SET action_order = $1 WHERE id = $2 AND flow_id = $3`,
          [i + 1, actionIds[i], flowId]
        );
      }

      await client.query('COMMIT');

      // Return updated actions
      return this.findByFlowId(flowId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export { FlowTriggerConditionModel, FlowActionModel };
