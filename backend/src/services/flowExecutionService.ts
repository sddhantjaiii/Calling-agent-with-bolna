import { logger } from '../utils/logger';
import { FlowExecutionModel, FlowActionLogModel } from '../models/FlowExecution';
import {
  FlowWithDetails,
  FlowAction,
  AICallActionConfig,
  WhatsAppActionConfig,
  EmailActionConfig,
  WaitActionConfig
} from '../types/autoEngagement';
import { ContactInterface } from '../models/Contact';
import { CallQueueModel } from '../models/CallQueue';

/**
 * FlowExecutionService
 * Handles execution of flow actions
 */
export class FlowExecutionService {
  /**
   * Execute a flow for a contact
   */
  static async executeFlow(
    flow: FlowWithDetails,
    contact: ContactInterface,
    userId: string,
    isTestRun: boolean = false
  ): Promise<string> {
    try {
      // Create execution record
      const execution = await FlowExecutionModel.create(
        flow.id,
        contact.id,
        userId,
        {
          flow_name: flow.name,
          trigger_source: 'contact_creation',
          contact_phone: contact.phone_number,
          contact_name: contact.name
        },
        isTestRun
      );

      logger.info('[FlowExecutionService] Starting flow execution', {
        executionId: execution.id,
        flowId: flow.id,
        flowName: flow.name,
        contactId: contact.id,
        contactName: contact.name,
        isTestRun
      });

      // Execute actions sequentially
      try {
        await this.executeActions(execution.id, flow, contact, userId, isTestRun);

        // Mark execution as completed
        await FlowExecutionModel.updateStatus(execution.id, 'completed');

        logger.info('[FlowExecutionService] Flow execution completed successfully', {
          executionId: execution.id,
          flowId: flow.id
        });
      } catch (error) {
        // Mark execution as failed
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await FlowExecutionModel.updateStatus(execution.id, 'failed', errorMessage);

        logger.error('[FlowExecutionService] Flow execution failed', {
          executionId: execution.id,
          flowId: flow.id,
          error: errorMessage
        });
      }

      return execution.id;
    } catch (error) {
      logger.error('[FlowExecutionService] Error creating flow execution', {
        error: error instanceof Error ? error.message : error,
        flowId: flow.id,
        contactId: contact.id
      });
      throw error;
    }
  }

  /**
   * Execute all actions in a flow sequentially
   */
  private static async executeActions(
    executionId: string,
    flow: FlowWithDetails,
    contact: ContactInterface,
    userId: string,
    isTestRun: boolean
  ): Promise<void> {
    if (!flow.actions || flow.actions.length === 0) {
      logger.warn('[FlowExecutionService] No actions to execute in flow', {
        executionId,
        flowId: flow.id
      });
      return;
    }

    // Sort actions by order
    const sortedActions = [...flow.actions].sort((a, b) => a.action_order - b.action_order);

    let previousActionResult: any = null;

    for (const action of sortedActions) {
      // Update current action step
      await FlowExecutionModel.updateCurrentStep(executionId, action.action_order);

      // Create action log
      const actionLog = await FlowActionLogModel.create(
        executionId,
        action.id,
        action.action_type,
        action.action_order
      );

      // Check if action should be executed based on conditions
      const shouldExecute = this.shouldExecuteAction(action, previousActionResult);

      if (!shouldExecute.execute) {
        // Skip this action
        await FlowActionLogModel.updateStatus(
          actionLog.id,
          'skipped',
          null,
          null,
          shouldExecute.reason
        );

        logger.info('[FlowExecutionService] Action skipped', {
          executionId,
          actionId: action.id,
          actionType: action.action_type,
          reason: shouldExecute.reason
        });

        continue;
      }

      // Mark action as running
      await FlowActionLogModel.markAsRunning(actionLog.id);

      try {
        // Execute the action
        const result = await this.executeAction(
          action,
          contact,
          userId,
          isTestRun
        );

        // Update action log with success
        await FlowActionLogModel.updateStatus(
          actionLog.id,
          'success',
          result
        );

        previousActionResult = result;

        logger.info('[FlowExecutionService] Action executed successfully', {
          executionId,
          actionId: action.id,
          actionType: action.action_type
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Update action log with failure
        await FlowActionLogModel.updateStatus(
          actionLog.id,
          'failed',
          null,
          errorMessage
        );

        logger.error('[FlowExecutionService] Action execution failed', {
          executionId,
          actionId: action.id,
          actionType: action.action_type,
          error: errorMessage
        });

        // Don't throw - continue to next action
        previousActionResult = { error: errorMessage };
      }
    }
  }

  /**
   * Check if action should be executed based on conditions
   * 
   * CONDITIONAL EXECUTION LOGIC:
   * - condition_value "answered" means: Execute this action ONLY if call was answered (stop flow if successful)
   * - condition_value "missed" means: Execute this action ONLY if call was NOT answered (fallback action)
   * - condition_value "failed" means: Execute this action ONLY if call failed (error handling)
   * 
   * Example flow:
   * 1. AI Call action (no condition)
   * 2. WhatsApp action (condition: "missed") -> Only executes if call was missed
   */
  private static shouldExecuteAction(
    action: FlowAction,
    previousActionResult: any
  ): { execute: boolean; reason?: string } {
    // If no condition, always execute
    if (!action.condition_type || action.condition_type === 'always') {
      return { execute: true };
    }

    // Check condition based on previous action result
    if (action.condition_type === 'call_outcome') {
      if (!previousActionResult || !previousActionResult.call_outcome) {
        return { execute: true }; // No previous call, execute anyway
      }

      const expectedOutcome = action.condition_value;
      const actualOutcome = previousActionResult.call_outcome;

      // If we expect "answered" and call WAS answered, DON'T execute next action (flow complete)
      if (expectedOutcome === 'answered' && actualOutcome === 'answered') {
        return { execute: false, reason: 'Call was answered - stopping flow' };
      }

      // If we expect "missed" and call was NOT answered, DO execute (fallback action)
      if (expectedOutcome === 'missed' && actualOutcome !== 'answered') {
        return { execute: true };
      }

      // If we expect "failed" and call DID fail, DO execute (error handling)
      if (expectedOutcome === 'failed' && actualOutcome === 'failed') {
        return { execute: true };
      }

      return { execute: false, reason: `Call outcome (${actualOutcome}) doesn't match condition (${expectedOutcome})` };
    }

    if (action.condition_type === 'previous_action_status') {
      if (!previousActionResult) {
        return { execute: true }; // No previous action, execute anyway
      }

      const expectedStatus = action.condition_value;
      const actualStatus = previousActionResult.status || 'success';

      if (expectedStatus === actualStatus) {
        return { execute: true };
      }

      return { execute: false, reason: `Previous action status (${actualStatus}) doesn't match condition (${expectedStatus})` };
    }

    return { execute: true };
  }

  /**
   * Execute a single action
   */
  private static async executeAction(
    action: FlowAction,
    contact: ContactInterface,
    userId: string,
    isTestRun: boolean
  ): Promise<any> {
    if (isTestRun) {
      // In test mode, just simulate the action
      logger.info('[FlowExecutionService] Simulating action (test mode)', {
        actionType: action.action_type,
        contactId: contact.id
      });
      return { simulated: true, action_type: action.action_type };
    }

    switch (action.action_type) {
      case 'ai_call':
        return await this.executeAICallAction(action.action_config as AICallActionConfig, contact, userId);
      case 'whatsapp_message':
        return await this.executeWhatsAppAction(action.action_config as WhatsAppActionConfig, contact, userId);
      case 'email':
        return await this.executeEmailAction(action.action_config as EmailActionConfig, contact, userId);
      case 'wait':
        return await this.executeWaitAction(action.action_config as WaitActionConfig);
      default:
        throw new Error(`Unknown action type: ${action.action_type}`);
    }
  }

  /**
   * Execute AI call action
   */
  private static async executeAICallAction(
    config: AICallActionConfig,
    contact: ContactInterface,
    userId: string
  ): Promise<any> {
    try {
      logger.info('[FlowExecutionService] Executing AI call action', {
        agentId: config.agent_id,
        contactId: contact.id,
        phoneNumber: contact.phone_number
      });

      // Add call to queue - it will be processed by the existing queue system
      const queueEntry = await CallQueueModel.addDirectCallToQueue({
        user_id: userId,
        contact_id: contact.id,
        agent_id: config.agent_id,
        phone_number: contact.phone_number,
        contact_name: contact.name,
        priority: 100 // Auto-engagement calls get high priority
      });

      return {
        call_queued: true,
        queue_id: queueEntry.id,
        call_outcome: 'queued', // Will be updated by webhook
        agent_id: config.agent_id
      };
    } catch (error) {
      logger.error('[FlowExecutionService] Error executing AI call action', {
        error: error instanceof Error ? error.message : error,
        contactId: contact.id
      });
      throw error;
    }
  }

  /**
   * Execute WhatsApp message action
   * 
   * ⚠️ PLACEHOLDER IMPLEMENTATION - PHASE 8
   * This action type is not yet functional. Configuration is accepted but execution is not implemented.
   * Future implementation will integrate with Chat Agent Server for WhatsApp Business API.
   */
  private static async executeWhatsAppAction(
    config: WhatsAppActionConfig,
    contact: ContactInterface,
    userId: string
  ): Promise<any> {
    try {
      logger.info('[FlowExecutionService] Executing WhatsApp action', {
        templateId: config.template_id,
        contactId: contact.id,
        phoneNumber: contact.phone_number
      });

      // PHASE 8: Integrate with Chat Agent Server for WhatsApp Business API
      logger.warn('[FlowExecutionService] WhatsApp integration not yet implemented (Phase 8)');

      return {
        whatsapp_sent: false,
        status: 'not_implemented',
        template_id: config.template_id,
        message: 'WhatsApp integration pending - Phase 8'
      };
    } catch (error) {
      logger.error('[FlowExecutionService] Error executing WhatsApp action', {
        error: error instanceof Error ? error.message : error,
        contactId: contact.id
      });
      throw error;
    }
  }

  /**
   * Execute email action
   * 
   * ⚠️ PLACEHOLDER IMPLEMENTATION - PHASE 8
   * This action type is not yet functional. Configuration is accepted but execution is not implemented.
   * Future implementation will integrate with email service provider.
   */
  private static async executeEmailAction(
    config: EmailActionConfig,
    contact: ContactInterface,
    userId: string
  ): Promise<any> {
    try {
      logger.info('[FlowExecutionService] Executing email action', {
        templateId: config.email_template_id,
        contactId: contact.id,
        email: contact.email
      });

      if (!contact.email) {
        throw new Error('Contact has no email address');
      }

      // PHASE 8: Integrate with email sending service
      logger.warn('[FlowExecutionService] Email integration not yet implemented (Phase 8)');

      return {
        email_sent: false,
        status: 'not_implemented',
        template_id: config.email_template_id,
        message: 'Email integration pending - Phase 8'
      };
    } catch (error) {
      logger.error('[FlowExecutionService] Error executing email action', {
        error: error instanceof Error ? error.message : error,
        contactId: contact.id
      });
      throw error;
    }
  }

  /**
   * Execute wait action
   * 
   * ⚠️ PLACEHOLDER IMPLEMENTATION - PHASE 8
   * This action type is not yet functional. Currently returns immediately instead of scheduling.
   * Future implementation will use job queue (Bull/BullMQ) for proper scheduling.
   */
  private static async executeWaitAction(config: WaitActionConfig): Promise<any> {
    try {
      logger.info('[FlowExecutionService] Executing wait action', {
        durationMinutes: config.duration_minutes
      });

      // PHASE 8: Implement with job queue for proper scheduling
      // In a real implementation, this would schedule the next action
      logger.warn('[FlowExecutionService] Wait action not yet implemented (Phase 8) - continuing immediately');

      return {
        waited: false,
        status: 'not_implemented',
        duration_minutes: config.duration_minutes,
        message: 'Wait/scheduling integration pending - Phase 8'
      };
    } catch (error) {
      logger.error('[FlowExecutionService] Error executing wait action', {
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }
}

export default FlowExecutionService;
