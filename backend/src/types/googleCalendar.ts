/**
 * Google Calendar Integration Type Definitions
 * 
 * This file contains all TypeScript interfaces and types for Google Calendar
 * OAuth integration and meeting scheduling functionality.
 */

import { calendar_v3 } from 'googleapis';

// ============================================================================
// OAuth Token Types
// ============================================================================

export interface GoogleOAuthTokens {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expiry_date: number; // Unix timestamp in milliseconds
}

export interface GoogleTokenRefreshResponse {
  access_token: string;
  expires_in: number; // Seconds until expiration
  scope: string;
  token_type: string;
}

export interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
}

// ============================================================================
// Calendar Connection Types
// ============================================================================

export interface CalendarConnectionStatus {
  connected: boolean;
  email?: string;
  calendar_id?: string;
  token_expiry?: Date;
  needs_refresh: boolean;
}

export interface ConnectCalendarResponse {
  success: boolean;
  auth_url: string;
  state: string;
}

export interface OAuthCallbackResult {
  success: boolean;
  user_id: string;
  google_email: string;
  message: string;
}

// ============================================================================
// Google Calendar Event Types
// ============================================================================

export interface CalendarEventDateTime {
  dateTime: string; // ISO 8601 format
  timeZone: string;
}

export interface CalendarEventAttendee {
  email: string;
  name?: string; // Also accept 'name' as alias for displayName
  displayName?: string;
  responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  optional?: boolean;
}

export interface CalendarEventConferenceData {
  createRequest?: {
    requestId: string;
    conferenceSolutionKey: {
      type: 'hangoutsMeet';
    };
  };
}

export interface CreateCalendarEventParams {
  calendarId?: string; // Calendar ID (default: 'primary')
  summary: string; // Meeting title
  description?: string; // Meeting description with full lead context
  startTime: Date; // Meeting start time
  endTime: Date; // Meeting end time
  start?: CalendarEventDateTime; // Alternative format
  end?: CalendarEventDateTime; // Alternative format
  attendees?: CalendarEventAttendee[];
  timeZone?: string; // Timezone for the meeting
  sendNotifications?: boolean; // Send email notifications
  conferenceData?: CalendarEventConferenceData;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{
      method: 'email' | 'popup';
      minutes: number;
    }>;
  };
  colorId?: string;
  visibility?: 'default' | 'public' | 'private';
}

export interface UpdateCalendarEventParams {
  eventId?: string; // For backwards compatibility
  calendarId?: string; // Calendar ID (default: 'primary')
  summary?: string;
  description?: string;
  startTime?: Date; // Meeting start time
  endTime?: Date; // Meeting end time
  start?: CalendarEventDateTime;
  end?: CalendarEventDateTime;
  attendees?: CalendarEventAttendee[];
  timeZone?: string; // Timezone for the meeting
  sendNotifications?: boolean; // Send email notifications
}

export type GoogleCalendarEvent = calendar_v3.Schema$Event;

// ============================================================================
// Meeting Scheduling Types
// ============================================================================

export interface ScheduleMeetingParams {
  userId: string;
  leadAnalyticsId?: string;
  callId?: string;
  contactId?: string;
  meetingDateTime: string; // ISO 8601 format from demo_book_datetime
  attendeeEmail: string;
  phoneNumber?: string; // Phone number (used for grouped records when leadAnalyticsId is not available)
  additionalAttendees?: string[]; // Additional emails to invite
  leadName?: string;
  companyName?: string;
  meetingTitle?: string; // Custom meeting title (optional)
  meetingDescription?: string; // Custom meeting description (optional)
  callDetails?: {
    transcript?: string;
    recording_url?: string;
    tags?: string;
    reasoning?: any;
    smart_notification?: string;
  };
}

export interface RescheduleMeetingParams {
  meetingId: string;
  userId: string;
  newDateTime: string; // ISO 8601 format
  reason?: string;
}

export interface CancelMeetingParams {
  meetingId: string;
  userId: string;
  reason: string;
  sendNotification?: boolean;
}

export interface MeetingScheduleResult {
  success: boolean;
  meeting_id?: string;
  google_event_id?: string;
  meeting_link?: string;
  error?: string;
}

// ============================================================================
// Database Model Types
// ============================================================================

export interface CalendarMeetingInterface {
  id: string;
  user_id: string;
  lead_analytics_id?: string | null;
  call_id?: string | null;
  contact_id?: string | null;
  google_event_id: string;
  google_calendar_id: string;
  meeting_title: string;
  meeting_description?: string | null;
  attendee_email: string;
  attendee_name?: string | null;
  meeting_start_time: Date;
  meeting_end_time: Date;
  meeting_duration_minutes: number;
  timezone?: string | null;
  status: 'scheduled' | 'cancelled' | 'rescheduled' | 'completed';
  cancellation_reason?: string | null;
  rescheduled_from_meeting_id?: string | null;
  invite_email_sent: boolean;
  invite_email_sent_at?: Date | null;
  reminder_email_sent: boolean;
  reminder_email_sent_at?: Date | null;
  google_api_response?: any;
  meeting_metadata?: any;
  created_at: Date;
  updated_at: Date;
  created_by?: string | null;
}

export interface CreateCalendarMeetingData {
  user_id: string;
  lead_analytics_id?: string;
  call_id?: string;
  contact_id?: string;
  google_event_id: string;
  google_calendar_id: string;
  meeting_title: string;
  meeting_description?: string;
  attendee_email: string;
  attendee_name?: string;
  meeting_start_time: Date;
  meeting_end_time: Date;
  meeting_duration_minutes?: number;
  timezone?: string;
  status?: 'scheduled' | 'cancelled' | 'rescheduled' | 'completed';
  google_api_response?: any;
  meeting_metadata?: any;
  created_by?: string;
}

// ============================================================================
// User Model Extension Types
// ============================================================================

export interface UserGoogleCalendarFields {
  google_access_token?: string | null;
  google_refresh_token?: string | null;
  google_token_expiry?: Date | null;
  google_calendar_connected: boolean;
  google_calendar_id?: string | null;
  google_email?: string | null;
}

// ============================================================================
// Email Notification Types
// ============================================================================

export interface MeetingEmailContext {
  user_name: string;
  user_email: string;
  meeting_title: string;
  meeting_start: string; // Formatted datetime
  meeting_end: string; // Formatted datetime
  meeting_link?: string;
  attendee_email: string;
  attendee_name?: string;
  lead_details: {
    name?: string;
    company?: string;
    phone?: string;
    email?: string;
    status_tag?: string;
    smart_notification?: string;
    reasoning?: any;
  };
  call_details?: {
    recording_url?: string;
    transcript_excerpt?: string;
    duration?: string;
    call_date?: string;
  };
}

export interface RescheduleMeetingEmailContext extends MeetingEmailContext {
  old_meeting_start: string;
  old_meeting_end: string;
  reschedule_reason?: string;
}

export interface CancelMeetingEmailContext {
  user_name: string;
  user_email: string;
  meeting_title: string;
  meeting_start: string;
  attendee_email: string;
  cancellation_reason: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface CalendarIntegrationStatusResponse {
  connected: boolean;
  email?: string;
  calendar_id?: string;
  needs_refresh?: boolean;
}

export interface UpcomingMeetingsResponse {
  meetings: CalendarMeetingInterface[];
  total: number;
}

export interface MeetingDetailResponse {
  meeting: CalendarMeetingInterface;
  google_event?: GoogleCalendarEvent;
  lead_details?: any;
  call_details?: any;
}

// ============================================================================
// Error Types
// ============================================================================

export class GoogleCalendarError extends Error {
  public code?: string;
  public originalError?: Error;
  
  constructor(
    message: string,
    code?: string,
    originalError?: Error
  ) {
    super(message);
    this.name = 'GoogleCalendarError';
    this.code = code;
    this.originalError = originalError;
  }
}

export class OAuthError extends Error {
  public code?: string;
  public details?: any;
  
  constructor(
    message: string,
    code?: string,
    details?: any
  ) {
    super(message);
    this.name = 'OAuthError';
    this.code = code;
    this.details = details;
  }
}

export class MeetingSchedulingError extends Error {
  public code?: string;
  public originalError?: Error;
  
  constructor(
    message: string,
    code?: string,
    originalError?: Error
  ) {
    super(message);
    this.name = 'MeetingSchedulingError';
    this.code = code;
    this.originalError = originalError;
  }
}

// ============================================================================
// Utility Types
// ============================================================================

export type MeetingStatus = 'scheduled' | 'cancelled' | 'rescheduled' | 'completed';

export interface MeetingFilterOptions {
  user_id: string;
  status?: MeetingStatus | MeetingStatus[];
  from_date?: Date;
  to_date?: Date;
  contact_id?: string;
  lead_analytics_id?: string;
  limit?: number;
  offset?: number;
}

export interface ParsedMeetingDateTime {
  startTime: Date;
  endTime: Date;
  timezone: string;
  durationMinutes: number;
}

// ============================================================================
// Constants
// ============================================================================

export const GOOGLE_OAUTH_SCOPES: string[] = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email'
];

export const DEFAULT_MEETING_DURATION_MINUTES = 30;

export const MEETING_REMINDER_MINUTES = {
  EMAIL_24_HOURS: 1440,
  POPUP_10_MINUTES: 10
} as const;
