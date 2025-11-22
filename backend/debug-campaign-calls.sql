-- Debug query to check why calls aren't being initiated

-- 1. Check current times
SELECT 
    NOW() as current_utc,
    (NOW() AT TIME ZONE 'America/Caracas')::TIME as caracas_time,
    '09:00:00'::TIME as first_call_time,
    '17:00:00'::TIME as last_call_time,
    (NOW() AT TIME ZONE 'America/Caracas')::TIME BETWEEN '09:00:00'::TIME AND '17:00:00'::TIME as is_within_window;

-- 2. Check the queued calls with all conditions
SELECT 
    q.id,
    q.user_id,
    q.status,
    q.scheduled_for,
    q.scheduled_for <= NOW() as is_scheduled_time_passed,
    c.status as campaign_status,
    c.campaign_timezone,
    c.use_custom_timezone,
    c.first_call_time,
    c.last_call_time,
    (NOW() AT TIME ZONE c.campaign_timezone)::TIME as current_time_in_campaign_tz,
    (NOW() AT TIME ZONE c.campaign_timezone)::TIME BETWEEN c.first_call_time AND c.last_call_time as should_call_now
FROM call_queue q
JOIN call_campaigns c ON q.campaign_id = c.id
WHERE q.user_id = '789895c8-4bd6-43e9-bfea-a4171ec47197'
  AND q.status = 'queued'
  AND q.call_type = 'campaign';

-- 3. Test the function directly
SELECT * FROM get_next_queued_call('789895c8-4bd6-43e9-bfea-a4171ec47197'::UUID);

-- 4. Check user's credits
SELECT id, email, credits, concurrent_calls_limit 
FROM users 
WHERE id = '789895c8-4bd6-43e9-bfea-a4171ec47197';

-- 5. Check if there are any active calls for this user
SELECT id, status, phone_number, created_at
FROM call_queue
WHERE user_id = '789895c8-4bd6-43e9-bfea-a4171ec47197'
  AND status IN ('processing', 'calling')
ORDER BY created_at DESC
LIMIT 5;
