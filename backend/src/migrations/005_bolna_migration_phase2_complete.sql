-- Migration: Complete Bolna.ai Database Transition - Phase 2
-- This migration completes the transition from ElevenLabs to Bolna.ai
-- Date: September 26, 2025

-- CRITICAL: This is Phase 2 of the migration. Run this AFTER Phase 1 and data migration are complete.

BEGIN;

-- Step 1: Make bolna_agent_id NOT NULL (since we're fully migrated)
-- First, let's set a default for any NULL values (shouldn't be any after migration)
UPDATE agents 
SET bolna_agent_id = 'legacy_' || id::text 
WHERE bolna_agent_id IS NULL;

-- Now make it NOT NULL
ALTER TABLE agents 
ALTER COLUMN bolna_agent_id SET NOT NULL;

-- Step 2: Make bolna_execution_id NOT NULL for calls
UPDATE calls 
SET bolna_execution_id = 'legacy_' || id::text 
WHERE bolna_execution_id IS NULL;

ALTER TABLE calls 
ALTER COLUMN bolna_execution_id SET NOT NULL;

-- Step 3: Add unique constraints for Bolna.ai IDs (now that data is migrated)
ALTER TABLE agents ADD CONSTRAINT agents_user_id_bolna_agent_id_key UNIQUE(user_id, bolna_agent_id);
ALTER TABLE calls ADD CONSTRAINT calls_bolna_execution_id_unique UNIQUE(bolna_execution_id);

-- Step 4: Drop old ElevenLabs constraints (if they exist)
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_user_id_elevenlabs_agent_id_key;
-- Note: We'll keep the old columns for now as backup, but make them nullable

-- Step 5: Create a backup view of the old data before any potential cleanup
CREATE OR REPLACE VIEW elevenlabs_backup_data AS
SELECT 
    a.id as agent_id,
    a.user_id,
    a.name as agent_name,
    a.elevenlabs_agent_id,
    a.bolna_agent_id,
    COUNT(c.id) as call_count,
    COUNT(CASE WHEN c.elevenlabs_conversation_id IS NOT NULL THEN 1 END) as elevenlabs_calls,
    COUNT(CASE WHEN c.bolna_execution_id IS NOT NULL THEN 1 END) as bolna_calls
FROM agents a
LEFT JOIN calls c ON a.id = c.agent_id
GROUP BY a.id, a.user_id, a.name, a.elevenlabs_agent_id, a.bolna_agent_id;

-- Step 6: Update indexes to prioritize Bolna.ai columns
-- The old indexes should still exist for legacy data access

-- Step 7: Update the user_stats view to prioritize Bolna.ai data
DROP VIEW IF EXISTS user_stats;

CREATE VIEW user_stats AS
SELECT 
    u.id,
    u.email,
    u.name,
    u.credits,
    u.is_active,
    u.created_at,
    COUNT(DISTINCT a.id) as agent_count,
    COUNT(DISTINCT c.id) as call_count,
    COUNT(DISTINCT ct.id) as contact_count,
    COALESCE(SUM(CASE WHEN c.status = 'completed' THEN c.credits_used ELSE 0 END), 0) as total_credits_used,
    -- Prioritize Bolna.ai calls in reporting
    COUNT(DISTINCT CASE WHEN c.bolna_execution_id IS NOT NULL THEN c.id END) as bolna_calls,
    COUNT(DISTINCT CASE WHEN c.elevenlabs_conversation_id IS NOT NULL AND c.bolna_execution_id IS NULL THEN c.id END) as legacy_elevenlabs_calls,
    -- Migration status indicators
    COUNT(DISTINCT CASE WHEN a.bolna_agent_id IS NOT NULL THEN a.id END) as migrated_agents,
    COUNT(DISTINCT CASE WHEN a.elevenlabs_agent_id IS NOT NULL AND a.bolna_agent_id IS NULL THEN a.id END) as legacy_agents
FROM users u
LEFT JOIN agents a ON u.id = a.user_id AND a.is_active = true
LEFT JOIN calls c ON u.id = c.user_id
LEFT JOIN contacts ct ON u.id = ct.user_id
GROUP BY u.id, u.email, u.name, u.credits, u.is_active, u.created_at;

-- Step 8: Create migration status function
CREATE OR REPLACE FUNCTION get_migration_status() 
RETURNS TABLE(
    migration_complete BOOLEAN,
    total_agents INTEGER,
    migrated_agents INTEGER,
    total_calls INTEGER,
    migrated_calls INTEGER,
    migration_percentage DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        -- Migration is complete if all active agents have bolna_agent_id
        (COUNT(CASE WHEN a.is_active AND a.bolna_agent_id IS NULL THEN 1 END) = 0) as migration_complete,
        COUNT(a.id)::INTEGER as total_agents,
        COUNT(CASE WHEN a.bolna_agent_id IS NOT NULL THEN 1 END)::INTEGER as migrated_agents,
        (SELECT COUNT(*)::INTEGER FROM calls) as total_calls,
        (SELECT COUNT(*)::INTEGER FROM calls WHERE bolna_execution_id IS NOT NULL) as migrated_calls,
        CASE 
            WHEN COUNT(a.id) = 0 THEN 100.0
            ELSE ROUND((COUNT(CASE WHEN a.bolna_agent_id IS NOT NULL THEN 1 END)::DECIMAL / COUNT(a.id)::DECIMAL) * 100, 2)
        END as migration_percentage
    FROM agents a;
END;
$$ LANGUAGE plpgsql;

-- Step 9: Add migration completion timestamp
CREATE TABLE IF NOT EXISTS migration_log (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) NOT NULL,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
);

INSERT INTO migration_log (migration_name, notes) 
VALUES ('bolna_migration_phase2', 'Completed database schema transition to Bolna.ai - made bolna_agent_id NOT NULL, added constraints');

COMMIT;

-- Verification queries (run these after the migration)
/*
-- Check migration status
SELECT * FROM get_migration_status();

-- Verify constraints
SELECT constraint_name, constraint_type 
FROM information_schema.table_constraints 
WHERE table_name IN ('agents', 'calls') 
  AND constraint_name LIKE '%bolna%';

-- Check data integrity
SELECT 
    'agents' as table_name,
    COUNT(*) as total_rows,
    COUNT(bolna_agent_id) as with_bolna_id,
    COUNT(elevenlabs_agent_id) as with_elevenlabs_id
FROM agents
UNION ALL
SELECT 
    'calls' as table_name,
    COUNT(*) as total_rows,
    COUNT(bolna_execution_id) as with_bolna_id,
    COUNT(elevenlabs_conversation_id) as with_elevenlabs_id
FROM calls;
*/