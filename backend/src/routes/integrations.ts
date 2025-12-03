/**
 * Integration Routes
 * 
 * API routes for third-party integrations (Google Calendar, etc.)
 */

import { Router } from 'express';
import { integrationController } from '../controllers/integrationController';
import { authenticateToken } from '../middleware/auth';
import { authRateLimit } from '../middleware/rateLimit';

const router = Router();

// ============================================
// Google Calendar OAuth Routes
// ============================================

/**
 * GET /api/integrations/google/auth
 * Initiate Google OAuth flow
 * Requires authentication
 */
router.get(
  '/google/auth',
  authenticateToken,
  integrationController.initiateGoogleAuth.bind(integrationController)
);

/**
 * GET /api/integrations/google/callback
 * Handle OAuth callback from Google
 * No auth required (Google redirects here)
 * Rate limited to prevent abuse
 */
router.get(
  '/google/callback',
  authRateLimit,
  integrationController.handleGoogleCallback.bind(integrationController)
);

/**
 * POST /api/integrations/google/disconnect
 * Disconnect Google Calendar integration
 * Requires authentication
 */
router.post(
  '/google/disconnect',
  authenticateToken,
  integrationController.disconnectGoogle.bind(integrationController)
);

/**
 * GET /api/integrations/google/status
 * Get Google Calendar connection status
 * Requires authentication
 */
router.get(
  '/google/status',
  authenticateToken,
  integrationController.getGoogleStatus.bind(integrationController)
);

// ============================================
// Calendar Meeting Routes
// ============================================

/**
 * GET /api/calendar/meetings
 * Get user's meetings (upcoming or past)
 * Query params: ?type=upcoming|past&limit=10
 * Requires authentication
 */
router.get(
  '/calendar/meetings',
  authenticateToken,
  integrationController.getMeetings.bind(integrationController)
);

/**
 * GET /api/calendar/meetings/:meetingId
 * Get specific meeting details
 * Requires authentication
 */
router.get(
  '/calendar/meetings/:meetingId',
  authenticateToken,
  integrationController.getMeeting.bind(integrationController)
);

/**
 * GET /api/calendar/meetings/lead/:leadAnalyticsId
 * Get all meetings for a specific lead
 * Requires authentication
 */
router.get(
  '/calendar/meetings/lead/:leadAnalyticsId',
  authenticateToken,
  integrationController.getMeetingsByLead.bind(integrationController)
);

/**
 * GET /api/calendar/meetings/contact/:contactId
 * Get all meetings for a specific contact
 * Requires authentication
 */
router.get(
  '/calendar/meetings/contact/:contactId',
  authenticateToken,
  integrationController.getMeetingsByContact.bind(integrationController)
);

/**
 * POST /api/calendar/meetings
 * Manually schedule a meeting
 * Body: { meetingDateTime, attendeeEmail, leadName?, companyName?, callDetails? }
 * Requires authentication
 */
router.post(
  '/calendar/meetings',
  authenticateToken,
  integrationController.createMeeting.bind(integrationController)
);

/**
 * PUT /api/calendar/meetings/:meetingId/reschedule
 * Reschedule an existing meeting
 * Body: { newDateTime, reason? }
 * Requires authentication
 */
router.put(
  '/calendar/meetings/:meetingId/reschedule',
  authenticateToken,
  integrationController.rescheduleMeeting.bind(integrationController)
);

/**
 * DELETE /api/calendar/meetings/:meetingId
 * Cancel a scheduled meeting
 * Body: { reason? }
 * Requires authentication
 */
router.delete(
  '/calendar/meetings/:meetingId',
  authenticateToken,
  integrationController.cancelMeeting.bind(integrationController)
);

// ============================================
// Agent Dynamic Information Routes
// ============================================

/**
 * GET /api/integrations/agents
 * Get all user's agents for dynamic information management
 * Requires authentication
 */
router.get(
  '/agents',
  authenticateToken,
  integrationController.getUserAgents.bind(integrationController)
);

/**
 * GET /api/integrations/agents/:agentId/dynamic-info
 * Get dynamic information for a specific agent
 * Requires authentication
 */
router.get(
  '/agents/:agentId/dynamic-info',
  authenticateToken,
  integrationController.getAgentDynamicInfo.bind(integrationController)
);

/**
 * PUT /api/integrations/agents/:agentId/dynamic-info
 * Update dynamic information for a specific agent
 * Body: { dynamicInformation: string }
 * Requires authentication
 */
router.put(
  '/agents/:agentId/dynamic-info',
  authenticateToken,
  integrationController.updateAgentDynamicInfo.bind(integrationController)
);

export default router;
