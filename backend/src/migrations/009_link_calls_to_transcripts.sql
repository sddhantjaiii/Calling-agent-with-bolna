-- Migration 009: Link calls to transcripts table properly
-- Date: October 8, 2025
-- Purpose: Add transcript_id foreign key to calls table, remove direct transcript column

-- Add transcript_id foreign key to calls table
ALTER TABLE calls
ADD COLUMN IF NOT EXISTS transcript_id UUID REFERENCES transcripts(id) ON DELETE SET NULL;

-- Remove the direct transcript column (migration 008 approach - reverting to proper design)
ALTER TABLE calls
DROP COLUMN IF EXISTS transcript;

-- Add index for quick transcript lookup
CREATE INDEX IF NOT EXISTS idx_calls_transcript_id 
ON calls(transcript_id) 
WHERE transcript_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN calls.transcript_id IS 
'Foreign key to transcripts table. Transcript saved when webhook status = "call-disconnected" (stage 4)';

