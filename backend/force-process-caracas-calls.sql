-- Temporary workaround: Force process calls for Caracas campaign
-- Run this to manually trigger the queue processing

-- First, verify which calls should be processed
SELECT 
    q.id,
    q.phone_number,
    c.name,
    c.campaign_timezone,
    c.first_call_time,
    c.last_call_time,
    (NOW() AT TIME ZONE c.campaign_timezone)::TIME as current_time_in_tz,
    (NOW() AT TIME ZONE c.campaign_timezone)::TIME BETWEEN c.first_call_time AND c.last_call_time as should_process
FROM call_queue q
JOIN call_campaigns c ON q.campaign_id = c.id
WHERE q.status = 'queued'
  AND c.campaign_timezone = 'America/Caracas'
  AND (NOW() AT TIME ZONE c.campaign_timezone)::TIME BETWEEN c.first_call_time AND c.last_call_time;

-- To manually process the queue, the backend's QueueProcessorService should be running
-- Check if it's running by looking at the logs

-- If you need to force immediate processing, you can call the queue processor endpoint:
-- POST http://localhost:5000/api/queue/process-immediate
-- OR restart the backend server which will trigger queue processing on startup
