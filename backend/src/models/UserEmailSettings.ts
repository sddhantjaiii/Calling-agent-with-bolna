import BaseModel, { BaseModelInterface } from './BaseModel';

/**
 * Conditions when to send follow-up emails
 */
export type SendCondition = 'completed' | 'busy' | 'no_answer' | 'after_retries' | 'voicemail';

/**
 * Lead status filters for sending emails
 */
export type LeadStatusFilter = 'hot' | 'warm' | 'cold' | 'not_qualified' | 'any';

export interface UserEmailSettingsInterface extends BaseModelInterface {
  id: string;
  user_id: string;
  
  // Enable/Disable auto-send
  auto_send_enabled: boolean;
  
  // OpenAI prompt ID for personalization
  openai_followup_email_prompt_id?: string | null;
  
  // Template configuration
  subject_template: string;
  body_template: string;
  
  // Send conditions
  send_conditions: SendCondition[];
  lead_status_filters: LeadStatusFilter[];
  
  // Other settings
  skip_if_no_email: boolean;
  send_delay_minutes: number;
  max_retries_before_send: number;
  
  // Timestamps
  created_at: Date;
  updated_at: Date;
}

/**
 * Default email subject template with variable placeholders
 */
export const DEFAULT_SUBJECT_TEMPLATE = 'Follow-up: Great speaking with you, {{lead_name}}!';

/**
 * Default HTML email body template
 */
export const DEFAULT_BODY_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #4f46e5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { padding: 20px; background: #f9f9f9; border-radius: 0 0 8px 8px; }
        .highlight { background: #e0e7ff; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Thank You for Speaking With Us!</h1>
        </div>
        <div class="content">
            <p>Hi {{lead_name}},</p>
            <p>Thank you for taking the time to speak with us today. It was great learning about your needs{{#if company}} at {{company}}{{/if}}.</p>
            <p>If you have any questions, feel free to reach out. We look forward to hearing from you!</p>
            <p>Best regards,<br>{{sender_name}}</p>
        </div>
        <div class="footer">
            <p>This is an automated follow-up email based on your recent conversation.</p>
        </div>
    </div>
</body>
</html>`;

/**
 * Model for managing user email settings
 */
export class UserEmailSettingsModel extends BaseModel<UserEmailSettingsInterface> {
  constructor() {
    super('user_email_settings');
  }

  /**
   * Find email settings by user ID
   */
  async findByUserId(userId: string): Promise<UserEmailSettingsInterface | null> {
    const result = await this.query(
      `SELECT * FROM ${this.tableName} WHERE user_id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.transformRow(result.rows[0]);
  }

  /**
   * Get or create email settings for a user
   */
  async getOrCreate(userId: string): Promise<UserEmailSettingsInterface> {
    const existing = await this.findByUserId(userId);
    if (existing) {
      return existing;
    }

    // Create default settings
    const result = await this.query(
      `INSERT INTO ${this.tableName} (user_id) VALUES ($1) RETURNING *`,
      [userId]
    );

    return this.transformRow(result.rows[0]);
  }

  /**
   * Update email settings for a user
   */
  async updateSettings(userId: string, settings: Partial<Omit<UserEmailSettingsInterface, 'id' | 'user_id' | 'created_at' | 'updated_at'>>): Promise<UserEmailSettingsInterface> {
    // Ensure settings exist first
    await this.getOrCreate(userId);

    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Build dynamic update query
    const allowedFields = [
      'auto_send_enabled',
      'openai_followup_email_prompt_id',
      'subject_template',
      'body_template',
      'send_conditions',
      'lead_status_filters',
      'skip_if_no_email',
      'send_delay_minutes',
      'max_retries_before_send'
    ];

    for (const field of allowedFields) {
      if (settings[field as keyof typeof settings] !== undefined) {
        const value = settings[field as keyof typeof settings];
        // Convert arrays to JSONB
        if (field === 'send_conditions' || field === 'lead_status_filters') {
          updateFields.push(`${field} = $${paramIndex}::jsonb`);
          values.push(JSON.stringify(value));
        } else {
          updateFields.push(`${field} = $${paramIndex}`);
          values.push(value);
        }
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      // No fields to update, return current settings
      const current = await this.findByUserId(userId);
      if (!current) {
        throw new Error('Settings not found');
      }
      return current;
    }

    values.push(userId);
    const result = await this.query(
      `UPDATE ${this.tableName} 
       SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $${paramIndex}
       RETURNING *`,
      values
    );

    return this.transformRow(result.rows[0]);
  }

  /**
   * Toggle auto-send for a user
   */
  async toggleAutoSend(userId: string, enabled: boolean): Promise<UserEmailSettingsInterface> {
    return this.updateSettings(userId, { auto_send_enabled: enabled });
  }

  /**
   * Get all users with auto-send enabled
   */
  async getUsersWithAutoSendEnabled(): Promise<UserEmailSettingsInterface[]> {
    const result = await this.query(
      `SELECT * FROM ${this.tableName} WHERE auto_send_enabled = true`,
      []
    );
    
    return result.rows.map((row: Record<string, unknown>) => this.transformRow(row));
  }

  /**
   * Check if a call should trigger a follow-up email
   */
  async shouldSendFollowUp(
    userId: string,
    callStatus: string,
    leadStatus: string | null,
    hasEmail: boolean,
    retryCount: number
  ): Promise<{ shouldSend: boolean; reason: string }> {
    const settings = await this.findByUserId(userId);
    
    if (!settings) {
      return { shouldSend: false, reason: 'No email settings configured' };
    }

    if (!settings.auto_send_enabled) {
      return { shouldSend: false, reason: 'Auto-send is disabled' };
    }

    if (settings.skip_if_no_email && !hasEmail) {
      return { shouldSend: false, reason: 'Contact has no email address' };
    }

    // Check send conditions
    const conditions = settings.send_conditions || ['completed'];
    let conditionMet = false;

    if (conditions.includes('completed') && callStatus === 'completed') {
      conditionMet = true;
    }
    if (conditions.includes('busy') && callStatus === 'busy') {
      conditionMet = true;
    }
    if (conditions.includes('no_answer') && callStatus === 'no-answer') {
      conditionMet = true;
    }
    if (conditions.includes('voicemail') && callStatus === 'voicemail') {
      conditionMet = true;
    }
    if (conditions.includes('after_retries') && retryCount >= (settings.max_retries_before_send || 3)) {
      conditionMet = true;
    }

    if (!conditionMet) {
      return { shouldSend: false, reason: `Call status '${callStatus}' does not match send conditions` };
    }

    // Check lead status filter
    const statusFilters = settings.lead_status_filters || ['any'];
    
    if (!statusFilters.includes('any')) {
      const normalizedLeadStatus = (leadStatus || '').toLowerCase();
      const matchesFilter = statusFilters.some(filter => 
        normalizedLeadStatus.includes(filter.toLowerCase())
      );
      
      if (!matchesFilter) {
        return { shouldSend: false, reason: `Lead status '${leadStatus}' does not match filter` };
      }
    }

    return { shouldSend: true, reason: 'All conditions met' };
  }

  /**
   * Transform database row to interface (handle JSONB parsing)
   * JSONB fields are returned as objects by pg driver, but might be strings in some cases
   */
  private transformRow(row: Record<string, unknown>): UserEmailSettingsInterface {
    const sendConditions = row.send_conditions;
    const leadStatusFilters = row.lead_status_filters;

    let parsedConditions: SendCondition[];
    let parsedFilters: LeadStatusFilter[];

    // Parse send_conditions - handle both string and array formats
    if (typeof sendConditions === 'string') {
      try {
        parsedConditions = JSON.parse(sendConditions);
      } catch {
        parsedConditions = ['completed'];
      }
    } else if (Array.isArray(sendConditions)) {
      parsedConditions = sendConditions as SendCondition[];
    } else {
      parsedConditions = ['completed'];
    }

    // Parse lead_status_filters - handle both string and array formats
    if (typeof leadStatusFilters === 'string') {
      try {
        parsedFilters = JSON.parse(leadStatusFilters);
      } catch {
        parsedFilters = ['any'];
      }
    } else if (Array.isArray(leadStatusFilters)) {
      parsedFilters = leadStatusFilters as LeadStatusFilter[];
    } else {
      parsedFilters = ['any'];
    }

    return {
      id: row.id as string,
      user_id: row.user_id as string,
      auto_send_enabled: row.auto_send_enabled as boolean,
      openai_followup_email_prompt_id: row.openai_followup_email_prompt_id as string | null | undefined,
      subject_template: row.subject_template as string,
      body_template: row.body_template as string,
      send_conditions: parsedConditions,
      lead_status_filters: parsedFilters,
      skip_if_no_email: row.skip_if_no_email as boolean,
      send_delay_minutes: row.send_delay_minutes as number,
      max_retries_before_send: row.max_retries_before_send as number,
      created_at: row.created_at as Date,
      updated_at: row.updated_at as Date
    };
  }
}

export default new UserEmailSettingsModel();
