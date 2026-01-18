import { Request, Response } from 'express';
import { EmailCampaignService } from '../services/emailCampaignService';
import { logger } from '../utils/logger';
import { SYSTEM_EMAIL_TEMPLATES } from '../constants/emailTemplates';

export class EmailCampaignController {
  /**
   * Validate email campaign tokens
   * POST /api/email-campaigns/validate
   */
  static async validateTokens(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
            timestamp: new Date(),
          },
        });
        return;
      }

      const { subject, body, contactIds } = req.body;

      if (!subject || !body || !contactIds || !Array.isArray(contactIds)) {
        res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Subject, body, and contactIds array are required',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Validate campaign tokens
      const validation = await EmailCampaignService.validateCampaignTokens(
        req.userId,
        subject,
        body,
        contactIds
      );

      res.json({
        success: true,
        data: validation,
        timestamp: new Date(),
      });
    } catch (error: any) {
      logger.error('Email campaign validation error:', error);
      res.status(500).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message || 'Failed to validate campaign tokens',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Create email campaign
   * POST /api/email-campaigns
   */
  static async createCampaign(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
            timestamp: new Date(),
          },
        });
        return;
      }

      const { campaign_name, subject, body, contact_ids, attachments } = req.body;

      if (!campaign_name || !subject || !body || !contact_ids || !Array.isArray(contact_ids)) {
        res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: 'campaign_name, subject, body, and contact_ids array are required',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Create campaign
      const campaign = await EmailCampaignService.createEmailCampaign(
        req.userId,
        {
          campaign_name,
          subject,
          body,
          contact_ids,
          attachments,
        }
      );

      res.status(201).json({
        success: true,
        data: campaign,
        timestamp: new Date(),
      });
    } catch (error: any) {
      logger.error('Email campaign creation error:', error);
      
      // Check if it's a validation error
      if (error.message && error.message.includes('Missing required tokens')) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
            details: error.validationDetails || null,
            timestamp: new Date(),
          },
        });
        return;
      }

      res.status(500).json({
        error: {
          code: 'CREATION_ERROR',
          message: error.message || 'Failed to create email campaign',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * List campaigns
   * GET /api/email-campaigns
   */
  static async listCampaigns(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
            timestamp: new Date(),
          },
        });
        return;
      }

      const campaigns = await EmailCampaignService.getUserEmailCampaigns(req.userId);

      res.json({
        success: true,
        data: campaigns,
        timestamp: new Date(),
      });
    } catch (error: any) {
      logger.error('List campaigns error:', error);
      res.status(500).json({
        error: {
          code: 'LIST_ERROR',
          message: error.message || 'Failed to list campaigns',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get system email templates
   * GET /api/email-campaigns/templates
   */
  static async getTemplates(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
            timestamp: new Date(),
          },
        });
        return;
      }

      res.json({
        success: true,
        data: SYSTEM_EMAIL_TEMPLATES,
        timestamp: new Date(),
      });
    } catch (error: any) {
      logger.error('Get templates error:', error);
      res.status(500).json({
        error: {
          code: 'GET_TEMPLATES_ERROR',
          message: error.message || 'Failed to retrieve templates',
          timestamp: new Date(),
        },
      });
    }
  }
}

export default EmailCampaignController;
