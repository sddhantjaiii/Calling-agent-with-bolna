-- Fix: Update get_next_queued_call to support direct calls
-- Run this manually to update the function

-- Drop the old function first (required when changing return type)
DROP FUNCTION IF EXISTS get_next_queued_call(UUID);

-- Also drop the unused get_next_queued function if it exists
DROP FUNCTION IF EXISTS get_next_queued(UUID);

-- Recreate with support for direct calls
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
