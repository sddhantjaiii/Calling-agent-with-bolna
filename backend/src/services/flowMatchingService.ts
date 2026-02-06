import { logger } from '../utils/logger';
import { AutoEngagementFlowModel } from '../models/AutoEngagementFlow';
import { FlowExecutionModel } from '../models/FlowExecution';
import {
  FlowWithDetails,
  TriggerMatchResult
} from '../types/autoEngagement';
import { ContactInterface } from '../models/Contact';

/**
 * FlowMatchingService
 * Handles matching contacts to flows based on trigger conditions
 */
export class FlowMatchingService {
  /**
   * Find matching flow for a contact
   * Returns highest priority matching flow
   */
  static async findMatchingFlow(
    userId: string,
    contact: ContactInterface
  ): Promise<TriggerMatchResult> {
    try {
      // Get all enabled flows ordered by priority
      const flows = await AutoEngagementFlowModel.findEnabledFlowsForMatching(userId);

      if (flows.length === 0) {
        return {
          matched: false,
          flow: null,
          reason: 'No enabled flows found for user'
        };
      }

      // Check DNC tag first - skip all flows if contact has DNC tag
      if (contact.tags && contact.tags.includes('DNC')) {
        logger.info('[FlowMatchingService] Contact has DNC tag, skipping all flows', {
          contactId: contact.id,
          userId
        });
        return {
          matched: false,
          flow: null,
          reason: 'Contact has DNC tag'
        };
      }

      // Try to match flows in priority order
      for (const flow of flows) {
        const isMatch = await this.evaluateTriggerConditions(flow, contact);
        
        if (isMatch) {
          // Check business hours if configured
          if (flow.use_custom_business_hours) {
            const isWithinBusinessHours = this.isWithinBusinessHours(
              flow.business_hours_start,
              flow.business_hours_end,
              flow.business_hours_timezone
            );

            if (!isWithinBusinessHours) {
              logger.info('[FlowMatchingService] Flow matched but outside business hours', {
                flowId: flow.id,
                flowName: flow.name,
                contactId: contact.id
              });
              continue; // Try next flow
            }
          }

          logger.info('[FlowMatchingService] Flow matched for contact', {
            flowId: flow.id,
            flowName: flow.name,
            contactId: contact.id,
            priority: flow.priority
          });

          return {
            matched: true,
            flow,
            reason: `Matched flow: ${flow.name} (priority ${flow.priority})`
          };
        }
      }

      return {
        matched: false,
        flow: null,
        reason: 'No matching flows found for contact'
      };
    } catch (error) {
      logger.error('[FlowMatchingService] Error finding matching flow', {
        error: error instanceof Error ? error.message : error,
        userId,
        contactId: contact.id
      });
      throw error;
    }
  }

  /**
   * Evaluate all trigger conditions for a flow
   * All conditions must match (AND logic)
   */
  private static async evaluateTriggerConditions(
    flow: FlowWithDetails,
    contact: ContactInterface
  ): Promise<boolean> {
    if (!flow.trigger_conditions || flow.trigger_conditions.length === 0) {
      // No conditions means always match
      return true;
    }

    // All conditions must match (AND logic)
    for (const condition of flow.trigger_conditions) {
      const matches = this.evaluateSingleCondition(condition, contact);
      if (!matches) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate a single trigger condition
   */
  private static evaluateSingleCondition(
    condition: any,
    contact: ContactInterface
  ): boolean {
    const { condition_type, condition_operator, condition_value } = condition;

    // Handle 'any' operator - always matches
    if (condition_operator === 'any') {
      return true;
    }

    let actualValue: string | null = null;

    // Get actual value from contact based on condition type
    switch (condition_type) {
      case 'lead_source':
        actualValue = contact.auto_creation_source || null;
        break;
      case 'entry_type':
        // Infer entry type from contact properties
        if (contact.is_auto_created) {
          actualValue = 'auto';
        } else if (contact.email) {
          actualValue = 'email';
        } else {
          actualValue = 'manual';
        }
        break;
      case 'custom_field':
        // For custom fields, check tags or other custom properties
        actualValue = this.getCustomFieldValue(contact, condition_value);
        break;
      default:
        logger.warn('[FlowMatchingService] Unknown condition type', {
          condition_type
        });
        return false;
    }

    // Evaluate based on operator
    switch (condition_operator) {
      case 'equals':
        return actualValue === condition_value;
      case 'not_equals':
        return actualValue !== condition_value;
      case 'contains':
        return actualValue ? actualValue.toLowerCase().includes((condition_value || '').toLowerCase()) : false;
      default:
        logger.warn('[FlowMatchingService] Unknown condition operator', {
          condition_operator
        });
        return false;
    }
  }

  /**
   * Get custom field value from contact
   */
  private static getCustomFieldValue(contact: ContactInterface, fieldName: string | null): string | null {
    if (!fieldName) return null;

    // Check if it's in tags
    if (contact.tags && contact.tags.includes(fieldName)) {
      return fieldName;
    }

    // Check other contact properties
    const contactAny = contact as any;
    return contactAny[fieldName] || null;
  }

  /**
   * Check if current time is within business hours
   */
  private static isWithinBusinessHours(
    startTime: string | null,
    endTime: string | null,
    timezone: string | null
  ): boolean {
    if (!startTime || !endTime) {
      return true; // No business hours configured
    }

    try {
      // Get current time in specified timezone
      const now = new Date();
      const timeString = now.toLocaleTimeString('en-US', {
        hour12: false,
        timeZone: timezone || 'UTC',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const [currentHour, currentMinute] = timeString.split(':').map(Number);
      const currentMinutes = currentHour * 60 + currentMinute;

      // Parse start and end times
      const [startHour, startMinute] = startTime.split(':').map(Number);
      const startMinutes = startHour * 60 + startMinute;

      const [endHour, endMinute] = endTime.split(':').map(Number);
      const endMinutes = endHour * 60 + endMinute;

      // Check if current time is within range
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } catch (error) {
      logger.error('[FlowMatchingService] Error checking business hours', {
        error: error instanceof Error ? error.message : error,
        startTime,
        endTime,
        timezone
      });
      return true; // Default to allowing if there's an error
    }
  }

  /**
   * Check if flow has been executed for this contact recently
   */
  static async hasRecentExecution(
    flowId: string,
    contactId: string,
    withinMinutes: number = 60
  ): Promise<boolean> {
    return await FlowExecutionModel.hasRecentExecution(flowId, contactId, withinMinutes);
  }
}

export default FlowMatchingService;
