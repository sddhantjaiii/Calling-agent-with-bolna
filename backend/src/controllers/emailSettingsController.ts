import { Request, Response } from 'express';
import UserEmailSettingsModel, { 
  UserEmailSettingsInterface, 
  SendCondition, 
  LeadStatusFilter,
  DEFAULT_SUBJECT_TEMPLATE,
  DEFAULT_BODY_TEMPLATE
} from '../models/UserEmailSettings';
import { followUpEmailService } from '../services/followUpEmailService';
import openaiPromptService from '../services/openaiPromptService';
import { logger } from '../utils/logger';

export class EmailSettingsController {
  /**
   * GET /api/email-settings
   * Get current user's email settings
   */
  static async getSettings(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      
      if (!userId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
            timestamp: new Date(),
          },
        });
        return;
      }

      const settings = await UserEmailSettingsModel.getOrCreate(userId);

      res.json({
        success: true,
        data: settings,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Get email settings error:', error);
      res.status(500).json({
        error: {
          code: 'GET_SETTINGS_ERROR',
          message: 'Failed to retrieve email settings',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * PUT /api/email-settings
   * Update user's email settings
   */
  static async updateSettings(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      
      if (!userId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
            timestamp: new Date(),
          },
        });
        return;
      }

      const {
        auto_send_enabled,
        openai_followup_email_prompt_id,
        subject_template,
        body_template,
        send_conditions,
        lead_status_filters,
        skip_if_no_email,
        send_delay_minutes,
        max_retries_before_send
      } = req.body;

      // Validate send_conditions if provided
      if (send_conditions) {
        const validConditions: SendCondition[] = ['completed', 'busy', 'no_answer', 'after_retries', 'voicemail'];
        const invalidConditions = send_conditions.filter((c: string) => !validConditions.includes(c as SendCondition));
        
        if (invalidConditions.length > 0) {
          res.status(400).json({
            error: {
              code: 'INVALID_SEND_CONDITIONS',
              message: `Invalid send conditions: ${invalidConditions.join(', ')}. Valid options: ${validConditions.join(', ')}`,
              timestamp: new Date(),
            },
          });
          return;
        }
      }

      // Validate lead_status_filters if provided
      if (lead_status_filters) {
        const validFilters: LeadStatusFilter[] = ['hot', 'warm', 'cold', 'not_qualified', 'any'];
        const invalidFilters = lead_status_filters.filter((f: string) => !validFilters.includes(f as LeadStatusFilter));
        
        if (invalidFilters.length > 0) {
          res.status(400).json({
            error: {
              code: 'INVALID_LEAD_FILTERS',
              message: `Invalid lead status filters: ${invalidFilters.join(', ')}. Valid options: ${validFilters.join(', ')}`,
              timestamp: new Date(),
            },
          });
          return;
        }
      }

      // Validate OpenAI prompt ID if provided
      if (openai_followup_email_prompt_id) {
        const validation = await openaiPromptService.validatePromptId(openai_followup_email_prompt_id);
        if (!validation.valid) {
          res.status(400).json({
            error: {
              code: 'INVALID_PROMPT_ID',
              message: validation.error || 'Invalid OpenAI prompt ID',
              timestamp: new Date(),
            },
          });
          return;
        }
      }

      const updatedSettings = await UserEmailSettingsModel.updateSettings(userId, {
        auto_send_enabled,
        openai_followup_email_prompt_id,
        subject_template,
        body_template,
        send_conditions,
        lead_status_filters,
        skip_if_no_email,
        send_delay_minutes,
        max_retries_before_send
      });

      res.json({
        success: true,
        data: updatedSettings,
        message: 'Email settings updated successfully',
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Update email settings error:', error);
      res.status(500).json({
        error: {
          code: 'UPDATE_SETTINGS_ERROR',
          message: 'Failed to update email settings',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * POST /api/email-settings/toggle
   * Toggle auto-send on/off
   */
  static async toggleAutoSend(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      
      if (!userId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
            timestamp: new Date(),
          },
        });
        return;
      }

      const { enabled } = req.body;
      
      if (typeof enabled !== 'boolean') {
        res.status(400).json({
          error: {
            code: 'INVALID_ENABLED_VALUE',
            message: 'The "enabled" field must be a boolean',
            timestamp: new Date(),
          },
        });
        return;
      }

      const settings = await UserEmailSettingsModel.toggleAutoSend(userId, enabled);

      res.json({
        success: true,
        data: {
          auto_send_enabled: settings.auto_send_enabled
        },
        message: `Auto-send ${enabled ? 'enabled' : 'disabled'} successfully`,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Toggle auto-send error:', error);
      res.status(500).json({
        error: {
          code: 'TOGGLE_AUTOSEND_ERROR',
          message: 'Failed to toggle auto-send setting',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * POST /api/email-settings/preview
   * Preview email with sample data
   */
  static async previewEmail(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      
      if (!userId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
            timestamp: new Date(),
          },
        });
        return;
      }

      const sampleData = req.body;
      const preview = await followUpEmailService.previewEmail(userId, sampleData);

      res.json({
        success: true,
        data: preview,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Preview email error:', error);
      res.status(500).json({
        error: {
          code: 'PREVIEW_EMAIL_ERROR',
          message: 'Failed to preview email',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * GET /api/email-settings/variables
   * Get list of available template variables
   */
  static async getVariables(req: Request, res: Response): Promise<void> {
    try {
      const variables = followUpEmailService.getAvailableVariables();

      res.json({
        success: true,
        data: variables,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Get variables error:', error);
      res.status(500).json({
        error: {
          code: 'GET_VARIABLES_ERROR',
          message: 'Failed to retrieve available variables',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * POST /api/email-settings/reset-template
   * Reset templates to defaults
   */
  static async resetTemplate(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      
      if (!userId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
            timestamp: new Date(),
          },
        });
        return;
      }

      const { type } = req.body; // 'subject', 'body', or 'both'

      const updates: Partial<UserEmailSettingsInterface> = {};
      
      if (type === 'subject' || type === 'both') {
        updates.subject_template = DEFAULT_SUBJECT_TEMPLATE;
      }
      
      if (type === 'body' || type === 'both') {
        updates.body_template = DEFAULT_BODY_TEMPLATE;
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({
          error: {
            code: 'INVALID_RESET_TYPE',
            message: 'Invalid reset type. Must be "subject", "body", or "both"',
            timestamp: new Date(),
          },
        });
        return;
      }

      const settings = await UserEmailSettingsModel.updateSettings(userId, updates);

      res.json({
        success: true,
        data: settings,
        message: 'Template reset to default successfully',
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Reset template error:', error);
      res.status(500).json({
        error: {
          code: 'RESET_TEMPLATE_ERROR',
          message: 'Failed to reset template',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * POST /api/email-settings/validate-prompt
   * Validate an OpenAI prompt ID
   */
  static async validatePrompt(req: Request, res: Response): Promise<void> {
    try {
      const { prompt_id } = req.body;

      if (!prompt_id) {
        res.status(400).json({
          error: {
            code: 'MISSING_PROMPT_ID',
            message: 'Prompt ID is required',
            timestamp: new Date(),
          },
        });
        return;
      }

      const validation = await openaiPromptService.validatePromptId(prompt_id);

      res.json({
        success: true,
        data: {
          valid: validation.valid,
          error: validation.error,
          details: validation.details
        },
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Validate prompt error:', error);
      res.status(500).json({
        error: {
          code: 'VALIDATE_PROMPT_ERROR',
          message: 'Failed to validate prompt',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * POST /api/email-settings/generate-template
   * Generate email template using AI based on user description
   */
  static async generateTemplate(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      
      if (!userId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
            timestamp: new Date(),
          },
        });
        return;
      }

      const { description, tone, brandColor, companyName } = req.body;

      if (!description || description.trim().length < 10) {
        res.status(400).json({
          error: {
            code: 'INVALID_DESCRIPTION',
            message: 'Please provide a description of at least 10 characters',
            timestamp: new Date(),
          },
        });
        return;
      }

      const validTones = ['professional', 'friendly', 'casual'];
      const selectedTone = validTones.includes(tone) ? tone : 'professional';

      const template = await followUpEmailService.generateTemplateWithAI({
        description: description.trim(),
        tone: selectedTone,
        brandColor: brandColor || '#4f46e5',
        companyName: companyName || undefined
      });

      res.json({
        success: true,
        data: template,
        message: 'Template generated successfully',
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Generate template error:', error);
      res.status(500).json({
        error: {
          code: 'GENERATE_TEMPLATE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to generate template',
          timestamp: new Date(),
        },
      });
    }
  }
}

export default EmailSettingsController;
