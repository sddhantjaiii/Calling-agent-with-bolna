import { pool } from '../config/database';

export interface Notification {
  id: string;
  user_id: string;
  notification_type: NotificationType;
  recipient_email: string;
  status: NotificationStatus;
  related_campaign_id?: string | null;
  related_transaction_id?: string | null;
  notification_data?: any;
  idempotency_key: string;
  error_message?: string | null;
  sent_at: Date;
  created_at: Date;
}

export type NotificationType = 
  | 'email_verification'
  | 'email_verification_reminder'
  | 'credit_low_15'
  | 'credit_low_5'
  | 'credit_exhausted_0'
  | 'credits_added'
  | 'campaign_summary'
  | 'marketing';

export type NotificationStatus = 'sent' | 'failed' | 'skipped';

export interface CreateNotificationParams {
  userId: string;
  notificationType: NotificationType;
  recipientEmail: string;
  status: NotificationStatus;
  relatedCampaignId?: string;
  relatedTransactionId?: string;
  notificationData?: any;
  idempotencyKey: string;
  errorMessage?: string;
}

export class NotificationModel {
  /**
   * Create a notification record with atomic idempotency
   * @returns notification ID if created, null if duplicate (idempotency key exists)
   */
  static async create(params: CreateNotificationParams): Promise<string | null> {
    const {
      userId,
      notificationType,
      recipientEmail,
      status,
      relatedCampaignId,
      relatedTransactionId,
      notificationData,
      idempotencyKey,
      errorMessage
    } = params;

    try {
      const result = await pool.query(
        `INSERT INTO notifications 
          (user_id, notification_type, recipient_email, status, 
           related_campaign_id, related_transaction_id, notification_data, 
           idempotency_key, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          userId,
          notificationType,
          recipientEmail,
          status,
          relatedCampaignId || null,
          relatedTransactionId || null,
          notificationData ? JSON.stringify(notificationData) : null,
          idempotencyKey,
          errorMessage || null
        ]
      );

      return result.rows[0].id;
    } catch (error: any) {
      // Duplicate idempotency key = already sent
      if (error.code === '23505') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get notification history for a user
   */
  static async getByUser(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Notification[]> {
    const result = await pool.query(
      `SELECT * FROM notifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return result.rows;
  }

  /**
   * Get notifications by campaign
   */
  static async getByCampaign(campaignId: string): Promise<Notification[]> {
    const result = await pool.query(
      `SELECT * FROM notifications 
       WHERE related_campaign_id = $1 
       ORDER BY created_at DESC`,
      [campaignId]
    );

    return result.rows;
  }

  /**
   * Check if notification already sent (idempotency check)
   */
  static async exists(idempotencyKey: string): Promise<boolean> {
    const result = await pool.query(
      `SELECT 1 FROM notifications WHERE idempotency_key = $1 LIMIT 1`,
      [idempotencyKey]
    );

    return result.rows.length > 0;
  }
}
