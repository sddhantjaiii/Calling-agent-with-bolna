import { Router } from 'express';

// Routes export file - defines API endpoints
import authRoutes from './auth';
import userRoutes from './user';
import emailRoutes from './email';
import agentRoutes from './agents';
import callRoutes from './calls';
import transcriptRoutes from './transcripts';
import contactRoutes from './contacts';
import billingRoutes from './billing';
import webhookRoutes from './webhooks';
import adminRoutes from './admin';
import dashboardRoutes from './dashboard';
import analyticsRoutes from './analytics';
import callAnalyticsRoutes from './callAnalytics';
import leadsRoutes from './leads';
import leadIntelligenceRoutes from './leadIntelligence';
import followUpsRoutes from './followUps';
import customersRoutes from './customers';
import agentAnalyticsRoutes from './agentAnalytics';
import monitoringRoutes from './monitoring';
import dataIntegrityRoutes from './dataIntegrity';
import notificationRoutes from './notifications';
import userNotificationRoutes from './userNotifications';
import campaignRoutes from './campaignRoutes';
import queueRoutes from './queueRoutes';
import settingsRoutes from './settingsRoutes';
import openaiPromptRoutes from './openaiPromptRoutes';
import schedulerRoutes from './schedulerRoutes';

// Import rate limiting middleware
import { generalRateLimit, authRateLimit } from '../middleware/rateLimit';
import { authenticateToken } from '../middleware/auth';

// Create authenticated rate limiting middleware
const authenticatedRateLimit = async (req: any, res: any, next: any) => {
    try {
        // First authenticate (this is async and sends response if fails)
        await authenticateToken(req, res, () => {});
        
        // If we get here, auth succeeded. Check if response was already sent
        if (res.headersSent) {
            return; // Auth middleware already sent a response (401), don't continue
        }
        
        // Now user is authenticated, apply rate limiting
        generalRateLimit(req, res, next);
    } catch (error) {
        // Auth middleware threw an error
        if (!res.headersSent) {
            next(error);
        }
    }
};

const router = Router();

// Mount route modules with appropriate rate limiting

// Authentication routes - use stricter rate limiting
router.use('/auth', authRateLimit, authRoutes);

// Public routes - use IP-based rate limiting
router.use('/email', generalRateLimit, emailRoutes);
router.use('/webhooks', webhookRoutes); // Webhooks have their own rate limiting

// Protected routes - authentication + user-based rate limiting
router.use('/user', authenticatedRateLimit, userRoutes);
router.use('/agents', authenticatedRateLimit, agentRoutes);
router.use('/calls', authenticatedRateLimit, callRoutes);
router.use('/transcripts', authenticatedRateLimit, transcriptRoutes);
router.use('/contacts', authenticatedRateLimit, contactRoutes);
router.use('/billing', authenticatedRateLimit, billingRoutes);
router.use('/admin', authenticatedRateLimit, adminRoutes);
router.use('/dashboard', authenticatedRateLimit, dashboardRoutes);
router.use('/analytics', authenticatedRateLimit, analyticsRoutes);
router.use('/call-analytics', authenticatedRateLimit, callAnalyticsRoutes);
router.use('/leads', authenticatedRateLimit, leadsRoutes);
router.use('/lead-intelligence', authenticatedRateLimit, leadIntelligenceRoutes);
router.use('/follow-ups', authenticatedRateLimit, followUpsRoutes);
router.use('/customers', authenticatedRateLimit, customersRoutes);
router.use('/agent-analytics', authenticatedRateLimit, agentAnalyticsRoutes);
router.use('/notifications', authenticatedRateLimit, notificationRoutes);
router.use('/user-notifications', authenticatedRateLimit, userNotificationRoutes);
router.use('/campaigns', authenticatedRateLimit, campaignRoutes);
router.use('/queue', authenticatedRateLimit, queueRoutes);
router.use('/settings', authenticatedRateLimit, settingsRoutes);
router.use('/openai-prompts', authenticatedRateLimit, openaiPromptRoutes);
router.use('/scheduler', authenticatedRateLimit, schedulerRoutes); // Campaign scheduler monitoring

// Monitoring routes - no rate limiting
router.use('/monitoring', monitoringRoutes);

// Data integrity routes - admin only with authentication
router.use('/data-integrity', authenticatedRateLimit, dataIntegrityRoutes);

export default router;