/**
 * Email Settings Routes
 * 
 * API routes for managing user follow-up email settings
 */

import { Router } from 'express';
import { EmailSettingsController } from '../controllers/emailSettingsController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

/**
 * GET /api/email-settings
 * Get current user's email settings
 * Requires authentication
 */
router.get(
  '/',
  authenticateToken,
  EmailSettingsController.getSettings
);

/**
 * PUT /api/email-settings
 * Update user's email settings
 * Body: { auto_send_enabled, subject_template, body_template, etc. }
 * Requires authentication
 */
router.put(
  '/',
  authenticateToken,
  EmailSettingsController.updateSettings
);

/**
 * POST /api/email-settings/toggle
 * Toggle auto-send on/off
 * Body: { enabled: boolean }
 * Requires authentication
 */
router.post(
  '/toggle',
  authenticateToken,
  EmailSettingsController.toggleAutoSend
);

/**
 * POST /api/email-settings/preview
 * Preview email with sample data
 * Body: { lead_name?, company?, summary?, etc. }
 * Requires authentication
 */
router.post(
  '/preview',
  authenticateToken,
  EmailSettingsController.previewEmail
);

/**
 * GET /api/email-settings/variables
 * Get list of available template variables
 * Requires authentication
 */
router.get(
  '/variables',
  authenticateToken,
  EmailSettingsController.getVariables
);

/**
 * POST /api/email-settings/reset-template
 * Reset templates to defaults
 * Body: { type: 'subject' | 'body' | 'both' }
 * Requires authentication
 */
router.post(
  '/reset-template',
  authenticateToken,
  EmailSettingsController.resetTemplate
);

/**
 * POST /api/email-settings/validate-prompt
 * Validate an OpenAI prompt ID
 * Body: { prompt_id: string }
 * Requires authentication
 */
router.post(
  '/validate-prompt',
  authenticateToken,
  EmailSettingsController.validatePrompt
);

/**
 * POST /api/email-settings/generate-template
 * Generate email template using AI based on user description
 * Body: { description: string, tone: 'professional' | 'friendly' | 'casual', brandColor?: string, companyName?: string }
 * Requires authentication
 */
router.post(
  '/generate-template',
  authenticateToken,
  EmailSettingsController.generateTemplate
);

export default router;
