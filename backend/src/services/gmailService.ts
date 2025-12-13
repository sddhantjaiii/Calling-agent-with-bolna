/**
 * Gmail Service
 * 
 * Sends emails via Gmail API using the user's connected Google account.
 * Falls back with clear error if Gmail is not connected or scope is missing.
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import googleAuthService from './googleAuthService';
import { hasGmailScope } from '../types/googleCalendar';

interface GmailRecipient {
  address: string;
  name?: string;
}

interface GmailAttachment {
  filename: string;
  content: string; // base64 encoded
  contentType?: string;
}

interface SendGmailOptions {
  to: GmailRecipient | GmailRecipient[];
  subject: string;
  htmlBody: string;
  textBody?: string;
  cc?: GmailRecipient[];
  bcc?: GmailRecipient[];
  attachments?: GmailAttachment[];
}

interface GmailSendResult {
  success: boolean;
  messageId?: string;
  threadId?: string;
  error?: string;
  requiresReconnect?: boolean;
}

interface GmailConnectionStatus {
  connected: boolean;
  hasGmailScope: boolean;
  email?: string;
  requiresReconnect: boolean;
  message: string;
}

class GmailService {
  private clientId: string;
  private clientSecret: string;

  constructor() {
    this.clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || '';
    this.clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '';
  }

  /**
   * Check if user has Gmail connected with proper scope
   */
  async getGmailStatus(userId: string): Promise<GmailConnectionStatus> {
    try {
      const result = await pool.query(
        `SELECT google_calendar_connected, google_email, google_access_token, google_refresh_token
         FROM users WHERE id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return {
          connected: false,
          hasGmailScope: false,
          requiresReconnect: false,
          message: 'User not found'
        };
      }

      const user = result.rows[0];

      // Check if Google is connected at all
      if (!user.google_calendar_connected || !user.google_refresh_token) {
        return {
          connected: false,
          hasGmailScope: false,
          requiresReconnect: false,
          message: 'Google account not connected. Please connect your Google account in Settings → Integrations.'
        };
      }

      // Check if user has Gmail scope by verifying the token with Google's tokeninfo API
      // Note: gmail.send scope ONLY allows sending, NOT reading profile, so we can't use getProfile
      try {
        // Get valid access token (refreshes if needed)
        logger.info('📧 Checking Gmail status - getting valid token', { userId });
        const accessToken = await googleAuthService.ensureValidToken(userId);
        
        // Verify token has gmail.send scope using Google's tokeninfo endpoint
        logger.info('📧 Verifying Gmail scope via tokeninfo API', { userId });
        const axios = require('axios');
        const tokenInfoResponse = await axios.get(
          `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`
        );
        
        const scopes = tokenInfoResponse.data.scope || '';
        const hasGmailSendScope = scopes.includes('gmail.send');
        
        if (hasGmailSendScope) {
          logger.info('✅ Gmail connected and ready (gmail.send scope verified)', { 
            userId, 
            email: user.google_email,
            scopes 
          });
          return {
            connected: true,
            hasGmailScope: true,
            email: user.google_email,
            requiresReconnect: false,
            message: 'Gmail connected and ready'
          };
        } else {
          logger.warn('⚠️ Gmail scope not in token', { userId, scopes });
          return {
            connected: true,
            hasGmailScope: false,
            email: user.google_email,
            requiresReconnect: true,
            message: 'Gmail permission not granted. Please reconnect your Google account to enable email sending.'
          };
        }
      } catch (error: any) {
        // Log the full error for debugging
        logger.error('❌ Gmail status check error:', {
          userId,
          errorCode: error.code,
          errorMessage: error.message,
          errorName: error.name,
          errorResponse: error.response?.data,
          errorStatus: error.response?.status,
          fullError: JSON.stringify(error, Object.getOwnPropertyNames(error))
        });

        // Check if error is due to missing scope (403 Forbidden with specific messages)
        const errorMessage = error.message?.toLowerCase() || '';
        const errorCode = error.code;
        const responseStatus = error.response?.status;
        
        // Gmail API returns 403 with specific error when scope is missing
        if (errorCode === 403 || responseStatus === 403 || 
            errorMessage.includes('insufficient') || 
            errorMessage.includes('scope') ||
            errorMessage.includes('gmail api has not been used') ||
            errorMessage.includes('access not configured')) {
          logger.warn('⚠️ Gmail scope not granted - requires reconnect', { userId });
          return {
            connected: true,
            hasGmailScope: false,
            email: user.google_email,
            requiresReconnect: true,
            message: 'Gmail permission not granted. Please reconnect your Google account to enable email sending.'
          };
        }
        
        // Check if it's a token-related error that requires reconnection
        if (error.code === 'CALENDAR_NOT_CONNECTED' || 
            error.code === 'TOKEN_REFRESH_ERROR' ||
            errorMessage.includes('invalid_grant') ||
            errorMessage.includes('token has been expired or revoked')) {
          logger.warn('⚠️ Token invalid - requires reconnect', { userId });
          return {
            connected: true,
            hasGmailScope: false,
            email: user.google_email,
            requiresReconnect: true,
            message: 'Your Google token has expired. Please reconnect your Google account.'
          };
        }
        
        // For other errors (network, temporary issues), don't force reconnect
        // Just report the error and let user retry
        logger.error('❌ Temporary Gmail connection issue:', error);
        return {
          connected: true,
          hasGmailScope: false,
          email: user.google_email,
          requiresReconnect: true,
          message: 'Gmail connection issue. Please reconnect your Google account.'
        };
      }
    } catch (error) {
      logger.error('Error getting Gmail status:', error);
      return {
        connected: false,
        hasGmailScope: false,
        requiresReconnect: false,
        message: 'Error checking Gmail status'
      };
    }
  }

  /**
   * Send email via Gmail API
   */
  async sendEmail(userId: string, options: SendGmailOptions): Promise<GmailSendResult> {
    try {
      // Log attachment info for debugging
      if (options.attachments && options.attachments.length > 0) {
        logger.info('📎 Email attachments received:', {
          count: options.attachments.length,
          attachments: options.attachments.map(att => ({
            filename: att.filename,
            contentType: att.contentType,
            contentLength: att.content?.length || 0,
            // Approx decoded size (base64 is ~4/3 of original)
            approxDecodedSize: Math.round((att.content?.length || 0) * 3 / 4)
          }))
        });
      }

      // First check Gmail status
      const status = await this.getGmailStatus(userId);
      
      if (!status.connected) {
        return {
          success: false,
          error: status.message,
          requiresReconnect: false
        };
      }

      if (!status.hasGmailScope || status.requiresReconnect) {
        return {
          success: false,
          error: status.message,
          requiresReconnect: true
        };
      }

      // Get valid access token
      const accessToken = await googleAuthService.ensureValidToken(userId);

      // Create OAuth client
      const oauth2Client = new google.auth.OAuth2(
        this.clientId,
        this.clientSecret
      );
      oauth2Client.setCredentials({ access_token: accessToken });

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      // Build the email message
      const rawMessage = this.buildRawMessage(options);

      // Send the email
      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: rawMessage
        }
      });

      logger.info('✅ Email sent via Gmail', {
        userId,
        messageId: response.data.id,
        threadId: response.data.threadId,
        to: Array.isArray(options.to) ? options.to.map(r => r.address) : [options.to.address]
      });

      return {
        success: true,
        messageId: response.data.id || undefined,
        threadId: response.data.threadId || undefined
      };
    } catch (error: any) {
      logger.error('❌ Failed to send email via Gmail:', error);

      // Check if it's a scope/permission error
      if (error.code === 403 || error.message?.includes('insufficient') || error.message?.includes('scope')) {
        return {
          success: false,
          error: 'Gmail permission not granted. Please reconnect your Google account to enable email sending.',
          requiresReconnect: true
        };
      }

      return {
        success: false,
        error: error.message || 'Failed to send email via Gmail'
      };
    }
  }

  /**
   * Build raw email message in RFC 2822 format
   */
  private buildRawMessage(options: SendGmailOptions): string {
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const toRecipients = Array.isArray(options.to) ? options.to : [options.to];
    
    // Format recipients
    const formatRecipient = (r: GmailRecipient): string => {
      if (r.name) {
        return `"${r.name}" <${r.address}>`;
      }
      return r.address;
    };

    // Build headers
    let headers = [
      `To: ${toRecipients.map(formatRecipient).join(', ')}`,
      `Subject: =?UTF-8?B?${Buffer.from(options.subject).toString('base64')}?=`,
      'MIME-Version: 1.0'
    ];

    if (options.cc && options.cc.length > 0) {
      headers.push(`Cc: ${options.cc.map(formatRecipient).join(', ')}`);
    }

    if (options.bcc && options.bcc.length > 0) {
      headers.push(`Bcc: ${options.bcc.map(formatRecipient).join(', ')}`);
    }

    let message = '';

    if (options.attachments && options.attachments.length > 0) {
      // Multipart message with attachments
      headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
      message = headers.join('\r\n') + '\r\n\r\n';

      // Text/HTML body part
      const bodyBoundary = `----=_Body_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      message += `--${boundary}\r\n`;
      message += `Content-Type: multipart/alternative; boundary="${bodyBoundary}"\r\n\r\n`;

      // Plain text version
      if (options.textBody) {
        message += `--${bodyBoundary}\r\n`;
        message += 'Content-Type: text/plain; charset=UTF-8\r\n';
        message += 'Content-Transfer-Encoding: base64\r\n\r\n';
        message += Buffer.from(options.textBody).toString('base64') + '\r\n';
      }

      // HTML version
      message += `--${bodyBoundary}\r\n`;
      message += 'Content-Type: text/html; charset=UTF-8\r\n';
      message += 'Content-Transfer-Encoding: base64\r\n\r\n';
      message += Buffer.from(options.htmlBody).toString('base64') + '\r\n';
      message += `--${bodyBoundary}--\r\n`;

      // Attachments
      for (const attachment of options.attachments) {
        message += `--${boundary}\r\n`;
        message += `Content-Type: ${attachment.contentType || 'application/octet-stream'}; name="${attachment.filename}"\r\n`;
        message += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n`;
        message += 'Content-Transfer-Encoding: base64\r\n\r\n';
        
        // Base64 content must have line breaks every 76 characters for MIME compliance
        const base64Content = attachment.content.replace(/(.{76})/g, '$1\r\n');
        message += base64Content + '\r\n';
      }

      message += `--${boundary}--`;
    } else {
      // Simple multipart/alternative for HTML + text
      const bodyBoundary = `----=_Body_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      headers.push(`Content-Type: multipart/alternative; boundary="${bodyBoundary}"`);
      message = headers.join('\r\n') + '\r\n\r\n';

      // Plain text version
      if (options.textBody) {
        message += `--${bodyBoundary}\r\n`;
        message += 'Content-Type: text/plain; charset=UTF-8\r\n';
        message += 'Content-Transfer-Encoding: base64\r\n\r\n';
        message += Buffer.from(options.textBody).toString('base64') + '\r\n';
      }

      // HTML version
      message += `--${bodyBoundary}\r\n`;
      message += 'Content-Type: text/html; charset=UTF-8\r\n';
      message += 'Content-Transfer-Encoding: base64\r\n\r\n';
      message += Buffer.from(options.htmlBody).toString('base64') + '\r\n';
      message += `--${bodyBoundary}--`;
    }

    // Encode to base64url format as required by Gmail API
    return Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}

// Export singleton instance
export const gmailService = new GmailService();
export default gmailService;
