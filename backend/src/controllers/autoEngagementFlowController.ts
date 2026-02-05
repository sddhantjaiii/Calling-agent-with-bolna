import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { AutoEngagementFlowModel } from '../models/AutoEngagementFlow';
import { FlowTriggerConditionModel, FlowActionModel } from '../models/FlowComponents';
import { FlowExecutionModel, FlowActionLogModel } from '../models/FlowExecution';
import {
  CreateFlowRequest,
  UpdateFlowRequest,
  BulkPriorityUpdateRequest,
  TestFlowRequest
} from '../types/autoEngagement';
import { logger } from '../utils/logger';
import { pool } from '../config/database';

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

      // Validate all flows belong to user
      for (const update of updates) {
        const flow = await AutoEngagementFlowModel.findById(update.id, userId);
        if (!flow) {
          res.status(404).json({
            success: false,
            error: `Flow ${update.id} not found`
          });
          return;
        }
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
}

export const autoEngagementFlowController = new AutoEngagementFlowController();
