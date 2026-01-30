/**
 * Email Tracking Service
 * 
 * Handles email open/click tracking via tracking pixels and link wrapping.
 * 
 * Architecture:
 * 1. When sending an email, inject a 1x1 tracking pixel with unique tracking ID
 * 2. Optionally wrap links for click tracking
 * 3. When pixel/link is loaded, record the event and return appropriate response
 */

import { pool } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import crypto from 'crypto';

// 1x1 transparent PNG pixel (base64 encoded)
const TRANSPARENT_PIXEL_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const TRANSPARENT_PIXEL = Buffer.from(TRANSPARENT_PIXEL_BASE64, 'base64');

interface TrackingEventData {
  emailId: string;
  eventType: 'open' | 'click';
  ipAddress?: string;
  userAgent?: string;
  clickedUrl?: string;
  linkId?: string;
}

interface EmailTrackingInfo {
  trackingId: string;
  pixelUrl: string;
}

interface ParsedUserAgent {
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  emailClient: string;
}

class EmailTrackingService {
  private baseUrl: string;

  constructor() {
    // Use the backend URL for tracking endpoints
    this.baseUrl = process.env.BACKEND_URL || process.env.API_BASE_URL || 'http://localhost:3000';
  }

  /**
   * Generate a unique tracking ID for an email
   */
  generateTrackingId(): string {
    // Use a combination of UUID and timestamp for uniqueness
    const uuid = uuidv4().replace(/-/g, '');
    const timestamp = Date.now().toString(36);
    return `${uuid.substring(0, 16)}${timestamp}`;
  }

  /**
   * Generate tracking pixel URL for an email
   */
  getTrackingPixelUrl(trackingId: string): string {
    return `${this.baseUrl}/api/track/open/${trackingId}.png`;
  }

  /**
   * Generate the HTML for the tracking pixel
   */
  getTrackingPixelHtml(trackingId: string): string {
    const pixelUrl = this.getTrackingPixelUrl(trackingId);
    return `<img src="${pixelUrl}" width="1" height="1" style="display:block;width:1px;height:1px;border:0;opacity:0;" alt="" />`;
  }

  /**
   * Inject tracking pixel into HTML email body
   */
  injectTrackingPixel(htmlBody: string, trackingId: string): string {
    const pixelHtml = this.getTrackingPixelHtml(trackingId);
    
    // Try to inject before </body> tag
    if (htmlBody.includes('</body>')) {
      return htmlBody.replace('</body>', `${pixelHtml}</body>`);
    }
    
    // Try to inject before </html> tag
    if (htmlBody.includes('</html>')) {
      return htmlBody.replace('</html>', `${pixelHtml}</html>`);
    }
    
    // Otherwise append at the end
    return htmlBody + pixelHtml;
  }

  /**
   * Generate a wrapped tracking URL for a link
   */
  getTrackedLinkUrl(trackingId: string, originalUrl: string, linkId?: string): string {
    const id = linkId || this.generateLinkId(originalUrl);
    const encodedUrl = encodeURIComponent(originalUrl);
    return `${this.baseUrl}/api/track/click/${trackingId}/${id}?url=${encodedUrl}`;
  }

  /**
   * Generate a unique link ID based on the URL
   */
  private generateLinkId(url: string): string {
    return crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
  }

  /**
   * Wrap all links in HTML for click tracking
   */
  wrapLinksForTracking(htmlBody: string, trackingId: string): string {
    // Regex to find all href links
    const linkRegex = /href=["']([^"']+)["']/gi;
    
    let wrappedHtml = htmlBody;
    let match;
    const replacements: { original: string; replacement: string }[] = [];
    
    while ((match = linkRegex.exec(htmlBody)) !== null) {
      const originalUrl = match[1];
      
      // Skip mailto:, tel:, and # links
      if (originalUrl.startsWith('mailto:') || 
          originalUrl.startsWith('tel:') || 
          originalUrl.startsWith('#') ||
          originalUrl.startsWith('javascript:')) {
        continue;
      }
      
      // Skip tracking pixel URLs (don't double-wrap)
      if (originalUrl.includes('/track/')) {
        continue;
      }
      
      const trackedUrl = this.getTrackedLinkUrl(trackingId, originalUrl);
      replacements.push({
        original: match[0],
        replacement: `href="${trackedUrl}"`
      });
    }
    
    // Apply replacements
    for (const { original, replacement } of replacements) {
      wrappedHtml = wrappedHtml.replace(original, replacement);
    }
    
    return wrappedHtml;
  }

  /**
   * Record a tracking event (open or click)
   */
  async recordTrackingEvent(data: TrackingEventData): Promise<boolean> {
    try {
      // First, look up the email by tracking_id or email_id
      let emailResult;
      
      // Check if emailId is a tracking_id or actual email id
      emailResult = await pool.query(
        `SELECT e.id, e.user_id, e.campaign_id, e.contact_id
         FROM emails e
         WHERE e.tracking_id = $1 OR e.id::text = $1
         LIMIT 1`,
        [data.emailId]
      );

      if (emailResult.rows.length === 0) {
        logger.warn('Email not found for tracking event', { emailId: data.emailId });
        return false;
      }

      const email = emailResult.rows[0];
      const parsedAgent = this.parseUserAgent(data.userAgent || '');

      // Insert tracking event
      await pool.query(
        `INSERT INTO email_tracking_events (
          email_id, user_id, event_type, ip_address, user_agent,
          clicked_url, link_id, device_type, email_client
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          email.id,
          email.user_id,
          data.eventType,
          data.ipAddress || null,
          data.userAgent || null,
          data.clickedUrl || null,
          data.linkId || null,
          parsedAgent.deviceType,
          parsedAgent.emailClient
        ]
      );

      logger.info(`📧 Email ${data.eventType} tracked`, {
        emailId: email.id,
        trackingId: data.emailId,
        eventType: data.eventType,
        ipAddress: data.ipAddress
      });

      return true;
    } catch (error) {
      logger.error('Failed to record tracking event:', error);
      return false;
    }
  }

  /**
   * Get the transparent 1x1 pixel image buffer
   */
  getTransparentPixel(): Buffer {
    return TRANSPARENT_PIXEL;
  }

  /**
   * Parse user agent to extract device and email client info
   */
  private parseUserAgent(userAgent: string): ParsedUserAgent {
    const ua = userAgent.toLowerCase();
    
    // Detect device type
    let deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown' = 'unknown';
    if (/ipad|android.*tablet|tablet/i.test(ua)) {
      deviceType = 'tablet';
    } else if (/mobile|iphone|android|blackberry|windows phone/i.test(ua)) {
      deviceType = 'mobile';
    } else if (/windows|macintosh|linux/i.test(ua)) {
      deviceType = 'desktop';
    }

    // Detect email client
    let emailClient = 'Unknown';
    if (ua.includes('googleimageproxy')) {
      emailClient = 'Gmail (Proxy)';
    } else if (ua.includes('outlook') || ua.includes('microsoft')) {
      emailClient = 'Outlook';
    } else if (ua.includes('apple') || ua.includes('iphone') || ua.includes('ipad')) {
      emailClient = 'Apple Mail';
    } else if (ua.includes('yahoo')) {
      emailClient = 'Yahoo Mail';
    } else if (ua.includes('thunderbird')) {
      emailClient = 'Thunderbird';
    } else if (ua.includes('chrome')) {
      emailClient = 'Chrome (Web)';
    } else if (ua.includes('firefox')) {
      emailClient = 'Firefox (Web)';
    } else if (ua.includes('safari')) {
      emailClient = 'Safari (Web)';
    }

    return { deviceType, emailClient };
  }

  /**
   * Get tracking statistics for an email
   */
  async getEmailTrackingStats(emailId: string, userId: string): Promise<{
    openCount: number;
    clickCount: number;
    firstOpenedAt: Date | null;
    lastOpenedAt: Date | null;
    uniqueOpens: number;
    events: any[];
  }> {
    // Get email stats
    const emailResult = await pool.query(
      `SELECT open_count, click_count, first_opened_at, last_opened_at
       FROM emails
       WHERE id = $1 AND user_id = $2`,
      [emailId, userId]
    );

    if (emailResult.rows.length === 0) {
      throw new Error('Email not found');
    }

    const email = emailResult.rows[0];

    // Get unique opens (by IP)
    const uniqueOpensResult = await pool.query(
      `SELECT COUNT(DISTINCT ip_address) as unique_opens
       FROM email_tracking_events
       WHERE email_id = $1 AND event_type = 'open'`,
      [emailId]
    );

    // Get recent events
    const eventsResult = await pool.query(
      `SELECT event_type, occurred_at, ip_address, device_type, email_client, clicked_url
       FROM email_tracking_events
       WHERE email_id = $1
       ORDER BY occurred_at DESC
       LIMIT 50`,
      [emailId]
    );

    return {
      openCount: email.open_count,
      clickCount: email.click_count,
      firstOpenedAt: email.first_opened_at,
      lastOpenedAt: email.last_opened_at,
      uniqueOpens: parseInt(uniqueOpensResult.rows[0]?.unique_opens || '0'),
      events: eventsResult.rows
    };
  }

  /**
   * Get tracking statistics for a campaign
   */
  async getCampaignTrackingStats(campaignId: string, userId: string): Promise<{
    totalEmails: number;
    sentEmails: number;
    openedEmails: number;
    clickedEmails: number;
    openRate: number;
    clickRate: number;
    clickToOpenRate: number;
  }> {
    const result = await pool.query(
      `SELECT 
        total_contacts,
        completed_emails as sent_emails,
        opened_emails,
        clicked_emails
       FROM email_campaigns
       WHERE id = $1 AND user_id = $2`,
      [campaignId, userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Campaign not found');
    }

    const campaign = result.rows[0];
    const sent = campaign.sent_emails || 0;
    const opened = campaign.opened_emails || 0;
    const clicked = campaign.clicked_emails || 0;

    return {
      totalEmails: campaign.total_contacts,
      sentEmails: sent,
      openedEmails: opened,
      clickedEmails: clicked,
      openRate: sent > 0 ? (opened / sent) * 100 : 0,
      clickRate: sent > 0 ? (clicked / sent) * 100 : 0,
      clickToOpenRate: opened > 0 ? (clicked / opened) * 100 : 0
    };
  }
}

// Export singleton instance
export const emailTrackingService = new EmailTrackingService();
export default emailTrackingService;
