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
import { gmailService } from '../services/gmailService';
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
   * GET /api/integrations/gmail/status
   * Get Gmail connection status (checks if gmail.send scope is granted)
   */
  async getGmailStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const status = await gmailService.getGmailStatus(userId);

      res.json({
        success: true,
        ...status
      });
    } catch (error) {
      logger.error('Failed to get Gmail status', {
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({
        error: 'Failed to get Gmail status',
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

      // Send email notification asynchronously (don't wait for it)
      // This allows the API to respond immediately while email sends in background
      meetingEmailService.sendMeetingInviteEmail(meeting).catch(error => {
        logger.error('Background email send failed', {
          meetingId: meeting.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });

      // Send meeting booked notification to dashboard user asynchronously
      const { notificationService } = await import('../services/notificationService');
      const { pool } = await import('../config/database');
      
      // Fetch user email, name, and timezone for notification
      const userResult = await pool.query(
        'SELECT email, name, timezone FROM users WHERE id = $1',
        [userId]
      );
      
      if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        
        notificationService.sendNotification({
          userId,
          email: user.email,
          notificationType: 'meeting_booked',
          notificationData: {
            userName: user.name || 'User',
            userTimezone: user.timezone || 'UTC', // Pass user timezone for dual timezone formatting
            meetingDetails: {
              leadName: leadName || meeting.attendee_name || undefined,
              leadEmail: meeting.attendee_email,
              company: companyName || undefined,
              phone: phoneNumber || undefined,
              meetingTime: new Date(meeting.meeting_start_time),
              meetingDuration: meeting.meeting_duration_minutes,
              meetingTitle: meeting.meeting_title,
              googleCalendarLink: meeting.google_event_id 
                ? `https://calendar.google.com/calendar/event?eid=${meeting.google_event_id}`
                : undefined
            },
            callContext: callDetails ? {
              transcript: callDetails.transcript || undefined,
              recordingUrl: callDetails.recording_url || undefined,
              leadStatusTag: callDetails.tags || undefined,
              aiReasoning: callDetails.reasoning || undefined,
              smartNotification: callDetails.smart_notification || undefined
            } : undefined
          },
          idempotencyKey: `meeting-booked-${meeting.id}` // Prevent duplicate notifications
        }).catch(notifError => {
          logger.error('Background meeting notification failed', {
            meetingId: meeting.id,
            userId,
            error: notifError instanceof Error ? notifError.message : 'Unknown error'
          });
        });
      }

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

      // Send reschedule email to lead (async, don't block)
      meetingEmailService.sendMeetingRescheduleEmail(oldMeeting, newMeeting).catch(emailError => {
        logger.error('Background reschedule email to lead failed', {
          meetingId: newMeeting.id,
          error: emailError instanceof Error ? emailError.message : 'Unknown error'
        });
      });

      // Send reschedule notification to dashboard user asynchronously
      (async () => {
        try {
          const { notificationService } = await import('../services/notificationService');
          const { pool } = await import('../config/database');
          
          // Fetch user email, name, and timezone
          const userResult = await pool.query(
            'SELECT email, name, timezone FROM users WHERE id = $1',
            [userId]
          );
          
          if (userResult.rows.length === 0) return;
          
          const user = userResult.rows[0];
          
          // Fetch call details if meeting has a call_id
          let callContext: any = undefined;
          if (newMeeting.call_id) {
            try {
              const callResult = await pool.query(
                `SELECT c.recording_url, c.phone_number, t.content,
                        la.lead_status_tag, la.reasoning, la.extraction
                 FROM calls c
                 LEFT JOIN transcripts t ON t.call_id = c.id
                 LEFT JOIN lead_analytics la ON la.call_id = c.id AND la.analysis_type = 'individual'
                 WHERE c.id = $1
                 ORDER BY la.created_at DESC
                 LIMIT 1`,
                [newMeeting.call_id]
              );
              
              if (callResult.rows.length > 0) {
                const callData = callResult.rows[0];
                callContext = {
                  transcript: callData.content,
                  recordingUrl: callData.recording_url,
                  leadStatusTag: callData.lead_status_tag,
                  aiReasoning: reason 
                    ? `Meeting rescheduled. Previous time: ${new Date(oldMeeting.meeting_start_time).toLocaleString('en-US', { 
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', 
                        hour: 'numeric', minute: '2-digit', timeZoneName: 'short' 
                      })}. New time: ${new Date(newMeeting.meeting_start_time).toLocaleString('en-US', { 
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', 
                        hour: 'numeric', minute: '2-digit', timeZoneName: 'short' 
                      })}. Reason: ${reason}`
                    : `Meeting rescheduled from ${new Date(oldMeeting.meeting_start_time).toLocaleString('en-US', { 
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', 
                        hour: 'numeric', minute: '2-digit', timeZoneName: 'short' 
                      })} to ${new Date(newMeeting.meeting_start_time).toLocaleString('en-US', { 
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', 
                        hour: 'numeric', minute: '2-digit', timeZoneName: 'short' 
                      })}`,
                  smartNotification: '⏰ Meeting time has been changed - Updated in your calendar'
                };
              }
            } catch (callError) {
              logger.warn('Failed to fetch call details for reschedule notification', {
                callId: newMeeting.call_id,
                error: callError instanceof Error ? callError.message : 'Unknown error'
              });
            }
          }
          
          // Get contact details for company/phone
          let contactDetails: any = {};
          if (newMeeting.contact_id) {
            const contactResult = await pool.query(
              'SELECT company_name, phone FROM contacts WHERE id = $1',
              [newMeeting.contact_id]
            );
            if (contactResult.rows.length > 0) {
              contactDetails = contactResult.rows[0];
            }
          }
          
          await notificationService.sendNotification({
            userId,
            email: user.email,
            notificationType: 'meeting_booked',
            notificationData: {
              userName: user.name || 'User',
              userTimezone: user.timezone || 'UTC', // Pass user timezone for dual timezone formatting
              meetingDetails: {
                leadName: newMeeting.attendee_name || undefined,
                leadEmail: newMeeting.attendee_email,
                company: contactDetails.company_name || undefined,
                phone: contactDetails.phone || undefined,
                meetingTime: new Date(newMeeting.meeting_start_time),
                meetingDuration: newMeeting.meeting_duration_minutes,
                meetingTitle: `RESCHEDULED: ${newMeeting.meeting_title}`,
                googleCalendarLink: newMeeting.google_event_id 
                  ? `https://calendar.google.com/calendar/event?eid=${newMeeting.google_event_id}`
                  : undefined
              },
              callContext: callContext || {
                aiReasoning: reason 
                  ? `Meeting rescheduled. Previous time: ${new Date(oldMeeting.meeting_start_time).toLocaleString('en-US', { 
                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', 
                      hour: 'numeric', minute: '2-digit', timeZoneName: 'short' 
                    })}. New time: ${new Date(newMeeting.meeting_start_time).toLocaleString('en-US', { 
                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', 
                      hour: 'numeric', minute: '2-digit', timeZoneName: 'short' 
                    })}. Reason: ${reason}`
                  : `Meeting rescheduled from ${new Date(oldMeeting.meeting_start_time).toLocaleString('en-US', { 
                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', 
                      hour: 'numeric', minute: '2-digit', timeZoneName: 'short' 
                    })} to ${new Date(newMeeting.meeting_start_time).toLocaleString('en-US', { 
                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', 
                      hour: 'numeric', minute: '2-digit', timeZoneName: 'short' 
                    })}`,
                smartNotification: '⏰ Meeting time has been changed - Updated in your calendar'
              }
            },
            idempotencyKey: `meeting-rescheduled-${newMeeting.id}-${Date.now()}`
          });
        } catch (notifError) {
          logger.error('Background reschedule notification failed', {
            meetingId: newMeeting.id,
            userId,
            error: notifError instanceof Error ? notifError.message : 'Unknown error'
          });
        }
      })();

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

  /**
   * GET /api/integrations/agents
   * Get all user's agents for dynamic information management
   */
  async getUserAgents(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      logger.info('Getting user agents for dynamic info', { userId });

      const { AgentModel } = await import('../models/Agent');
      const agentModel = new AgentModel();
      const agents = await agentModel.findByUserId(userId, true); // Active agents only

      res.json({
        success: true,
        agents: agents.map(agent => ({
          id: agent.id,
          name: agent.name,
          agent_type: agent.agent_type,
          bolna_agent_id: agent.bolna_agent_id
        }))
      });
    } catch (error) {
      logger.error('Failed to get user agents', {
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({
        error: 'Failed to get agents',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/integrations/agents/:agentId/dynamic-info
   * Get dynamic information for a specific agent
   */
  async getAgentDynamicInfo(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { agentId } = req.params;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      logger.info('Getting agent dynamic info', { userId, agentId });

      const { AgentModel } = await import('../models/Agent');
      const agentModel = new AgentModel();
      const agent = await agentModel.findById(agentId);

      if (!agent) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }

      // Verify agent belongs to user
      if (agent.user_id !== userId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      res.json({
        success: true,
        dynamicInformation: agent.dynamic_information || ''
      });
    } catch (error) {
      logger.error('Failed to get agent dynamic info', {
        userId: req.user?.id,
        agentId: req.params.agentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({
        error: 'Failed to get dynamic information',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * PUT /api/integrations/agents/:agentId/dynamic-info
   * Update dynamic information for a specific agent
   */
  async updateAgentDynamicInfo(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { agentId } = req.params;
      const { dynamicInformation } = req.body;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      logger.info('Updating agent dynamic info', { userId, agentId });

      const { AgentModel } = await import('../models/Agent');
      const agentModel = new AgentModel();
      const agent = await agentModel.findById(agentId);

      if (!agent) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }

      // Verify agent belongs to user
      if (agent.user_id !== userId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Validate agent has Bolna ID and system prompt
      if (!agent.bolna_agent_id) {
        res.status(400).json({ error: 'Agent is not linked to Bolna' });
        return;
      }

      if (!agent.system_prompt) {
        res.status(400).json({ error: 'Agent does not have a system prompt configured' });
        return;
      }

      // Update dynamic_information in database
      await agentModel.update(agentId, {
        dynamic_information: dynamicInformation || null
      });

      // Combine system_prompt with dynamic_information
      const finalSystemPrompt = dynamicInformation
        ? `${agent.system_prompt}\n\n${dynamicInformation}`
        : agent.system_prompt;

      // Update Bolna agent system prompt via PATCH
      const { bolnaService } = await import('../services/bolnaService');
      await bolnaService.patchAgentSystemPrompt(agent.bolna_agent_id, finalSystemPrompt);

      logger.info('Successfully updated agent dynamic info and Bolna system prompt', {
        userId,
        agentId,
        bolnaAgentId: agent.bolna_agent_id
      });

      res.json({
        success: true,
        message: 'Dynamic information updated successfully'
      });
    } catch (error) {
      logger.error('Failed to update agent dynamic info', {
        userId: req.user?.id,
        agentId: req.params.agentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({
        error: 'Failed to update dynamic information',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

// Export controller instance
export const integrationController = new IntegrationController();
