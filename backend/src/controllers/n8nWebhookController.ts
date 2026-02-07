import { Request, Response } from 'express';
import Agent from '../models/Agent';
import Contact from '../models/Contact';
import { ContactService } from '../services/contactService';
import { AutoEngagementTriggerService } from '../services/autoEngagementTriggerService';
import { logger } from '../utils/logger';
import { pool } from '../config/database';

/**
 * n8n Lead Capture Webhook Controller
 * 
 * Handles incoming lead data from external sources (n8n, Zapier, etc.)
 * Creates/updates contacts and lets Auto Engagement Flows handle calling
 * 
 * Authentication: Uses bolna_agent_id existence in database as authentication
 * The bolna_agent_id must exist and agent must be active, the associated user_id is used for operations
 * 
 * Flow:
 * 1. Validate bolna_agent_id exists and agent is active
 * 2. Get user_id from agent
 * 3. Create or update contact (upsert by phone number)
 * 4. Auto Engagement Flow triggers automatically based on Source field
 * 
 * Note: This webhook NO LONGER initiates calls directly.
 * All calling is handled by Auto Engagement Flows for consistency.
 */
export class N8nWebhookController {
  /**
   * Handle incoming lead capture (contact creation only)
   * Auto Engagement Flows will handle calling based on configured rules
   * 
   * Expected payload:
   * {
   *   "agent_id": "bolna-agent-id", // Required: Bolna agent ID (from Bolna dashboard)
   *   "lead_name": "John Doe",      // Required: Lead's name
   *   "recipient_phone_number": "+919876543210", // Required: Phone number with ISD
   *   "email": "john@example.com",  // Optional
   *   "Source": "TradeIndia",       // Optional: Lead source (IMPORTANT - used by Auto Engagement Flow matching)
   *   "Notes": "Interested in...",  // Optional
   *   "company": "ABC Corp",        // Optional
   *   "city": "Mumbai",             // Optional
   *   "country": "India"            // Optional
   * }
   * 
   * After contact creation, Auto Engagement Flows automatically:
   * 1. Match flow by Source field (auto_creation_source)
   * 2. Check priority (lower = higher priority)
   * 3. Execute flow actions (AI call, WhatsApp, Email, etc.)
   * 4. Apply conditional logic based on outcomes
   */
  async handleLeadCaptureAndCall(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    const requestId = `n8n-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    try {
      const payload = req.body;
      
      // Log incoming request
      logger.info(`[${requestId}] n8n webhook received:`, {
        hasBolnaAgentId: !!payload.agent_id,
        hasName: !!payload.lead_name,
        hasPhone: !!payload.recipient_phone_number,
        source: payload.Source || 'not_specified'
      });

      // ==================== VALIDATION ====================
      
      // 1. Validate required fields
      const { agent_id: bolna_agent_id, lead_name, recipient_phone_number } = payload;
      
      if (!bolna_agent_id) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: agent_id (bolna_agent_id)',
          request_id: requestId
        });
        return;
      }

      if (!lead_name) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: lead_name',
          request_id: requestId
        });
        return;
      }

      if (!recipient_phone_number) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: recipient_phone_number',
          request_id: requestId
        });
        return;
      }

      // 2. Validate agent exists by bolna_agent_id and is active (this is our authentication)
      const agent = await Agent.findByBolnaId(bolna_agent_id);
      
      if (!agent) {
        logger.warn(`[${requestId}] Invalid bolna_agent_id provided: ${bolna_agent_id}`);
        res.status(401).json({
          success: false,
          error: 'Invalid agent_id - agent not found',
          request_id: requestId
        });
        return;
      }

      if (!agent.is_active) {
        logger.warn(`[${requestId}] Inactive agent used: ${bolna_agent_id}`);
        res.status(401).json({
          success: false,
          error: 'Agent is not active',
          request_id: requestId
        });
        return;
      }

      // Agent already has bolna_agent_id since we found it by that field
      const agentDbId = agent.id; // Our internal agent UUID

      const userId = agent.user_id;
      logger.info(`[${requestId}] Agent authenticated, user_id: ${userId}`);

      // ==================== CONTACT CREATE/UPDATE ====================
      
      // Normalize phone number
      const normalizedPhone = ContactService.normalizePhoneNumber(recipient_phone_number);
      
      // Check if contact exists for this user
      let contact = await ContactService.findByPhone(userId, normalizedPhone);
      let isNewContact = false;
      
      if (contact) {
        // Update existing contact with any new information
        logger.info(`[${requestId}] Updating existing contact: ${contact.id}`);
        
        const updateData: Record<string, any> = {};
        
        // Only update fields that have new values
        if (payload.lead_name && payload.lead_name !== contact.name) {
          updateData.name = payload.lead_name;
        }
        if (payload.email && payload.email !== contact.email) {
          updateData.email = payload.email;
        }
        if (payload.company && payload.company !== contact.company) {
          updateData.company = payload.company;
        }
        if (payload.Notes && payload.Notes !== contact.notes) {
          // Append new notes to existing notes
          updateData.notes = contact.notes 
            ? `${contact.notes}\n---\n[${new Date().toISOString()}] ${payload.Notes}`
            : payload.Notes;
        }
        if (payload.city && payload.city !== contact.city) {
          updateData.city = payload.city;
        }
        if (payload.country && payload.country !== contact.country) {
          updateData.country = payload.country;
        }
        // Update source if provided (this tracks latest lead source)
        if (payload.Source) {
          updateData.auto_creation_source = payload.Source;
        }
        
        // Only update if there are changes
        if (Object.keys(updateData).length > 0) {
          contact = await ContactService.updateContact(userId, contact.id, updateData);
          logger.info(`[${requestId}] Contact updated with fields: ${Object.keys(updateData).join(', ')}`);
        } else {
          logger.info(`[${requestId}] No contact fields to update`);
        }
      } else {
        // Create new contact
        logger.info(`[${requestId}] Creating new contact for phone: ${normalizedPhone}`);
        isNewContact = true;
        
        const contactData = {
          name: payload.lead_name,
          phone_number: normalizedPhone,
          email: payload.email || null,
          company: payload.company || null,
          notes: payload.Notes || null,
          city: payload.city || null,
          country: payload.country || null,
          is_auto_created: true,
          auto_creation_source: payload.Source || 'n8n_webhook'
        };
        
        contact = await ContactService.createContact(userId, contactData);
        logger.info(`[${requestId}] New contact created: ${contact.id}`);
      }

      // ==================== TRIGGER AUTO ENGAGEMENT FLOW ====================
      // For new contacts, trigger Auto Engagement Flow matching and execution
      if (isNewContact) {
        logger.info(`[${requestId}] Triggering Auto Engagement Flow for new contact`);
        // Trigger asynchronously - don't wait for completion
        AutoEngagementTriggerService.onContactCreated(contact, userId)
          .catch(err => {
            logger.error(`[${requestId}] Auto Engagement Flow trigger failed (non-blocking):`, {
              error: err.message,
              contactId: contact.id
            });
          });
      }

      // ==================== RESPONSE ====================
      // Contact created/updated successfully
      // Auto Engagement Flow will handle calling automatically based on Source field
      
      const processingTime = Date.now() - startTime;
      logger.info(`[${requestId}] Lead captured successfully - Auto Engagement Flow will trigger`, {
        contactId: contact.id,
        isNewContact,
        source: payload.Source || 'n8n_webhook',
        processingTimeMs: processingTime
      });

      // Return success response
      res.status(201).json({
        success: true,
        message: 'Lead captured successfully - Auto Engagement Flow will handle follow-up',
        data: {
          contact_id: contact.id,
          contact_created: isNewContact,
          source: payload.Source || 'n8n_webhook',
          auto_engagement_enabled: true,
          note: 'Contact will be processed by Auto Engagement Flow based on configured rules'
        },
        request_id: requestId,
        processing_time_ms: processingTime
      });

    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      
      logger.error(`[${requestId}] n8n webhook error:`, {
        error: error.message,
        stack: error.stack,
        processingTimeMs: processingTime
      });

      // Generic error response
      res.status(500).json({
        success: false,
        error: 'Failed to process lead',
        details: error.message,
        request_id: requestId
      });
    }
  }

  /**
   * Health check endpoint for n8n webhook
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      // Quick database check
      await pool.query('SELECT 1');
      
      res.status(200).json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        endpoint: 'n8n-lead-capture'
      });
    } catch (error: any) {
      logger.error('n8n webhook health check failed:', error);
      res.status(503).json({
        success: false,
        status: 'unhealthy',
        error: error.message
      });
    }
  }
}

export const n8nWebhookController = new N8nWebhookController();
