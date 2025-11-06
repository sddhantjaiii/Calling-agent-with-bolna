-- Enhanced get_next_queued_call function with campaign checks
-- Run this SQL in your database to update the function

CREATE OR REPLACE FUNCTION get_next_queued_call(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  campaign_id UUID,
  agent_id UUID,
  contact_id UUID,
  phone_number VARCHAR,
  contact_name VARCHAR,
  scheduled_for TIMESTAMP WITH TIME ZONE,
  status VARCHAR,
  priority INTEGER,
  position INTEGER,
  call_id UUID,
  attempts INTEGER,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  user_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  last_system_allocation_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT q.*
  FROM call_queue q
  INNER JOIN call_campaigns c ON q.campaign_id = c.id
  WHERE 
    q.user_id = p_user_id
    AND q.status = 'queued'
    AND c.status = 'active'                           -- Campaign must be active
    AND q.scheduled_for <= CURRENT_TIMESTAMP          -- Scheduled time has come
    AND CURRENT_TIME >= c.first_call_time::time       -- Within time window start
    AND CURRENT_TIME <= c.last_call_time::time        -- Within time window end
    AND (c.end_date IS NULL OR CURRENT_DATE <= c.end_date)  -- Campaign not expired
  ORDER BY q.priority DESC, q.position ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Test the function
-- SELECT * FROM get_next_queued_call('your-user-id-here');
