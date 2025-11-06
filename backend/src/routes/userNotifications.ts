import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { UserNotificationController } from '../controllers/userNotificationController';

const router = Router();

// Get user's email notification history
router.get('/', authenticateToken, UserNotificationController.getNotifications);

// Get email notifications for a specific campaign
router.get('/campaign/:campaignId', authenticateToken, UserNotificationController.getCampaignNotifications);

// Get user's notification preferences
router.get('/preferences', authenticateToken, UserNotificationController.getPreferences);

// Update user's notification preferences
router.put('/preferences', authenticateToken, UserNotificationController.updatePreferences);

export default router;
