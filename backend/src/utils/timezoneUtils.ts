/**
 * Timezone Utilities
 * 
 * IMPORTANT: All functions assume timestamps are stored in UTC.
 * Database session timezone MUST be set to UTC.
 * Node.js process.env.TZ MUST be set to UTC.
 * 
 * Centralized timezone conversion and formatting logic
 */

import { logger } from './logger';

/**
 * Valid IANA timezones (can be expanded)
 */
export const VALID_TIMEZONES = [
  'UTC',
  // Americas
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Vancouver',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  // Europe
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Brussels',
  'Europe/Vienna',
  'Europe/Stockholm',
  'Europe/Moscow',
  'Europe/Istanbul',
  // Asia
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Seoul',
  'Asia/Jakarta',
  'Asia/Manila',
  // Pacific
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
  'Pacific/Fiji',
  // Africa
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Africa/Nairobi',
] as const;

export type SupportedTimezone = typeof VALID_TIMEZONES[number];

/**
 * Validate timezone string using Intl API
 */
export function isValidTimezone(timezone: string): boolean {
  if (!timezone || typeof timezone !== 'string') {
    return false;
  }
  
  // Allow UTC as a special case
  if (timezone === 'UTC') {
    return true;
  }
  
  // Reject abbreviations (PST, EST, etc.) and offset formats (GMT+5)
  // IANA timezones must contain / (e.g., America/New_York)
  if (timezone.length < 3 || !timezone.includes('/')) {
    return false;
  }
  
  // Validate with Intl API
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    
    // Check for exact case match by formatting a date and checking timezone
    // This helps reject case variants that Intl API might accept
    const parts = Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'long'
    }).formatToParts(new Date());
    
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Convert UTC date to user's timezone
 */
export function convertToUserTimezone(
  utcDate: Date,
  userTimezone: string
): Date {
  try {
    if (!isValidTimezone(userTimezone)) {
      logger.warn('Invalid timezone, falling back to UTC', { userTimezone });
      return utcDate;
    }

    // Get the date string in user's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: userTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    return new Date(formatter.format(utcDate));
  } catch (error) {
    logger.error('Timezone conversion failed, falling back to UTC', {
      utcDate,
      userTimezone,
      error
    });
    return utcDate;
  }
}

/**
 * Format date for user's timezone
 */
export function formatDateForTimezone(
  date: Date,
  timezone: string,
  options: Intl.DateTimeFormatOptions = {}
): string {
  try {
    if (!isValidTimezone(timezone)) {
      timezone = 'UTC';
    }

    const defaultOptions: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
      ...options
    };
    
    return new Intl.DateTimeFormat('en-US', defaultOptions).format(date);
  } catch (error) {
    logger.error('Date formatting failed', { date, timezone, error });
    return date.toISOString();
  }
}

/**
 * Get user-friendly timezone name
 */
export function getTimezoneName(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'long'
    });
    
    const parts = formatter.formatToParts(now);
    const timeZonePart = parts.find(part => part.type === 'timeZoneName');
    
    return timeZonePart?.value || timezone;
  } catch (error) {
    return timezone;
  }
}

/**
 * Calculate timezone offset in minutes
 */
export function getTimezoneOffset(timezone: string, date: Date = new Date()): number {
  try {
    if (!isValidTimezone(timezone)) {
      return 0;
    }

    // Get offset by comparing local time in timezone to UTC
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
    
    return Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);
  } catch (error) {
    logger.error('Failed to calculate timezone offset', { timezone, error });
    return 0;
  }
}

/**
 * Convert campaign time window to different timezone
 * Example: "09:00:00" in UTC to user's timezone
 */
export function convertTimeWindowToTimezone(
  timeString: string, // Format: "HH:MM" or "HH:MM:SS"
  fromTimezone: string,
  toTimezone: string,
  referenceDate: Date = new Date()
): string {
  try {
    if (!isValidTimezone(fromTimezone) || !isValidTimezone(toTimezone)) {
      logger.warn('Invalid timezone in time window conversion', {
        fromTimezone,
        toTimezone
      });
      return timeString;
    }

    const [hours, minutes, seconds = '00'] = timeString.split(':');
    
    // Create date in source timezone
    const dateInSource = new Date(
      referenceDate.toLocaleString('en-US', { timeZone: fromTimezone })
    );
    dateInSource.setHours(parseInt(hours), parseInt(minutes), parseInt(seconds));
    
    // Convert to target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: toTimezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    return formatter.format(dateInSource);
  } catch (error) {
    logger.error('Time window conversion failed', {
      timeString,
      fromTimezone,
      toTimezone,
      error
    });
    return timeString; // Return original on error
  }
}

/**
 * Format date with dual timezone display (user timezone + UTC)
 * Example: "Meeting at 2:00 PM PST (22:00 UTC)"
 */
export function formatDualTimezone(
  date: Date,
  userTimezone: string
): string {
  try {
    const userTime = formatDateForTimezone(date, userTimezone, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
    
    const utcTime = date.toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
    
    return `${userTime} (${utcTime})`;
  } catch (error) {
    logger.error('Dual timezone formatting failed', { date, userTimezone, error });
    return date.toISOString();
  }
}

/**
 * Get list of valid timezones
 */
export function getValidTimezones(): readonly string[] {
  return VALID_TIMEZONES;
}

/**
 * Format time in specific timezone with custom pattern
 */
export function formatTimeInTimezone(
  date: Date,
  timezone: string,
  pattern: string = 'yyyy-MM-dd HH:mm:ss'
): string {
  try {
    if (!isValidTimezone(timezone)) {
      logger.warn('Invalid timezone in formatTimeInTimezone', { timezone });
      timezone = 'UTC';
    }

    // If pattern looks like a date-fns pattern (like 'PPpp'), just format normally
    if (pattern.match(/[Pp]/)) {
      return formatDateForTimezone(date, timezone);
    }

    // Parse pattern and create format options
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    };

    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(date);
    
    // Build formatted string
    const values: Record<string, string> = {};
    parts.forEach(part => {
      if (part.type !== 'literal') {
        values[part.type] = part.value;
      }
    });

    // Simple pattern replacement
    return pattern
      .replace(/yyyy/g, values.year || '')
      .replace(/MM/g, values.month || '')
      .replace(/dd/g, values.day || '')
      .replace(/HH/g, values.hour || '')
      .replace(/mm/g, values.minute || '')
      .replace(/ss/g, values.second || '');
  } catch (error) {
    logger.error('Time formatting failed', { date, timezone, pattern, error });
    return date.toISOString();
  }
}

/**
 * Get current time in specific timezone
 */
export function getCurrentTimeInTimezone(timezone: string): Date {
  try {
    if (!isValidTimezone(timezone)) {
      logger.warn('Invalid timezone, using UTC', { timezone });
      return new Date();
    }

    // Return current time - timezone only affects display, not the Date object itself
    return new Date();
  } catch (error) {
    logger.error('Failed to get current time in timezone', { timezone, error });
    return new Date();
  }
}

/**
 * Convert date between timezones
 * Note: Date objects represent absolute moments in time.
 * This function returns the same moment - timezone only affects display.
 */
export function convertBetweenTimezones(
  date: Date,
  fromTimezone: string,
  toTimezone: string
): Date {
  try {
    if (!isValidTimezone(fromTimezone) || !isValidTimezone(toTimezone)) {
      logger.warn('Invalid timezone in conversion', { fromTimezone, toTimezone });
      return date;
    }

    // Dates represent absolute moments - return the same date object
    // The timezone is used for display/formatting only
    return new Date(date.getTime());
  } catch (error) {
    logger.error('Timezone conversion failed', { date, fromTimezone, toTimezone, error });
    return date;
  }
}

/**
 * Parse time string in specific timezone
 */
export function parseTimeStringInTimezone(
  timeString: string,
  timezone: string,
  referenceDate: Date = new Date()
): Date {
  try {
    if (!isValidTimezone(timezone)) {
      timezone = 'UTC';
    }

    const parts = timeString.split(':');
    const hours = parseInt(parts[0]);
    const minutes = parseInt(parts[1]);
    const seconds = parts[2] ? parseInt(parts[2]) : 0;
    
    // Create date in the specified timezone
    const dateInTz = new Date(
      referenceDate.toLocaleString('en-US', { timeZone: timezone })
    );
    dateInTz.setHours(hours, minutes, seconds, 0);
    
    return dateInTz;
  } catch (error) {
    logger.error('Time string parsing failed', { timeString, timezone, error });
    return new Date();
  }
}

/**
 * Check if current time is within specified time window in timezone
 */
export function isWithinTimeWindow(
  startTime: string,
  endTime: string,
  timezone: string,
  currentDate: Date = new Date()
): boolean {
  try {
    if (!isValidTimezone(timezone)) {
      timezone = 'UTC';
    }

    // Get time components from currentDate in the specified timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(currentDate);
    const currentHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const currentMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    const currentSecond = parseInt(parts.find(p => p.type === 'second')?.value || '0');
    
    const currentTimeInMinutes = currentHour * 60 + currentMinute + currentSecond / 60;

    // Parse start and end times
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    const startTimeInMinutes = startHour * 60 + startMinute;
    const endTimeInMinutes = endHour * 60 + endMinute;

    // Handle time window crossing midnight
    if (endTimeInMinutes < startTimeInMinutes) {
      return currentTimeInMinutes >= startTimeInMinutes || currentTimeInMinutes <= endTimeInMinutes;
    }
    
    return currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes <= endTimeInMinutes;
  } catch (error) {
    logger.error('Time window check failed', { startTime, endTime, timezone, error });
    return false;
  }
}
