-- Migration 1023: Plivo Dialer Phase-2 (Recording + Transcript + Contact Link + Timestamp Fixes)
-- Goal:
-- - Add contact linkage for plivo_calls
-- - Fix lifecycle timestamps so KPIs are accurate (started_at should not default to created_at)
-- - Persist Plivo recording callback data and Whisper transcription output

BEGIN;

-- 1) Add contact linkage
ALTER TABLE plivo_calls
  ADD COLUMN IF NOT EXISTS contact_id UUID NULL REFERENCES contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_plivo_calls_contact_id ON plivo_calls(contact_id);

-- 2) Add initiated_at (keep created_at as audit, initiated_at as call-log creation time)
ALTER TABLE plivo_calls
  ADD COLUMN IF NOT EXISTS initiated_at TIMESTAMPTZ NULL;

-- Backfill initiated_at from created_at for existing rows
UPDATE plivo_calls
SET initiated_at = COALESCE(initiated_at, created_at)
WHERE initiated_at IS NULL;

ALTER TABLE plivo_calls
  ALTER COLUMN initiated_at SET NOT NULL;

ALTER TABLE plivo_calls
  ALTER COLUMN initiated_at SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_plivo_calls_user_initiated_at
  ON plivo_calls(user_id, initiated_at DESC);

-- 3) Fix started_at so it reflects real call start (ringing/calling/answered), not insert time
-- Previously: started_at NOT NULL DEFAULT CURRENT_TIMESTAMP
ALTER TABLE plivo_calls
  ALTER COLUMN started_at DROP DEFAULT;

ALTER TABLE plivo_calls
  ALTER COLUMN started_at DROP NOT NULL;

-- Optional cleanup: if a row was never progressed beyond initiated, null out started_at
UPDATE plivo_calls
SET started_at = NULL
WHERE status = 'initiated' AND started_at IS NOT NULL;

-- 4) Recording metadata + raw payload
ALTER TABLE plivo_calls
  ADD COLUMN IF NOT EXISTS recording_id VARCHAR(128) NULL,
  ADD COLUMN IF NOT EXISTS recording_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS recording_format VARCHAR(16) NULL,
  ADD COLUMN IF NOT EXISTS recording_duration_seconds INTEGER NULL,
  ADD COLUMN IF NOT EXISTS recording_status VARCHAR(32) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS raw_recording_payload JSONB NULL;

CREATE INDEX IF NOT EXISTS idx_plivo_calls_recording_status
  ON plivo_calls(user_id, recording_status);

-- 5) Transcript fields (Whisper)
ALTER TABLE plivo_calls
  ADD COLUMN IF NOT EXISTS transcript_text TEXT NULL,
  ADD COLUMN IF NOT EXISTS transcript_status VARCHAR(32) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS transcript_error TEXT NULL,
  ADD COLUMN IF NOT EXISTS transcript_created_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS transcript_updated_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_plivo_calls_transcript_status
  ON plivo_calls(user_id, transcript_status);

COMMIT;
