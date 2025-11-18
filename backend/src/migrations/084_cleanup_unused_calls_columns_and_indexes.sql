-- Migration: Cleanup unused columns and redundant indexes from calls table
-- This removes legacy Bolna columns that were never used and redundant indexes

-- Drop unused JSONB columns (never used in codebase, always empty {})
ALTER TABLE calls DROP COLUMN IF EXISTS bolna_call_config;
ALTER TABLE calls DROP COLUMN IF EXISTS bolna_voice_settings;
ALTER TABLE calls DROP COLUMN IF EXISTS bolna_metadata;

-- Drop redundant indexes (covered by more specific composite indexes)

-- idx_calls_user_id is redundant - covered by:
-- - idx_calls_user_created_status (user_id, created_at, status)
-- - idx_calls_user_id_created_at (user_id, created_at)
-- - idx_calls_kpi_covering (user_id, status, created_at)
DROP INDEX IF EXISTS idx_calls_user_id;

-- idx_calls_agent_id is partially redundant - covered by:
-- - idx_calls_agent_performance (agent_id, user_id, created_at, status, duration_minutes, credits_used)
-- - idx_calls_user_agent_created_status (user_id, agent_id, created_at, status)
DROP INDEX IF EXISTS idx_calls_agent_id;

-- idx_calls_status is redundant - covered by:
-- - idx_calls_user_status_created (user_id, status, created_at)
-- - idx_calls_kpi_covering (user_id, status, created_at)
DROP INDEX IF EXISTS idx_calls_status;

-- idx_calls_created_at is redundant - covered by:
-- - idx_calls_user_id_created_at (user_id, created_at)
-- - idx_calls_user_created_status (user_id, created_at, status)
DROP INDEX IF EXISTS idx_calls_created_at;

-- idx_calls_execution_id is a duplicate of idx_calls_bolna_execution_id
DROP INDEX IF EXISTS idx_calls_execution_id;

-- Summary of cleanup:
-- ✅ Removed 3 unused JSONB columns (bolna_call_config, bolna_voice_settings, bolna_metadata)
-- ✅ Removed 5 redundant indexes
-- 📊 Result: Reduced storage size, improved write performance, simplified schema
