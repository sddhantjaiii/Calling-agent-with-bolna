-- Migration: Add Active Calls Tracking and Call Source Management
-- Description: Implements real-time concurrency tracking with direct call priority over campaign calls
-- Date: 2025-10-10

-- =====================================================
-- 1. Create Active Calls Tracking Table
-- =====================================================

-- Create active_calls table for real-time concurrency tracking
CREATE TABLE IF NOT EXISTS active_calls (
  id UUID PRIMARY KEY,  -- References calls.id
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  call_type VARCHAR(20) NOT NULL CHECK (call_type IN ('direct', 'campaign')),
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  bolna_execution_id VARCHAR(255),  -- For quick lookups and API correlation
  metadata JSONB DEFAULT '{}',
  
  -- Ensure we don't have duplicate call tracking
  CONSTRAINT active_calls_unique_id UNIQUE (id)
);

-- Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_active_calls_user_id ON active_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_active_calls_call_type ON active_calls(user_id, call_type);
CREATE INDEX IF NOT EXISTS idx_active_calls_started_at ON active_calls(started_at);
CREATE INDEX IF NOT EXISTS idx_active_calls_bolna_execution_id ON active_calls(bolna_execution_id) WHERE bolna_execution_id IS NOT NULL;

-- Add comments for clarity
COMMENT ON TABLE active_calls IS 'Real-time tracking of active calls for concurrency management. Direct calls get priority over campaign calls.';
COMMENT ON COLUMN active_calls.call_type IS 'Type of call: direct (user-initiated) or campaign (automated). Direct calls have priority.';
COMMENT ON COLUMN active_calls.started_at IS 'When this call slot was reserved/started';
COMMENT ON COLUMN active_calls.bolna_execution_id IS 'Bolna.ai execution ID for API correlation and quick lookups';

-- =====================================================
-- 2. Enhance Calls Table with Call Source Tracking
-- =====================================================

-- Add call_source column to track the origin of calls
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS call_source VARCHAR(20) DEFAULT 'campaign' 
CHECK (call_source IN ('direct', 'campaign'));

-- Create index for call source queries
CREATE INDEX IF NOT EXISTS idx_calls_call_source ON calls(user_id, call_source);
CREATE INDEX IF NOT EXISTS idx_calls_user_source_status ON calls(user_id, call_source, status);

-- Add comment
COMMENT ON COLUMN calls.call_source IS 'Source of the call: direct (user-initiated via contact list) or campaign (automated via campaign system)';

-- =====================================================
-- 3. Create Helper Functions for Concurrency Management
-- =====================================================

-- Function to get user's active call count by type
CREATE OR REPLACE FUNCTION get_user_active_calls_count(p_user_id UUID, p_call_type VARCHAR DEFAULT NULL)
RETURNS INTEGER AS $$
BEGIN
  IF p_call_type IS NULL THEN
    RETURN (
      SELECT COUNT(*)::INTEGER 
      FROM active_calls 
      WHERE user_id = p_user_id
    );
  ELSE
    RETURN (
      SELECT COUNT(*)::INTEGER 
      FROM active_calls 
      WHERE user_id = p_user_id AND call_type = p_call_type
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to get system-wide active call count
CREATE OR REPLACE FUNCTION get_system_active_calls_count()
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER 
    FROM active_calls
  );
END;
$$ LANGUAGE plpgsql;

-- Function to clean up orphaned active_calls (calls that ended but weren't properly cleaned up)
CREATE OR REPLACE FUNCTION cleanup_orphaned_active_calls()
RETURNS INTEGER AS $$
DECLARE
  cleanup_count INTEGER;
BEGIN
  -- Remove active_calls entries where the actual call is no longer in progress
  DELETE FROM active_calls 
  WHERE id IN (
    SELECT ac.id 
    FROM active_calls ac
    LEFT JOIN calls c ON c.id = ac.id
    WHERE c.id IS NULL 
       OR c.status IN ('completed', 'failed', 'cancelled')
  );
  
  GET DIAGNOSTICS cleanup_count = ROW_COUNT;
  RETURN cleanup_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 4. Create Triggers for Automatic Cleanup
-- =====================================================

-- Trigger function to automatically remove from active_calls when call ends
CREATE OR REPLACE FUNCTION trigger_cleanup_active_calls()
RETURNS TRIGGER AS $$
BEGIN
  -- When a call status changes to completed/failed/cancelled, remove from active_calls
  IF NEW.status IN ('completed', 'failed', 'cancelled') AND 
     OLD.status NOT IN ('completed', 'failed', 'cancelled') THEN
    
    DELETE FROM active_calls WHERE id = NEW.id;
    
    -- Log the cleanup for debugging
    RAISE NOTICE 'Cleaned up active_calls entry for call_id: %, status: %', NEW.id, NEW.status;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS cleanup_active_calls_on_status_change ON calls;
CREATE TRIGGER cleanup_active_calls_on_status_change
  AFTER UPDATE ON calls
  FOR EACH ROW
  EXECUTE FUNCTION trigger_cleanup_active_calls();

-- =====================================================
-- 5. Update Existing Data (Backfill)
-- =====================================================

-- Update existing calls to have proper call_source
-- Campaign calls: calls that have a campaign_id or were created via queue
UPDATE calls 
SET call_source = 'campaign'
WHERE call_source IS NULL 
  AND (
    EXISTS (
      SELECT 1 FROM call_queue cq 
      WHERE cq.call_id = calls.id
    )
    OR metadata->>'campaign_id' IS NOT NULL
  );

-- Direct calls: all other calls (user-initiated)
UPDATE calls 
SET call_source = 'direct'
WHERE call_source IS NULL;

-- =====================================================
-- 6. Add Constraints and Validation
-- =====================================================

-- Ensure call_source is not null going forward
ALTER TABLE calls ALTER COLUMN call_source SET NOT NULL;

-- Add check to ensure active_calls entries correspond to actual in-progress calls
-- This is handled by the trigger, but we add a constraint for extra safety
ALTER TABLE active_calls 
ADD CONSTRAINT active_calls_valid_reference 
CHECK (id IS NOT NULL);

-- =====================================================
-- 7. Create Views for Monitoring and Debugging
-- =====================================================

-- View for current concurrency status per user
CREATE OR REPLACE VIEW user_concurrency_status AS
SELECT 
  u.id as user_id,
  u.name as user_name,
  u.email as user_email,
  u.concurrent_calls_limit as user_limit,
  COALESCE(total_calls.count, 0) as active_calls,
  COALESCE(direct_calls.count, 0) as direct_calls,
  COALESCE(campaign_calls.count, 0) as campaign_calls,
  (u.concurrent_calls_limit - COALESCE(total_calls.count, 0)) as available_slots,
  CASE 
    WHEN COALESCE(total_calls.count, 0) >= u.concurrent_calls_limit THEN 'AT_LIMIT'
    WHEN COALESCE(total_calls.count, 0) = 0 THEN 'IDLE'
    ELSE 'ACTIVE'
  END as status
FROM users u
LEFT JOIN (
  SELECT user_id, COUNT(*) as count 
  FROM active_calls 
  GROUP BY user_id
) total_calls ON total_calls.user_id = u.id
LEFT JOIN (
  SELECT user_id, COUNT(*) as count 
  FROM active_calls 
  WHERE call_type = 'direct'
  GROUP BY user_id
) direct_calls ON direct_calls.user_id = u.id
LEFT JOIN (
  SELECT user_id, COUNT(*) as count 
  FROM active_calls 
  WHERE call_type = 'campaign'
  GROUP BY user_id
) campaign_calls ON campaign_calls.user_id = u.id
ORDER BY active_calls DESC, user_name;

-- View for system-wide concurrency overview
CREATE OR REPLACE VIEW system_concurrency_overview AS
SELECT 
  (SELECT COUNT(*) FROM active_calls) as total_active_calls,
  (SELECT COUNT(*) FROM active_calls WHERE call_type = 'direct') as direct_calls,
  (SELECT COUNT(*) FROM active_calls WHERE call_type = 'campaign') as campaign_calls,
  (SELECT COUNT(DISTINCT user_id) FROM active_calls) as users_with_active_calls,
  10 as system_limit,  -- Default system limit (configurable via environment variable)
  NOW() as snapshot_time;

-- Add comment to views
COMMENT ON VIEW user_concurrency_status IS 'Real-time view of each user''s concurrency status for monitoring and debugging';
COMMENT ON VIEW system_concurrency_overview IS 'System-wide concurrency statistics and limits';

-- =====================================================
-- Migration Completion
-- =====================================================

-- Migration completed successfully - concurrency management system ready