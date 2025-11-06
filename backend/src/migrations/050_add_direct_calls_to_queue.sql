-- Migration: Add Direct Calls to Queue System
-- Description: Extend call_queue table to support both direct and campaign calls
-- Date: 2025-10-10

-- =====================================================
-- 1. Add call_type Column
-- =====================================================

-- Add call_type to distinguish between direct and campaign calls
ALTER TABLE call_queue 
ADD COLUMN IF NOT EXISTS call_type VARCHAR(20) NOT NULL DEFAULT 'campaign' 
CHECK (call_type IN ('direct', 'campaign'));

-- Add index for call_type queries
CREATE INDEX IF NOT EXISTS idx_call_queue_call_type ON call_queue(user_id, call_type, status);
CREATE INDEX IF NOT EXISTS idx_call_queue_type_priority ON call_queue(user_id, call_type, priority DESC, "position" ASC) WHERE status = 'queued';

-- Add comment
COMMENT ON COLUMN call_queue.call_type IS 'Type of call: direct (user-initiated, high priority) or campaign (automated, standard priority)';

-- =====================================================
-- 2. Make campaign_id Nullable for Direct Calls
-- =====================================================

-- Drop the NOT NULL constraint on campaign_id since direct calls won't have a campaign
ALTER TABLE call_queue 
ALTER COLUMN campaign_id DROP NOT NULL;

-- Add a check constraint to ensure campaign calls have campaign_id
ALTER TABLE call_queue
ADD CONSTRAINT call_queue_campaign_id_check 
CHECK (
  (call_type = 'campaign' AND campaign_id IS NOT NULL) OR
  (call_type = 'direct' AND campaign_id IS NULL)
);

COMMENT ON CONSTRAINT call_queue_campaign_id_check ON call_queue IS 
'Ensures campaign calls have campaign_id and direct calls do not';

-- =====================================================
-- 3. Update Existing Unique Constraint
-- =====================================================

-- Drop old constraint that only applies to campaigns
ALTER TABLE call_queue
DROP CONSTRAINT IF EXISTS call_queue_campaign_contact_unique;

-- Add new constraint that works for both types
-- For campaigns: one contact per campaign
-- For direct calls: allow duplicate contacts (user can call same contact multiple times)
CREATE UNIQUE INDEX IF NOT EXISTS idx_call_queue_campaign_contact_unique 
ON call_queue(campaign_id, contact_id) 
WHERE call_type = 'campaign' AND status IN ('queued', 'processing');

COMMENT ON INDEX idx_call_queue_campaign_contact_unique IS 
'Ensures each contact appears only once per active campaign, does not apply to direct calls';

-- =====================================================
-- 4. Add Helper Functions for Direct Call Queue
-- =====================================================

-- Function to get next direct call for a user
CREATE OR REPLACE FUNCTION get_next_direct_call_queued(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  agent_id UUID,
  contact_id UUID,
  phone_number VARCHAR(50),
  contact_name VARCHAR(255),
  user_data JSONB,
  call_type VARCHAR(20),
  priority INTEGER,
  "position" INTEGER,
  scheduled_for TIMESTAMPTZ,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    q.id,
    q.user_id,
    q.agent_id,
    q.contact_id,
    q.phone_number,
    q.contact_name,
    q.user_data,
    q.call_type,
    q.priority,
    q."position",
    q.scheduled_for,
    q.created_at
  FROM call_queue q
  WHERE q.user_id = p_user_id
    AND q.call_type = 'direct'
    AND q.status = 'queued'
    AND q.scheduled_for <= NOW()
  ORDER BY q.priority DESC, q."position" ASC, q.created_at ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to count direct calls in queue for a user
CREATE OR REPLACE FUNCTION count_user_direct_calls_queued(p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM call_queue
    WHERE user_id = p_user_id
      AND call_type = 'direct'
      AND status = 'queued'
  );
END;
$$ LANGUAGE plpgsql;

-- Function to get position in queue for a call
CREATE OR REPLACE FUNCTION get_call_queue_position(p_queue_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_user_id UUID;
  v_call_type VARCHAR(20);
  v_priority INTEGER;
  v_position INTEGER;
  v_created_at TIMESTAMPTZ;
  queue_position INTEGER;
BEGIN
  -- Get the call details
  SELECT user_id, call_type, priority, "position", created_at
  INTO v_user_id, v_call_type, v_priority, v_position, v_created_at
  FROM call_queue
  WHERE id = p_queue_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Count calls ahead of this one for the same user and type
  SELECT COUNT(*)::INTEGER INTO queue_position
  FROM call_queue
  WHERE user_id = v_user_id
    AND call_type = v_call_type
    AND status = 'queued'
    AND (
      priority > v_priority OR
      (priority = v_priority AND "position" < v_position) OR
      (priority = v_priority AND "position" = v_position AND created_at < v_created_at)
    );
  
  RETURN queue_position + 1; -- Add 1 because position is 1-indexed
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 5. Update Existing get_next_queued_call Function
-- =====================================================

-- Update the function to prioritize direct calls over campaign calls
CREATE OR REPLACE FUNCTION get_next_queued_call(p_user_id UUID)
RETURNS call_queue AS $$
DECLARE
  result call_queue;
BEGIN
  -- First try to get a direct call (highest priority)
  SELECT * INTO result
  FROM call_queue q
  WHERE q.user_id = p_user_id
    AND q.call_type = 'direct'
    AND q.status = 'queued'
    AND q.scheduled_for <= NOW()
  ORDER BY q.priority DESC, q."position" ASC, q.created_at ASC
  LIMIT 1;
  
  -- If no direct call, get campaign call
  IF result.id IS NULL THEN
    SELECT * INTO result
    FROM call_queue q
    INNER JOIN call_campaigns c ON q.campaign_id = c.id
    WHERE q.user_id = p_user_id
      AND q.call_type = 'campaign'
      AND q.status = 'queued'
      AND c.status = 'active'
      AND q.scheduled_for <= NOW()
      AND CURRENT_TIME BETWEEN c.first_call_time AND c.last_call_time
    ORDER BY 
      COALESCE(q.last_system_allocation_at, '1970-01-01'::timestamptz) ASC,
      q.priority DESC,
      q."position" ASC,
      q.created_at ASC
    LIMIT 1;
  END IF;
  
  -- Update last_system_allocation_at for round-robin
  IF result.id IS NOT NULL THEN
    UPDATE call_queue 
    SET last_system_allocation_at = NOW()
    WHERE id = result.id;
  END IF;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. Add Monitoring View
-- =====================================================

-- View for queue status by call type
CREATE OR REPLACE VIEW queue_status_by_type AS
SELECT 
  q.user_id,
  u.email as user_email,
  q.call_type,
  q.status,
  COUNT(*) as call_count,
  MIN(q.created_at) as oldest_call,
  MAX(q.created_at) as newest_call
FROM call_queue q
INNER JOIN users u ON q.user_id = u.id
GROUP BY q.user_id, u.email, q.call_type, q.status
ORDER BY q.user_id, q.call_type, q.status;

COMMENT ON VIEW queue_status_by_type IS 'Overview of queue status broken down by call type and status';

-- =====================================================
-- 7. Migration Completion
-- =====================================================

-- Update existing queued calls to have call_type = 'campaign' (default already set)
-- No action needed as DEFAULT is already 'campaign'

-- Migration completed successfully - direct calls can now be queued alongside campaign calls
