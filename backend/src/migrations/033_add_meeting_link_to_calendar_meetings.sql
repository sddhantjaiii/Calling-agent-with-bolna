-- Migration 033: Add meeting link to calendar_meetings table
-- Created: November 9, 2025
-- Purpose: Store Google Meet/Hangout link for easy access from Lead Intelligence

-- Add meeting_link column to store the Google Meet URL
ALTER TABLE calendar_meetings ADD COLUMN IF NOT EXISTS meeting_link TEXT;

-- Add index for quick lookup
CREATE INDEX IF NOT EXISTS idx_calendar_meetings_meeting_link 
  ON calendar_meetings(meeting_link) 
  WHERE meeting_link IS NOT NULL;

-- Add comment
COMMENT ON COLUMN calendar_meetings.meeting_link IS 'Google Meet/Hangout link for the meeting (e.g., https://meet.google.com/xxx-yyyy-zzz)';
