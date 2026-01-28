import { Router } from 'express';
import { PlivoDialerController } from '../controllers/plivoDialerController';

const router = Router();

// Auth is applied at mount level via authenticatedRateLimit
router.get('/token', PlivoDialerController.getToken);
router.post('/calls', PlivoDialerController.createCallLog);
router.get('/calls', PlivoDialerController.listCallLogs);
router.get('/calls/:id/transcript', PlivoDialerController.getCallTranscript);
router.get('/calls/:id/lead-intelligence', PlivoDialerController.getCallLeadIntelligence);
router.post('/calls/:id/status', PlivoDialerController.updateCallStatus);
router.get('/analytics/summary', PlivoDialerController.getAnalyticsSummary);

export default router;
