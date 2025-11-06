-- Migration 007: Webhook Lifecycle Tracking and OpenAI Integration
-- Date: October 8, 2025
-- Purpose: Add columns for 5-stage webhook lifecycle tracking and dual analysis types

-- ============================================
-- 1. Update calls table for webhook lifecycle
-- ============================================

-- Add lifecycle tracking columns
ALTER TABLE calls
ADD COLUMN IF NOT EXISTS call_lifecycle_status VARCHAR(20) DEFAULT 'initiated',
ADD COLUMN IF NOT EXISTS hangup_by VARCHAR(20),
ADD COLUMN IF NOT EXISTS hangup_reason TEXT,
ADD COLUMN IF NOT EXISTS hangup_provider_code INTEGER,
ADD COLUMN IF NOT EXISTS ringing_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS call_answered_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS call_disconnected_at TIMESTAMPTZ;

-- Add CHECK constraint for call_lifecycle_status
ALTER TABLE calls
DROP CONSTRAINT IF EXISTS calls_lifecycle_status_check;

ALTER TABLE calls
ADD CONSTRAINT calls_lifecycle_status_check 
CHECK (call_lifecycle_status IN (
  'initiated',
  'ringing',
  'in-progress',
  'call-disconnected',
  'completed',
  'no-answer',
  'busy',
  'failed'
));

-- Update lead_type constraint to match Bolna.ai values
ALTER TABLE calls
DROP CONSTRAINT IF EXISTS calls_lead_type_check;

ALTER TABLE calls
ADD CONSTRAINT calls_lead_type_check 
CHECK (lead_type IN ('inbound', 'outbound'));

-- Add indexes for webhook lifecycle queries
CREATE INDEX IF NOT EXISTS idx_calls_lifecycle_status 
ON calls(call_lifecycle_status);

CREATE INDEX IF NOT EXISTS idx_calls_execution_id 
ON calls(bolna_execution_id);

CREATE INDEX IF NOT EXISTS idx_calls_disconnected_at 
ON calls(call_disconnected_at) 
WHERE call_disconnected_at IS NOT NULL;

-- Add comment explaining lifecycle flow
COMMENT ON COLUMN calls.call_lifecycle_status IS 
'Tracks call through 5-stage webhook lifecycle: initiated → ringing → in-progress → call-disconnected → completed. Failed calls: initiated → ringing → no-answer/busy';

-- ============================================
-- 2. Update lead_analytics table for dual analysis
-- ============================================

-- Add multi-tenant and analysis type tracking columns
ALTER TABLE lead_analytics
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS analysis_type VARCHAR(20) DEFAULT 'individual',
ADD COLUMN IF NOT EXISTS previous_calls_analyzed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS latest_call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS analysis_timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Add CHECK constraint for analysis_type
ALTER TABLE lead_analytics
DROP CONSTRAINT IF EXISTS lead_analytics_type_check;

ALTER TABLE lead_analytics
ADD CONSTRAINT lead_analytics_type_check 
CHECK (analysis_type IN ('individual', 'complete'));

-- Add indexes for querying analyses
CREATE INDEX IF NOT EXISTS idx_lead_analytics_type 
ON lead_analytics(call_id, analysis_type);

CREATE INDEX IF NOT EXISTS idx_lead_analytics_user_phone 
ON lead_analytics(user_id, phone_number);

CREATE INDEX IF NOT EXISTS idx_lead_analytics_complete 
ON lead_analytics(user_id, phone_number, analysis_type) 
WHERE analysis_type = 'complete';

CREATE INDEX IF NOT EXISTS idx_lead_analytics_user_id 
ON lead_analytics(user_id) 
WHERE user_id IS NOT NULL;

-- Add comments explaining dual analysis pattern
COMMENT ON COLUMN lead_analytics.analysis_type IS 
'Type of analysis: "individual" = single call analysis (one row per call), "complete" = aggregated analysis across all calls for a contact (one row per user_id + phone_number, updated on each call)';

COMMENT ON COLUMN lead_analytics.previous_calls_analyzed IS 
'For individual: always 0. For complete: total number of calls analyzed for this user_id + phone_number combination';

COMMENT ON COLUMN lead_analytics.latest_call_id IS 
'For complete analysis only: points to most recent call analyzed. NULL for individual analysis';

COMMENT ON COLUMN lead_analytics.phone_number IS 
'Required for complete analysis (identifies contact across calls). NULL for individual analysis (phone derived from call_id)';

COMMENT ON COLUMN lead_analytics.user_id IS 
'Required for complete analysis (multi-tenant isolation - one contact can interact with multiple users). Inherited from call for individual analysis';

-- ============================================
-- 3. Remove deprecated tables
-- ============================================

-- Drop Twilio processed calls table (no longer needed with Bolna.ai)
DROP TABLE IF EXISTS twilio_processed_calls CASCADE;

-- ============================================
-- 4. Data migration for existing records
-- ============================================

-- Backfill user_id for existing lead_analytics records
UPDATE lead_analytics la
SET user_id = c.user_id
FROM calls c
WHERE la.call_id = c.id
  AND la.user_id IS NULL;

-- Set analysis_type to 'individual' for all existing records
UPDATE lead_analytics
SET analysis_type = 'individual',
    previous_calls_analyzed = 0
WHERE analysis_type IS NULL;

-- Set default call_lifecycle_status for existing calls based on status
UPDATE calls
SET call_lifecycle_status = CASE
  WHEN status = 'completed' THEN 'completed'
  WHEN status = 'failed' THEN 'failed'
  WHEN status = 'cancelled' THEN 'failed'
  WHEN status = 'in_progress' THEN 'in-progress'
  ELSE 'initiated'
END
WHERE call_lifecycle_status IS NULL;

-- ============================================
-- 5. Verify migration
-- ============================================

-- Count calls by lifecycle status
DO $$
DECLARE
  total_calls INTEGER;
  initiated_calls INTEGER;
  completed_calls INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_calls FROM calls;
  SELECT COUNT(*) INTO initiated_calls FROM calls WHERE call_lifecycle_status = 'initiated';
  SELECT COUNT(*) INTO completed_calls FROM calls WHERE call_lifecycle_status = 'completed';
  
  RAISE NOTICE 'Migration 007 completed successfully';
  RAISE NOTICE 'Total calls: %', total_calls;
  RAISE NOTICE 'Initiated calls: %', initiated_calls;
  RAISE NOTICE 'Completed calls: %', completed_calls;
END $$;

-- Count lead_analytics by analysis type
DO $$
DECLARE
  total_analytics INTEGER;
  individual_analytics INTEGER;
  complete_analytics INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_analytics FROM lead_analytics;
  SELECT COUNT(*) INTO individual_analytics FROM lead_analytics WHERE analysis_type = 'individual';
  SELECT COUNT(*) INTO complete_analytics FROM lead_analytics WHERE analysis_type = 'complete';
  
  RAISE NOTICE 'Total lead_analytics: %', total_analytics;
  RAISE NOTICE 'Individual analyses: %', individual_analytics;
  RAISE NOTICE 'Complete analyses: %', complete_analytics;
END $$;
