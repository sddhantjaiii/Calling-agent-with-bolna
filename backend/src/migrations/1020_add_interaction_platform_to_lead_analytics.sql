-- Migration: Add interaction_platform column to lead_analytics table
-- This column stores the platform/mode for manual interactions (Call, WhatsApp, Email)
-- It's used to distinguish manual interactions in the timeline

-- Add interaction_platform column
ALTER TABLE lead_analytics 
ADD COLUMN IF NOT EXISTS interaction_platform VARCHAR(50);

-- Add comment to explain the column
COMMENT ON COLUMN lead_analytics.interaction_platform IS 'Platform for manual interaction (Call, WhatsApp, Email). Used for human_edit analysis type to show the mode of interaction in timeline.';

-- Create index for filtering by platform
CREATE INDEX IF NOT EXISTS idx_lead_analytics_interaction_platform 
ON lead_analytics(interaction_platform) 
WHERE interaction_platform IS NOT NULL;

-- Set default value for existing human_edit records
UPDATE lead_analytics 
SET interaction_platform = 'Call' 
WHERE analysis_type = 'human_edit' 
  AND interaction_platform IS NULL;
