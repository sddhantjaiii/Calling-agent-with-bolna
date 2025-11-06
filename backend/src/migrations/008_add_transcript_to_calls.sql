-- Migration 008: Add transcript to calls table and optimize webhook processing
-- Date: October 8, 2025
-- Purpose: Add transcript column directly to calls table for faster webhook processing

-- Add transcript column to calls table (currently in separate transcripts table)
ALTER TABLE calls
ADD COLUMN IF NOT EXISTS transcript TEXT;

-- Add index for searching transcripts
CREATE INDEX IF NOT EXISTS idx_calls_transcript_search 
ON calls USING gin(to_tsvector('english', transcript)) 
WHERE transcript IS NOT NULL;

-- Migrate existing transcripts from transcripts table to calls table
UPDATE calls c
SET transcript = t.content
FROM transcripts t
WHERE c.id = t.call_id
  AND c.transcript IS NULL;

-- Add comment
COMMENT ON COLUMN calls.transcript IS 
'Full call transcript in plain text format. Received from Bolna.ai webhook stage 4 (call-disconnected). Format: "speaker: message\nspeaker: message"';

