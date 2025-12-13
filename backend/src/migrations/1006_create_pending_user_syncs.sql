-- Migration: Create pending_user_syncs table for Chat Agent Server sync retry logic
-- This table tracks user sync attempts to the Chat Agent Server (WhatsApp microservice)
-- Retry schedule: immediate → 60 minutes → 12 hours

-- Create the pending_user_syncs table
CREATE TABLE IF NOT EXISTS pending_user_syncs (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    next_retry_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_error TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create index for efficient retry queue processing
CREATE INDEX IF NOT EXISTS idx_pending_user_syncs_next_retry 
ON pending_user_syncs(next_retry_at) 
WHERE status = 'pending';

-- Create index for status filtering
CREATE INDEX IF NOT EXISTS idx_pending_user_syncs_status 
ON pending_user_syncs(status);

-- Add comment for documentation
COMMENT ON TABLE pending_user_syncs IS 'Tracks pending user sync attempts to Chat Agent Server with retry logic';
COMMENT ON COLUMN pending_user_syncs.attempt_number IS 'Current attempt number (1-3), retry intervals: immediate, 60min, 12h';
COMMENT ON COLUMN pending_user_syncs.next_retry_at IS 'When the next retry should be attempted';
COMMENT ON COLUMN pending_user_syncs.status IS 'pending = waiting for retry, failed = max retries exceeded';
