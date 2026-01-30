import { pool } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import gmailService from './gmailService';
import emailTrackingService from './emailTrackingService';
import { logger } from '../utils/logger';
import { 
  replaceTokens, 
  validateTokensForContacts, 
  ContactData,
  ValidationResult 
} from '../utils/emailTokenReplacer';

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

interface EmailAttachmentMetadata {
  id: string;
  email_id: string;
  filename: string;
  content_type: string;
  file_size: number;
  created_at: Date;
}

interface EmailCampaignEmail {
  id: string;
  contact_id: string | null;
  to_email: string;
  to_name: string | null;
  status: string;
  sent_at: Date;
  delivered_at: Date | null;
  opened_at: Date | null;
  failed_at: Date | null;
  error_message: string | null;
  contact: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  attachments: EmailAttachmentMetadata[];
}

export class EmailCampaignService {
  /**
   * Check if Gmail is connected for the user
   */
  static async checkGmailConnection(userId: string): Promise<{ connected: boolean; hasGmailScope: boolean; requiresReconnect?: boolean; message: string; email?: string }> {
    return await gmailService.getGmailStatus(userId);
  }

  /**
   * Validate email campaign tokens against contacts
   * Returns validation result with detailed error report
   */
  static async validateCampaignTokens(
    userId: string,
    subject: string,
    body: string,
    contactIds: string[]
  ): Promise<ValidationResult> {
    // Fetch contacts
    const contactsResult = await pool.query(
      `SELECT id, name, phone_number, email, company, city, country, business_context 
       FROM contacts WHERE id = ANY($1::uuid[]) AND user_id = $2`,
      [contactIds, userId]
    );

    const contacts: ContactData[] = contactsResult.rows;

    // Validate tokens
    return validateTokensForContacts(subject, body, contacts);
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

    // Validate tokens if contacts are provided
    if (data.contact_ids && data.contact_ids.length > 0) {
      const validation = await this.validateCampaignTokens(
        userId,
        data.subject,
        data.body,
        data.contact_ids
      );

      if (!validation.valid) {
        const errorDetails = validation.errors.map(err => ({
          contactId: err.contactId,
          contactName: err.contactName,
          issues: err.tokensFailed.map(tf => tf.reason)
        }));
        
        throw new Error(
          `Token validation failed for ${validation.contactsWithErrors} contact(s). ` +
          `Details: ${JSON.stringify(errorDetails)}`
        );
      }
    }

    return await pool.transaction(async (client) => {
      const campaignId = uuidv4();
      const bodyText = data.body.replace(/<[^>]*>/g, ''); // Strip HTML for text version

      // Create email campaign with 'draft' status - emails will be sent in background
      // Valid statuses: draft, scheduled, in_progress, completed, cancelled
      const campaignResult = await client.query(
        `INSERT INTO email_campaigns (
          id, user_id, name, subject, body_html, body_text, status, scheduled_at, total_contacts
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          campaignId,
          userId,
          data.campaign_name,
          data.subject,
          data.body,
          bodyText,
          data.schedule ? 'scheduled' : 'draft', // Use 'draft' as initial status
          data.schedule ? new Date(data.schedule) : null,
          data.contact_ids?.length || 0,
        ]
      );

      const campaign = campaignResult.rows[0];

      // Store contact IDs and attachments for background processing
      if (data.contact_ids && data.contact_ids.length > 0) {
        // Start background email processing after transaction commits
        // Use setImmediate to not block the response
        setImmediate(() => {
          this.processEmailCampaignInBackground(
            userId,
            campaignId,
            data.contact_ids!,
            data.subject,
            data.body,
            bodyText,
            data.attachments
          ).catch(error => {
            logger.error(`Background email campaign processing failed for ${campaignId}:`, error);
          });
        });
      }

      logger.info(`Email campaign created: ${campaignId} for user ${userId}`);

      return campaign;
    });
  }

  /**
   * Process email campaign in background (non-blocking)
   */
  private static async processEmailCampaignInBackground(
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
    try {
      // Update status to in_progress
      await pool.query(
        `UPDATE email_campaigns SET status = 'in_progress', start_date = CURRENT_TIMESTAMP WHERE id = $1`,
        [campaignId]
      );

      // Get Gmail status to get sender email
      const gmailStatus = await gmailService.getGmailStatus(userId);
      if (!gmailStatus.connected || !gmailStatus.hasGmailScope) {
        await pool.query(
          `UPDATE email_campaigns SET status = 'failed', end_date = CURRENT_TIMESTAMP WHERE id = $1`,
          [campaignId]
        );
        throw new Error('Gmail is not connected. Cannot send campaign emails.');
      }

      const fromEmail = gmailStatus.email || '';

      // Get user's name for the sender display name
      const userResult = await pool.query(
        'SELECT name FROM users WHERE id = $1',
        [userId]
      );
      const fromName = userResult.rows[0]?.name || '';

      // Get contacts
      const contactsResult = await pool.query(
        'SELECT id, email, name, phone_number, company, city, country, business_context FROM contacts WHERE id = ANY($1::uuid[]) AND user_id = $2',
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
          // Personalize subject and body with token replacement
          const personalizedSubject = replaceTokens(subject, contact);
          const personalizedBodyHtml = replaceTokens(bodyHtml, contact);
          const personalizedBodyText = replaceTokens(bodyText, contact);

          // Generate tracking ID for this email
          const trackingId = emailTrackingService.generateTrackingId();

          // Send email via Gmail API with tracking enabled
          const result = await gmailService.sendEmail(userId, {
            to: { address: contact.email, name: contact.name || contact.email.split('@')[0] },
            subject: personalizedSubject,
            htmlBody: personalizedBodyHtml,
            textBody: personalizedBodyText,
            fromName,
            fromEmail,
            attachments: attachments?.map(att => ({
              filename: att.filename,
              content: att.content,
              contentType: att.contentType || 'application/octet-stream',
            })),
            trackingId,
            enableTracking: true,
            enableLinkTracking: true
          });

          if (result.success) {
            // Store email record with tracking ID
            const emailId = uuidv4();
            await pool.query(
              `INSERT INTO emails (
                id, user_id, contact_id, campaign_id, from_email, from_name,
                to_email, to_name, subject, body_html, body_text,
                has_attachments, attachment_count, status, tracking_id
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'sent', $14)`,
              [
                emailId,
                userId,
                contact.id,
                campaignId,
                fromEmail,
                fromName,
                contact.email,
                contact.name || contact.email.split('@')[0],
                personalizedSubject,
                personalizedBodyHtml,
                personalizedBodyText,
                attachments && attachments.length > 0,
                attachments?.length || 0,
                trackingId,
              ]
            );

            // Link email to lead_analytics if exists
            await pool.query(
              `UPDATE lead_analytics 
               SET email_id = $1
               WHERE id = (
                 SELECT id FROM lead_analytics
                 WHERE user_id = $2 AND phone_number = $3 AND email_id IS NULL
                 ORDER BY created_at DESC
                 LIMIT 1
               )`,
              [emailId, userId, contact.phone_number]
            );

            // Store attachments metadata if any
            if (attachments && attachments.length > 0) {
              const attachmentQueries = attachments.map((att) =>
                pool.query(
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

          // Update progress periodically (every 10 emails)
          if ((successCount + failCount) % 10 === 0) {
            await pool.query(
              `UPDATE email_campaigns 
               SET completed_emails = $1, successful_emails = $2, failed_emails = $3
               WHERE id = $4`,
              [successCount + failCount, successCount, failCount, campaignId]
            );
          }
        } catch (error: any) {
          logger.error(`Failed to send email to ${contact.email}:`, error);
          failCount++;
        }
      }

      // Final update - mark campaign as completed
      await pool.query(
        `UPDATE email_campaigns 
         SET completed_emails = $1, successful_emails = $2, failed_emails = $3,
             status = 'completed', end_date = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [successCount + failCount, successCount, failCount, campaignId]
      );

      logger.info(`Email campaign ${campaignId} completed: ${successCount} sent, ${failCount} failed`);
    } catch (error: any) {
      logger.error(`Email campaign ${campaignId} failed:`, error);
      await pool.query(
        `UPDATE email_campaigns SET status = 'failed', end_date = CURRENT_TIMESTAMP WHERE id = $1`,
        [campaignId]
      );
    }
  }

  /**
   * Send emails to all contacts in the campaign (DEPRECATED - use processEmailCampaignInBackground)
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

    // Get user's name for the sender display name
    const userResult = await client.query(
      'SELECT name FROM users WHERE id = $1',
      [userId]
    );
    const fromName = userResult.rows[0]?.name || '';

    // Get contacts
    const contactsResult = await client.query(
      'SELECT id, email, name, phone_number, company, city, country, business_context FROM contacts WHERE id = ANY($1::uuid[]) AND user_id = $2',
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
        // Personalize subject and body with token replacement
        const personalizedSubject = replaceTokens(subject, contact);
        const personalizedBodyHtml = replaceTokens(bodyHtml, contact);
        const personalizedBodyText = replaceTokens(bodyText, contact);

        // Generate tracking ID for this email
        const trackingId = emailTrackingService.generateTrackingId();

        // Send email via Gmail API with tracking enabled
        const result = await gmailService.sendEmail(userId, {
          to: { address: contact.email, name: contact.name || contact.email.split('@')[0] },
          subject: personalizedSubject,
          htmlBody: personalizedBodyHtml,
          textBody: personalizedBodyText,
          fromName, // User's display name for the sender
          fromEmail, // User's Gmail address
          attachments: attachments?.map(att => ({
            filename: att.filename,
            content: att.content,
            contentType: att.contentType || 'application/octet-stream',
          })),
          trackingId, // Use pre-generated tracking ID
          enableTracking: true, // Enable open tracking
          enableLinkTracking: true // Enable click tracking for campaigns
        });

        if (result.success) {
          // Store email record with tracking ID
          const emailId = uuidv4();
          await client.query(
            `INSERT INTO emails (
              id, user_id, contact_id, campaign_id, from_email, from_name,
              to_email, to_name, subject, body_html, body_text,
              has_attachments, attachment_count, status, tracking_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'sent', $14)`,
            [
              emailId,
              userId,
              contact.id,
              campaignId,
              fromEmail,
              null, // Gmail uses profile name automatically
              contact.email,
              contact.name || contact.email.split('@')[0],
              personalizedSubject,
              personalizedBodyHtml,
              personalizedBodyText,
              attachments && attachments.length > 0,
              attachments?.length || 0,
              trackingId, // Store the tracking ID
            ]
          );

          // Link email to lead_analytics if a lead analytics record exists for this contact
          await client.query(
            `UPDATE lead_analytics 
             SET email_id = $1
             WHERE id = (
               SELECT id FROM lead_analytics
               WHERE user_id = $2 AND phone_number = $3 AND email_id IS NULL
               ORDER BY created_at DESC
               LIMIT 1
             )`,
            [emailId, userId, contact.phone_number]
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
   * Get an email campaign + recipient emails and attachment metadata
   */
  static async getEmailCampaignDetails(
    id: string,
    userId: string
  ): Promise<{ campaign: EmailCampaign; emails: EmailCampaignEmail[] } | null> {
    const campaign = await this.getEmailCampaign(id, userId);
    if (!campaign) return null;

    const emailsResult = await pool.query(
      `SELECT
        e.id,
        e.contact_id,
        e.to_email,
        e.to_name,
        e.status,
        e.sent_at,
        e.delivered_at,
        e.opened_at,
        e.failed_at,
        e.error_message,
        c.name AS contact_name,
        c.email AS contact_email
      FROM emails e
      LEFT JOIN contacts c ON c.id = e.contact_id
      WHERE e.campaign_id = $1 AND e.user_id = $2
      ORDER BY e.sent_at DESC`,
      [id, userId]
    );

    const emailRows = emailsResult.rows as Array<{
      id: string;
      contact_id: string | null;
      to_email: string;
      to_name: string | null;
      status: string;
      sent_at: Date;
      delivered_at: Date | null;
      opened_at: Date | null;
      failed_at: Date | null;
      error_message: string | null;
      contact_name: string | null;
      contact_email: string | null;
    }>;

    const emailIds = emailRows.map((r) => r.id);
    const attachmentsByEmailId: Record<string, EmailAttachmentMetadata[]> = {};

    if (emailIds.length > 0) {
      const attachmentsResult = await pool.query(
        `SELECT id, email_id, filename, content_type, file_size, created_at
         FROM email_attachments
         WHERE email_id = ANY($1::uuid[])`,
        [emailIds]
      );

      for (const row of attachmentsResult.rows as EmailAttachmentMetadata[]) {
        if (!attachmentsByEmailId[row.email_id]) attachmentsByEmailId[row.email_id] = [];
        attachmentsByEmailId[row.email_id].push(row);
      }
    }

    const emails: EmailCampaignEmail[] = emailRows.map((row) => ({
      id: row.id,
      contact_id: row.contact_id,
      to_email: row.to_email,
      to_name: row.to_name,
      status: row.status,
      sent_at: row.sent_at,
      delivered_at: row.delivered_at,
      opened_at: row.opened_at,
      failed_at: row.failed_at,
      error_message: row.error_message,
      contact: row.contact_id
        ? { id: row.contact_id, name: row.contact_name, email: row.contact_email }
        : null,
      attachments: attachmentsByEmailId[row.id] || [],
    }));

    return { campaign, emails };
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
