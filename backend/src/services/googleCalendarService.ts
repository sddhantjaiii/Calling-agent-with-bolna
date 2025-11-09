/**
 * Google Calendar Service
 * 
 * Wraps Google Calendar API v3 operations.
 * Handles event CRUD operations (Create, Read, Update, Delete).
 * Automatically uses valid tokens via googleAuthService.
 */

import { google, calendar_v3 } from 'googleapis';
import { GoogleAuthService } from './googleAuthService';
import { 
  CreateCalendarEventParams, 
  UpdateCalendarEventParams,
  GoogleCalendarError 
} from '../types/googleCalendar';
import { logger } from '../utils/logger';

// Create instance for use
const googleAuthService = new GoogleAuthService();

class GoogleCalendarService {
  /**
   * Get authenticated Calendar API client for a user
   */
  private async getCalendarClient(userId: string): Promise<calendar_v3.Calendar> {
    try {
      const oauth2Client = await googleAuthService.getAuthenticatedClient(userId);
      return google.calendar({ version: 'v3', auth: oauth2Client });
    } catch (error) {
      logger.error('Failed to get Calendar API client', { userId, error });
      throw new GoogleCalendarError(
        'Failed to initialize Google Calendar client',
        'CALENDAR_CLIENT_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Create a calendar event
   * 
   * @param userId - User ID who owns the calendar
   * @param eventParams - Event details (title, description, start, end, attendees)
   * @returns Created event with Google event ID
   */
  async createEvent(
    userId: string, 
    eventParams: CreateCalendarEventParams
  ): Promise<calendar_v3.Schema$Event> {
    const {
      calendarId = 'primary',
      summary,
      description,
      startTime,
      endTime,
      attendees,
      timeZone = 'UTC',
      sendNotifications = true
    } = eventParams;

    try {
      logger.info('Creating Google Calendar event', {
        userId,
        calendarId,
        summary,
        startTime,
        endTime,
        attendeeCount: attendees?.length || 0
      });

      const calendar = await this.getCalendarClient(userId);

      // Build attendees array
      const eventAttendees = attendees?.map(attendee => ({
        email: attendee.email,
        displayName: attendee.name,
        responseStatus: 'needsAction' as const
      }));

      // Create event request
      const eventRequest: calendar_v3.Schema$Event = {
        summary,
        description,
        start: {
          dateTime: startTime.toISOString(),
          timeZone
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone
        },
        attendees: eventAttendees,
        // Add Google Meet conference
        conferenceData: {
          createRequest: {
            requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            conferenceSolutionKey: {
              type: 'hangoutsMeet'
            }
          }
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 }, // 1 day before
            { method: 'popup', minutes: 30 }        // 30 minutes before
          ]
        },
        guestsCanModify: false,
        guestsCanInviteOthers: false,
        guestsCanSeeOtherGuests: true
      };

      // Create event via API with conferenceDataVersion to enable Google Meet
      const response = await calendar.events.insert({
        calendarId,
        requestBody: eventRequest,
        conferenceDataVersion: 1, // Required to create Google Meet link
        sendUpdates: sendNotifications ? 'all' : 'none'
      });

      if (!response.data) {
        throw new GoogleCalendarError(
          'No event data returned from Google Calendar API',
          'CALENDAR_API_ERROR'
        );
      }

      logger.info('✅ Google Calendar event created successfully', {
        userId,
        eventId: response.data.id,
        summary: response.data.summary,
        htmlLink: response.data.htmlLink
      });

      return response.data;
    } catch (error) {
      logger.error('❌ Failed to create Google Calendar event', {
        userId,
        summary,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Check for specific Google API errors
      if (error && typeof error === 'object' && 'code' in error) {
        const apiError = error as { code: number; message: string };
        if (apiError.code === 403) {
          throw new GoogleCalendarError(
            'Insufficient permissions to create calendar event. User may need to reconnect.',
            'CALENDAR_PERMISSION_ERROR',
            error instanceof Error ? error : undefined
          );
        }
        if (apiError.code === 404) {
          throw new GoogleCalendarError(
            'Calendar not found. The specified calendar may not exist.',
            'CALENDAR_NOT_FOUND',
            error instanceof Error ? error : undefined
          );
        }
      }

      throw new GoogleCalendarError(
        'Failed to create calendar event',
        'CALENDAR_CREATE_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Update an existing calendar event
   * 
   * @param userId - User ID who owns the calendar
   * @param eventId - Google Calendar event ID
   * @param updates - Fields to update
   * @returns Updated event
   */
  async updateEvent(
    userId: string,
    eventId: string,
    updates: UpdateCalendarEventParams
  ): Promise<calendar_v3.Schema$Event> {
    const {
      calendarId = 'primary',
      summary,
      description,
      startTime,
      endTime,
      attendees,
      timeZone,
      sendNotifications = true
    } = updates;

    try {
      logger.info('Updating Google Calendar event', {
        userId,
        eventId,
        calendarId,
        hasNewTime: !!startTime
      });

      const calendar = await this.getCalendarClient(userId);

      // Get existing event first
      const existingEvent = await calendar.events.get({
        calendarId,
        eventId
      });

      if (!existingEvent.data) {
        throw new GoogleCalendarError(
          'Event not found',
          'CALENDAR_EVENT_NOT_FOUND'
        );
      }

      // Build update request (only include fields that are being updated)
      const updateRequest: calendar_v3.Schema$Event = {
        ...existingEvent.data
      };

      if (summary !== undefined) updateRequest.summary = summary;
      if (description !== undefined) updateRequest.description = description;
      
      if (startTime && endTime) {
        updateRequest.start = {
          dateTime: startTime.toISOString(),
          timeZone: timeZone || existingEvent.data.start?.timeZone || 'UTC'
        };
        updateRequest.end = {
          dateTime: endTime.toISOString(),
          timeZone: timeZone || existingEvent.data.end?.timeZone || 'UTC'
        };
      }

      if (attendees) {
        updateRequest.attendees = attendees.map(attendee => ({
          email: attendee.email,
          displayName: attendee.name,
          responseStatus: 'needsAction' as const
        }));
      }

      // Update event via API
      const response = await calendar.events.update({
        calendarId,
        eventId,
        requestBody: updateRequest,
        sendUpdates: sendNotifications ? 'all' : 'none'
      });

      if (!response.data) {
        throw new GoogleCalendarError(
          'No event data returned from update',
          'CALENDAR_API_ERROR'
        );
      }

      logger.info('✅ Google Calendar event updated successfully', {
        userId,
        eventId,
        summary: response.data.summary
      });

      return response.data;
    } catch (error) {
      logger.error('❌ Failed to update Google Calendar event', {
        userId,
        eventId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw new GoogleCalendarError(
        'Failed to update calendar event',
        'CALENDAR_UPDATE_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Cancel (delete) a calendar event
   * 
   * @param userId - User ID who owns the calendar
   * @param eventId - Google Calendar event ID
   * @param calendarId - Calendar ID (default: 'primary')
   * @param sendNotifications - Send cancellation emails to attendees
   */
  async cancelEvent(
    userId: string,
    eventId: string,
    calendarId: string = 'primary',
    sendNotifications: boolean = true
  ): Promise<void> {
    try {
      logger.info('Cancelling Google Calendar event', {
        userId,
        eventId,
        calendarId
      });

      const calendar = await this.getCalendarClient(userId);

      // Delete event via API
      await calendar.events.delete({
        calendarId,
        eventId,
        sendUpdates: sendNotifications ? 'all' : 'none'
      });

      logger.info('✅ Google Calendar event cancelled successfully', {
        userId,
        eventId
      });
    } catch (error) {
      logger.error('❌ Failed to cancel Google Calendar event', {
        userId,
        eventId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // If event already doesn't exist, don't throw error
      if (error && typeof error === 'object' && 'code' in error) {
        const apiError = error as { code: number };
        if (apiError.code === 404 || apiError.code === 410) {
          logger.warn('Event already deleted or not found', { userId, eventId });
          return;
        }
      }

      throw new GoogleCalendarError(
        'Failed to cancel calendar event',
        'CALENDAR_CANCEL_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get a specific calendar event
   * 
   * @param userId - User ID who owns the calendar
   * @param eventId - Google Calendar event ID
   * @param calendarId - Calendar ID (default: 'primary')
   * @returns Event details
   */
  async getEvent(
    userId: string,
    eventId: string,
    calendarId: string = 'primary'
  ): Promise<calendar_v3.Schema$Event> {
    try {
      logger.info('Fetching Google Calendar event', {
        userId,
        eventId,
        calendarId
      });

      const calendar = await this.getCalendarClient(userId);

      const response = await calendar.events.get({
        calendarId,
        eventId
      });

      if (!response.data) {
        throw new GoogleCalendarError(
          'Event not found',
          'CALENDAR_EVENT_NOT_FOUND'
        );
      }

      return response.data;
    } catch (error) {
      logger.error('Failed to fetch Google Calendar event', {
        userId,
        eventId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw new GoogleCalendarError(
        'Failed to fetch calendar event',
        'CALENDAR_GET_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * List all calendars for a user
   * 
   * @param userId - User ID
   * @returns Array of calendars
   */
  async listCalendars(userId: string): Promise<calendar_v3.Schema$CalendarListEntry[]> {
    try {
      logger.info('Listing Google Calendars', { userId });

      const calendar = await this.getCalendarClient(userId);

      const response = await calendar.calendarList.list({
        minAccessRole: 'writer' // Only calendars user can write to
      });

      const calendars = response.data.items || [];

      logger.info('✅ Fetched user calendars', {
        userId,
        calendarCount: calendars.length
      });

      return calendars;
    } catch (error) {
      logger.error('Failed to list Google Calendars', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw new GoogleCalendarError(
        'Failed to list calendars',
        'CALENDAR_LIST_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check if a calendar event exists
   * 
   * @param userId - User ID who owns the calendar
   * @param eventId - Google Calendar event ID
   * @param calendarId - Calendar ID (default: 'primary')
   * @returns true if event exists, false otherwise
   */
  async eventExists(
    userId: string,
    eventId: string,
    calendarId: string = 'primary'
  ): Promise<boolean> {
    try {
      await this.getEvent(userId, eventId, calendarId);
      return true;
    } catch (error) {
      if (error instanceof GoogleCalendarError && 
          error.code === 'CALENDAR_EVENT_NOT_FOUND') {
        return false;
      }
      throw error;
    }
  }

  /**
   * List upcoming events for a user
   * 
   * @param userId - User ID
   * @param calendarId - Calendar ID (default: 'primary')
   * @param maxResults - Maximum number of events to return
   * @returns Array of upcoming events
   */
  async listUpcomingEvents(
    userId: string,
    calendarId: string = 'primary',
    maxResults: number = 10
  ): Promise<calendar_v3.Schema$Event[]> {
    try {
      logger.info('Listing upcoming Google Calendar events', {
        userId,
        calendarId,
        maxResults
      });

      const calendar = await this.getCalendarClient(userId);

      const response = await calendar.events.list({
        calendarId,
        timeMin: new Date().toISOString(),
        maxResults,
        singleEvents: true,
        orderBy: 'startTime'
      });

      const events = response.data.items || [];

      logger.info('✅ Fetched upcoming events', {
        userId,
        eventCount: events.length
      });

      return events;
    } catch (error) {
      logger.error('Failed to list upcoming events', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw new GoogleCalendarError(
        'Failed to list upcoming events',
        'CALENDAR_LIST_EVENTS_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }
}

// Export singleton instance
export const googleCalendarService = new GoogleCalendarService();
