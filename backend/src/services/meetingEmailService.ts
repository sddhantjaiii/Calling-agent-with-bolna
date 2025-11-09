/**
 * Meeting Email Service
 * 
 * Sends email notifications for calendar meetings.
 * Uses existing ZeptoMail SMTP configuration.
 * Includes full lead context in emails.
 */

import nodemailer from 'nodemailer';
import { CalendarMeetingInterface } from '../types/googleCalendar';
import CalendarMeeting from '../models/CalendarMeeting';
import { logger } from '../utils/logger';

interface MeetingEmailParams {
  recipientEmail: string;
  recipientName?: string;
  meetingTitle: string;
  meetingStartTime: Date;
  meetingEndTime: Date;
  meetingDescription: string;
  googleCalendarLink?: string;
  leadContext?: {
    name?: string;
    company?: string;
    phone?: string;
    tags?: string;
    recordingUrl?: string;
  };
}

class MeetingEmailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initializeTransporter();
  }

  /**
   * Initialize SMTP transporter using existing ZeptoMail config
   */
  private initializeTransporter(): void {
    try {
      const host = process.env.ZEPTOMAIL_HOST;
      const port = parseInt(process.env.ZEPTOMAIL_PORT || '587', 10);
      const user = process.env.ZEPTOMAIL_USER;
      const pass = process.env.ZEPTOMAIL_PASSWORD;
      const fromEmail = process.env.ZEPTOMAIL_FROM_EMAIL;

      if (!host || !user || !pass || !fromEmail) {
        logger.warn('⚠️ ZeptoMail configuration incomplete, email notifications will be disabled', {
          hasHost: !!host,
          hasUser: !!user,
          hasPass: !!pass,
          hasFromEmail: !!fromEmail
        });
        return;
      }

      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: {
          user,
          pass
        }
      });

      logger.info('✅ Meeting email service initialized with ZeptoMail');
    } catch (error) {
      logger.error('Failed to initialize meeting email service', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Send meeting invite email
   */
  async sendMeetingInviteEmail(
    meeting: CalendarMeetingInterface
  ): Promise<void> {
    try {
      if (!this.transporter) {
        logger.warn('Email transporter not initialized, skipping invite email', {
          meetingId: meeting.id
        });
        return;
      }

      logger.info('📧 Sending meeting invite email', {
        meetingId: meeting.id,
        attendeeEmail: meeting.attendee_email,
        meetingTitle: meeting.meeting_title
      });

      const emailHtml = this.buildInviteEmailHtml({
        recipientEmail: meeting.attendee_email,
        recipientName: meeting.attendee_name || undefined,
        meetingTitle: meeting.meeting_title,
        meetingStartTime: new Date(meeting.meeting_start_time),
        meetingEndTime: new Date(meeting.meeting_end_time),
        meetingDescription: meeting.meeting_description || '',
        googleCalendarLink: (meeting.google_api_response as any)?.htmlLink,
        leadContext: meeting.meeting_metadata as any
      });

      const emailText = this.buildInviteEmailText({
        recipientEmail: meeting.attendee_email,
        recipientName: meeting.attendee_name || undefined,
        meetingTitle: meeting.meeting_title,
        meetingStartTime: new Date(meeting.meeting_start_time),
        meetingEndTime: new Date(meeting.meeting_end_time),
        meetingDescription: meeting.meeting_description || '',
        googleCalendarLink: (meeting.google_api_response as any)?.htmlLink
      });

      await this.transporter.sendMail({
        from: process.env.ZEPTOMAIL_FROM_EMAIL!,
        to: meeting.attendee_email,
        subject: `📅 Demo Meeting Scheduled: ${meeting.meeting_title}`,
        text: emailText,
        html: emailHtml
      });

      // Mark email as sent in database
      await CalendarMeeting.markInviteEmailSent(meeting.id);

      logger.info('✅ Meeting invite email sent successfully', {
        meetingId: meeting.id,
        attendeeEmail: meeting.attendee_email
      });
    } catch (error) {
      logger.error('❌ Failed to send meeting invite email', {
        meetingId: meeting.id,
        attendeeEmail: meeting.attendee_email,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Don't throw - email failures shouldn't break meeting creation
    }
  }

  /**
   * Send meeting reschedule email
   */
  async sendMeetingRescheduleEmail(
    oldMeeting: CalendarMeetingInterface,
    newMeeting: CalendarMeetingInterface
  ): Promise<void> {
    try {
      if (!this.transporter) {
        logger.warn('Email transporter not initialized, skipping reschedule email');
        return;
      }

      logger.info('📧 Sending meeting reschedule email', {
        oldMeetingId: oldMeeting.id,
        newMeetingId: newMeeting.id,
        attendeeEmail: newMeeting.attendee_email
      });

      const emailHtml = this.buildRescheduleEmailHtml(oldMeeting, newMeeting);
      const emailText = this.buildRescheduleEmailText(oldMeeting, newMeeting);

      await this.transporter.sendMail({
        from: process.env.ZEPTOMAIL_FROM_EMAIL!,
        to: newMeeting.attendee_email,
        subject: `🔄 Demo Meeting Rescheduled: ${newMeeting.meeting_title}`,
        text: emailText,
        html: emailHtml
      });

      // Mark email as sent
      await CalendarMeeting.markInviteEmailSent(newMeeting.id);

      logger.info('✅ Meeting reschedule email sent successfully', {
        newMeetingId: newMeeting.id
      });
    } catch (error) {
      logger.error('❌ Failed to send meeting reschedule email', {
        newMeetingId: newMeeting.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Send meeting cancellation email
   */
  async sendMeetingCancellationEmail(
    meeting: CalendarMeetingInterface,
    reason?: string
  ): Promise<void> {
    try {
      if (!this.transporter) {
        logger.warn('Email transporter not initialized, skipping cancellation email');
        return;
      }

      logger.info('📧 Sending meeting cancellation email', {
        meetingId: meeting.id,
        attendeeEmail: meeting.attendee_email,
        reason
      });

      const emailHtml = this.buildCancellationEmailHtml(meeting, reason);
      const emailText = this.buildCancellationEmailText(meeting, reason);

      await this.transporter.sendMail({
        from: process.env.ZEPTOMAIL_FROM_EMAIL!,
        to: meeting.attendee_email,
        subject: `❌ Demo Meeting Cancelled: ${meeting.meeting_title}`,
        text: emailText,
        html: emailHtml
      });

      logger.info('✅ Meeting cancellation email sent successfully', {
        meetingId: meeting.id
      });
    } catch (error) {
      logger.error('❌ Failed to send meeting cancellation email', {
        meetingId: meeting.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Build HTML for meeting invite email
   */
  private buildInviteEmailHtml(params: MeetingEmailParams): string {
    const {
      recipientName,
      meetingTitle,
      meetingStartTime,
      meetingEndTime,
      meetingDescription,
      googleCalendarLink,
      leadContext
    } = params;

    const startTimeFormatted = this.formatDateTime(meetingStartTime);
    const endTimeFormatted = this.formatTime(meetingEndTime);

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .meeting-card { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .meeting-time { font-size: 24px; font-weight: bold; color: #667eea; margin: 15px 0; }
    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 15px 0; }
    .details { background: #f0f4ff; padding: 15px; border-radius: 5px; margin: 15px 0; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📅 Demo Meeting Scheduled</h1>
    </div>
    <div class="content">
      <p>Hi ${recipientName || 'there'},</p>
      <p>Your demo meeting has been scheduled! We're looking forward to connecting with you.</p>
      
      <div class="meeting-card">
        <h2>${meetingTitle}</h2>
        <div class="meeting-time">
          📅 ${startTimeFormatted}
        </div>
        <p>⏱️ Duration: ${this.calculateDuration(meetingStartTime, meetingEndTime)} minutes</p>
        
        ${googleCalendarLink ? `
        <a href="${googleCalendarLink}" class="button">📅 View in Google Calendar</a>
        ` : ''}
      </div>

      ${leadContext?.recordingUrl ? `
      <div class="details">
        <h3>📝 Meeting Context</h3>
        <p><strong>Based on your previous call:</strong></p>
        ${leadContext.company ? `<p>Company: ${leadContext.company}</p>` : ''}
        ${leadContext.phone ? `<p>Phone: ${leadContext.phone}</p>` : ''}
        ${leadContext.tags ? `<p>Status: ${leadContext.tags}</p>` : ''}
        ${leadContext.recordingUrl ? `
        <p><a href="${leadContext.recordingUrl}">🎙️ Listen to call recording</a></p>
        ` : ''}
      </div>
      ` : ''}

      <div class="details">
        <h3>📋 Meeting Details</h3>
        <pre style="white-space: pre-wrap; font-family: Arial, sans-serif;">${meetingDescription}</pre>
      </div>

      <p>Please let us know if you need to reschedule or have any questions.</p>
      
      <div class="footer">
        <p>This meeting was automatically scheduled by your AI Calling Agent Platform</p>
        <p>If you have any questions, please contact us.</p>
      </div>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Build plain text for meeting invite email
   */
  private buildInviteEmailText(params: MeetingEmailParams): string {
    const {
      recipientName,
      meetingTitle,
      meetingStartTime,
      meetingEndTime,
      meetingDescription,
      googleCalendarLink
    } = params;

    return `
Demo Meeting Scheduled
======================

Hi ${recipientName || 'there'},

Your demo meeting has been scheduled!

${meetingTitle}

Date & Time: ${this.formatDateTime(meetingStartTime)}
Duration: ${this.calculateDuration(meetingStartTime, meetingEndTime)} minutes

${googleCalendarLink ? `View in Google Calendar: ${googleCalendarLink}` : ''}

Meeting Details:
${meetingDescription}

Please let us know if you need to reschedule.

---
Scheduled automatically via AI Calling Agent Platform
    `.trim();
  }

  /**
   * Build HTML for reschedule email
   */
  private buildRescheduleEmailHtml(
    oldMeeting: CalendarMeetingInterface,
    newMeeting: CalendarMeetingInterface
  ): string {
    const oldTime = this.formatDateTime(new Date(oldMeeting.meeting_start_time));
    const newTime = this.formatDateTime(new Date(newMeeting.meeting_start_time));

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .time-change { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .old-time { text-decoration: line-through; color: #999; }
    .new-time { font-size: 24px; font-weight: bold; color: #f5576c; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔄 Meeting Rescheduled</h1>
    </div>
    <div class="content">
      <p>Hi ${newMeeting.attendee_name || 'there'},</p>
      <p>Your demo meeting has been rescheduled to a new time.</p>
      
      <div class="time-change">
        <h2>${newMeeting.meeting_title}</h2>
        <p class="old-time">Previous: ${oldTime}</p>
        <div class="new-time">📅 New: ${newTime}</div>
      </div>

      <p>Your calendar has been updated automatically. We look forward to meeting with you!</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Build plain text for reschedule email
   */
  private buildRescheduleEmailText(
    oldMeeting: CalendarMeetingInterface,
    newMeeting: CalendarMeetingInterface
  ): string {
    const oldTime = this.formatDateTime(new Date(oldMeeting.meeting_start_time));
    const newTime = this.formatDateTime(new Date(newMeeting.meeting_start_time));

    return `
Meeting Rescheduled
===================

Hi ${newMeeting.attendee_name || 'there'},

Your demo meeting has been rescheduled.

${newMeeting.meeting_title}

Previous Time: ${oldTime}
New Time: ${newTime}

Your calendar has been updated automatically.
    `.trim();
  }

  /**
   * Build HTML for cancellation email
   */
  private buildCancellationEmailHtml(
    meeting: CalendarMeetingInterface,
    reason?: string
  ): string {
    const timeFormatted = this.formatDateTime(new Date(meeting.meeting_start_time));

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #ff6b6b; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>❌ Meeting Cancelled</h1>
    </div>
    <div class="content">
      <p>Hi ${meeting.attendee_name || 'there'},</p>
      <p>Unfortunately, the following meeting has been cancelled:</p>
      
      <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h2>${meeting.meeting_title}</h2>
        <p><strong>Scheduled Time:</strong> ${timeFormatted}</p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
      </div>

      <p>We apologize for any inconvenience. Please contact us if you'd like to reschedule.</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Build plain text for cancellation email
   */
  private buildCancellationEmailText(
    meeting: CalendarMeetingInterface,
    reason?: string
  ): string {
    const timeFormatted = this.formatDateTime(new Date(meeting.meeting_start_time));

    return `
Meeting Cancelled
=================

Hi ${meeting.attendee_name || 'there'},

The following meeting has been cancelled:

${meeting.meeting_title}
Scheduled Time: ${timeFormatted}

${reason ? `Reason: ${reason}` : ''}

Please contact us if you'd like to reschedule.
    `.trim();
  }

  /**
   * Format date and time for display
   */
  private formatDateTime(date: Date): string {
    return date.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  }

  /**
   * Format time only
   */
  private formatTime(date: Date): string {
    return date.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  }

  /**
   * Calculate duration in minutes
   */
  private calculateDuration(start: Date, end: Date): number {
    return Math.round((end.getTime() - start.getTime()) / 60000);
  }
}

// Export singleton instance
export const meetingEmailService = new MeetingEmailService();
