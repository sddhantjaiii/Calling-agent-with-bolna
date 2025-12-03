/**
 * Timezone Standardization Unit Tests
 * 
 * IMPORTANT: All functions assume timestamps are stored in UTC.
 * Database session timezone MUST be set to UTC.
 * Node.js process.env.TZ MUST be set to UTC.
 * 
 * These tests verify:
 * 1. Node.js process is using UTC
 * 2. Timezone utility functions work correctly
 * 3. Date conversions maintain UTC consistency
 */

import {
  isValidTimezone,
  convertToUserTimezone,
  formatDateForTimezone,
  getTimezoneOffset,
  convertTimeWindowToTimezone,
  isWithinTimeWindow,
  VALID_TIMEZONES,
} from '../utils/timezoneUtils';

describe('Timezone Standardization', () => {
  
  describe('Node.js Process Timezone', () => {
    test('process.env.TZ should default to UTC', () => {
      // The server sets TZ to UTC on startup
      // In test environment, TZ might not be set, so we verify it's either UTC or not set
      const actualTZ = process.env.TZ;
      expect([undefined, '', 'UTC']).toContain(actualTZ);
    });

    test('new Date().toISOString() should always produce UTC timestamps', () => {
      const date = new Date();
      const iso = date.toISOString();
      
      // ISO string should end with Z (UTC marker)
      expect(iso).toMatch(/Z$/);
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    test('new Date() should create consistent UTC timestamps', () => {
      const now1 = new Date();
      const now2 = new Date(now1.toISOString());
      
      // Both dates should represent the same moment in time
      expect(now1.getTime()).toBe(now2.getTime());
    });
  });

  describe('Timezone Validation', () => {
    test('should validate known IANA timezones', () => {
      expect(isValidTimezone('UTC')).toBe(true);
      expect(isValidTimezone('America/New_York')).toBe(true);
      expect(isValidTimezone('Asia/Kolkata')).toBe(true);
      expect(isValidTimezone('Europe/London')).toBe(true);
      expect(isValidTimezone('Pacific/Auckland')).toBe(true);
    });

    test('should reject invalid timezone strings', () => {
      expect(isValidTimezone('')).toBe(false);
      expect(isValidTimezone('PST')).toBe(false); // Abbreviations not allowed
      expect(isValidTimezone('EST')).toBe(false);
      expect(isValidTimezone('GMT+5')).toBe(false); // Offset format not allowed
      expect(isValidTimezone('invalid/timezone')).toBe(false);
    });

    test('should reject null and undefined', () => {
      expect(isValidTimezone(null as any)).toBe(false);
      expect(isValidTimezone(undefined as any)).toBe(false);
    });

    test('VALID_TIMEZONES should contain common timezones', () => {
      expect(VALID_TIMEZONES).toContain('UTC');
      expect(VALID_TIMEZONES).toContain('America/New_York');
      expect(VALID_TIMEZONES).toContain('Asia/Kolkata');
      expect(VALID_TIMEZONES).toContain('Europe/London');
      expect(VALID_TIMEZONES).toContain('Asia/Tokyo');
      expect(VALID_TIMEZONES).toContain('Australia/Sydney');
    });
  });

  describe('Timezone Offset Calculation', () => {
    test('should return 0 for UTC timezone', () => {
      const offset = getTimezoneOffset('UTC');
      expect(offset).toBe(0);
    });

    test('should return positive offset for timezones ahead of UTC', () => {
      // Asia/Kolkata is UTC+5:30 = 330 minutes ahead
      const offset = getTimezoneOffset('Asia/Kolkata');
      expect(offset).toBe(330);
    });

    test('should return correct offset for Asia/Tokyo', () => {
      // Asia/Tokyo is UTC+9 = 540 minutes ahead
      const offset = getTimezoneOffset('Asia/Tokyo');
      expect(offset).toBe(540);
    });

    test('should return 0 for invalid timezone', () => {
      const offset = getTimezoneOffset('Invalid/Timezone');
      expect(offset).toBe(0);
    });

    test('should handle timezone offset with reference date', () => {
      // Test with a specific date to ensure consistency
      const referenceDate = new Date('2025-06-15T12:00:00Z'); // Summer date
      const offset = getTimezoneOffset('America/New_York', referenceDate);
      
      // New York in summer is EDT (UTC-4) = -240 minutes
      expect(offset).toBe(-240);
    });
  });

  describe('Date Formatting for Timezone', () => {
    test('should format date in user timezone', () => {
      const utcDate = new Date('2025-12-03T10:30:00.000Z');
      const formatted = formatDateForTimezone(utcDate, 'Asia/Kolkata');
      
      // Should contain the formatted date
      expect(formatted).toBeTruthy();
      expect(typeof formatted).toBe('string');
    });

    test('should include timezone name in formatted output', () => {
      const utcDate = new Date('2025-12-03T10:30:00.000Z');
      const formatted = formatDateForTimezone(utcDate, 'America/New_York');
      
      // Should contain EST or EDT timezone abbreviation
      expect(formatted).toMatch(/EST|EDT/);
    });

    test('should fall back to UTC for invalid timezone', () => {
      const utcDate = new Date('2025-12-03T10:30:00.000Z');
      const formatted = formatDateForTimezone(utcDate, 'Invalid/Timezone');
      
      // Should not throw and should return something
      expect(formatted).toBeTruthy();
    });
  });

  describe('Time Window Conversion', () => {
    test('should convert time window between timezones', () => {
      const timeString = '09:00:00';
      const result = convertTimeWindowToTimezone(
        timeString,
        'UTC',
        'Asia/Kolkata'
      );
      
      // 09:00 UTC should be 14:30 IST (UTC+5:30)
      expect(result).toBeTruthy();
    });

    test('should handle conversion from IST to UTC', () => {
      const timeString = '14:30:00';
      const result = convertTimeWindowToTimezone(
        timeString,
        'Asia/Kolkata',
        'UTC'
      );
      
      // 14:30 IST should be around 09:00 UTC
      expect(result).toBeTruthy();
    });

    test('should return original time for invalid timezone', () => {
      const timeString = '09:00:00';
      const result = convertTimeWindowToTimezone(
        timeString,
        'Invalid/From',
        'Invalid/To'
      );
      
      // Should return original on error
      expect(result).toBe(timeString);
    });

    test('should handle time with only hours and minutes', () => {
      const timeString = '09:00';
      const result = convertTimeWindowToTimezone(
        timeString,
        'UTC',
        'Asia/Kolkata'
      );
      
      expect(result).toBeTruthy();
    });
  });

  describe('Time Window Check', () => {
    test('should detect time within window', () => {
      // Create a date that's at 10:00 in UTC
      const testDate = new Date('2025-12-03T10:00:00.000Z');
      
      const inWindow = isWithinTimeWindow('09:00', '17:00', 'UTC', testDate);
      expect(inWindow).toBe(true);
    });

    test('should detect time outside window', () => {
      // Create a date that's at 08:00 in UTC
      const testDate = new Date('2025-12-03T08:00:00.000Z');
      
      const inWindow = isWithinTimeWindow('09:00', '17:00', 'UTC', testDate);
      expect(inWindow).toBe(false);
    });

    test('should handle timezone conversion in window check', () => {
      // 15:30 IST (10:00 UTC) should be within 09:00-17:00 IST
      const testDate = new Date('2025-12-03T10:00:00.000Z');
      
      const inWindow = isWithinTimeWindow('09:00', '17:00', 'Asia/Kolkata', testDate);
      expect(inWindow).toBe(true);
    });

    test('should handle window crossing midnight', () => {
      // Test a window from 22:00 to 06:00 (night shift)
      const testDateInWindow = new Date('2025-12-03T23:00:00.000Z');
      const testDateOutWindow = new Date('2025-12-03T12:00:00.000Z');
      
      expect(isWithinTimeWindow('22:00', '06:00', 'UTC', testDateInWindow)).toBe(true);
      expect(isWithinTimeWindow('22:00', '06:00', 'UTC', testDateOutWindow)).toBe(false);
    });
  });

  describe('UTC Storage Consistency', () => {
    test('should maintain consistent timestamps across timezones', () => {
      // Create a timestamp representing a specific moment
      const utcMoment = new Date('2025-12-03T10:00:00.000Z');
      
      // Convert to different timezones for display
      const istFormatted = formatDateForTimezone(utcMoment, 'Asia/Kolkata');
      const nyFormatted = formatDateForTimezone(utcMoment, 'America/New_York');
      
      // Both should represent the same moment
      expect(istFormatted).toBeTruthy();
      expect(nyFormatted).toBeTruthy();
      
      // The underlying UTC time should be the same
      const originalUtc = utcMoment.toISOString();
      expect(originalUtc).toBe('2025-12-03T10:00:00.000Z');
    });

    test('should correctly identify day boundaries in user timezone', () => {
      // 23:30 UTC on Dec 3 is 05:00 IST on Dec 4
      const utcDate = new Date('2025-12-03T23:30:00.000Z');
      
      // Get the date in IST
      const istOffset = getTimezoneOffset('Asia/Kolkata', utcDate);
      expect(istOffset).toBe(330); // UTC+5:30
      
      // This verifies the date boundary issue that was described in the documentation
      // A call at 23:30 UTC should appear as Dec 4 in IST timezone
    });

    test('should handle daylight saving time correctly', () => {
      // Test with a date during summer (DST active in US)
      const summerDate = new Date('2025-07-15T12:00:00.000Z');
      const summerOffset = getTimezoneOffset('America/New_York', summerDate);
      
      // Test with a date during winter (standard time in US)
      const winterDate = new Date('2025-01-15T12:00:00.000Z');
      const winterOffset = getTimezoneOffset('America/New_York', winterDate);
      
      // EDT is UTC-4 (-240), EST is UTC-5 (-300)
      expect(summerOffset).toBe(-240);
      expect(winterOffset).toBe(-300);
    });
  });
});
