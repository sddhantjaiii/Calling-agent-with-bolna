/**
 * Meeting Scheduler Service
 * 
 * High-level business logic for scheduling, rescheduling, and cancelling meetings.
 * Orchestrates Google Calendar API, database operations, and email notifications.
 */

import { v4 as uuidv4 } from 'uuid';
import { googleCalendarService } from './googleCalendarService';
import CalendarMeeting from '../models/CalendarMeeting';
import UserModel from '../models/User';
import database from '../config/database';
import { 
  ScheduleMeetingParams, 
  RescheduleMeetingParams, 
  CancelMeetingParams,
  CalendarMeetingInterface,
  MeetingSchedulingError,
  DEFAULT_MEETING_DURATION_MINUTES 
} from '../types/googleCalendar';
import { logger } from '../utils/logger';

class MeetingSchedulerService {
  /**
   * Schedule a calendar meeting from AI call analysis
   * 
   * This is the main entry point called from webhookService after AI extraction.
   * 
   * @param params - Meeting parameters from lead analytics
   * @returns Created meeting record
   */
  async scheduleCalendarMeeting(
    params: ScheduleMeetingParams
  ): Promise<CalendarMeetingInterface> {
    const {
      userId,
      leadAnalyticsId: initialLeadAnalyticsId,
      callId: initialCallId,
      contactId: initialContactId,
      meetingDateTime,
      attendeeEmail,
      leadName,
      companyName,
      callDetails,
      phoneNumber
    } = params;

    // Use let so we can update these from phone-based lookup
    let leadAnalyticsId = initialLeadAnalyticsId;
    let callId = initialCallId;
    let contactId = initialContactId;

    try {
      logger.info('📅 Scheduling calendar meeting - START', {
        userId,
        leadAnalyticsId,
        leadAnalyticsIdType: typeof leadAnalyticsId,
        leadAnalyticsIdIsNull: leadAnalyticsId === null,
        leadAnalyticsIdIsUndefined: leadAnalyticsId === undefined,
        phoneNumber,
        attendeeEmail,
        meetingDateTime,
        hasCustomTitle: !!params.meetingTitle,
        hasCustomDescription: !!params.meetingDescription
      });

      // 1. Validate user has Google Calendar connected
      const user = await UserModel.findById(userId);
      if (!user) {
        throw new MeetingSchedulingError(
          'User not found',
          'USER_NOT_FOUND'
        );
      }

      if (!user.google_calendar_connected) {
        throw new MeetingSchedulingError(
          'Google Calendar not connected for this user',
          'CALENDAR_NOT_CONNECTED'
        );
      }

      // 2. Parse meeting datetime
      const startTime = new Date(meetingDateTime);
      if (isNaN(startTime.getTime())) {
        throw new MeetingSchedulingError(
          `Invalid meeting datetime format: ${meetingDateTime}`,
          'INVALID_DATETIME'
        );
      }

      // Check if meeting is in the past
      if (startTime < new Date()) {
        logger.warn('Meeting time is in the past, scheduling anyway', {
          meetingDateTime,
          userId
        });
      }

      // 3. Calculate end time (default 30 minutes)
      const durationMs = (DEFAULT_MEETING_DURATION_MINUTES || 30) * 60 * 1000;
      const endTime = new Date(startTime.getTime() + durationMs);

      // 4. Extract timezone from ISO string (e.g., "+05:30" from "2025-09-18T17:00:00+05:30")
      let timezone = 'UTC';
      const timezoneMatch = meetingDateTime.match(/([+-]\d{2}:\d{2}|Z)$/);
      if (timezoneMatch) {
        // Convert offset to timezone name (simplified)
        const offset = timezoneMatch[1];
        if (offset === '+05:30') timezone = 'Asia/Kolkata';
        else if (offset === 'Z' || offset === '+00:00') timezone = 'UTC';
        // Add more timezone mappings as needed
      }

      // 5. Build meeting title: use custom or default to "{name} + {company} + Demo"
      const meetingTitle = params.meetingTitle || (() => {
        const titleParts = [
          leadName || 'Lead',
          companyName,
          'Demo'
        ].filter(Boolean);
        return titleParts.join(' + ');
      })();

      // 6. Build meeting description: use custom or default to simple message
      const description = params.meetingDescription || this.buildSimpleMeetingDescription({
        meetingTime: startTime
      });

      // 7. Create event in Google Calendar
      logger.info('Creating Google Calendar event', {
        userId,
        meetingTitle,
        startTime: startTime.toISOString(),
        attendeeEmail
      });

      // Build attendees list (primary attendee + additional invites)
      const attendees = [{
        email: attendeeEmail,
        name: leadName || undefined
      }];
      
      // Add additional attendees if provided
      if (params.additionalAttendees && params.additionalAttendees.length > 0) {
        params.additionalAttendees.forEach(email => {
          attendees.push({ email, name: undefined });
        });
        logger.info('Added additional attendees', {
          count: params.additionalAttendees.length,
          emails: params.additionalAttendees
        });
      }

      const googleEvent = await googleCalendarService.createEvent(userId, {
        calendarId: user.google_calendar_id || 'primary',
        summary: meetingTitle,
        description,
        startTime,
        endTime,
        attendees,
        timeZone: timezone,
        sendNotifications: true // This will send Google Calendar invites
      });

      if (!googleEvent.id) {
        throw new MeetingSchedulingError(
          'Google Calendar event created but no event ID returned',
          'CALENDAR_EVENT_ID_MISSING'
        );
      }

      // 8. Lookup lead_analytics_id, call_id, contact_id if not provided
      // This must happen BEFORE saving to database so foreign keys are populated
      if (!leadAnalyticsId && phoneNumber) {
        logger.info('🔍 No leadAnalyticsId provided, trying phone-based lookup BEFORE saving', { phoneNumber });
        
        const phoneLookupResult = await database.query(
          `SELECT la.id, la.call_id, la.analysis_type, la.demo_book_datetime, c.contact_id
           FROM lead_analytics la
           JOIN calls c ON la.call_id = c.id
           WHERE c.phone_number = $1 
             AND la.analysis_type = 'complete'
             AND c.user_id = $2
           ORDER BY c.created_at DESC
           LIMIT 1`,
          [phoneNumber, userId]
        );

        if (phoneLookupResult.rows.length > 0) {
          const foundRecord = phoneLookupResult.rows[0];
          leadAnalyticsId = foundRecord.id;
          callId = callId || foundRecord.call_id;
          contactId = contactId || foundRecord.contact_id;
          
          logger.info('✅ Found and populated foreign keys via phone lookup', { 
            leadAnalyticsId, 
            callId,
            contactId,
            phoneNumber 
          });
        } else {
          logger.warn('⚠️ No complete lead_analytics record found for phone number', {
            phoneNumber,
            userId,
            message: 'Foreign keys will be NULL in calendar_meetings table'
          });
        }
      }

      // 9. Save meeting to database
      logger.info('Saving meeting to database', {
        userId,
        googleEventId: googleEvent.id,
        leadAnalyticsId,
        callId,
        contactId
      });

      const meetingData = {
        user_id: userId,
        lead_analytics_id: leadAnalyticsId,
        call_id: callId,
        contact_id: contactId,
        google_event_id: googleEvent.id,
        google_calendar_id: user.google_calendar_id || 'primary',
        meeting_title: meetingTitle,
        meeting_description: description,
        attendee_email: attendeeEmail,
        attendee_name: leadName || undefined,
        meeting_start_time: startTime,
        meeting_end_time: endTime,
        meeting_duration_minutes: DEFAULT_MEETING_DURATION_MINUTES || 30,
        meeting_link: googleEvent.hangoutLink || null, // Google Meet link
        timezone,
        status: 'scheduled' as const,
        invite_email_sent: false,
        reminder_email_sent: false,
        google_api_response: googleEvent,
        meeting_metadata: {
          lead_tags: callDetails?.tags,
          call_id: callId,
          scheduled_via: 'ai_extraction'
        }
      };

      const createdMeeting = await CalendarMeeting.createMeeting(meetingData);

      // Update demo_book_datetime in lead_analytics so it shows in Lead Intelligence
      logger.info('🔄 Attempting to update demo_book_datetime in lead_analytics', {
        leadAnalyticsId,
        leadAnalyticsIdProvided: !!leadAnalyticsId,
        phoneNumber,
        phoneNumberProvided: !!phoneNumber,
        startTime: startTime.toISOString(),
        strategy: leadAnalyticsId ? 'direct-id' : (phoneNumber ? 'phone-lookup' : 'none')
      });

      try {
        if (leadAnalyticsId) {
          // First, check if the record exists and its current state
          const checkResult = await database.query(
            `SELECT id, analysis_type, demo_book_datetime, created_at 
             FROM lead_analytics 
             WHERE id = $1`,
            [leadAnalyticsId]
          );

          logger.info('🔍 Lead analytics record check', {
            leadAnalyticsId,
            recordExists: checkResult.rows.length > 0,
            recordData: checkResult.rows.length > 0 ? checkResult.rows[0] : null
          });

          if (checkResult.rows.length === 0) {
            logger.error('❌ Lead analytics record NOT FOUND', {
              leadAnalyticsId,
              message: 'The provided leadAnalyticsId does not exist in the database'
            });
          } else if (checkResult.rows[0].analysis_type !== 'complete') {
            logger.warn('⚠️ Lead analytics record exists but analysis_type is NOT complete', {
              leadAnalyticsId,
              actualAnalysisType: checkResult.rows[0].analysis_type,
              currentDemoBookDatetime: checkResult.rows[0].demo_book_datetime,
              message: 'Record will NOT be updated because analysis_type must be "complete"'
            });
          }

          // Update lead_analytics record ONLY for analysis_type = 'complete'
          // This is correct because Lead Intelligence only shows complete analyses
          const updateResult = await database.query(
            `UPDATE lead_analytics 
             SET demo_book_datetime = $1 
             WHERE id = $2 AND analysis_type = 'complete'
             RETURNING id, analysis_type, demo_book_datetime`,
            [startTime, leadAnalyticsId]
          );
          
          if (updateResult.rows.length > 0) {
            logger.info('✅ Successfully updated lead_analytics demo_book_datetime', { 
              leadAnalyticsId, 
              startTime: startTime.toISOString(),
              analysisType: updateResult.rows[0].analysis_type,
              updatedDatetime: updateResult.rows[0].demo_book_datetime,
              message: 'Meeting should now appear in Lead Intelligence UI'
            });
          } else {
            logger.error('❌ UPDATE query executed but returned 0 rows', { 
              leadAnalyticsId,
              possibleReasons: [
                '1. Record does not exist',
                '2. analysis_type is not "complete"',
                '3. ID does not match any record'
              ],
              message: 'demo_book_datetime was NOT updated - meeting will NOT show in Lead Intelligence'
            });
          }
        } else {
          logger.warn('⚠️ No leadAnalyticsId or phoneNumber provided, skipping demo_book_datetime update', {
            message: 'Meeting created in calendar but will not show in Lead Intelligence',
            suggestion: 'Ensure either leadAnalyticsId or phoneNumber is passed from frontend'
          });
        }
      } catch (updateError) {
        logger.error('Failed to update demo_book_datetime in lead_analytics', {
          error: updateError instanceof Error ? updateError.message : 'Unknown error',
          stack: updateError instanceof Error ? updateError.stack : undefined,
          attendeeEmail,
          leadAnalyticsId
        });
        // Don't throw - meeting is already created
      }

      logger.info('✅ Calendar meeting scheduled successfully', {
        meetingId: createdMeeting.id,
        googleEventId: googleEvent.id,
        userId,
        leadAnalyticsId,
        meetingTime: startTime.toISOString(),
        htmlLink: googleEvent.htmlLink
      });

      return createdMeeting;
    } catch (error) {
      logger.error('❌ Failed to schedule calendar meeting', {
        userId,
        leadAnalyticsId,
        attendeeEmail,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      if (error instanceof MeetingSchedulingError) {
        throw error;
      }

      throw new MeetingSchedulingError(
        'Failed to schedule calendar meeting',
        'SCHEDULING_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Reschedule an existing meeting to a new time
   * 
   * @param params - Reschedule parameters
   * @returns New meeting record (old meeting marked as rescheduled)
   */
  async rescheduleMeeting(
    params: RescheduleMeetingParams
  ): Promise<CalendarMeetingInterface> {
    const { meetingId, newDateTime, userId, reason } = params;

    try {
      logger.info('🔄 Rescheduling meeting', {
        meetingId,
        newDateTime,
        userId
      });

      // 1. Get existing meeting
      const existingMeeting = await CalendarMeeting.findById(meetingId);
      if (!existingMeeting) {
        throw new MeetingSchedulingError(
          'Meeting not found',
          'MEETING_NOT_FOUND'
        );
      }

      // 2. Verify ownership
      if (existingMeeting.user_id !== userId) {
        throw new MeetingSchedulingError(
          'Unauthorized: Meeting belongs to different user',
          'UNAUTHORIZED'
        );
      }

      // 3. Check meeting status - allow rescheduling of scheduled or rescheduled meetings
      const allowedStatuses = ['scheduled', 'rescheduled'];
      if (!allowedStatuses.includes(existingMeeting.status)) {
        throw new MeetingSchedulingError(
          `Cannot reschedule meeting with status: ${existingMeeting.status}`,
          'INVALID_STATUS'
        );
      }

      // 4. Parse new datetime
      const newStartTime = new Date(newDateTime);
      if (isNaN(newStartTime.getTime())) {
        throw new MeetingSchedulingError(
          `Invalid datetime format: ${newDateTime}`,
          'INVALID_DATETIME'
        );
      }

      const newEndTime = new Date(
        newStartTime.getTime() + existingMeeting.meeting_duration_minutes * 60 * 1000
      );

      // 5. Update Google Calendar event
      logger.info('Updating Google Calendar event', {
        userId,
        googleEventId: existingMeeting.google_event_id,
        newStartTime: newStartTime.toISOString()
      });

      const updatedGoogleEvent = await googleCalendarService.updateEvent(
        userId,
        existingMeeting.google_event_id,
        {
          calendarId: existingMeeting.google_calendar_id,
          startTime: newStartTime,
          endTime: newEndTime,
          sendNotifications: true
        }
      );

      // 6. Update the existing meeting record with new time (don't create new record)
      logger.info('Updating existing meeting record in database', {
        meetingId,
        oldStartTime: existingMeeting.meeting_start_time,
        newStartTime: newStartTime.toISOString()
      });

      const updateResult = await database.query(
        `UPDATE calendar_meetings 
         SET meeting_start_time = $1,
             meeting_end_time = $2,
             status = 'scheduled',
             google_api_response = $3,
             meeting_metadata = jsonb_set(
               COALESCE(meeting_metadata, '{}'::jsonb),
               '{reschedule_history}',
               COALESCE(meeting_metadata->'reschedule_history', '[]'::jsonb) || 
               jsonb_build_array(jsonb_build_object(
                 'previous_time', $4::text,
                 'new_time', $5::text,
                 'rescheduled_at', $6::text,
                 'reason', $7::text
               ))
             )
         WHERE id = $8 AND user_id = $9
         RETURNING *`,
        [
          newStartTime,
          newEndTime,
          updatedGoogleEvent,
          existingMeeting.meeting_start_time.toISOString(),
          newStartTime.toISOString(),
          new Date().toISOString(),
          reason || 'User requested reschedule',
          meetingId,
          userId
        ]
      );

      if (updateResult.rows.length === 0) {
        throw new MeetingSchedulingError(
          'Failed to update meeting record in database',
          'UPDATE_FAILED'
        );
      }

      const updatedMeeting = updateResult.rows[0];

      logger.info('✅ Meeting rescheduled successfully', {
        meetingId,
        oldTime: existingMeeting.meeting_start_time,
        newTime: newStartTime.toISOString(),
        userId
      });

      return updatedMeeting;
    } catch (error) {
      logger.error('❌ Failed to reschedule meeting', {
        meetingId,
        newDateTime,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      if (error instanceof MeetingSchedulingError) {
        throw error;
      }

      throw new MeetingSchedulingError(
        'Failed to reschedule meeting',
        'RESCHEDULE_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Cancel a scheduled meeting
   * 
   * @param params - Cancellation parameters
   */
  async cancelMeeting(params: CancelMeetingParams): Promise<void> {
    const { meetingId, userId, reason } = params;

    try {
      logger.info('❌ Cancelling meeting', {
        meetingId,
        userId,
        reason
      });

      // 1. Get existing meeting
      const meeting = await CalendarMeeting.findById(meetingId);
      if (!meeting) {
        throw new MeetingSchedulingError(
          'Meeting not found',
          'MEETING_NOT_FOUND'
        );
      }

      // 2. Verify ownership
      if (meeting.user_id !== userId) {
        throw new MeetingSchedulingError(
          'Unauthorized: Meeting belongs to different user',
          'UNAUTHORIZED'
        );
      }

      // 3. Check if already cancelled
      if (meeting.status === 'cancelled') {
        logger.warn('Meeting already cancelled', { meetingId });
        return;
      }

      // 4. Cancel in Google Calendar
      logger.info('Cancelling Google Calendar event', {
        userId,
        googleEventId: meeting.google_event_id
      });

      await googleCalendarService.cancelEvent(
        userId,
        meeting.google_event_id,
        meeting.google_calendar_id,
        true // Send notifications
      );

      // 5. Update database
      await CalendarMeeting.markAsCancelled(meetingId, userId, reason || 'Cancelled by user');

      logger.info('✅ Meeting cancelled successfully', {
        meetingId,
        userId,
        reason
      });
    } catch (error) {
      logger.error('❌ Failed to cancel meeting', {
        meetingId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      if (error instanceof MeetingSchedulingError) {
        throw error;
      }

      throw new MeetingSchedulingError(
        'Failed to cancel meeting',
        'CANCEL_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get all meetings for a specific lead
   */
  async getMeetingsByLead(
    leadAnalyticsId: string,
    userId: string
  ): Promise<CalendarMeetingInterface[]> {
    try {
      const meetings = await CalendarMeeting.findByLeadAnalytics(leadAnalyticsId, userId);
      
      return meetings;
    } catch (error) {
      logger.error('Failed to get meetings by lead', {
        leadAnalyticsId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new MeetingSchedulingError(
        'Failed to fetch meetings',
        'FETCH_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get upcoming meetings for a user
   */
  async getUpcomingMeetings(
    userId: string,
    limit: number = 10
  ): Promise<CalendarMeetingInterface[]> {
    try {
      return await CalendarMeeting.findUpcoming(userId, limit);
    } catch (error) {
      logger.error('Failed to get upcoming meetings', {
        userId,
        limit,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new MeetingSchedulingError(
        'Failed to fetch upcoming meetings',
        'FETCH_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get past meetings for a user
   */
  async getPastMeetings(
    userId: string,
    limit: number = 10
  ): Promise<CalendarMeetingInterface[]> {
    try {
      return await CalendarMeeting.findPast(userId, limit);
    } catch (error) {
      logger.error('Failed to get past meetings', {
        userId,
        limit,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new MeetingSchedulingError(
        'Failed to fetch past meetings',
        'FETCH_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get meetings for a specific contact
   */
  async getMeetingsByContact(
    contactId: string,
    userId: string
  ): Promise<CalendarMeetingInterface[]> {
    try {
      return await CalendarMeeting.findByContact(contactId, userId);
    } catch (error) {
      logger.error('Failed to get meetings by contact', {
        contactId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new MeetingSchedulingError(
        'Failed to fetch meetings',
        'FETCH_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Build rich meeting description with all lead context
   */
  private buildMeetingDescription(params: {
    leadName: string;
    companyName?: string;
    phoneNumber?: string;
    tags?: string;
    reasoning?: any;
    smartNotification?: string;
    recordingUrl?: string;
    transcript?: string;
  }): string {
    const {
      leadName,
      companyName,
      phoneNumber,
      tags,
      reasoning,
      smartNotification,
      recordingUrl,
      transcript
    } = params;

    const lines: string[] = [];

    lines.push(`🎯 Demo Meeting with ${leadName}`);
    lines.push('');

    // Lead details section
    lines.push('📞 Lead Details:');
    if (companyName) lines.push(`- Company: ${companyName}`);
    if (phoneNumber) lines.push(`- Phone: ${phoneNumber}`);
    if (tags) lines.push(`- Status: ${tags}`);
    lines.push('');

    // AI analysis section
    if (reasoning || smartNotification) {
      lines.push('🤖 AI Analysis:');
      if (smartNotification) {
        lines.push(smartNotification);
      }
      if (reasoning && typeof reasoning === 'object') {
        const reasoningText = JSON.stringify(reasoning, null, 2);
        lines.push(reasoningText);
      } else if (reasoning) {
        lines.push(String(reasoning));
      }
      lines.push('');
    }

    // Transcript preview
    if (transcript) {
      lines.push('📝 Call Transcript Preview:');
      const preview = transcript.length > 500 
        ? transcript.substring(0, 500) + '...' 
        : transcript;
      lines.push(preview);
      lines.push('');
    }

    // Resources section
    lines.push('🔗 Resources:');
    if (recordingUrl) {
      lines.push(`- Recording: ${recordingUrl}`);
    }
    lines.push('- Full details available in your AI Calling Platform');
    lines.push('');

    lines.push('---');
    lines.push('Scheduled automatically via AI Calling Agent Platform');

    return lines.join('\n');
  }

  /**
   * Build simple meeting description with just meeting time
   */
  private buildSimpleMeetingDescription(params: {
    meetingTime: Date;
  }): string {
    const { meetingTime } = params;
    
    // Format time in a readable way
    const timeStr = meetingTime.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
    
    return `See you at ${timeStr}!`;
  }
}

// Export singleton instance
export default new MeetingSchedulerService();
