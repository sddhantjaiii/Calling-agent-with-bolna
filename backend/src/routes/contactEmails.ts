import { Router } from 'express';
import { ContactEmailController } from '../controllers/contactEmailController';
import { authenticateToken, requireAuth } from '../middleware';

const router = Router();

// All routes require authentication
router.use(authenticateToken, requireAuth);

// Send email to contact
router.post('/send', ContactEmailController.sendEmail);

// Get email history for a specific contact
router.get('/contact/:contactId', ContactEmailController.getContactEmails);

// Get all emails for the authenticated user
router.get('/', ContactEmailController.getUserEmails);

// Get email statistics
router.get('/stats', ContactEmailController.getEmailStats);

export default router;
