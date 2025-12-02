-- Migration: Add Retry Logic to Call Campaigns
-- Description: Implements auto-callback retry functionality for busy/no-answer calls
-- Date: 2024-12-02

-- =====================================================
-- 1. Add Retry Configuration to Campaigns Table
-- =====================================================

-- Add max_retries column (number of retry attempts for busy/no-answer)
ALTER TABLE call_campaigns 
ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 0 
CHECK (max_retries >= 0 AND max_retries <= 5);

-- Add retry_interval_minutes column (gap between retries in minutes)
ALTER TABLE call_campaigns 
ADD COLUMN IF NOT EXISTS retry_interval_minutes INTEGER NOT NULL DEFAULT 60 
CHECK (retry_interval_minutes >= 1 AND retry_interval_minutes <= 1440);

-- Add comments
COMMENT ON COLUMN call_campaigns.max_retries IS 'Maximum number of auto-callback retries for busy/no-answer calls (0 = no retries, max 5)';
COMMENT ON COLUMN call_campaigns.retry_interval_minutes IS 'Time gap between retry attempts in minutes';

-- =====================================================
-- 2. Add Retry Tracking to Queue Table
-- =====================================================

-- Add retry_count to track how many times this contact has been retried
ALTER TABLE call_queue 
ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0 
CHECK (retry_count >= 0);

-- Add original_queue_id to link retry items to original queue item
ALTER TABLE call_queue 
ADD COLUMN IF NOT EXISTS original_queue_id UUID REFERENCES call_queue(id) ON DELETE SET NULL;

-- Add last_call_outcome to track why a retry was scheduled
ALTER TABLE call_queue 
ADD COLUMN IF NOT EXISTS last_call_outcome VARCHAR(20);

-- Add comments
COMMENT ON COLUMN call_queue.retry_count IS 'Number of retry attempts made for this contact';
COMMENT ON COLUMN call_queue.original_queue_id IS 'Reference to original queue item if this is a retry';
COMMENT ON COLUMN call_queue.last_call_outcome IS 'Outcome of last call attempt (busy, no-answer, failed)';

-- =====================================================
-- 3. Create Index for Retry Processing
-- =====================================================

-- Index to efficiently find items needing retry
CREATE INDEX IF NOT EXISTS idx_call_queue_retry_count ON call_queue(campaign_id, retry_count) 
WHERE status = 'queued' AND retry_count > 0;

-- =====================================================
-- Migration Complete
-- =====================================================
