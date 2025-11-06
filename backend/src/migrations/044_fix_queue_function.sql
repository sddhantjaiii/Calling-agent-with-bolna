-- =====================================================
-- Migration 044: Fix get_next_queued_call Function
-- =====================================================
-- This migration updates the get_next_queued_call function to:
-- 1. Return the full call_queue record instead of just UUID
-- 2. Add campaign status check (only 'active' campaigns)
-- 3. Add time window checks (first_call_time to last_call_time)
-- 4. Add campaign expiry check (end_date)
-- =====================================================

-- Drop the old function
DROP FUNCTION IF EXISTS get_next_queued_call(UUID);

-- Create the enhanced function that returns full record
CREATE OR REPLACE FUNCTION get_next_queued_call(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  campaign_id UUID,
  agent_id UUID,
  contact_id UUID,
  phone_number VARCHAR(50),
  contact_name VARCHAR(255),
  user_data JSONB,
  status VARCHAR(20),
  priority INTEGER,
  "position" INTEGER,
  scheduled_for TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  call_id UUID,
  failure_reason TEXT,
  last_system_allocation_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    q.id,
    q.user_id,
    q.campaign_id,
    q.agent_id,
    q.contact_id,
    q.phone_number,
    q.contact_name,
    q.user_data,
    q.status,
    q.priority,
    q."position",
    q.scheduled_for,
    q.started_at,
    q.completed_at,
    q.call_id,
    q.failure_reason,
    q.last_system_allocation_at,
    q.created_at,
    q.updated_at
  FROM call_queue q
  INNER JOIN call_campaigns c ON q.campaign_id = c.id
  WHERE 
    q.user_id = p_user_id
    AND q.status = 'queued'
    AND q.scheduled_for <= CURRENT_TIMESTAMP
    -- Campaign must be active
    AND c.status = 'active'
    -- Must be within time window
    AND CURRENT_TIME >= c.first_call_time::time
    AND CURRENT_TIME <= c.last_call_time::time
    -- Campaign must not be expired
    AND (c.end_date IS NULL OR CURRENT_DATE <= c.end_date)
  ORDER BY q.priority DESC, q."position" ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Add comment to document the function
COMMENT ON FUNCTION get_next_queued_call(UUID) IS 
'Returns the next queued call for a user that meets all criteria:
- Queue status must be queued
- Scheduled time must have passed
- Campaign must be active
- Current time must be within campaign calling hours
- Campaign must not be expired
Orders by priority (descending) then position (FIFO) and returns first match.';
