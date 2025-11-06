-- Migration: Fix lead_analytics schema issues
-- Run this to optimize the table for Bolna + OpenAI workflow

-- 1. Remove UNIQUE constraint on call_id (conflicts with complete analysis)
-- The unique_call_id_lead_analytics constraint prevents complete analysis from updating
-- We need to make it a partial index for individual analysis only

ALTER TABLE lead_analytics DROP CONSTRAINT IF EXISTS unique_call_id_lead_analytics;

CREATE UNIQUE INDEX IF NOT EXISTS unique_call_id_individual_analytics 
ON lead_analytics (call_id)
WHERE analysis_type = 'individual';

-- 2. Keep demo_book_datetime as TIMESTAMP WITH TIME ZONE (OpenAI returns ISO 8601 strings)
-- No change needed - will handle conversion in code

-- 3. Increase smart_notification length for longer messages
ALTER TABLE lead_analytics 
ALTER COLUMN smart_notification TYPE TEXT;

-- 4. Update analysis_source default to 'bolna'
ALTER TABLE lead_analytics 
ALTER COLUMN analysis_source SET DEFAULT 'bolna';

-- Update existing records to use 'bolna' as source
UPDATE lead_analytics 
SET analysis_source = 'bolna' 
WHERE analysis_source = 'elevenlabs';

-- 5. Add useful composite indexes for queries
CREATE INDEX IF NOT EXISTS idx_lead_analytics_phone_type_timestamp 
ON lead_analytics (phone_number, analysis_type, analysis_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_lead_analytics_user_type_timestamp 
ON lead_analytics (user_id, analysis_type, analysis_timestamp DESC);

-- 6. Add index for filtering by scores
CREATE INDEX IF NOT EXISTS idx_lead_analytics_score_filters 
ON lead_analytics (user_id, total_score DESC, lead_status_tag)
WHERE analysis_type = 'complete';

-- 7. Verify changes
SELECT 
  'Schema fixes applied successfully' as status,
  COUNT(*) as total_records,
  COUNT(CASE WHEN analysis_type = 'individual' THEN 1 END) as individual_count,
  COUNT(CASE WHEN analysis_type = 'complete' THEN 1 END) as complete_count,
  COUNT(CASE WHEN analysis_source = 'bolna' THEN 1 END) as bolna_records
FROM lead_analytics;

-- 8. Show all indexes on the table
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'lead_analytics'
ORDER BY indexname;
