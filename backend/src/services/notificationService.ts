import { NotificationModel, NotificationType, CreateNotificationParams } from '../models/Notification';
import { NotificationPreferenceModel } from '../models/NotificationPreference';
import { emailService } from './emailService';
import { logger } from '../utils/logger';

export interface SendNotificationParams {
  userId: string;
  email: string;
  notificationType: NotificationType;
  relatedCampaignId?: string;
  relatedTransactionId?: string;
  notificationData?: any;
  idempotencyKey: string;
}

export class NotificationService {
  /**
   * Send notification with preference check and atomicity
   */
  async sendNotification(params: SendNotificationParams): Promise<boolean> {
    const {
      userId,
      email,
      notificationType,
      relatedCampaignId,
      relatedTransactionId,
      notificationData,
      idempotencyKey
    } = params;

    try {
      // Step 1: Check if already sent (idempotency)
      const exists = await NotificationModel.exists(idempotencyKey);
      if (exists) {
        logger.info('Notification already sent (idempotent)', { idempotencyKey });
        return false;
      }

      // Step 2: Check user preferences
      const preferenceKey = this.getPreferenceKey(notificationType);
      if (preferenceKey) {
        const isEnabled = await NotificationPreferenceModel.isEnabled(userId, preferenceKey);
        
        if (!isEnabled) {
          // Record as skipped
          await NotificationModel.create({
            userId,
            notificationType,
            recipientEmail: email,
            status: 'skipped',
            relatedCampaignId,
            relatedTransactionId,
            notificationData,
            idempotencyKey,
            errorMessage: 'User preference disabled'
          });

          logger.info('Notification skipped due to user preference', {
            userId,
            notificationType,
            preferenceKey
          });

          return false;
        }
      }

      // Step 3: Send email
      const emailSent = await this.sendEmailByType(
        notificationType,
        email,
        notificationData
      );

      // Step 4: Record notification
      const status = emailSent ? 'sent' : 'failed';
      const errorMessage = emailSent ? undefined : 'Email delivery failed';

      await NotificationModel.create({
        userId,
        notificationType,
        recipientEmail: email,
        status,
        relatedCampaignId,
        relatedTransactionId,
        notificationData,
        idempotencyKey,
        errorMessage
      });

      logger.info('Notification processed', {
        userId,
        notificationType,
        status,
        idempotencyKey
      });

      return emailSent;
    } catch (error) {
      logger.error('Failed to send notification', {
        error,
        userId,
        notificationType,
        idempotencyKey
      });

      // Try to record failure
      try {
        await NotificationModel.create({
          userId,
          notificationType,
          recipientEmail: email,
          status: 'failed',
          relatedCampaignId,
          relatedTransactionId,
          notificationData,
          idempotencyKey,
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        });
      } catch (recordError) {
        logger.error('Failed to record notification failure', { recordError });
      }

      return false;
    }
  }

  /**
   * Map notification type to preference key
   */
  private getPreferenceKey(
    notificationType: NotificationType
  ): 'low_credit_alerts' | 'credits_added_emails' | 'campaign_summary_emails' | 'email_verification_reminders' | 'marketing_emails' | null {
    const mapping: Record<NotificationType, any> = {
      credit_low_15: 'low_credit_alerts',
      credit_low_5: 'low_credit_alerts',
      credit_exhausted_0: 'low_credit_alerts',
      credits_added: 'credits_added_emails',
      campaign_summary: 'campaign_summary_emails',
      email_verification_reminder: 'email_verification_reminders',
      marketing: 'marketing_emails',
      email_verification: null // Always send (no preference)
    };

    return mapping[notificationType];
  }

  /**
   * Send email based on notification type
   */
  private async sendEmailByType(
    notificationType: NotificationType,
    email: string,
    data: any
  ): Promise<boolean> {
    try {
      switch (notificationType) {
        case 'email_verification':
          return await emailService.sendVerificationEmail({
            userEmail: email,
            userName: data.userName,
            verificationUrl: data.token
          });

        case 'email_verification_reminder':
          return await emailService.sendVerificationEmail({
            userEmail: email,
            userName: data.userName,
            verificationUrl: data.token
          });

        case 'credit_low_15':
        case 'credit_low_5':
        case 'credit_exhausted_0':
          return await emailService.sendLowCreditsNotification(
            email,
            data.userName,
            data.credits
          );

        case 'credits_added':
          return await emailService.sendCreditsAddedEmail({
            userEmail: email,
            userName: data.userName,
            amountAdded: data.creditsAdded,
            newBalance: data.newBalance
          });

        case 'campaign_summary':
          return await emailService.sendCampaignSummaryEmail({
            userEmail: email,
            userName: data.userName,
            campaignName: data.campaignName,
            stats: data.stats,
            topLeads: data.hotLeads,
            hotLeadsCsv: data.csvBuffer
          });

        case 'marketing':
          // Future implementation
          logger.warn('Marketing emails not yet implemented');
          return false;

        default:
          logger.error('Unknown notification type', { notificationType });
          return false;
      }
    } catch (error) {
      logger.error('Email send failed', { error, notificationType, email });
      return false;
    }
  }
}

export const notificationService = new NotificationService();
