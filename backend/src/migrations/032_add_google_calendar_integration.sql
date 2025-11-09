-- Migration 032: Add Google Calendar Integration Support
-- Created: November 9, 2025
-- Purpose: Enable users to connect their Google Calendar and auto-schedule meetings from AI call analysis

-- ============================================================================
-- PART 1: Add Google Calendar columns to users table
-- ============================================================================

-- Add OAuth token storage columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_token_expiry TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_calendar_connected BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_calendar_id VARCHAR(255) DEFAULT 'primary';
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_email VARCHAR(255);

-- Add index for quick lookup of connected users
CREATE INDEX IF NOT EXISTS idx_users_google_connected 
  ON users(google_calendar_connected) 
  WHERE google_calendar_connected = TRUE;

-- Add index for OAuth operations
CREATE INDEX IF NOT EXISTS idx_users_google_email 
  ON users(google_email) 
  WHERE google_email IS NOT NULL;

-- Add comments
COMMENT ON COLUMN users.google_access_token IS 'Google OAuth access token for Calendar API (short-lived, ~1 hour)';
COMMENT ON COLUMN users.google_refresh_token IS 'Google OAuth refresh token for obtaining new access tokens (long-lived)';
COMMENT ON COLUMN users.google_token_expiry IS 'Timestamp when the current access token expires';
COMMENT ON COLUMN users.google_calendar_connected IS 'Whether user has successfully connected their Google Calendar';
COMMENT ON COLUMN users.google_calendar_id IS 'Google Calendar ID to use (default: primary calendar)';
COMMENT ON COLUMN users.google_email IS 'Google account email address used for Calendar integration';

-- ============================================================================
-- PART 2: Create calendar_meetings table
-- ============================================================================

CREATE TABLE IF NOT EXISTS calendar_meetings (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relationships (Foreign Keys with proper data isolation)
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lead_analytics_id UUID REFERENCES lead_analytics(id) ON DELETE SET NULL,
  call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  
  -- Google Calendar integration data
  google_event_id VARCHAR(255) NOT NULL,
  google_calendar_id VARCHAR(255) NOT NULL DEFAULT 'primary',
  
  -- Meeting details
  meeting_title VARCHAR(500) NOT NULL,
  meeting_description TEXT,
  attendee_email VARCHAR(255) NOT NULL,
  attendee_name VARCHAR(255),
  
  -- Scheduling information
  meeting_start_time TIMESTAMPTZ NOT NULL,
  meeting_end_time TIMESTAMPTZ NOT NULL,
  meeting_duration_minutes INTEGER DEFAULT 30,
  timezone VARCHAR(100),
  
  -- Status tracking
  status VARCHAR(50) DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'cancelled', 'rescheduled', 'completed')),
  cancellation_reason TEXT,
  rescheduled_from_meeting_id UUID REFERENCES calendar_meetings(id) ON DELETE SET NULL,
  
  -- Email tracking
  invite_email_sent BOOLEAN DEFAULT FALSE,
  invite_email_sent_at TIMESTAMPTZ,
  reminder_email_sent BOOLEAN DEFAULT FALSE,
  reminder_email_sent_at TIMESTAMPTZ,
  
  -- Metadata storage
  google_api_response JSONB,
  meeting_metadata JSONB,
  
  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  
  -- Constraints
  CONSTRAINT calendar_meetings_time_check CHECK(meeting_end_time > meeting_start_time),
  CONSTRAINT calendar_meetings_duration_positive CHECK(meeting_duration_minutes > 0),
  CONSTRAINT calendar_meetings_user_event_unique UNIQUE(user_id, google_event_id)
);

-- ============================================================================
-- PART 3: Create indexes for performance
-- ============================================================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_calendar_meetings_user 
  ON calendar_meetings(user_id);

CREATE INDEX IF NOT EXISTS idx_calendar_meetings_lead_analytics 
  ON calendar_meetings(lead_analytics_id) 
  WHERE lead_analytics_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_meetings_call 
  ON calendar_meetings(call_id) 
  WHERE call_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_meetings_contact 
  ON calendar_meetings(contact_id) 
  WHERE contact_id IS NOT NULL;

-- Status and time-based indexes
CREATE INDEX IF NOT EXISTS idx_calendar_meetings_status 
  ON calendar_meetings(status) 
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_calendar_meetings_start_time 
  ON calendar_meetings(meeting_start_time);

-- Index for upcoming meetings (without NOW() function in predicate)
CREATE INDEX IF NOT EXISTS idx_calendar_meetings_user_upcoming 
  ON calendar_meetings(user_id, meeting_start_time, status) 
  WHERE status = 'scheduled';

-- Google Calendar operation index
CREATE INDEX IF NOT EXISTS idx_calendar_meetings_google_event 
  ON calendar_meetings(google_event_id);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_calendar_meetings_user_status_time 
  ON calendar_meetings(user_id, status, meeting_start_time DESC);

-- ============================================================================
-- PART 4: Create trigger for updated_at
-- ============================================================================

CREATE TRIGGER update_calendar_meetings_updated_at
  BEFORE UPDATE ON calendar_meetings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 5: Add table and column comments
-- ============================================================================

COMMENT ON TABLE calendar_meetings IS 
'Tracks Google Calendar meetings scheduled from AI call analysis. Supports auto-scheduling, rescheduling, and cancellation.';

COMMENT ON COLUMN calendar_meetings.google_event_id IS 
'Google Calendar event ID for API operations (update, cancel). Required for all Google Calendar operations.';

COMMENT ON COLUMN calendar_meetings.google_calendar_id IS 
'Which Google Calendar to use (usually ''primary''). Allows multi-calendar support.';

COMMENT ON COLUMN calendar_meetings.meeting_title IS 
'Meeting title format: "{lead_name} + {company_name} + Demo"';

COMMENT ON COLUMN calendar_meetings.meeting_description IS 
'Full lead context including: tags, reasoning, recording link, transcript, and AI analysis summary';

COMMENT ON COLUMN calendar_meetings.attendee_email IS 
'Email to invite (prioritizes contact.email over lead_analytics.extracted_email)';

COMMENT ON COLUMN calendar_meetings.status IS 
'Lifecycle: scheduled (active), cancelled (user cancelled), rescheduled (moved to new time), completed (meeting happened)';

COMMENT ON COLUMN calendar_meetings.rescheduled_from_meeting_id IS 
'If this is a rescheduled meeting, links back to the original meeting record for history tracking';

COMMENT ON COLUMN calendar_meetings.invite_email_sent IS 
'Whether initial meeting invite email was sent to user (with full lead context)';

COMMENT ON COLUMN calendar_meetings.google_api_response IS 
'Stores full Google Calendar API response for debugging and reference';

COMMENT ON COLUMN calendar_meetings.meeting_metadata IS 
'Additional context: lead scores, tags, CTA interactions, smart notifications';

-- ============================================================================
-- PART 6: Grant necessary permissions (if using specific database roles)
-- ============================================================================

-- Grant SELECT, INSERT, UPDATE, DELETE on new columns/table to application role
-- Adjust role name as needed for your setup
-- GRANT SELECT, INSERT, UPDATE, DELETE ON calendar_meetings TO your_app_role;
-- GRANT SELECT, UPDATE ON users TO your_app_role;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 032 completed successfully!';
  RAISE NOTICE '📅 Google Calendar Integration tables and columns created';
  RAISE NOTICE '🔒 Data isolation constraints applied';
  RAISE NOTICE '⚡ Performance indexes created';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Configure Google OAuth in .env';
  RAISE NOTICE '2. Restart backend server';
  RAISE NOTICE '3. Test OAuth flow: Connect Calendar button';
  RAISE NOTICE '4. Verify auto-scheduling after AI extraction';
END $$;
