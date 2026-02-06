import { logger } from '../utils/logger';
import { ContactInterface } from '../models/Contact';
import { FlowMatchingService } from './flowMatchingService';
import { FlowExecutionService } from './flowExecutionService';

/**
 * AutoEngagementTriggerService
 * Handles triggering of flows when contacts are created
 */
export class AutoEngagementTriggerService {
  /**
   * Trigger flow execution for a newly created contact
   * This should be called after a contact is created
   */
  static async onContactCreated(
    contact: ContactInterface,
    userId: string
  ): Promise<void> {
    try {
      logger.info('[AutoEngagementTriggerService] Processing new contact for auto-engagement', {
        contactId: contact.id,
        contactName: contact.name,
        phoneNumber: contact.phone_number,
        userId,
        autoCreationSource: contact.auto_creation_source
      });

      // Find matching flow
      const matchResult = await FlowMatchingService.findMatchingFlow(userId, contact);

      if (!matchResult.matched || !matchResult.flow) {
        logger.info('[AutoEngagementTriggerService] No matching flow found for contact', {
          contactId: contact.id,
          reason: matchResult.reason
        });
        return;
      }

      // Check if flow was recently executed for this contact (within 1 hour)
      const hasRecent = await FlowMatchingService.hasRecentExecution(
        matchResult.flow.id,
        contact.id,
        60
      );

      if (hasRecent) {
        logger.info('[AutoEngagementTriggerService] Flow recently executed for this contact, skipping', {
          contactId: contact.id,
          flowId: matchResult.flow.id,
          flowName: matchResult.flow.name
        });
        return;
      }

      // Execute the flow
      const executionId = await FlowExecutionService.executeFlow(
        matchResult.flow,
        contact,
        userId,
        false // Not a test run
      );

      logger.info('[AutoEngagementTriggerService] Flow execution triggered successfully', {
        contactId: contact.id,
        flowId: matchResult.flow.id,
        flowName: matchResult.flow.name,
        executionId
      });
    } catch (error) {
      logger.error('[AutoEngagementTriggerService] Error triggering auto-engagement flow', {
        error: error instanceof Error ? error.message : error,
        contactId: contact.id,
        userId
      });
      // Don't throw - we don't want to fail contact creation if flow execution fails
    }
  }

  /**
   * Trigger flow execution for multiple contacts (batch processing)
   */
  static async onContactsCreated(
    contacts: ContactInterface[],
    userId: string
  ): Promise<void> {
    logger.info('[AutoEngagementTriggerService] Processing batch of contacts for auto-engagement', {
      count: contacts.length,
      userId
    });

    // Process contacts sequentially to avoid overwhelming the system
    for (const contact of contacts) {
      await this.onContactCreated(contact, userId);
    }
  }

  /**
   * Test flow execution for a contact (without actually executing actions)
   */
  static async testFlowExecution(
    contactId: string,
    userId: string,
    flowId?: string
  ): Promise<any> {
    try {
      // TODO: Implement test flow execution
      // This would simulate the flow without actually making calls/sending messages
      logger.info('[AutoEngagementTriggerService] Test flow execution not yet implemented', {
        contactId,
        userId,
        flowId
      });

      return {
        success: false,
        message: 'Test flow execution not yet implemented'
      };
    } catch (error) {
      logger.error('[AutoEngagementTriggerService] Error testing flow execution', {
        error: error instanceof Error ? error.message : error,
        contactId,
        userId
      });
      throw error;
    }
  }
}

export default AutoEngagementTriggerService;
