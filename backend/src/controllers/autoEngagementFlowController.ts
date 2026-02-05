import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { AutoEngagementFlowModel } from '../models/AutoEngagementFlow';
import { FlowTriggerConditionModel, FlowActionModel } from '../models/FlowComponents';
import { FlowExecutionModel, FlowActionLogModel } from '../models/FlowExecution';
import {
  CreateFlowRequest,
  UpdateFlowRequest,
  BulkPriorityUpdateRequest
} from '../types/autoEngagement';
import { logger } from '../utils/logger';
import { pool } from '../config/database';

/**
 * Validation helper functions
 */
const validateActionConfig = (actionType: string, actionConfig: any): { valid: boolean; error?: string } => {
  switch (actionType) {
    case 'ai_call':
      if (!actionConfig.agent_id || !actionConfig.phone_number_id) {
        return { valid: false, error: 'AI call action requires agent_id and phone_number_id' };
      }
      break;
    case 'whatsapp_message':
      if (!actionConfig.whatsapp_phone_number_id || !actionConfig.template_id) {
        return { valid: false, error: 'WhatsApp action requires whatsapp_phone_number_id and template_id' };
      }
      break;
    case 'email':
      if (!actionConfig.email_template_id) {
        return { valid: false, error: 'Email action requires email_template_id' };
      }
      break;
    case 'wait':
      if (!actionConfig.duration_minutes || actionConfig.duration_minutes <= 0) {
        return { valid: false, error: 'Wait action requires positive duration_minutes' };
      }
      break;
  }
  return { valid: true };
};

const validateBusinessHours = (data: any): { valid: boolean; error?: string } => {
  if (data.use_custom_business_hours) {
    if (!data.business_hours_start || !data.business_hours_end) {
      return { valid: false, error: 'Both business_hours_start and business_hours_end are required when use_custom_business_hours is true' };
    }
    
    // Validate time format (HH:MM:SS)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
    if (!timeRegex.test(data.business_hours_start) || !timeRegex.test(data.business_hours_end)) {
      return { valid: false, error: 'Business hours must be in HH:MM:SS format' };
    }
    
    // Validate start is before end
    const [startHour, startMin] = data.business_hours_start.split(':').map(Number);
    const [endHour, endMin] = data.business_hours_end.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    if (startMinutes >= endMinutes) {
      return { valid: false, error: 'business_hours_start must be before business_hours_end' };
    }
    
    // Validate timezone if provided
    if (data.business_hours_timezone) {
      try {
        // Try to use the timezone - this will throw if invalid
        new Date().toLocaleString('en-US', { timeZone: data.business_hours_timezone });
      } catch (e) {
        return { valid: false, error: 'Invalid timezone identifier' };
      }
    }
  }
  return { valid: true };
};

/**
 * Controller for Auto Engagement Flow endpoints
 */
export class AutoEngagementFlowController {
  /**
   * Get all flows for the authenticated user
   * GET /api/auto-engagement/flows
   */
  async getFlows(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { enabled_only, limit, offset } = req.query;

      const flows = await AutoEngagementFlowModel.findByUserId(userId, {
        enabled_only: enabled_only === 'true',
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined
      });

      const count = await AutoEngagementFlowModel.count(userId, enabled_only === 'true');

      res.json({
        success: true,
        data: flows,
        meta: {
          total: count,
          limit: limit ? parseInt(limit as string) : undefined,
          offset: offset ? parseInt(offset as string) : undefined
        }
      });
    } catch (error) {
      logger.error('[AutoEngagementFlowController] Error fetching flows:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch flows'
      });
    }
  }

  /**
   * Get a single flow by ID with full details
   * GET /api/auto-engagement/flows/:id
   */
  async getFlowById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const flow = await AutoEngagementFlowModel.findByIdWithDetails(id, userId);

      if (!flow) {
        res.status(404).json({
          success: false,
          error: 'Flow not found'
        });
        return;
      }

      res.json({
        success: true,
        data: flow
      });
    } catch (error) {
      logger.error('[AutoEngagementFlowController] Error fetching flow:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch flow'
      });
    }
  }

  /**
   * Create a new flow
   * POST /api/auto-engagement/flows
   */
  async createFlow(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const flowData: CreateFlowRequest = req.body;

      // Validate required fields
      if (!flowData.name) {
        res.status(400).json({
          success: false,
          error: 'Flow name is required'
        });
        return;
      }

      // Validate business hours
      const businessHoursValidation = validateBusinessHours(flowData);
      if (!businessHoursValidation.valid) {
        res.status(400).json({
          success: false,
          error: businessHoursValidation.error
        });
        return;
      }

      // Validate actions if provided
      if (flowData.actions && flowData.actions.length > 0) {
        // Check for unique action orders
        const actionOrders = flowData.actions.map(a => a.action_order);
        const uniqueOrders = new Set(actionOrders);
        if (actionOrders.length !== uniqueOrders.size) {
          res.status(400).json({
            success: false,
            error: 'Action orders must be unique within a flow'
          });
          return;
        }

        // Check for positive action orders
        if (actionOrders.some(order => order <= 0)) {
          res.status(400).json({
            success: false,
            error: 'Action orders must be positive integers'
          });
          return;
        }

        // Validate action configs
        for (const action of flowData.actions) {
          const configValidation = validateActionConfig(action.action_type, action.action_config);
          if (!configValidation.valid) {
            res.status(400).json({
              success: false,
              error: configValidation.error
            });
            return;
          }
        }
      }

      // If priority not provided, get next available
      if (flowData.priority === undefined) {
        flowData.priority = await AutoEngagementFlowModel.getNextAvailablePriority(userId);
      } else {
        // Check if priority is already taken
        const isAvailable = await AutoEngagementFlowModel.isPriorityAvailable(userId, flowData.priority);
        if (!isAvailable) {
          res.status(400).json({
            success: false,
            error: `Priority ${flowData.priority} is already assigned to another flow`
          });
          return;
        }
      }

      const client = await pool.getClient();
      try {
        await client.query('BEGIN');

        // Create the flow
        const flow = await AutoEngagementFlowModel.create(userId, flowData, userId);

        // Create trigger conditions if provided
        if (flowData.trigger_conditions && flowData.trigger_conditions.length > 0) {
          await FlowTriggerConditionModel.createBatch(
            flowData.trigger_conditions.map(cond => ({
              flowId: flow.id,
              conditionType: cond.condition_type,
              conditionOperator: cond.condition_operator,
              conditionValue: cond.condition_value
            }))
          );
        }

        // Create actions if provided
        if (flowData.actions && flowData.actions.length > 0) {
          await FlowActionModel.createBatch(
            flowData.actions.map(action => ({
              flowId: flow.id,
              actionOrder: action.action_order,
              actionType: action.action_type,
              actionConfig: action.action_config,
              conditionType: action.condition_type,
              conditionValue: action.condition_value
            }))
          );
        }

        await client.query('COMMIT');

        // Fetch full flow details
        const fullFlow = await AutoEngagementFlowModel.findByIdWithDetails(flow.id, userId);

        res.status(201).json({
          success: true,
          data: fullFlow
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('[AutoEngagementFlowController] Error creating flow:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create flow'
      });
    }
  }

  /**
   * Update a flow
   * PATCH /api/auto-engagement/flows/:id
   */
  async updateFlow(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const updates: UpdateFlowRequest = req.body;

      // Check if flow exists
      const existingFlow = await AutoEngagementFlowModel.findById(id, userId);
      if (!existingFlow) {
        res.status(404).json({
          success: false,
          error: 'Flow not found'
        });
        return;
      }

      // If updating priority, check availability
      if (updates.priority !== undefined && updates.priority !== existingFlow.priority) {
        const isAvailable = await AutoEngagementFlowModel.isPriorityAvailable(userId, updates.priority, id);
        if (!isAvailable) {
          res.status(400).json({
            success: false,
            error: `Priority ${updates.priority} is already assigned to another flow`
          });
          return;
        }
      }

      const updatedFlow = await AutoEngagementFlowModel.update(id, userId, updates);

      if (!updatedFlow) {
        res.status(404).json({
          success: false,
          error: 'Flow not found'
        });
        return;
      }

      res.json({
        success: true,
        data: updatedFlow
      });
    } catch (error) {
      logger.error('[AutoEngagementFlowController] Error updating flow:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update flow'
      });
    }
  }

  /**
   * Delete a flow
   * DELETE /api/auto-engagement/flows/:id
   */
  async deleteFlow(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const deleted = await AutoEngagementFlowModel.delete(id, userId);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'Flow not found'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Flow deleted successfully'
      });
    } catch (error) {
      logger.error('[AutoEngagementFlowController] Error deleting flow:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete flow'
      });
    }
  }

  /**
   * Toggle flow enabled status
   * PATCH /api/auto-engagement/flows/:id/toggle
   */
  async toggleFlow(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { enabled } = req.body;

      if (typeof enabled !== 'boolean') {
        res.status(400).json({
          success: false,
          error: 'enabled field must be a boolean'
        });
        return;
      }

      const updatedFlow = await AutoEngagementFlowModel.toggleEnabled(id, userId, enabled);

      if (!updatedFlow) {
        res.status(404).json({
          success: false,
          error: 'Flow not found'
        });
        return;
      }

      res.json({
        success: true,
        data: updatedFlow
      });
    } catch (error) {
      logger.error('[AutoEngagementFlowController] Error toggling flow:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to toggle flow'
      });
    }
  }

  /**
   * Update multiple flow priorities at once
   * POST /api/auto-engagement/flows/priorities/bulk-update
   */
  async bulkUpdatePriorities(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { updates }: BulkPriorityUpdateRequest = req.body;

      if (!Array.isArray(updates) || updates.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Updates array is required'
        });
        return;
      }

      // Validate no duplicate priorities
      const priorities = updates.map(u => u.priority);
      const uniquePriorities = new Set(priorities);
      if (priorities.length !== uniquePriorities.size) {
        res.status(400).json({
          success: false,
          error: 'Priority values must be unique'
        });
        return;
      }

      // Validate all flows belong to user using a single bulk query to avoid N+1 pattern
      const flowIds = updates.map((update) => update.id);
      const validateResult = await pool.query(
        'SELECT id FROM auto_engagement_flows WHERE user_id = $1 AND id = ANY($2)',
        [userId, flowIds]
      );

      const existingIds = new Set<string>(validateResult.rows.map((row: { id: string }) => row.id));
      const missingUpdate = updates.find((update) => !existingIds.has(update.id));

      if (missingUpdate) {
        res.status(404).json({
          success: false,
          error: `Flow ${missingUpdate.id} not found`
        });
        return;
      }

      await AutoEngagementFlowModel.updatePriorities(userId, updates);

      res.json({
        success: true,
        message: 'Priorities updated successfully'
      });
    } catch (error) {
      logger.error('[AutoEngagementFlowController] Error updating priorities:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update priorities'
      });
    }
  }

  /**
   * Update trigger conditions for a flow
   * PUT /api/auto-engagement/flows/:id/conditions
   */
  async updateTriggerConditions(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { conditions } = req.body;

      // Check if flow exists
      const flow = await AutoEngagementFlowModel.findById(id, userId);
      if (!flow) {
        res.status(404).json({
          success: false,
          error: 'Flow not found'
        });
        return;
      }

      if (!Array.isArray(conditions)) {
        res.status(400).json({
          success: false,
          error: 'conditions must be an array'
        });
        return;
      }

      const updatedConditions = await FlowTriggerConditionModel.replaceConditions(id, conditions);

      res.json({
        success: true,
        data: updatedConditions
      });
    } catch (error) {
      logger.error('[AutoEngagementFlowController] Error updating conditions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update trigger conditions'
      });
    }
  }

  /**
   * Update actions for a flow
   * PUT /api/auto-engagement/flows/:id/actions
   */
  async updateActions(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { actions } = req.body;

      // Check if flow exists
      const flow = await AutoEngagementFlowModel.findById(id, userId);
      if (!flow) {
        res.status(404).json({
          success: false,
          error: 'Flow not found'
        });
        return;
      }

      if (!Array.isArray(actions)) {
        res.status(400).json({
          success: false,
          error: 'actions must be an array'
        });
        return;
      }

      // Validate actions
      if (actions.length > 0) {
        // Check for unique action orders
        const actionOrders = actions.map((a: any) => a.actionOrder);
        const uniqueOrders = new Set(actionOrders);
        if (actionOrders.length !== uniqueOrders.size) {
          res.status(400).json({
            success: false,
            error: 'Action orders must be unique within a flow'
          });
          return;
        }

        // Check for positive action orders
        if (actionOrders.some((order: number) => order <= 0)) {
          res.status(400).json({
            success: false,
            error: 'Action orders must be positive integers'
          });
          return;
        }

        // Validate action configs
        for (const action of actions) {
          const configValidation = validateActionConfig(action.actionType, action.actionConfig);
          if (!configValidation.valid) {
            res.status(400).json({
              success: false,
              error: configValidation.error
            });
            return;
          }
        }
      }

      const updatedActions = await FlowActionModel.replaceActions(id, actions);

      res.json({
        success: true,
        data: updatedActions
      });
    } catch (error) {
      logger.error('[AutoEngagementFlowController] Error updating actions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update actions'
      });
    }
  }

  /**
   * Get flow executions
   * GET /api/auto-engagement/flows/:id/executions
   */
  async getFlowExecutions(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { status, limit, offset } = req.query;

      const executions = await FlowExecutionModel.findByFlowId(id, userId, {
        status: status as any,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined
      });

      res.json({
        success: true,
        data: executions
      });
    } catch (error) {
      logger.error('[AutoEngagementFlowController] Error fetching executions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch executions'
      });
    }
  }

  /**
   * Get all executions for user
   * GET /api/auto-engagement/executions
   */
  async getAllExecutions(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { status, flow_id, limit, offset, test_runs_only } = req.query;

      const executions = await FlowExecutionModel.findByUserId(userId, {
        status: status as any,
        flowId: flow_id as string,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
        testRunsOnly: test_runs_only === 'true'
      });

      res.json({
        success: true,
        data: executions
      });
    } catch (error) {
      logger.error('[AutoEngagementFlowController] Error fetching all executions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch executions'
      });
    }
  }

  /**
   * Get execution details with action logs
   * GET /api/auto-engagement/executions/:id
   */
  async getExecutionDetails(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const execution = await FlowExecutionModel.findById(id, userId);
      if (!execution) {
        res.status(404).json({
          success: false,
          error: 'Execution not found'
        });
        return;
      }

      const actionLogs = await FlowActionLogModel.findByExecutionId(id);

      res.json({
        success: true,
        data: {
          ...execution,
          action_logs: actionLogs
        }
      });
    } catch (error) {
      logger.error('[AutoEngagementFlowController] Error fetching execution details:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch execution details'
      });
    }
  }

  /**
   * Cancel a running execution
   * POST /api/auto-engagement/executions/:id/cancel
   */
  async cancelExecution(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const cancelledExecution = await FlowExecutionModel.cancel(id, userId);

      if (!cancelledExecution) {
        res.status(404).json({
          success: false,
          error: 'Execution not found or not running'
        });
        return;
      }

      res.json({
        success: true,
        data: cancelledExecution
      });
    } catch (error) {
      logger.error('[AutoEngagementFlowController] Error cancelling execution:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to cancel execution'
      });
    }
  }

  /**
   * Get flow statistics
   * GET /api/auto-engagement/flows/:id/statistics
   */
  async getFlowStatistics(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      // Check if flow exists
      const flow = await AutoEngagementFlowModel.findById(id, userId);
      if (!flow) {
        res.status(404).json({
          success: false,
          error: 'Flow not found'
        });
        return;
      }

      const executionStats = await FlowExecutionModel.getStatistics(userId, id);
      const actionStats = await FlowActionLogModel.getStatisticsByFlow(id, userId);

      res.json({
        success: true,
        data: {
          execution_statistics: executionStats,
          action_statistics: actionStats
        }
      });
    } catch (error) {
      logger.error('[AutoEngagementFlowController] Error fetching statistics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch statistics'
      });
    }
  }

  /**
   * Test flow execution (simulation mode)
   * POST /api/auto-engagement/flows/:id/test
   */
  async testFlowExecution(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { contact_data } = req.body;

      // Validate flow exists and belongs to user
      const flow = await AutoEngagementFlowModel.findByIdWithDetails(id, userId);
      if (!flow) {
        res.status(404).json({
          success: false,
          error: 'Flow not found'
        });
        return;
      }

      // Simulate matching logic
      let matchResult = {
        matches: true,
        reason: 'All conditions met',
        conditions_checked: [] as any[]
      };

      if (flow.trigger_conditions) {
        for (const condition of flow.trigger_conditions) {
          const conditionCheck = {
            type: condition.condition_type,
            operator: condition.condition_operator,
            value: condition.condition_value,
            contact_value: contact_data?.[condition.condition_type] || 'N/A',
            result: false
          };

          // Simulate condition evaluation
          if (condition.condition_type === 'any' as any) {
            conditionCheck.result = true;
          } else if (contact_data && condition.condition_value) {
            const contactValue = String(contact_data[condition.condition_type] || '');
            const conditionValue = String(condition.condition_value);

            switch (condition.condition_operator) {
              case 'equals':
                conditionCheck.result = contactValue === conditionValue;
                break;
              case 'not_equals':
                conditionCheck.result = contactValue !== conditionValue;
                break;
              case 'contains':
                conditionCheck.result = contactValue.toLowerCase().includes(conditionValue.toLowerCase());
                break;
              default:
                conditionCheck.result = false;
            }
          }

          matchResult.conditions_checked.push(conditionCheck);
          
          if (!conditionCheck.result) {
            matchResult.matches = false;
            matchResult.reason = `Condition failed: ${condition.condition_type} ${condition.condition_operator} ${condition.condition_value}`;
          }
        }
      }

      // Simulate action execution plan
      const actionPlan = flow.actions ? flow.actions.map(action => ({
        order: action.action_order,
        type: action.action_type,
        config: action.action_config,
        condition: action.condition_type ? {
          type: action.condition_type,
          value: action.condition_value,
          will_execute: action.condition_type === 'always'
        } : null,
        estimated_status: 'Would be executed in live mode'
      })) : [];

      res.json({
        success: true,
        data: {
          test_mode: true,
          flow_id: id,
          flow_name: flow.name,
          matching: matchResult,
          action_plan: actionPlan,
          note: 'This is a simulation. No actual actions were executed.'
        }
      });

    } catch (error) {
      logger.error('[AutoEngagementFlowController] Error testing flow execution:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to test flow execution'
      });
    }
  }

  /**
   * Get analytics for all flows
   * GET /api/auto-engagement/analytics
   */
  async getAnalytics(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      // Get all flows for user
      const flows = await AutoEngagementFlowModel.findByUserId(userId);

      // Get overall statistics
      const allExecutionsResult = await pool.query(
        `SELECT 
          COUNT(*) as total_executions,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_count
        FROM flow_executions
        WHERE flow_id IN (
          SELECT id FROM auto_engagement_flows WHERE user_id = $1
        )`,
        [userId]
      );

      // Get per-flow statistics
      const flowStatsResult = await pool.query(
        `SELECT 
          aef.id as flow_id,
          aef.name as flow_name,
          aef.priority,
          aef.is_enabled,
          COUNT(fe.id) as execution_count,
          COUNT(CASE WHEN fe.status = 'completed' THEN 1 END) as success_count,
          COUNT(CASE WHEN fe.status = 'failed' THEN 1 END) as failure_count,
          MAX(fe.triggered_at) as last_execution
        FROM auto_engagement_flows aef
        LEFT JOIN flow_executions fe ON fe.flow_id = aef.id
        WHERE aef.user_id = $1
        GROUP BY aef.id, aef.name, aef.priority, aef.is_enabled
        ORDER BY aef.priority ASC`,
        [userId]
      );

      // Get action success rates
      const actionStatsResult = await pool.query(
        `SELECT 
          fa.action_type,
          COUNT(fal.id) as total_actions,
          COUNT(CASE WHEN fal.status = 'completed' THEN 1 END) as successful_actions,
          COUNT(CASE WHEN fal.status = 'failed' THEN 1 END) as failed_actions,
          COUNT(CASE WHEN fal.status = 'skipped' THEN 1 END) as skipped_actions
        FROM flow_actions fa
        LEFT JOIN flow_action_logs fal ON fal.action_id = fa.id
        WHERE fa.flow_id IN (
          SELECT id FROM auto_engagement_flows WHERE user_id = $1
        )
        GROUP BY fa.action_type`,
        [userId]
      );

      // Get recent executions timeline (last 30 days)
      const timelineResult = await pool.query(
        `SELECT 
          DATE(triggered_at) as date,
          COUNT(*) as execution_count,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as success_count
        FROM flow_executions
        WHERE flow_id IN (
          SELECT id FROM auto_engagement_flows WHERE user_id = $1
        )
        AND triggered_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(triggered_at)
        ORDER BY date ASC`,
        [userId]
      );

      res.json({
        success: true,
        data: {
          summary: {
            total_flows: flows.length,
            enabled_flows: flows.filter(f => f.is_enabled).length,
            total_executions: parseInt(allExecutionsResult.rows[0]?.total_executions || '0'),
            completed_executions: parseInt(allExecutionsResult.rows[0]?.completed_count || '0'),
            failed_executions: parseInt(allExecutionsResult.rows[0]?.failed_count || '0'),
            success_rate: allExecutionsResult.rows[0]?.total_executions > 0
              ? ((parseInt(allExecutionsResult.rows[0].completed_count) / parseInt(allExecutionsResult.rows[0].total_executions)) * 100).toFixed(2)
              : '0'
          },
          flow_statistics: flowStatsResult.rows.map((row: any) => ({
            flow_id: row.flow_id,
            flow_name: row.flow_name,
            priority: row.priority,
            is_enabled: row.is_enabled,
            execution_count: parseInt(row.execution_count || '0'),
            success_count: parseInt(row.success_count || '0'),
            failure_count: parseInt(row.failure_count || '0'),
            success_rate: row.execution_count > 0
              ? ((parseInt(row.success_count) / parseInt(row.execution_count)) * 100).toFixed(2)
              : '0',
            last_execution: row.last_execution
          })),
          action_statistics: actionStatsResult.rows.map((row: any) => ({
            action_type: row.action_type,
            total_actions: parseInt(row.total_actions || '0'),
            successful_actions: parseInt(row.successful_actions || '0'),
            failed_actions: parseInt(row.failed_actions || '0'),
            skipped_actions: parseInt(row.skipped_actions || '0'),
            success_rate: row.total_actions > 0
              ? ((parseInt(row.successful_actions) / parseInt(row.total_actions)) * 100).toFixed(2)
              : '0'
          })),
          timeline: timelineResult.rows.map((row: any) => ({
            date: row.date,
            execution_count: parseInt(row.execution_count || '0'),
            success_count: parseInt(row.success_count || '0')
          }))
        }
      });

    } catch (error) {
      logger.error('[AutoEngagementFlowController] Error getting analytics:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get analytics'
      });
    }
  }
}

export const autoEngagementFlowController = new AutoEngagementFlowController();
