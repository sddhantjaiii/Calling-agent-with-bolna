import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  createEmailTemplate,
  getEmailTemplate,
  listEmailTemplates,
  updateEmailTemplate,
  deleteEmailTemplate
} from '../controllers/emailTemplateController';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * Email Template Routes
 * Base path: /api/email-templates
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
