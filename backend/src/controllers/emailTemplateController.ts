import { Request, Response } from 'express';
import { EmailTemplateModel, CreateEmailTemplateRequest, UpdateEmailTemplateRequest } from '../models/EmailTemplate';
import { logger } from '../utils/logger';

/**
 * Email Template Controller
 * Handles CRUD operations for email templates used in auto-engagement flows
 */

/**
 * Create a new email template
 * POST /api/email-templates
 */
export const createEmailTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'User not authenticated' });
      return;
    }

    const data: CreateEmailTemplateRequest = req.body;

    // Validate required fields
    if (!data.name || !data.subject) {
      res.status(400).json({
        success: false,
        error: 'Name and subject are required'
      });
      return;
    }

    // Auto-extract variables if not provided
    if (!data.variables) {
      data.variables = EmailTemplateModel.extractVariables(
        data.subject,
        data.body_html || '',
        data.body_text || ''
      );
    }

    const template = await EmailTemplateModel.create(userId, data);

    res.status(201).json({
      success: true,
      data: template
    });
  } catch (error) {
    logger.error('[EmailTemplateController] Error creating email template', {
      error: error instanceof Error ? error.message : error,
      userId: req.userId
    });

    res.status(500).json({
      success: false,
      error: 'Failed to create email template',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get email template by ID
 * GET /api/email-templates/:id
 */
export const getEmailTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'User not authenticated' });
      return;
    }

    const { id } = req.params;

    const template = await EmailTemplateModel.findById(id, userId);

    if (!template) {
      res.status(404).json({
        success: false,
        error: 'Email template not found'
      });
      return;
    }

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    logger.error('[EmailTemplateController] Error getting email template', {
      error: error instanceof Error ? error.message : error,
      templateId: req.params.id,
      userId: req.userId
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get email template'
    });
  }
};

/**
 * List email templates
 * GET /api/email-templates
 */
export const listEmailTemplates = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'User not authenticated' });
      return;
    }

    const category = req.query.category as string | undefined;
    const isActive = req.query.is_active === 'true' ? true : req.query.is_active === 'false' ? false : undefined;
    
    // Validate and parse limit/offset
    let limit: number | undefined;
    let offset: number | undefined;
    
    if (req.query.limit) {
      limit = parseInt(req.query.limit as string);
      if (isNaN(limit) || limit < 1 || limit > 100) {
        res.status(400).json({
          success: false,
          error: 'Invalid limit parameter. Must be a number between 1 and 100.'
        });
        return;
      }
    }
    
    if (req.query.offset) {
      offset = parseInt(req.query.offset as string);
      if (isNaN(offset) || offset < 0) {
        res.status(400).json({
          success: false,
          error: 'Invalid offset parameter. Must be a non-negative number.'
        });
        return;
      }
    }

    const result = await EmailTemplateModel.findByUserId(userId, {
      category,
      isActive,
      limit,
      offset
    });

    res.json({
      success: true,
      data: result.templates,
      pagination: {
        total: result.total,
        limit: limit || result.total,
        offset: offset || 0
      }
    });
  } catch (error) {
    logger.error('[EmailTemplateController] Error listing email templates', {
      error: error instanceof Error ? error.message : error,
      userId: req.userId
    });

    res.status(500).json({
      success: false,
      error: 'Failed to list email templates'
    });
  }
};

/**
 * Update email template
 * PATCH /api/email-templates/:id
 */
export const updateEmailTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'User not authenticated' });
      return;
    }

    const { id } = req.params;
    const data: UpdateEmailTemplateRequest = req.body;

    // Auto-extract variables if subject or body changed but variables not provided
    const hasSubject = 'subject' in data;
    const hasBodyHtml = 'body_html' in data;
    const hasBodyText = 'body_text' in data;
    const hasVariables = 'variables' in data;

    if ((hasSubject || hasBodyHtml || hasBodyText) && !hasVariables) {
      const existing = await EmailTemplateModel.findById(id, userId);
      if (existing) {
        const subject = data.subject !== undefined ? data.subject : existing.subject;
        const bodyHtml = data.body_html !== undefined ? data.body_html : (existing.body_html || '');
        const bodyText = data.body_text !== undefined ? data.body_text : (existing.body_text || '');

        data.variables = EmailTemplateModel.extractVariables(
          subject,
          bodyHtml,
          bodyText
        );
      }
    }

    const template = await EmailTemplateModel.update(id, userId, data);

    if (!template) {
      res.status(404).json({
        success: false,
        error: 'Email template not found'
      });
      return;
    }

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    logger.error('[EmailTemplateController] Error updating email template', {
      error: error instanceof Error ? error.message : error,
      templateId: req.params.id,
      userId: req.userId
    });

    res.status(500).json({
      success: false,
      error: 'Failed to update email template'
    });
  }
};

/**
 * Delete email template
 * DELETE /api/email-templates/:id
 */
export const deleteEmailTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'User not authenticated' });
      return;
    }

    const { id } = req.params;

    const deleted = await EmailTemplateModel.delete(id, userId);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'Email template not found'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Email template deleted successfully'
    });
  } catch (error) {
    logger.error('[EmailTemplateController] Error deleting email template', {
      error: error instanceof Error ? error.message : error,
      templateId: req.params.id,
      userId: req.userId
    });

    res.status(500).json({
      success: false,
      error: 'Failed to delete email template'
    });
  }
};
