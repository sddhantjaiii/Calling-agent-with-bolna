import { Request, Response } from 'express';
import { pool } from '../config/database';
import { gmailService } from '../services/gmailService';
import { v4 as uuidv4 } from 'uuid';

interface SendEmailRequest {
  contactId: string;
  to: string;
  toName?: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  attachments?: Array<{
    filename: string;
    content: string; // base64 encoded
    contentType?: string;
    size?: number;
  }>;
}

export class ContactEmailController {
  /**
   * Send email to a contact
   */
  static async sendEmail(req: Request, response: Response) {
    const userId = req.userId;
    
    if (!userId) {
      return response.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    try {
      const {
        contactId,
        to,
        toName,
        cc,
        bcc,
        subject,
        bodyHtml,
        bodyText,
        attachments = [],
      } = req.body as SendEmailRequest;

      // Validate required fields
      if (!to || !subject || !bodyHtml) {
        return response.status(400).json({
          success: false,
          error: 'Missing required fields: to, subject, bodyHtml',
        });
      }

      // Verify contact belongs to user (if contactId provided)
      if (contactId) {
        const contactCheck = await pool.query(
          'SELECT id FROM contacts WHERE id = $1 AND user_id = $2',
          [contactId, userId]
        );

        if (contactCheck.rows.length === 0) {
          return response.status(404).json({
            success: false,
            error: 'Contact not found',
          });
        }
      }

      // Check Gmail connection status first
      const gmailStatus = await gmailService.getGmailStatus(userId);
      
      if (!gmailStatus.connected || !gmailStatus.hasGmailScope) {
        return response.status(400).json({
          success: false,
          error: gmailStatus.message,
          requiresReconnect: gmailStatus.requiresReconnect,
          code: 'GMAIL_NOT_CONNECTED'
        });
      }

      // Send email via Gmail API
      const result = await gmailService.sendEmail(userId, {
        to: { address: to, name: toName },
        subject,
        htmlBody: bodyHtml,
        textBody: bodyText || bodyHtml.replace(/<[^>]*>/g, ''), // Strip HTML for text
        cc: cc?.map(email => ({ address: email })),
        bcc: bcc?.map(email => ({ address: email })),
        attachments: attachments?.map(att => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType || 'application/octet-stream',
        }))
      });

      if (!result.success) {
        return response.status(result.requiresReconnect ? 400 : 500).json({
          success: false,
          error: result.error || 'Failed to send email',
          requiresReconnect: result.requiresReconnect,
          code: result.requiresReconnect ? 'GMAIL_RECONNECT_REQUIRED' : 'SEND_FAILED'
        });
      }

      // Store email record in database (use Gmail sender email)
      const emailId = uuidv4();
      const insertResult = await pool.query(
        `INSERT INTO emails (
          id, user_id, contact_id, from_email, from_name,
          to_email, to_name, cc_emails, bcc_emails,
          subject, body_html, body_text,
          has_attachments, attachment_count, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'sent')
        RETURNING *`,
        [
          emailId,
          userId,
          contactId || null,
          gmailStatus.email, // Use user's Gmail address
          null, // Gmail uses user's profile name automatically
          to,
          toName || to.split('@')[0],
          cc || [],
          bcc || [],
          subject,
          bodyHtml,
          bodyText || null,
          attachments.length > 0,
          attachments.length,
        ]
      );

      // Store attachments metadata if any
      if (attachments.length > 0) {
        const attachmentQueries = attachments.map((att) =>
          pool.query(
            `INSERT INTO email_attachments (email_id, filename, content_type, file_size)
             VALUES ($1, $2, $3, $4)`,
            [emailId, att.filename, att.contentType || 'application/octet-stream', att.size || 0]
          )
        );
        await Promise.all(attachmentQueries);
      }

      console.log('✅ Email sent and logged:', {
        emailId,
        to,
        subject,
        contactId,
      });

      return response.status(200).json({
        success: true,
        data: {
          emailId,
          email: insertResult.rows[0],
        },
        message: 'Email sent successfully',
      });
    } catch (error) {
      console.error('❌ Error sending email:', error);
      return response.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email',
      });
    }
  }

  /**
   * Get email history for a contact
   */
  static async getContactEmails(req: Request, response: Response) {
    const userId = req.userId;
    const { contactId } = req.params;

    if (!userId) {
      return response.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    try {
      // Verify contact belongs to user
      const contactCheck = await pool.query(
        'SELECT id FROM contacts WHERE id = $1 AND user_id = $2',
        [contactId, userId]
      );

      if (contactCheck.rows.length === 0) {
        return response.status(404).json({
          success: false,
          error: 'Contact not found',
        });
      }

      // Get email history
      const result = await pool.query(
        `SELECT 
          e.*,
          COALESCE(
            json_agg(
              json_build_object(
                'filename', ea.filename,
                'contentType', ea.content_type,
                'fileSize', ea.file_size
              )
            ) FILTER (WHERE ea.id IS NOT NULL),
            '[]'
          ) as attachments
        FROM emails e
        LEFT JOIN email_attachments ea ON ea.email_id = e.id
        WHERE e.contact_id = $1 AND e.user_id = $2
        GROUP BY e.id
        ORDER BY e.sent_at DESC`,
        [contactId, userId]
      );

      return response.status(200).json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error('❌ Error fetching contact emails:', error);
      return response.status(500).json({
        success: false,
        error: 'Failed to fetch email history',
      });
    }
  }

  /**
   * Get all emails for the authenticated user
   */
  static async getUserEmails(req: Request, response: Response) {
    const userId = req.userId;
    const { limit = 50, offset = 0 } = req.query;

    if (!userId) {
      return response.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    try {
      const result = await pool.query(
        `SELECT 
          e.*,
          c.name as contact_name,
          c.company as contact_company
        FROM emails e
        LEFT JOIN contacts c ON c.id = e.contact_id
        WHERE e.user_id = $1
        ORDER BY e.sent_at DESC
        LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      const countResult = await pool.query(
        'SELECT COUNT(*) FROM emails WHERE user_id = $1',
        [userId]
      );

      return response.status(200).json({
        success: true,
        data: result.rows,
        pagination: {
          total: parseInt(countResult.rows[0].count),
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      });
    } catch (error) {
      console.error('❌ Error fetching user emails:', error);
      return response.status(500).json({
        success: false,
        error: 'Failed to fetch emails',
      });
    }
  }

  /**
   * Get email statistics for the authenticated user
   */
  static async getEmailStats(req: Request, response: Response) {
    const userId = req.userId;

    if (!userId) {
      return response.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    try {
      const result = await pool.query(
        `SELECT 
          COUNT(*) as total_sent,
          COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
          COUNT(*) FILTER (WHERE status = 'opened') as opened,
          COUNT(*) FILTER (WHERE status = 'bounced') as bounced,
          COUNT(*) FILTER (WHERE status = 'failed') as failed
        FROM emails
        WHERE user_id = $1`,
        [userId]
      );

      return response.status(200).json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      console.error('❌ Error fetching email stats:', error);
      return response.status(500).json({
        success: false,
        error: 'Failed to fetch email statistics',
      });
    }
  }
}
