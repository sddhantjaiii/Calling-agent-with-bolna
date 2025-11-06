-- Migration: Add unique constraint for complete analysis upsert
-- This constraint allows us to have only ONE complete analysis record per user+phone combination

-- First, let's check if there are any duplicate records
SELECT 
  user_id, 
  phone_number, 
  analysis_type, 
  COUNT(*) as count
FROM lead_analytics
WHERE analysis_type = 'complete'
GROUP BY user_id, phone_number, analysis_type
HAVING COUNT(*) > 1;

-- If the above query returns any rows, we need to clean them up first
-- Delete all but the most recent complete analysis for each user+phone
DELETE FROM lead_analytics
WHERE id IN (
  SELECT id
  FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, phone_number, analysis_type 
        ORDER BY analysis_timestamp DESC
      ) as rn
    FROM lead_analytics
    WHERE analysis_type = 'complete'
  ) sub
  WHERE rn > 1
);

-- Now create the unique constraint
-- Note: This is a PARTIAL unique index - it only applies to 'complete' analysis type
-- Individual analyses can have duplicates (one per call)
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_analytics_complete_unique
ON lead_analytics (user_id, phone_number, analysis_type)
WHERE analysis_type = 'complete';

-- Verify the constraint was created
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'lead_analytics' 
  AND indexname = 'idx_lead_analytics_complete_unique';

-- Test the constraint works
-- This should succeed (first insert)
-- INSERT INTO lead_analytics (
--   call_id, user_id, phone_number, analysis_type,
--   intent_score, total_score, reasoning, cta_interactions
-- ) VALUES (
--   (SELECT id FROM calls LIMIT 1),
--   (SELECT id FROM users LIMIT 1),
--   '+1234567890',
--   'complete',
--   50, 50, '{}', '{}'
-- );

-- This should succeed (upsert updates the existing record)
-- INSERT INTO lead_analytics (
--   call_id, user_id, phone_number, analysis_type,
--   intent_score, total_score, reasoning, cta_interactions
-- ) VALUES (
--   (SELECT id FROM calls LIMIT 1),
--   (SELECT id FROM users LIMIT 1),
--   '+1234567890',
--   'complete',
--   60, 60, '{}', '{}'
-- )
-- ON CONFLICT (user_id, phone_number, analysis_type)
-- DO UPDATE SET
--   intent_score = EXCLUDED.intent_score,
--   total_score = EXCLUDED.total_score;
