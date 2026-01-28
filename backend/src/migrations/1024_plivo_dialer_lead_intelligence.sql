-- Migration: Add lead intelligence extraction storage for plivo_calls (dialer)
-- Runs after Whisper transcription completes.

ALTER TABLE plivo_calls
  ADD COLUMN IF NOT EXISTS lead_extraction_status VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS lead_extraction_started_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS lead_extraction_completed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS lead_extraction_updated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS lead_extraction_error TEXT NULL,
  ADD COLUMN IF NOT EXISTS lead_individual_analysis JSONB NULL,
  ADD COLUMN IF NOT EXISTS lead_complete_analysis JSONB NULL;

CREATE INDEX IF NOT EXISTS idx_plivo_calls_lead_extraction_status
  ON plivo_calls(user_id, lead_extraction_status);
