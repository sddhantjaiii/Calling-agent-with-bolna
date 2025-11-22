BEGIN;

-- Fix lead_analytics to allow upserts for complete analysis
-- The issue: Only one complete analysis should exist per user+phone combination
-- Solution: Add proper unique constraint for user_id + phone_number + analysis_type

-- First, drop the wrongly named index if it exists on lead_analytics
DROP INDEX IF EXISTS idx_agent_analytics_unique_agent_user_date;

-- Create proper unique constraint for lead_analytics
-- Ensures only ONE complete analysis per user+phone (not per day, but total)
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_analytics_unique_complete_user_phone
ON lead_analytics(user_id, phone_number, analysis_type)
WHERE analysis_type = 'complete';

COMMIT;
