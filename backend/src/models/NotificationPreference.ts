import { pool } from '../config/database';

export interface NotificationPreference {
  id: string;
  user_id: string;
  low_credit_alerts: boolean;
  credits_added_emails: boolean;
  campaign_summary_emails: boolean;
  email_verification_reminders: boolean;
  marketing_emails: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UpdatePreferencesParams {
  low_credit_alerts?: boolean;
  credits_added_emails?: boolean;
  campaign_summary_emails?: boolean;
  email_verification_reminders?: boolean;
  marketing_emails?: boolean;
}

export class NotificationPreferenceModel {
  /**
   * Get preferences for a user (creates default if not exists)
   */
  static async getByUserId(userId: string): Promise<NotificationPreference> {
    // Try to get existing preferences
    const result = await pool.query(
      `SELECT * FROM notification_preferences WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Create default preferences if not exists
    const createResult = await pool.query(
      `INSERT INTO notification_preferences (user_id) 
       VALUES ($1) 
       ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING *`,
      [userId]
    );

    return createResult.rows[0];
  }

  /**
   * Update preferences for a user
   */
  static async update(
    userId: string,
    preferences: UpdatePreferencesParams
  ): Promise<NotificationPreference> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Build dynamic UPDATE query
    Object.entries(preferences).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });

    if (fields.length === 0) {
      // No changes, return current preferences
      return this.getByUserId(userId);
    }

    values.push(userId); // Last parameter

    const result = await pool.query(
      `UPDATE notification_preferences 
       SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new Error('Failed to update preferences');
    }

    return result.rows[0];
  }

  /**
   * Check if a specific notification type is enabled for user
   */
  static async isEnabled(
    userId: string,
    notificationType: 
      | 'low_credit_alerts'
      | 'credits_added_emails'
      | 'campaign_summary_emails'
      | 'email_verification_reminders'
      | 'marketing_emails'
  ): Promise<boolean> {
    const prefs = await this.getByUserId(userId);
    return prefs[notificationType];
  }
}
