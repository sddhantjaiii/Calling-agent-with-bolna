/**
 * Integration Controller
 * 
 * Handles API endpoints for Google Calendar integration.
 * Includes OAuth flow and meeting management endpoints.
 */

import { Request, Response } from 'express';
import { GoogleAuthService } from '../services/googleAuthService';
import MeetingSchedulerService from '../services/meetingSchedulerService';
import CalendarMeeting from '../models/CalendarMeeting';
import { meetingEmailService } from '../services/meetingEmailService';
import { logger } from '../utils/logger';

// Create service instances
const googleAuthService = new GoogleAuthService();

export class IntegrationController {
  /**
   * GET /api/integrations/google/auth
   * Initiate Google OAuth flow
   */
  async initiateGoogleAuth(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      logger.info('Initiating Google OAuth flow', { userId });

      const { auth_url, state } = await googleAuthService.initiateOAuthFlow(userId);

      res.json({
        success: true,
        authUrl: auth_url,
        state
      });
    } catch (error) {
      logger.error('Failed to initiate Google OAuth', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({
        error: 'Failed to initiate OAuth flow',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/integrations/google/callback
   * Handle OAuth callback from Google
   */
  async handleGoogleCallback(req: Request, res: Response): Promise<void> {
    try {
      const { code, state } = req.query;

      if (!code || typeof code !== 'string') {
        res.status(400).json({ error: 'Missing authorization code' });
        return;
      }

      if (!state || typeof state !== 'string') {
        res.status(400).json({ error: 'Missing state parameter' });
        return;
      }

      logger.info('Handling Google OAuth callback', { hasCode: !!code, hasState: !!state });

      await googleAuthService.handleOAuthCallback(code, state);

      // Redirect to frontend dashboard with integrations tab
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/dashboard?tab=integrations&google_calendar=connected`);
    } catch (error) {
      logger.error('Failed to handle Google OAuth callback', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.redirect(`${frontendUrl}/dashboard?tab=integrations&google_calendar=error&message=${encodeURIComponent(errorMessage)}`);
    }
  }

  /**
   * POST /api/integrations/google/disconnect
   * Disconnect Google Calendar integration
   */
  async disconnectGoogle(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      logger.info('Disconnecting Google Calendar', { userId });

      await googleAuthService.disconnectCalendar(userId);

      res.json({
        success: true,
        message: 'Google Calendar disconnected successfully'
      });
    } catch (error) {
      logger.error('Failed to disconnect Google Calendar', {
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({
        error: 'Failed to disconnect calendar',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/integrations/google/status
   * Get Google Calendar connection status
   */
  async getGoogleStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const status = await googleAuthService.getConnectionStatus(userId);

      res.json({
        success: true,
        ...status
      });
    } catch (error) {
      logger.error('Failed to get Google Calendar status', {
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({
        error: 'Failed to get connection status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/calendar/meetings
   * Get user's meetings (upcoming by default)
   */
  async getMeetings(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { type = 'upcoming', limit = '10' } = req.query;
      const limitNum = parseInt(limit as string, 10);

      let meetings;
      if (type === 'upcoming') {
        meetings = await MeetingSchedulerService.getUpcomingMeetings(userId, limitNum);
      } else if (type === 'past') {
        meetings = await MeetingSchedulerService.getPastMeetings(userId, limitNum);
      } else {
        res.status(400).json({ error: 'Invalid type parameter. Use "upcoming" or "past"' });
        return;
      }

      res.json({
        success: true,
        meetings,
        count: meetings.length
      });
    } catch (error) {
      logger.error('Failed to get meetings', {
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({
        error: 'Failed to fetch meetings',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/calendar/meetings/:meetingId
   * Get specific meeting details
   */
  async getMeeting(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { meetingId } = req.params;

      const meeting = await CalendarMeeting.findById(meetingId);
      if (!meeting) {
        res.status(404).json({ error: 'Meeting not found' });
        return;
      }

      // Verify ownership
      if (meeting.user_id !== userId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      res.json({
        success: true,
        meeting
      });
    } catch (error) {
      logger.error('Failed to get meeting', {
        meetingId: req.params.meetingId,
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({
        error: 'Failed to fetch meeting',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/calendar/meetings/lead/:leadAnalyticsId
   * Get all meetings for a specific lead
   */
  async getMeetingsByLead(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { leadAnalyticsId } = req.params;

      const meetings = await MeetingSchedulerService.getMeetingsByLead(leadAnalyticsId, userId);

      res.json({
        success: true,
        meetings,
        count: meetings.length
      });
    } catch (error) {
      logger.error('Failed to get meetings by lead', {
        leadAnalyticsId: req.params.leadAnalyticsId,
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({
        error: 'Failed to fetch meetings',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/calendar/meetings/contact/:contactId
   * Get all meetings for a specific contact
   */
  async getMeetingsByContact(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { contactId } = req.params;

      const meetings = await MeetingSchedulerService.getMeetingsByContact(contactId, userId);

      res.json({
        success: true,
        meetings,
        count: meetings.length
      });
    } catch (error) {
      logger.error('Failed to get meetings by contact', {
        contactId: req.params.contactId,
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({
        error: 'Failed to fetch meetings',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * POST /api/calendar/meetings
   * Manually schedule a meeting (for testing or admin use)
   */
  async createMeeting(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const {
        leadAnalyticsId,
        callId,
        contactId,
        phoneNumber,
        meetingDateTime,
        attendeeEmail,
        leadName,
        companyName,
        callDetails,
        additionalAttendees,
        meetingTitle,
        meetingDescription
      } = req.body;

      // Validate required fields
      if (!meetingDateTime || !attendeeEmail) {
        res.status(400).json({
          error: 'Missing required fields',
          required: ['meetingDateTime', 'attendeeEmail']
        });
        return;
      }

      logger.info('Manually creating calendar meeting', {
        userId,
        attendeeEmail,
        meetingDateTime,
        additionalAttendeesCount: additionalAttendees?.length || 0,
        customTitle: !!meetingTitle,
        customDescription: !!meetingDescription
      });

      const meeting = await MeetingSchedulerService.scheduleCalendarMeeting({
        userId,
        leadAnalyticsId,
        callId,
        contactId,
        phoneNumber,
        meetingDateTime,
        attendeeEmail,
        leadName,
        companyName,
        callDetails,
        additionalAttendees,
        meetingTitle,
        meetingDescription
      });

      // Send email notification
      await meetingEmailService.sendMeetingInviteEmail(meeting);

      res.status(201).json({
        success: true,
        meeting,
        message: 'Meeting scheduled successfully'
      });
    } catch (error) {
      logger.error('Failed to create meeting', {
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({
        error: 'Failed to schedule meeting',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * PUT /api/calendar/meetings/:meetingId/reschedule
   * Reschedule an existing meeting
   */
  async rescheduleMeeting(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { meetingId } = req.params;
      const { newDateTime, reason } = req.body;

      if (!newDateTime) {
        res.status(400).json({
          error: 'Missing required field: newDateTime'
        });
        return;
      }

      logger.info('Rescheduling meeting', {
        userId,
        meetingId,
        newDateTime
      });

      // Get old meeting for email
      const oldMeeting = await CalendarMeeting.findById(meetingId);
      if (!oldMeeting) {
        res.status(404).json({ error: 'Meeting not found' });
        return;
      }

      const newMeeting = await MeetingSchedulerService.rescheduleMeeting({
        meetingId,
        newDateTime,
        userId,
        reason
      });

      // Send reschedule email
      await meetingEmailService.sendMeetingRescheduleEmail(oldMeeting, newMeeting);

      res.json({
        success: true,
        meeting: newMeeting,
        message: 'Meeting rescheduled successfully'
      });
    } catch (error) {
      logger.error('Failed to reschedule meeting', {
        meetingId: req.params.meetingId,
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({
        error: 'Failed to reschedule meeting',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * DELETE /api/calendar/meetings/:meetingId
   * Cancel a scheduled meeting
   */
  async cancelMeeting(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { meetingId } = req.params;
      const { reason } = req.body;

      logger.info('Cancelling meeting', {
        userId,
        meetingId,
        reason
      });

      // Get meeting for email
      const meeting = await CalendarMeeting.findById(meetingId);
      if (!meeting) {
        res.status(404).json({ error: 'Meeting not found' });
        return;
      }

      await MeetingSchedulerService.cancelMeeting({
        meetingId,
        userId,
        reason
      });

      // Send cancellation email
      await meetingEmailService.sendMeetingCancellationEmail(meeting, reason);

      res.json({
        success: true,
        message: 'Meeting cancelled successfully'
      });
    } catch (error) {
      logger.error('Failed to cancel meeting', {
        meetingId: req.params.meetingId,
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({
        error: 'Failed to cancel meeting',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

// Export controller instance
export const integrationController = new IntegrationController();
