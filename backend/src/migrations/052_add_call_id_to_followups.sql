-- Migration: Add call_id to follow_ups table
-- This links follow-ups to specific calls for better tracking

-- Add call_id column with foreign key to calls table
ALTER TABLE follow_ups
ADD COLUMN call_id UUID REFERENCES calls(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX idx_follow_ups_call_id ON follow_ups(call_id);

-- Add comment to document the column
COMMENT ON COLUMN follow_ups.call_id IS 'Reference to the specific call that triggered this follow-up';
