import { Router } from 'express';
import {
  createEmailTemplate,
  getEmailTemplate,
  listEmailTemplates,
  updateEmailTemplate,
  deleteEmailTemplate
} from '../controllers/emailTemplateController';

const router = Router();

/**
 * Email Template Routes
 * Base path: /api/email-templates
 * 
 * Note: Authentication is enforced at mount time via authenticatedRateLimit
 * in routes/index.ts. Individual routes do not need to call authenticateToken.
 */

// Create new email template
router.post('/', createEmailTemplate);

// List email templates
router.get('/', listEmailTemplates);

// Get specific email template
router.get('/:id', getEmailTemplate);

// Update email template
router.patch('/:id', updateEmailTemplate);

// Delete email template
router.delete('/:id', deleteEmailTemplate);

export default router;
