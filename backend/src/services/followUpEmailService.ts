import { emailService } from './emailService';
import UserEmailSettingsModel, { UserEmailSettingsInterface, DEFAULT_BODY_TEMPLATE, DEFAULT_SUBJECT_TEMPLATE } from '../models/UserEmailSettings';
import openaiPromptService from './openaiPromptService';
import { logger } from '../utils/logger';
import { pool } from '../config/database';
import axios from 'axios';
import DOMPurify from 'isomorphic-dompurify';

/**
 * Variables available for email template replacement
 */
export interface EmailTemplateVariables {
  lead_name: string;
  lead_email?: string;
  company?: string;
  phone?: string;
  agent_name?: string;
  sender_name: string;
  call_duration?: string;
  call_date?: string;
  lead_status?: string;
  // Custom variables from OpenAI personalization
  [key: string]: string | undefined;
}

/**
 * Call data for generating follow-up email
 */
export interface FollowUpCallData {
  callId: string;
  userId: string;
  contactId?: string;
  phoneNumber: string;
  callStatus: string;
  leadStatus?: string;
  transcript?: string;
  durationMinutes?: number;
  retryCount?: number;
  createdAt: Date;
}

/**
 * Service for managing and sending follow-up emails
 */
class FollowUpEmailService {
  private apiKey: string;
  private baseUrl = 'https://api.openai.com/v1';

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
  }

  /**
   * Process a call for potential follow-up email
   */
  async processCallForFollowUp(callData: FollowUpCallData): Promise<{
    sent: boolean;
    reason: string;
    emailId?: string;
  }> {
    try {
      logger.info('Processing call for follow-up email', {
        callId: callData.callId,
        userId: callData.userId,
        callStatus: callData.callStatus
      });

      // Get user email settings
      const settings = await UserEmailSettingsModel.findByUserId(callData.userId);
      
      if (!settings) {
        return { sent: false, reason: 'No email settings configured for user' };
      }

      // Get contact email
      const contactEmail = await this.getContactEmail(callData.contactId, callData.phoneNumber, callData.userId);
      
      // Check if should send follow-up
      const { shouldSend, reason } = await UserEmailSettingsModel.shouldSendFollowUp(
        callData.userId,
        callData.callStatus,
        callData.leadStatus || null,
        !!contactEmail,
        callData.retryCount || 0
      );

      if (!shouldSend) {
        logger.info('Follow-up email not sent', { callId: callData.callId, reason });
        return { sent: false, reason };
      }

      // Schedule email (with delay if configured)
      if (settings.send_delay_minutes > 0) {
        await this.scheduleFollowUpEmail(callData, settings, contactEmail!);
        return { sent: true, reason: `Email scheduled for ${settings.send_delay_minutes} minutes` };
      }

      // Send immediately
      const result = await this.sendFollowUpEmail(callData, settings, contactEmail!);
      return result;
    } catch (error) {
      logger.error('Error processing call for follow-up email', {
        callId: callData.callId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return { sent: false, reason: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Send follow-up email immediately
   */
  private async sendFollowUpEmail(
    callData: FollowUpCallData,
    settings: UserEmailSettingsInterface,
    contactEmail: string
  ): Promise<{ sent: boolean; reason: string; emailId?: string }> {
    try {
      // Get additional context for template variables
      const context = await this.getEmailContext(callData);
      
      // Build template variables
      const variables: EmailTemplateVariables = {
        lead_name: context.contactName || 'Valued Customer',
        lead_email: contactEmail,
        company: context.company,
        phone: callData.phoneNumber,
        agent_name: context.agentName,
        sender_name: context.userName || 'Our Team',
        call_duration: callData.durationMinutes ? `${callData.durationMinutes} minutes` : undefined,
        call_date: callData.createdAt.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        lead_status: callData.leadStatus,
        // Call status flags for conditional template sections
        call_completed: callData.callStatus === 'completed' ? 'true' : undefined,
        call_busy: callData.callStatus === 'busy' ? 'true' : undefined,
        call_no_answer: callData.callStatus === 'no-answer' || callData.callStatus === 'no_answer' ? 'true' : undefined
      };

      // Generate personalized content using OpenAI if configured
      let personalizedContent: { subject?: string; body?: string } = {};
      
      // Try user-level prompt first, then check if admin set one in users table
      const promptId = settings.openai_followup_email_prompt_id || 
        await this.getUserFollowupPromptId(callData.userId);
      
      if (promptId && callData.transcript) {
        personalizedContent = await this.generatePersonalizedContent(
          promptId,
          callData.transcript,
          variables
        );
      }

      // Apply template with variables
      const subject = this.applyTemplate(
        personalizedContent.subject || settings.subject_template || DEFAULT_SUBJECT_TEMPLATE,
        variables
      );
      
      const body = this.applyTemplate(
        personalizedContent.body || settings.body_template || DEFAULT_BODY_TEMPLATE,
        variables
      );

      // Send the email
      const sent = await emailService.sendFollowUpEmail({
        to: contactEmail,
        subject,
        html: body,
        text: this.htmlToPlainText(body)
      });

      if (sent) {
        logger.info('Follow-up email sent successfully', {
          callId: callData.callId,
          to: contactEmail
        });
        return { sent: true, reason: 'Email sent successfully' };
      } else {
        return { sent: false, reason: 'Email service failed to send' };
      }
    } catch (error) {
      logger.error('Error sending follow-up email', {
        callId: callData.callId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return { sent: false, reason: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Schedule a follow-up email for later
   */
  private async scheduleFollowUpEmail(
    callData: FollowUpCallData,
    settings: UserEmailSettingsInterface,
    contactEmail: string
  ): Promise<void> {
    // For now, store in a simple way. In production, use a proper job queue
    const scheduledTime = new Date(Date.now() + settings.send_delay_minutes * 60 * 1000);
    
    logger.info('Scheduling follow-up email', {
      callId: callData.callId,
      scheduledFor: scheduledTime,
      delay: settings.send_delay_minutes
    });

    // Store scheduled email in database for later processing
    await pool.query(
      `INSERT INTO scheduled_emails (
        call_id, user_id, contact_email, scheduled_at, status, created_at
      ) VALUES ($1, $2, $3, $4, 'pending', CURRENT_TIMESTAMP)
      ON CONFLICT (call_id) DO UPDATE SET
        scheduled_at = EXCLUDED.scheduled_at,
        status = 'pending',
        updated_at = CURRENT_TIMESTAMP`,
      [callData.callId, callData.userId, contactEmail, scheduledTime]
    ).catch(async () => {
      // Table might not exist yet, log warning and send immediately as fallback
      logger.warn('scheduled_emails table not available, sending immediately instead');
      await this.sendFollowUpEmail(callData, settings, contactEmail);
    });
  }

  /**
   * Get contact email from contact or lead analytics
   */
  private async getContactEmail(
    contactId: string | undefined,
    phoneNumber: string,
    userId: string
  ): Promise<string | null> {
    try {
      // Try contact table first
      if (contactId) {
        const contactResult = await pool.query(
          'SELECT email FROM contacts WHERE id = $1 AND user_id = $2',
          [contactId, userId]
        );
        if (contactResult.rows[0]?.email) {
          return contactResult.rows[0].email;
        }
      }

      // Try by phone number
      const phoneResult = await pool.query(
        'SELECT email FROM contacts WHERE phone_number = $1 AND user_id = $2 AND email IS NOT NULL',
        [phoneNumber, userId]
      );
      if (phoneResult.rows[0]?.email) {
        return phoneResult.rows[0].email;
      }

      // Try lead_analytics extracted email
      const analyticsResult = await pool.query(
        `SELECT la.extracted_email 
         FROM lead_analytics la
         JOIN calls c ON la.call_id = c.id
         WHERE c.phone_number = $1 AND c.user_id = $2 AND la.extracted_email IS NOT NULL
         ORDER BY la.created_at DESC LIMIT 1`,
        [phoneNumber, userId]
      );
      if (analyticsResult.rows[0]?.extracted_email) {
        return analyticsResult.rows[0].extracted_email;
      }

      return null;
    } catch (error) {
      logger.error('Error getting contact email', { error });
      return null;
    }
  }

  /**
   * Get additional context for email template
   */
  private async getEmailContext(callData: FollowUpCallData): Promise<{
    contactName?: string;
    company?: string;
    agentName?: string;
    userName?: string;
  }> {
    try {
      const result = await pool.query(
        `SELECT 
          c.name as contact_name,
          c.company as company,
          a.name as agent_name,
          u.name as user_name
         FROM calls cl
         LEFT JOIN contacts c ON cl.contact_id = c.id
         LEFT JOIN agents a ON cl.agent_id = a.id
         LEFT JOIN users u ON cl.user_id = u.id
         WHERE cl.id = $1`,
        [callData.callId]
      );

      const row = result.rows[0] || {};
      return {
        contactName: row.contact_name,
        company: row.company,
        agentName: row.agent_name,
        userName: row.user_name
      };
    } catch (error) {
      logger.error('Error getting email context', { error });
      return {};
    }
  }

  /**
   * Get user's follow-up prompt ID from users table (admin-set)
   */
  private async getUserFollowupPromptId(userId: string): Promise<string | null> {
    try {
      const result = await pool.query(
        'SELECT openai_followup_email_prompt_id FROM users WHERE id = $1',
        [userId]
      );
      return result.rows[0]?.openai_followup_email_prompt_id || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate personalized email content using OpenAI
   */
  /**
   * Generate personalized email content using OpenAI Responses API
   * 
   * Uses OpenAI's Responses API (/v1/responses) with prompt templates.
   * The API expects a prompt ID (starts with "pmpt_") and an input string.
   * 
   * Response formats:
   * - Responses API: output_text contains the generated content
   * - Legacy format: choices[0].message.content (fallback for compatibility)
   * 
   * @see openaiPromptService.ts for prompt ID validation
   */
  private async generatePersonalizedContent(
    promptId: string,
    transcript: string,
    variables: EmailTemplateVariables
  ): Promise<{ subject?: string; body?: string }> {
    try {
      if (!this.apiKey) {
        logger.warn('OpenAI API key not configured for email personalization');
        return {};
      }

      // Use OpenAI Responses API with prompt templates
      // This API is used for stored prompts (pmpt_...) that can be managed in OpenAI Dashboard
      const response = await axios.post(
        `${this.baseUrl}/responses`,
        {
          prompt: { id: promptId },
          input: JSON.stringify({
            transcript: transcript.substring(0, 4000), // Limit transcript length
            lead_name: variables.lead_name,
            company: variables.company,
            call_date: variables.call_date,
            lead_status: variables.lead_status
          })
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`
          },
          timeout: 30000
        }
      );

      // Parse the response - handle both Responses API (output_text) 
      // and legacy chat completions format (choices[0].message.content)
      const content = response.data?.output_text || response.data?.choices?.[0]?.message?.content;
      
      if (content) {
        try {
          // Expect JSON response with subject and body fields
          const parsed = JSON.parse(content);
          return {
            subject: parsed.subject,
            body: parsed.body
          };
        } catch {
          // If response is not valid JSON, treat it as the email body
          return { body: content };
        }
      }

      return {};
    } catch (error) {
      logger.error('Error generating personalized email content', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {};
    }
  }

  /**
   * Apply template variables to a template string
   */
  private applyTemplate(template: string, variables: EmailTemplateVariables): string {
    let result = template;

    // Replace simple variables {{variable_name}}
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, value || '');
    }

    // Handle conditional blocks {{#if variable}}content{{/if}}
    result = result.replace(
      /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (_, varName, content) => {
        return variables[varName] ? content : '';
      }
    );

    return result;
  }

  /**
   * Convert HTML to plain text
   * Uses DOMPurify to safely sanitize and extract text content from HTML.
   * This generates a plain text alternative for email clients that don't support HTML.
   */
  private htmlToPlainText(html: string): string {
    // First sanitize the HTML to remove any potentially dangerous content
    const sanitized = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [], // Strip all tags to get plain text
      KEEP_CONTENT: true, // Keep text content
    });
    
    // Normalize whitespace and trim
    return sanitized.replace(/\s+/g, ' ').trim();
  }

  /**
   * Preview email with sample data
   */
  async previewEmail(
    userId: string,
    sampleData?: Partial<EmailTemplateVariables> & { preview_call_status?: 'completed' | 'busy' | 'no_answer' }
  ): Promise<{ subject: string; html: string; text: string }> {
    const settings = await UserEmailSettingsModel.getOrCreate(userId);
    
    // Determine which call status to preview
    const previewStatus = sampleData?.preview_call_status || 'completed';
    
    const variables: EmailTemplateVariables = {
      lead_name: sampleData?.lead_name || 'John Doe',
      lead_email: sampleData?.lead_email || 'john.doe@example.com',
      company: sampleData?.company || 'Acme Corp',
      phone: sampleData?.phone || '+1 (555) 123-4567',
      agent_name: sampleData?.agent_name || 'Sarah',
      sender_name: sampleData?.sender_name || 'Your Team',
      call_duration: previewStatus === 'completed' ? (sampleData?.call_duration || '5 minutes') : undefined,
      call_date: sampleData?.call_date || new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      lead_status: sampleData?.lead_status || 'Warm',
      // Set call status flags based on preview selection
      call_completed: previewStatus === 'completed' ? 'true' : undefined,
      call_busy: previewStatus === 'busy' ? 'true' : undefined,
      call_no_answer: previewStatus === 'no_answer' ? 'true' : undefined
    };

    const subject = this.applyTemplate(
      settings.subject_template || DEFAULT_SUBJECT_TEMPLATE,
      variables
    );
    
    const html = this.applyTemplate(
      settings.body_template || DEFAULT_BODY_TEMPLATE,
      variables
    );

    return {
      subject,
      html,
      text: this.htmlToPlainText(html)
    };
  }

  /**
   * Get available template variables with descriptions
   */
  getAvailableVariables(): Array<{ name: string; description: string; example: string }> {
    return [
      { name: 'lead_name', description: 'Name of the lead/contact', example: 'John Doe' },
      { name: 'lead_email', description: 'Email address of the lead', example: 'john@example.com' },
      { name: 'company', description: 'Company name of the lead', example: 'Acme Corp' },
      { name: 'phone', description: 'Phone number of the lead', example: '+1 (555) 123-4567' },
      { name: 'agent_name', description: 'Name of the AI agent that made the call', example: 'Sarah' },
      { name: 'sender_name', description: 'Your name or company name', example: 'Your Team' },
      { name: 'call_duration', description: 'Duration of the call', example: '5 minutes' },
      { name: 'call_date', description: 'Date when the call was made', example: 'Monday, December 2, 2025' },
      { name: 'lead_status', description: 'Current lead status/tag', example: 'Warm' },
      { name: 'call_completed', description: 'True if call was completed successfully (use with {{#if call_completed}})', example: 'true' },
      { name: 'call_busy', description: 'True if lead was busy (use with {{#if call_busy}})', example: 'false' },
      { name: 'call_no_answer', description: 'True if there was no answer (use with {{#if call_no_answer}})', example: 'false' }
    ];
  }

  /**
   * Generate email template using AI based on user description
   */
  async generateTemplateWithAI(params: {
    description: string;
    tone: 'professional' | 'friendly' | 'casual';
    brandColor?: string;
    companyName?: string;
  }): Promise<{
    subject_template: string;
    body_template: string;
  }> {
    const { description, tone, brandColor = '#4f46e5', companyName } = params;

    const toneGuide = {
      professional: 'Use formal language, proper salutations, and business-appropriate phrasing. Maintain a polished and respectful tone.',
      friendly: 'Use warm, approachable language while staying professional. Be personable but not overly casual.',
      casual: 'Use relaxed, conversational language. Be warm and human, like writing to a friend.'
    };

    const systemPrompt = `You are an expert email template designer. Generate a professional HTML email template for follow-up emails after phone calls.

AVAILABLE VARIABLES (use these in the template with double curly braces):
- {{lead_name}} - Name of the lead/contact
- {{lead_email}} - Email address of the lead  
- {{company}} - Company name (optional, use with {{#if company}})
- {{phone}} - Phone number
- {{agent_name}} - Name of the AI agent
- {{sender_name}} - Sender's name/company
- {{call_duration}} - Duration of the call (only available for completed calls)
- {{call_date}} - Date when the call was made
- {{lead_status}} - Lead status tag (Hot/Warm/Cold)

CALL STATUS CONDITIONALS (IMPORTANT - use these to show different content based on call outcome):
- {{#if call_completed}}...{{/if}} - Content shown only when call was completed successfully
- {{#if call_busy}}...{{/if}} - Content shown only when lead was busy
- {{#if call_no_answer}}...{{/if}} - Content shown only when there was no answer

CONDITIONAL SYNTAX:
- Use {{#if variable}}content{{/if}} for optional sections
- Example: {{#if company}} at {{company}}{{/if}}

REQUIREMENTS:
1. Generate a SINGLE responsive HTML email template that handles ALL three call outcomes
2. Use the call status conditionals to show appropriate messaging for each scenario:
   - For completed calls: Thank them for the conversation, reference what was discussed
   - For busy calls: Acknowledge they were busy, offer to reschedule
   - For no answer: Let them know you tried to reach them, offer callback
3. Use inline CSS styles (no external stylesheets)
4. Include the specified brand color: ${brandColor}
5. Make it mobile-friendly with max-width: 600px
6. Include proper email structure: header, content, footer
7. Use the specified tone: ${tone}
8. ${companyName ? `Company name is: ${companyName}` : 'Do not mention specific company name'}

TONE GUIDE: ${toneGuide[tone]}

EXAMPLE STRUCTURE:
<div>
  {{#if call_completed}}
    <p>Thank you for speaking with us...</p>
  {{/if}}
  {{#if call_busy}}
    <p>We tried to reach you but you were busy...</p>
  {{/if}}
  {{#if call_no_answer}}
    <p>We attempted to call you but couldn't connect...</p>
  {{/if}}
</div>

Respond with a JSON object containing:
{
  "subject_template": "The email subject line (can also use conditionals)",
  "body_template": "Complete HTML email template with all three call outcome sections"
}

Do NOT include markdown code blocks. Return only valid JSON.`;

    const userPrompt = `Create an email template based on this description:
"${description}"

Make sure to:
- Use {{lead_name}} for personalization
- Use {{#if company}} at {{company}}{{/if}} for optional company mention
- Include {{sender_name}} in the signature
- Include ALL THREE call outcome sections (completed, busy, no_answer) with appropriate messaging for each
- Make the design clean and modern with the brand color ${brandColor}`;

    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
          max_tokens: 2000
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const content = response.data.choices[0]?.message?.content;
      
      if (!content) {
        throw new Error('No content returned from AI');
      }

      // Parse the JSON response
      let parsed;
      try {
        // Remove any markdown code blocks if present
        const cleanContent = content
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();
        parsed = JSON.parse(cleanContent);
      } catch (parseError) {
        logger.error('Failed to parse AI response:', { content, error: parseError });
        throw new Error('Failed to parse AI response as JSON');
      }

      if (!parsed.subject_template || !parsed.body_template) {
        throw new Error('AI response missing required fields');
      }

      // Ensure the body template contains valid HTML tags.
      // Some AI responses might omit angle brackets and return tag-like
      // strings such as "div style=...". If we detect that there are no
      // angle brackets at all, we wrap the content in a basic <div> so
      // email clients and the preview render proper HTML instead of raw text.
      if (!/[<>]/.test(parsed.body_template)) {
        parsed.body_template = `<div style="font-family: Arial, sans-serif;">${parsed.body_template}</div>`;
      }

      // Sanitize the HTML template
      const sanitizedBody = DOMPurify.sanitize(parsed.body_template, {
        ALLOWED_TAGS: ['html', 'head', 'body', 'meta', 'style', 'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
                       'span', 'a', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'table', 
                       'tr', 'td', 'th', 'thead', 'tbody', 'img', 'center', 'blockquote'],
        ALLOWED_ATTR: ['style', 'href', 'src', 'alt', 'width', 'height', 'border', 'cellpadding', 
                       'cellspacing', 'align', 'valign', 'bgcolor', 'class', 'id', 'charset', 'name', 'content']
      });

      return {
        subject_template: parsed.subject_template,
        body_template: sanitizedBody
      };
    } catch (error) {
      logger.error('Failed to generate template with AI:', error);
      throw error;
    }
  }
}

export const followUpEmailService = new FollowUpEmailService();
export default followUpEmailService;
