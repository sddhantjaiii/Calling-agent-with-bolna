-- Verify Webhook Data Saved Correctly
-- Run this after testing webhooks to verify all data is saved properly

-- Test execution ID from production payloads
\set execution_id '6028966f-669e-4954-8933-a582ef93dfd7'

\echo '=========================================='
\echo '📊 Webhook Data Verification'
\echo '=========================================='
\echo ''

\echo '1️⃣ Call Record (Should have transcript_id and recording_url)'
\echo ''
SELECT 
  id,
  bolna_execution_id,
  call_lifecycle_status,
  CASE 
    WHEN transcript_id IS NOT NULL THEN '✅ Linked'
    ELSE '❌ Missing'
  END as transcript_link,
  CASE 
    WHEN recording_url IS NOT NULL THEN '✅ Saved'
    ELSE '❌ Missing'
  END as recording_status,
  duration_seconds,
  hangup_by,
  hangup_reason,
  hangup_provider_code,
  to_char(ringing_started_at, 'HH24:MI:SS') as ringing_time,
  to_char(call_answered_at, 'HH24:MI:SS') as answered_time,
  to_char(call_disconnected_at, 'HH24:MI:SS') as disconnected_time,
  to_char(completed_at, 'HH24:MI:SS') as completed_time
FROM calls
WHERE bolna_execution_id = :'execution_id';

\echo ''
\echo '2️⃣ Transcript Record (Should exist with content and segments)'
\echo ''
SELECT 
  t.id as transcript_id,
  t.call_id,
  LENGTH(t.content) as transcript_length,
  CASE 
    WHEN LENGTH(t.content) > 0 THEN '✅ Has Content'
    ELSE '❌ Empty'
  END as content_status,
  jsonb_array_length(t.speaker_segments) as segments_count,
  CASE 
    WHEN jsonb_array_length(t.speaker_segments) > 0 THEN '✅ Has Segments'
    ELSE '❌ No Segments'
  END as segments_status,
  c.bolna_execution_id,
  CASE 
    WHEN c.transcript_id = t.id THEN '✅ Linked'
    ELSE '⚠️ Not Linked'
  END as link_status,
  to_char(t.created_at, 'HH24:MI:SS') as created_time
FROM transcripts t
JOIN calls c ON t.call_id = c.id
WHERE c.bolna_execution_id = :'execution_id';

\echo ''
\echo '3️⃣ Sample Transcript Content (First 200 chars)'
\echo ''
SELECT 
  LEFT(t.content, 200) || '...' as transcript_preview
FROM transcripts t
JOIN calls c ON t.call_id = c.id
WHERE c.bolna_execution_id = :'execution_id';

\echo ''
\echo '4️⃣ Sample Speaker Segments (First 3 segments)'
\echo ''
SELECT 
  segment->>'speaker' as speaker,
  segment->>'message' as message
FROM transcripts t
JOIN calls c ON t.call_id = c.id
CROSS JOIN LATERAL jsonb_array_elements(t.speaker_segments) AS segment
WHERE c.bolna_execution_id = :'execution_id'
LIMIT 3;

\echo ''
\echo '5️⃣ Recording URL (Should be from Plivo)'
\echo ''
SELECT 
  CASE 
    WHEN recording_url LIKE '%plivo.com%' THEN '✅ Valid Plivo URL'
    WHEN recording_url IS NOT NULL THEN '⚠️ Unexpected URL'
    ELSE '❌ No URL'
  END as url_validation,
  LEFT(recording_url, 80) || '...' as url_preview
FROM calls
WHERE bolna_execution_id = :'execution_id';

\echo ''
\echo '6️⃣ OpenAI Analysis (Should exist if transcript was processed)'
\echo ''
SELECT 
  la.id,
  la.analysis_type,
  la.total_score,
  la.lead_status_tag,
  to_char(la.created_at, 'HH24:MI:SS') as analyzed_time,
  c.bolna_execution_id
FROM lead_analytics la
JOIN calls c ON la.call_id = c.id
WHERE c.bolna_execution_id = :'execution_id';

\echo ''
\echo '7️⃣ Timeline Events (All webhook stages)'
\echo ''
SELECT 
  ringing_started_at IS NOT NULL as stage_2_ringing,
  call_answered_at IS NOT NULL as stage_3_in_progress,
  call_disconnected_at IS NOT NULL as stage_4_disconnected,
  completed_at IS NOT NULL as stage_5_completed,
  CASE 
    WHEN ringing_started_at IS NOT NULL 
         AND call_answered_at IS NOT NULL 
         AND call_disconnected_at IS NOT NULL 
         AND completed_at IS NOT NULL 
    THEN '✅ All Stages Captured'
    ELSE '⚠️ Some Stages Missing'
  END as timeline_status
FROM calls
WHERE bolna_execution_id = :'execution_id';

\echo ''
\echo '=========================================='
\echo '✅ Verification Complete'
\echo '=========================================='
\echo ''
\echo 'Expected Results:'
\echo '  - Call record: transcript_id ✅, recording_url ✅'
\echo '  - Transcript record: content ✅, segments ✅, linked ✅'
\echo '  - Recording URL: Valid Plivo URL ✅'
\echo '  - OpenAI analysis: Exists with scores ✅'
\echo '  - Timeline: All 4 stages captured ✅'
\echo ''
