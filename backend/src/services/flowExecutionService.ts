import { logger } from '../utils/logger';
import { pool } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { gmailService } from './gmailService';
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
import { CallService } from './callService';

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
        // No previous call outcome available - skip this conditional action
        return { 
          execute: false, 
          reason: 'No previous call outcome available for call_outcome condition' 
        };
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
        phoneNumber: contact.phone_number,
        userId: userId, // Debug: Check if userId is passed correctly
        contactName: contact.name
      });

      // Call Bolna directly for immediate execution
      const callResult = await CallService.initiateCall({
        userId: userId,
        contactId: contact.id,
        agentId: config.agent_id,
        phoneNumber: contact.phone_number,
        metadata: { source: 'auto_engagement_flow' }
      });

      logger.info('[FlowExecutionService] Call initiated successfully', {
        contactId: contact.id,
        callId: callResult.callId,
        executionId: callResult.executionId
      });

      return {
        call_initiated: true,
        call_id: callResult.callId,
        execution_id: callResult.executionId,
        call_outcome: 'initiated', // Will be updated by webhook
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
   * Sends WhatsApp template message via Chat Agent Server
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

      // Check if contact has phone number
      if (!contact.phone_number) {
        throw new Error('Contact does not have a phone number');
      }

      // Check if Chat Agent Server is configured
      const chatAgentServerUrl = process.env.CHAT_AGENT_SERVER_URL;
      if (!chatAgentServerUrl) {
        logger.warn('[FlowExecutionService] CHAT_AGENT_SERVER_URL not configured');
        throw new Error('WhatsApp service not configured. Please set CHAT_AGENT_SERVER_URL environment variable.');
      }

      // Prepare variable mappings from contact data
      const variables: Record<string, string> = {};
      if (config.variable_mappings) {
        for (const [key, value] of Object.entries(config.variable_mappings)) {
          // Map contact fields to template variables
          const contactValue = (contact as any)[value];
          if (contactValue) {
            variables[key] = String(contactValue);
          }
        }
      }

      // Send WhatsApp message via Chat Agent Server
      // Uses the standard /api/v1/send endpoint with contact object
      const response = await axios.post(
        `${chatAgentServerUrl}/api/v1/send`,
        {
          phone_number_id: config.whatsapp_phone_number_id,
          template_id: config.template_id,
          contact: {
            phone: contact.phone_number,
            name: contact.name || undefined,
            email: contact.email || undefined,
            company: contact.company || undefined
          },
          variables: variables
        },
        {
          timeout: 30000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      // Chat Agent Server returns {success, data} envelope
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'WhatsApp send failed');
      }

      const messageId = response.data.data?.message_id;

      logger.info('[FlowExecutionService] WhatsApp message sent successfully', {
        contactId: contact.id,
        templateId: config.template_id,
        messageId: messageId
      });

      return {
        whatsapp_sent: true,
        status: 'sent',
        template_id: config.template_id,
        message_id: messageId,
        to_phone: contact.phone_number
      };
    } catch (error) {
      logger.error('[FlowExecutionService] Error executing WhatsApp action', {
        error: error instanceof Error ? error.message : error,
        contactId: contact.id,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Execute email action
   * Sends email via Gmail service with template support
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

      // Import pool for email record creation
      // uuid imported at top of file

      // Get email template
      const templateResult = await pool.query(
        'SELECT * FROM email_templates WHERE id = $1 AND user_id = $2',
        [config.email_template_id, userId]
      );

      if (templateResult.rows.length === 0) {
        throw new Error(`Email template not found: ${config.email_template_id}`);
      }

      const template = templateResult.rows[0];

      // Replace variables in subject and body
      // Apply subject_override if provided, otherwise use template subject
      let subject = config.subject_override || template.subject || 'Automated Email';
      let bodyHtml = template.body_html || '';
      let bodyText = template.body_text || '';

      // Simple variable replacement - supports {{name}}, {{email}}, {{company}}, etc.
      const replacements: Record<string, string> = {
        name: contact.name || '',
        email: contact.email || '',
        phone_number: contact.phone_number || '',
        company: contact.company || '',
        city: contact.city || '',
        country: contact.country || '',
      };

      for (const [key, value] of Object.entries(replacements)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        // Use replacer function to prevent $ special char issues in replacement strings
        subject = subject.replace(regex, () => value);
        bodyHtml = bodyHtml.replace(regex, () => value);
        bodyText = bodyText.replace(regex, () => value);
      }

      // Check Gmail connection
      const gmailStatus = await gmailService.getGmailStatus(userId);
      if (!gmailStatus.connected || !gmailStatus.hasGmailScope) {
        throw new Error('Gmail is not connected. Please connect Gmail in Settings > Integrations.');
      }

      // Verify Gmail email address is available
      if (!gmailStatus.email) {
        throw new Error('Gmail email address not available. Please reconnect Gmail in Settings > Integrations.');
      }

      // Send email via Gmail with correct parameter format
      // Compute the effective text body (what will actually be sent)
      const effectiveTextBody = bodyText || bodyHtml.replace(/<[^>]*>/g, ''); // Strip HTML for text version

      const result = await gmailService.sendEmail(userId, {
        to: {
          address: contact.email,
          name: contact.name || undefined
        },
        subject: subject,
        htmlBody: bodyHtml,
        textBody: effectiveTextBody,
        fromEmail: gmailStatus.email,
        fromName: config.from_name
      });

      // Check if email send was successful
      if (!result.success) {
        throw new Error(result.error || 'Failed to send email via Gmail');
      }

      // Create email record in database with the exact text body that was sent
      const emailId = uuidv4();
      await pool.query(
        `INSERT INTO emails (
          id, user_id, contact_id, from_email, from_name, to_email, to_name,
          subject, body_html, body_text, status, sent_at, external_message_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12)`,
        [
          emailId,
          userId,
          contact.id,
          gmailStatus.email, // Already verified to exist above
          config.from_name || 'Auto Engagement',
          contact.email,
          contact.name,
          subject,
          bodyHtml,
          effectiveTextBody, // Use the same text body that was sent
          'sent',
          result.messageId
        ]
      );

      logger.info('[FlowExecutionService] Email sent successfully', {
        contactId: contact.id,
        emailId: emailId,
        messageId: result.messageId
      });

      return {
        email_sent: true,
        status: 'sent',
        email_id: emailId,
        message_id: result.messageId,
        to_email: contact.email,
        subject: subject
      };
    } catch (error) {
      logger.error('[FlowExecutionService] Error executing email action', {
        error: error instanceof Error ? error.message : error,
        contactId: contact.id,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Execute wait action
   * Schedules the flow to continue after a specified delay
   * 
   * ⚠️ IMPLEMENTATION NOTE:
   * This uses in-memory setTimeout which has limitations:
   * - Ties up the execution worker/slot for the full duration
   * - Lost on process restart or crash
   * - Not suitable for very long delays beyond the configured maximum (currently 24 hours)
   * 
   * For production at scale, consider:
   * - Persisting scheduled state to database
   * - Using job queue (Bull/BullMQ) for reliable scheduling
   * - Enforcing maximum duration limits
   * 
   * ⚠️ wait_until_business_hours flag is logged but not currently implemented.
   * Future enhancement should add business hours scheduling logic.
   */
  private static async executeWaitAction(config: WaitActionConfig): Promise<any> {
    try {
      logger.info('[FlowExecutionService] Executing wait action', {
        durationMinutes: config.duration_minutes,
        waitUntilBusinessHours: config.wait_until_business_hours
      });

      // Note: wait_until_business_hours is currently not implemented
      // The action will always wait for the specified duration regardless of business hours
      if (config.wait_until_business_hours) {
        logger.warn('[FlowExecutionService] wait_until_business_hours flag is set but not implemented');
      }

      // Validate duration_minutes to prevent extremely long waits
      // Node.js setTimeout has a max of ~24.8 days (2^31-1 ms)
      const MAX_DURATION_MINUTES = 1440; // 24 hours
      if (!Number.isFinite(config.duration_minutes) || config.duration_minutes <= 0) {
        throw new Error(`Invalid duration_minutes: ${config.duration_minutes}. Must be a positive finite number.`);
      }
      if (config.duration_minutes > MAX_DURATION_MINUTES) {
        logger.warn('[FlowExecutionService] duration_minutes exceeds maximum', {
          requested: config.duration_minutes,
          max: MAX_DURATION_MINUTES
        });
        throw new Error(`duration_minutes (${config.duration_minutes}) exceeds maximum of ${MAX_DURATION_MINUTES} minutes (24 hours)`);
      }

      // Simple in-memory delay - suitable for short waits only
      const durationMs = config.duration_minutes * 60 * 1000;

      // Create a promise that resolves after the specified duration
      await new Promise(resolve => setTimeout(resolve, durationMs));

      logger.info('[FlowExecutionService] Wait action completed', {
        durationMinutes: config.duration_minutes,
        actualWaitMs: durationMs
      });

      return {
        waited: true,
        status: 'completed',
        duration_minutes: config.duration_minutes,
        message: `Waited for ${config.duration_minutes} minutes`
      };
    } catch (error) {
      logger.error('[FlowExecutionService] Error executing wait action', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }
}

export default FlowExecutionService;
