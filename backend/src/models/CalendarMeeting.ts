/**
 * CalendarMeeting Model
 * 
 * Manages calendar meetings scheduled from AI call analysis.
 * Tracks meeting status, Google Calendar integration, and email notifications.
 */

import BaseModel, { BaseModelInterface } from './BaseModel';
import database from '../config/database';
import { 
  CalendarMeetingInterface, 
  CreateCalendarMeetingData,
  MeetingFilterOptions 
} from '../types/googleCalendar';

export { CalendarMeetingInterface };

export class CalendarMeeting extends BaseModel<CalendarMeetingInterface> {
  constructor() {
    super('calendar_meetings');
  }

  /**
   * Find all meetings for a specific user
   */
  async findByUser(userId: string, limit: number = 50): Promise<CalendarMeetingInterface[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE user_id = $1
      ORDER BY meeting_start_time DESC
      LIMIT $2
    `;
    
    const result = await database.query(query, [userId, limit]);
    return result.rows;
  }

  /**
   * Find meetings associated with a specific lead analytics record
   */
  async findByLeadAnalytics(
    leadAnalyticsId: string,
    userId: string
  ): Promise<CalendarMeetingInterface[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE lead_analytics_id = $1 
        AND user_id = $2
      ORDER BY created_at DESC
    `;
    
    const result = await database.query(query, [leadAnalyticsId, userId]);
    return result.rows;
  }

  /**
   * Find meetings for a specific contact
   */
  async findByContact(
    contactId: string, 
    userId: string
  ): Promise<CalendarMeetingInterface[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE contact_id = $1 
        AND user_id = $2
      ORDER BY meeting_start_time DESC
    `;
    
    const result = await database.query(query, [contactId, userId]);
    return result.rows;
  }

  /**
   * Find upcoming meetings for a user
   */
  async findUpcoming(
    userId: string,
    limit: number = 10
  ): Promise<CalendarMeetingInterface[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE user_id = $1
        AND status = 'scheduled'
        AND meeting_start_time > NOW()
      ORDER BY meeting_start_time ASC
      LIMIT $2
    `;
    
    const result = await database.query(query, [userId, limit]);
    return result.rows;
  }

  /**
   * Find past meetings for a user
   */
  async findPast(
    userId: string,
    limit: number = 50
  ): Promise<CalendarMeetingInterface[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE user_id = $1
        AND (
          meeting_start_time < NOW() 
          OR status IN ('completed', 'cancelled', 'rescheduled')
        )
      ORDER BY meeting_start_time DESC
      LIMIT $2
    `;
    
    const result = await database.query(query, [userId, limit]);
    return result.rows;
  }

  /**
   * Find meetings by Google event ID
   */
  async findByGoogleEventId(
    googleEventId: string,
    userId: string
  ): Promise<CalendarMeetingInterface | null> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE google_event_id = $1 
        AND user_id = $2
      LIMIT 1
    `;
    
    const result = await database.query(query, [googleEventId, userId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Find meetings with flexible filtering
   */
  async findWithFilters(options: MeetingFilterOptions): Promise<CalendarMeetingInterface[]> {
    const conditions: string[] = ['user_id = $1'];
    const values: any[] = [options.user_id];
    let paramIndex = 2;

    // Status filter
    if (options.status) {
      if (Array.isArray(options.status)) {
        const placeholders = options.status.map(() => `$${paramIndex++}`).join(', ');
        conditions.push(`status IN (${placeholders})`);
        values.push(...options.status);
      } else {
        conditions.push(`status = $${paramIndex++}`);
        values.push(options.status);
      }
    }

    // Date range filter
    if (options.from_date) {
      conditions.push(`meeting_start_time >= $${paramIndex++}`);
      values.push(options.from_date);
    }

    if (options.to_date) {
      conditions.push(`meeting_start_time <= $${paramIndex++}`);
      values.push(options.to_date);
    }

    // Contact filter
    if (options.contact_id) {
      conditions.push(`contact_id = $${paramIndex++}`);
      values.push(options.contact_id);
    }

    // Lead analytics filter
    if (options.lead_analytics_id) {
      conditions.push(`lead_analytics_id = $${paramIndex++}`);
      values.push(options.lead_analytics_id);
    }

    const query = `
      SELECT * FROM ${this.tableName}
      WHERE ${conditions.join(' AND ')}
      ORDER BY meeting_start_time DESC
      LIMIT $${paramIndex++}
      OFFSET $${paramIndex}
    `;

    values.push(options.limit || 50, options.offset || 0);

    const result = await database.query(query, values);
    return result.rows;
  }

  /**
   * Create a new calendar meeting record
   */
  async createMeeting(data: CreateCalendarMeetingData): Promise<CalendarMeetingInterface> {
    // Set defaults
    const meetingData = {
      ...data,
      meeting_duration_minutes: data.meeting_duration_minutes || 30,
      status: data.status || 'scheduled',
      google_calendar_id: data.google_calendar_id || 'primary',
      invite_email_sent: false,
      reminder_email_sent: false
    };

    return await this.create(meetingData as any);
  }

  /**
   * Mark meeting as completed
   */
  async markAsCompleted(meetingId: string, userId: string): Promise<CalendarMeetingInterface | null> {
    const query = `
      UPDATE ${this.tableName}
      SET status = 'completed', updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;
    
    const result = await database.query(query, [meetingId, userId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Mark meeting as cancelled
   */
  async markAsCancelled(
    meetingId: string,
    userId: string,
    reason: string
  ): Promise<CalendarMeetingInterface | null> {
    const query = `
      UPDATE ${this.tableName}
      SET status = 'cancelled', 
          cancellation_reason = $3,
          updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;
    
    const result = await database.query(query, [meetingId, userId, reason]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Mark meeting as rescheduled and link to new meeting
   */
  async markAsRescheduled(
    meetingId: string,
    userId: string
  ): Promise<CalendarMeetingInterface | null> {
    const query = `
      UPDATE ${this.tableName}
      SET status = 'rescheduled', updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;
    
    const result = await database.query(query, [meetingId, userId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Update meeting time (for rescheduling)
   */
  async updateMeetingTime(
    meetingId: string,
    userId: string,
    startTime: Date,
    endTime: Date
  ): Promise<CalendarMeetingInterface | null> {
    const query = `
      UPDATE ${this.tableName}
      SET meeting_start_time = $3,
          meeting_end_time = $4,
          updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;
    
    const result = await database.query(query, [meetingId, userId, startTime, endTime]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Mark invite email as sent
   */
  async markInviteEmailSent(meetingId: string): Promise<void> {
    const query = `
      UPDATE ${this.tableName}
      SET invite_email_sent = true, 
          invite_email_sent_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `;
    
    await database.query(query, [meetingId]);
  }

  /**
   * Mark reminder email as sent
   */
  async markReminderEmailSent(meetingId: string): Promise<void> {
    const query = `
      UPDATE ${this.tableName}
      SET reminder_email_sent = true, 
          reminder_email_sent_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `;
    
    await database.query(query, [meetingId]);
  }

  /**
   * Get meeting count by status for a user
   */
  async getCountByStatus(userId: string): Promise<Record<string, number>> {
    const query = `
      SELECT status, COUNT(*) as count
      FROM ${this.tableName}
      WHERE user_id = $1
      GROUP BY status
    `;
    
    const result = await database.query(query, [userId]);
    
    const counts: Record<string, number> = {};
    result.rows.forEach((row: any) => {
      counts[row.status] = parseInt(row.count);
    });
    
    return counts;
  }

  /**
   * Get meetings that need reminder emails (24 hours before start)
   */
  async findNeedingReminders(): Promise<CalendarMeetingInterface[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE status = 'scheduled'
        AND reminder_email_sent = false
        AND meeting_start_time > NOW()
        AND meeting_start_time <= NOW() + INTERVAL '24 hours'
      ORDER BY meeting_start_time ASC
    `;
    
    const result = await database.query(query);
    return result.rows;
  }

  /**
   * Delete old completed/cancelled meetings (cleanup)
   */
  async cleanupOldMeetings(daysOld: number = 90): Promise<number> {
    const query = `
      DELETE FROM ${this.tableName}
      WHERE status IN ('completed', 'cancelled')
        AND updated_at < NOW() - INTERVAL '${daysOld} days'
    `;
    
    const result = await database.query(query);
    return result.rowCount || 0;
  }
}

// Export singleton instance
export default new CalendarMeeting();
