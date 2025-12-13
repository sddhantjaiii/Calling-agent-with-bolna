import { pool } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import gmailService from './gmailService';
import { logger } from '../utils/logger';

interface CreateEmailCampaignRequest {
  campaign_name: string;
  subject: string;
  body: string;
  contact_ids?: string[];
  schedule?: string;
  attachments?: Array<{
    filename: string;
    content: string; // base64
    contentType: string;
    size: number;
  }>;
}

interface EmailCampaign {
  id: string;
  user_id: string;
  name: string;
  subject: string;
  body_html: string;
  body_text: string;
  status: 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  total_contacts: number;
  completed_emails: number;
  successful_emails: number;
  failed_emails: number;
  opened_emails: number;
  scheduled_at?: Date;
  start_date?: Date;
  end_date?: Date;
  created_at: Date;
  updated_at: Date;
}

export class EmailCampaignService {
  /**
   * Check if Gmail is connected for the user
   */
  static async checkGmailConnection(userId: string): Promise<{ connected: boolean; hasGmailScope: boolean; requiresReconnect?: boolean; message: string; email?: string }> {
    return await gmailService.getGmailStatus(userId);
  }

  /**
   * Create a new email campaign
   */
  static async createEmailCampaign(
    userId: string,
    data: CreateEmailCampaignRequest
  ): Promise<EmailCampaign> {
    // Check Gmail connection before creating campaign
    const gmailStatus = await this.checkGmailConnection(userId);
    if (!gmailStatus.connected || !gmailStatus.hasGmailScope) {
      throw new Error(gmailStatus.requiresReconnect 
        ? 'Please reconnect Google to enable email sending. Go to Settings > Integrations to reconnect.'
        : 'Gmail is not connected. Please connect your Gmail account in Settings > Integrations to send emails.');
    }

    return await pool.transaction(async (client) => {
      const campaignId = uuidv4();
      const bodyText = data.body.replace(/<[^>]*>/g, ''); // Strip HTML for text version

      // Create email campaign
      const campaignResult = await client.query(
        `INSERT INTO email_campaigns (
          id, user_id, name, subject, body_html, body_text, status, scheduled_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          campaignId,
          userId,
          data.campaign_name,
          data.subject,
          data.body,
          bodyText,
          data.schedule ? 'scheduled' : 'in_progress',
          data.schedule ? new Date(data.schedule) : null,
        ]
      );

      const campaign = campaignResult.rows[0];

      // If contacts are provided, send emails immediately (or schedule them)
      if (data.contact_ids && data.contact_ids.length > 0) {
        await this.sendCampaignEmails(
          client, 
          userId, 
          campaignId, 
          data.contact_ids, 
          data.subject, 
          data.body, 
          bodyText,
          data.attachments
        );
        
        // Update total contacts count
        await client.query(
          'UPDATE email_campaigns SET total_contacts = $1 WHERE id = $2',
          [data.contact_ids.length, campaignId]
        );
      }

      logger.info(`Email campaign created: ${campaignId} for user ${userId}`);

      return campaign;
    });
  }

  /**
   * Send emails to all contacts in the campaign
   */
  private static async sendCampaignEmails(
    client: any,
    userId: string,
    campaignId: string,
    contactIds: string[],
    subject: string,
    bodyHtml: string,
    bodyText: string,
    attachments?: Array<{
      filename: string;
      content: string;
      contentType: string;
      size: number;
    }>
  ): Promise<void> {
    // Get Gmail status to get sender email
    const gmailStatus = await gmailService.getGmailStatus(userId);
    if (!gmailStatus.connected || !gmailStatus.hasGmailScope) {
      throw new Error('Gmail is not connected. Cannot send campaign emails.');
    }

    const fromEmail = gmailStatus.email || '';

    // Get contacts
    const contactsResult = await client.query(
      'SELECT id, email, name FROM contacts WHERE id = ANY($1::uuid[]) AND user_id = $2',
      [contactIds, userId]
    );
    const contacts = contactsResult.rows;

    let successCount = 0;
    let failCount = 0;

    // Send emails to each contact
    for (const contact of contacts) {
      if (!contact.email) {
        failCount++;
        continue;
      }

      try {
        // Send email via Gmail API
        const result = await gmailService.sendEmail(userId, {
          to: { address: contact.email, name: contact.name || contact.email.split('@')[0] },
          subject,
          htmlBody: bodyHtml,
          textBody: bodyText,
          attachments: attachments?.map(att => ({
            filename: att.filename,
            content: att.content,
            contentType: att.contentType || 'application/octet-stream',
          }))
        });

        if (result.success) {
          // Store email record
          const emailId = uuidv4();
          await client.query(
            `INSERT INTO emails (
              id, user_id, contact_id, campaign_id, from_email, from_name,
              to_email, to_name, subject, body_html, body_text,
              has_attachments, attachment_count, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'sent')`,
            [
              emailId,
              userId,
              contact.id,
              campaignId,
              fromEmail,
              null, // Gmail uses profile name automatically
              contact.email,
              contact.name || contact.email.split('@')[0],
              subject,
              bodyHtml,
              bodyText,
              attachments && attachments.length > 0,
              attachments?.length || 0,
            ]
          );

          // Store attachments metadata if any
          if (attachments && attachments.length > 0) {
            const attachmentQueries = attachments.map((att) =>
              client.query(
                `INSERT INTO email_attachments (email_id, filename, content_type, file_size)
                 VALUES ($1, $2, $3, $4)`,
                [emailId, att.filename, att.contentType || 'application/octet-stream', att.size || 0]
              )
            );
            await Promise.all(attachmentQueries);
          }

          successCount++;
        } else {
          failCount++;
          logger.error(`Failed to send campaign email to ${contact.email}: ${result.error}`);
        }
      } catch (error: any) {
        logger.error(`Failed to send email to ${contact.email}:`, error);
        failCount++;
      }
    }

    // Update campaign statistics
    await client.query(
      `UPDATE email_campaigns 
       SET completed_emails = $1, successful_emails = $2, failed_emails = $3,
           status = 'completed', end_date = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [successCount + failCount, successCount, failCount, campaignId]
    );

    logger.info(`Email campaign ${campaignId} completed: ${successCount} sent, ${failCount} failed`);
  }

  /**
   * Get email campaign by ID
   */
  static async getEmailCampaign(id: string, userId: string): Promise<EmailCampaign | null> {
    const result = await pool.query(
      'SELECT * FROM email_campaigns WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get all email campaigns for user
   */
  static async getUserEmailCampaigns(userId: string): Promise<EmailCampaign[]> {
    const result = await pool.query(
      'SELECT * FROM email_campaigns WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    return result.rows;
  }

  /**
   * Cancel email campaign
   */
  static async cancelEmailCampaign(id: string, userId: string): Promise<void> {
    await pool.query(
      `UPDATE email_campaigns 
       SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    logger.info(`Email campaign ${id} cancelled by user ${userId}`);
  }
}
