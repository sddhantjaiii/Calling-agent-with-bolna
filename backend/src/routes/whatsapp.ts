import { Router } from 'express';
import {
  listTemplates,
  getTemplate,
  createTemplate,
  deleteTemplate,
  submitTemplate,
  syncTemplates,
  getButtonClicks,
  listButtonClicks,
  getLeadButtonActivity,
  uploadMedia,
} from '../controllers/whatsappController';

const router = Router();

/**
 * WhatsApp Template Routes
 * 
 * Base: /api/whatsapp
 * All routes require authentication (mounted with authenticatedRateLimit in index.ts)
 * 
 * Features:
 * - Template CRUD with R2 media upload
 * - Submit templates to Meta for approval
 * - Sync templates from Meta
 * - Button click analytics
 */

// Media upload (separate from template creation)
router.post('/media/upload', uploadMedia);

// Template CRUD
router.get('/templates', listTemplates);
router.get('/templates/:templateId', getTemplate);
router.post('/templates', createTemplate); // Accepts multipart/form-data
router.delete('/templates/:templateId', deleteTemplate);

// Template submission and sync
router.post('/templates/:templateId/submit', submitTemplate);
router.post('/templates/sync', syncTemplates);

// Button click analytics
router.get('/templates/:templateId/button-clicks', getButtonClicks);
router.get('/button-clicks', listButtonClicks);
router.get('/leads/:customerPhone/button-activity', getLeadButtonActivity);

export default router;
