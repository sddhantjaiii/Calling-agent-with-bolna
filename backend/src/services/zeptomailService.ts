/**
 * ZeptoMail API Service
 * 
 * API-based email service using ZeptoMail (Zoho Mail)
 * Replaces SMTP-based nodemailer implementation
 */

import { SendMailClient } from 'zeptomail';

interface EmailRecipient {
  address: string;
  name?: string;
}

interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

interface SendEmailOptions {
  to: EmailRecipient | EmailRecipient[];
  subject: string;
  htmlbody?: string;
  textbody?: string;
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
  attachments?: EmailAttachment[];
}

class ZeptoMailService {
  private client: SendMailClient | null = null;
  private isConfigured = false;
  private fromEmail: string;
  private fromName: string;

  constructor() {
    this.fromEmail = process.env.ZEPTOMAIL_FROM_EMAIL || 'noreply@sniperthink.com';
    this.fromName = process.env.ZEPTOMAIL_FROM_NAME || 'noreply';
    this.initializeClient();
  }

  /**
   * Initialize ZeptoMail API client
   */
  private initializeClient(): void {
    const apiUrl = process.env.ZEPTOMAIL_API_URL || 'https://api.zeptomail.in/v1.1/email';
    const apiToken = process.env.ZEPTOMAIL_API_TOKEN;

    if (!apiToken) {
      console.warn('⚠️ ZeptoMail API token not configured. Email functionality will be disabled.');
      return;
    }

    try {
      this.client = new SendMailClient({
        url: apiUrl,
        token: apiToken
      });

      this.isConfigured = true;
      console.log('✅ ZeptoMail API service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize ZeptoMail API service:', error);
      this.isConfigured = false;
    }
  }

  /**
   * Send email via ZeptoMail API
   */
  async sendEmail(options: SendEmailOptions): Promise<boolean> {
    if (!this.isConfigured || !this.client) {
      console.error('❌ ZeptoMail service not configured');
      return false;
    }

    try {
      // Convert recipients to ZeptoMail format
      const toRecipients = Array.isArray(options.to) ? options.to : [options.to];
      const to = toRecipients.map(recipient => ({
        email_address: {
          address: recipient.address,
          name: recipient.name || recipient.address.split('@')[0]
        }
      }));

      // Prepare email payload
      const emailPayload: any = {
        from: {
          address: this.fromEmail,
          name: this.fromName
        },
        to,
        subject: options.subject
      };

      // Add HTML body if provided
      if (options.htmlbody) {
        emailPayload.htmlbody = options.htmlbody;
      }

      // Add text body if provided
      if (options.textbody) {
        emailPayload.textbody = options.textbody;
      }

      // Add CC if provided
      if (options.cc && options.cc.length > 0) {
        emailPayload.cc = options.cc.map(recipient => ({
          email_address: {
            address: recipient.address,
            name: recipient.name || recipient.address.split('@')[0]
          }
        }));
      }

      // Add BCC if provided
      if (options.bcc && options.bcc.length > 0) {
        emailPayload.bcc = options.bcc.map(recipient => ({
          email_address: {
            address: recipient.address,
            name: recipient.name || recipient.address.split('@')[0]
          }
        }));
      }

      // Add attachments if provided
      if (options.attachments && options.attachments.length > 0) {
        emailPayload.attachments = options.attachments.map(attachment => {
          // ZeptoMail API expects base64 string for content
          let base64Content: string;
          
          if (attachment.content instanceof Buffer) {
            // Convert Buffer to base64 string
            base64Content = attachment.content.toString('base64');
          } else if (typeof attachment.content === 'string') {
            // Content is already base64 string - use as-is
            base64Content = attachment.content;
          } else {
            base64Content = Buffer.from(String(attachment.content)).toString('base64');
          }
          
          console.log(`📎 Processing attachment: ${attachment.filename}`);
          console.log(`   - Content type: ${typeof attachment.content}`);
          console.log(`   - Base64 length: ${base64Content.length} chars`);
          console.log(`   - Estimated file size: ${Math.round(base64Content.length * 0.75 / 1024)} KB`);
          console.log(`   - MIME type: ${attachment.contentType || 'application/octet-stream'}`);
          
          return {
            name: attachment.filename,
            content: base64Content,
            mime_type: attachment.contentType || 'application/octet-stream'
          };
        });
        
        console.log(`📧 Email has ${emailPayload.attachments.length} attachment(s)`);
      }

      // Send email
      const response = await this.client.sendMail(emailPayload);
      
      console.log('✅ Email sent successfully via ZeptoMail API', {
        to: toRecipients.map(r => r.address),
        subject: options.subject
      });

      return true;
    } catch (error) {
      console.error('❌ Failed to send email via ZeptoMail API:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
      }
      return false;
    }
  }

  /**
   * Send simple email with single recipient
   */
  async sendSimpleEmail(
    to: string,
    subject: string,
    htmlbody: string,
    textbody?: string
  ): Promise<boolean> {
    return this.sendEmail({
      to: { address: to },
      subject,
      htmlbody,
      textbody
    });
  }

  /**
   * Check if service is configured
   */
  isReady(): boolean {
    return this.isConfigured;
  }

  /**
   * Get from email address
   */
  getFromEmail(): string {
    return this.fromEmail;
  }

  /**
   * Get from name
   */
  getFromName(): string {
    return this.fromName;
  }
}

// Export singleton instance
export default new ZeptoMailService();
