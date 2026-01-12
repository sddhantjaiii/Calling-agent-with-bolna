-- Migration: Add custom retry schedule support to campaigns
-- Description: Adds retry_strategy and custom_retry_schedule columns to enable flexible retry configurations
-- Date: 2026-01-12

-- =====================================================
-- 1. Add retry strategy columns to call_campaigns
-- =====================================================

ALTER TABLE call_campaigns
ADD COLUMN IF NOT EXISTS retry_strategy VARCHAR(20) DEFAULT 'simple',
ADD COLUMN IF NOT EXISTS custom_retry_schedule JSONB DEFAULT NULL;

-- =====================================================
-- 2. Add check constraint for retry_strategy
-- =====================================================

ALTER TABLE call_campaigns
ADD CONSTRAINT call_campaigns_retry_strategy_check 
CHECK (retry_strategy IN ('simple', 'custom'));

-- =====================================================
-- 3. Add comments for documentation
-- =====================================================

COMMENT ON COLUMN call_campaigns.retry_strategy IS 
'Retry configuration mode: "simple" (fixed interval) or "custom" (per-retry schedule)';

COMMENT ON COLUMN call_campaigns.custom_retry_schedule IS 
'Custom retry schedule in JSON format: {"retries": [{"attempt": 1, "delay_minutes": 15}, ...]}. Only used when retry_strategy = "custom"';

-- =====================================================
-- 4. Create index for custom retry campaigns
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_campaigns_custom_retry 
ON call_campaigns(retry_strategy) 
WHERE retry_strategy = 'custom';

-- =====================================================
-- 5. Validation function for custom retry schedule
-- =====================================================

CREATE OR REPLACE FUNCTION validate_custom_retry_schedule()
RETURNS TRIGGER AS $$
BEGIN
  -- Only validate if retry_strategy is 'custom'
  IF NEW.retry_strategy = 'custom' THEN
    -- Ensure custom_retry_schedule is not null
    IF NEW.custom_retry_schedule IS NULL THEN
      RAISE EXCEPTION 'custom_retry_schedule cannot be null when retry_strategy is "custom"';
    END IF;
    
    -- Ensure it has a 'retries' array
    IF NOT (NEW.custom_retry_schedule ? 'retries') THEN
      RAISE EXCEPTION 'custom_retry_schedule must contain a "retries" array';
    END IF;
    
    -- Ensure retries array is not empty
    IF jsonb_array_length(NEW.custom_retry_schedule->'retries') = 0 THEN
      RAISE EXCEPTION 'custom_retry_schedule retries array cannot be empty';
    END IF;
    
    -- Ensure max 5 retries
    IF jsonb_array_length(NEW.custom_retry_schedule->'retries') > 5 THEN
      RAISE EXCEPTION 'Maximum 5 retries allowed in custom_retry_schedule';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. Add trigger for validation
-- =====================================================

DROP TRIGGER IF EXISTS trigger_validate_custom_retry_schedule ON call_campaigns;

CREATE TRIGGER trigger_validate_custom_retry_schedule
BEFORE INSERT OR UPDATE ON call_campaigns
FOR EACH ROW
EXECUTE FUNCTION validate_custom_retry_schedule();

-- =====================================================
-- Migration Complete
-- =====================================================

-- Migration Notes:
-- - Existing campaigns will have retry_strategy = 'simple' (default)
-- - custom_retry_schedule is NULL for simple mode campaigns
-- - Validation ensures custom mode has valid schedule format
-- - Max 5 retries enforced at database level
