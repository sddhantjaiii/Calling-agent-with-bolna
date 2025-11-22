-- Check status of Caracas campaign and its calls

-- 1. Campaign details
SELECT 
    id,
    name,
    campaign_timezone,
    use_custom_timezone,
    first_call_time,
    last_call_time,
    status,
    total_contacts,
    completed_calls,
    created_at
FROM call_campaigns
WHERE campaign_timezone = 'America/Caracas'
   OR id = '20302c08-5dbe-4e25-8cae-ebad215bacec';

-- 2. Queue items for this campaign
SELECT 
    id,
    campaign_id,
    contact_id,
    phone_number,
    status,
    scheduled_for,
    created_at,
    updated_at,
    failure_reason
FROM call_queue
WHERE campaign_id = '20302c08-5dbe-4e25-8cae-ebad215bacec'
ORDER BY created_at DESC;

-- 3. Count by status
SELECT 
    status,
    COUNT(*) as count
FROM call_queue
WHERE campaign_id = '20302c08-5dbe-4e25-8cae-ebad215bacec'
GROUP BY status;

-- 4. Check if calls are in processing/calling status
SELECT 
    q.id,
    q.status,
    q.phone_number,
    q.started_at,
    q.completed_at,
    q.failure_reason
FROM call_queue q
WHERE q.campaign_id = '20302c08-5dbe-4e25-8cae-ebad215bacec'
  AND q.status IN ('processing', 'calling', 'completed', 'failed')
ORDER BY q.updated_at DESC;
