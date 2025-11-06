import { userService } from './userService';
import { notificationService } from './notificationService';
import { logger } from '../utils/logger';

/**
 * Service for managing credit-related notifications
 * Uses the unified notification system with user preferences and idempotency
 */
export class CreditNotificationService {
  
  /**
   * Check user's credit level and send appropriate notifications
   * Uses unified notification system with:
   * - Idempotency (one notification per threshold per day)
   * - User preference checking
   * - Fire-and-forget delivery
   */
  static async checkAndSendNotifications(userId: string): Promise<void> {
    try {
      // Respect system-level feature toggle
      const enabled = (process.env.LOW_CREDITS_NOTIFICATIONS_ENABLED || '').toLowerCase();
      if (enabled && enabled !== 'true' && enabled !== '1' && enabled !== 'yes') {
        logger.info('Low credits notifications disabled by system configuration', { userId });
        return;
      }

      const user = await userService.getUserProfile(userId);
      if (!user) {
        logger.warn('User not found for credit notification check', { userId });
        return;
      }

      const credits = user.credits;
      logger.info('Checking credit notifications', { userId, credits });

      // Determine which threshold to notify about (highest severity that applies)
      let notificationType: 'credit_exhausted_0' | 'credit_low_5' | 'credit_low_15' | null = null;
      let threshold: number;

      if (credits <= 0) {
        notificationType = 'credit_exhausted_0';
        threshold = 0;
      } else if (credits <= 5) {
        notificationType = 'credit_low_5';
        threshold = 5;
      } else if (credits <= 15) {
        notificationType = 'credit_low_15';
        threshold = 15;
      } else {
        logger.info('Credits above threshold, no notification needed', { userId, credits });
        return;
      }

      // Generate idempotency key (one per threshold per day)
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const idempotencyKey = `${userId}:credit_low_${threshold}:${today}`;

      // Send notification (will check preferences and idempotency internally)
      const sent = await notificationService.sendNotification({
        userId,
        email: user.email,
        notificationType,
        idempotencyKey,
        notificationData: {
          userName: user.name,
          credits,
          threshold
        }
      });

      if (sent) {
        logger.info('Credit notification sent successfully', { 
          userId, 
          notificationType,
          credits,
          threshold
        });
      } else {
        logger.info('Credit notification not sent (preference disabled or already sent)', { 
          userId, 
          notificationType,
          idempotencyKey
        });
      }

    } catch (error) {
      logger.error('Error in credit notification check', { userId, error });
    }
  }

  /**
   * Legacy method name compatibility - calls checkAndSendNotifications
   * @deprecated Use checkAndSendNotifications instead
   */
  static async checkCreditsAndNotify(userId: string): Promise<void> {
    return this.checkAndSendNotifications(userId);
  }
}

export const creditNotificationService = new CreditNotificationService();
