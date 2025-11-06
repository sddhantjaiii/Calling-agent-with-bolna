-- Migration: Complete ElevenLabs Removal and Bolna.ai Schema Finalization
-- This migration removes ALL ElevenLabs references and creates a clean Bolna.ai schema
-- Date: September 26, 2025
-- CRITICAL: This will DROP all ElevenLabs columns permanently

BEGIN;

-- Step 1: Drop all ElevenLabs-related constraints first
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_user_id_elevenlabs_agent_id_key;
ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_elevenlabs_conversation_id_unique;

-- Step 2: Drop all ElevenLabs columns from agents table
ALTER TABLE agents 
DROP COLUMN IF EXISTS elevenlabs_agent_id,
DROP COLUMN IF EXISTS elevenlabs_config,
DROP COLUMN IF EXISTS elevenlabs_voice_id,
DROP COLUMN IF EXISTS elevenlabs_model_id;

-- Step 3: Drop all ElevenLabs columns from calls table  
ALTER TABLE calls
DROP COLUMN IF EXISTS elevenlabs_conversation_id,
DROP COLUMN IF EXISTS elevenlabs_agent_config,
DROP COLUMN IF EXISTS elevenlabs_voice_settings,
DROP COLUMN IF EXISTS elevenlabs_metadata;

-- Step 4: Drop any other ElevenLabs-related columns
ALTER TABLE transcripts DROP COLUMN IF EXISTS elevenlabs_transcript_id;
ALTER TABLE webhooks DROP COLUMN IF EXISTS elevenlabs_webhook_id;
ALTER TABLE lead_analytics DROP COLUMN IF EXISTS elevenlabs_analysis_id;

-- Step 5: Ensure Bolna.ai columns are properly configured
-- Make sure bolna_agent_id is NOT NULL and has proper constraints
ALTER TABLE agents 
ALTER COLUMN bolna_agent_id SET NOT NULL,
ADD CONSTRAINT agents_bolna_agent_id_unique UNIQUE(bolna_agent_id),
ADD CONSTRAINT agents_user_bolna_agent_id_unique UNIQUE(user_id, bolna_agent_id);

-- Make sure bolna_execution_id is NOT NULL and has proper constraints  
ALTER TABLE calls
ALTER COLUMN bolna_execution_id SET NOT NULL,
ADD CONSTRAINT calls_bolna_execution_id_unique UNIQUE(bolna_execution_id);

-- Step 6: Add any missing Bolna.ai columns that we need
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS bolna_webhook_url TEXT,
ADD COLUMN IF NOT EXISTS bolna_voice_config JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS bolna_llm_config JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS bolna_task_config JSONB DEFAULT '{}';

ALTER TABLE calls
ADD COLUMN IF NOT EXISTS bolna_call_config JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS bolna_voice_settings JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS bolna_metadata JSONB DEFAULT '{}';

-- Step 7: Update indexes to use Bolna.ai columns only
DROP INDEX IF EXISTS idx_agents_elevenlabs_agent_id;
DROP INDEX IF EXISTS idx_calls_elevenlabs_conversation_id;
DROP INDEX IF EXISTS idx_agents_user_elevenlabs;

CREATE INDEX IF NOT EXISTS idx_agents_bolna_agent_id ON agents(bolna_agent_id);
CREATE INDEX IF NOT EXISTS idx_calls_bolna_execution_id ON calls(bolna_execution_id);
CREATE INDEX IF NOT EXISTS idx_agents_user_bolna ON agents(user_id, bolna_agent_id);

-- Step 8: Create a view for Bolna.ai agent management
CREATE OR REPLACE VIEW bolna_agents AS
SELECT 
    a.id,
    a.user_id,
    a.name,
    a.description,
    a.agent_type,
    a.is_active,
    a.created_at,
    a.updated_at,
    a.bolna_agent_id,
    a.bolna_webhook_url,
    a.bolna_voice_config,
    a.bolna_llm_config,
    a.bolna_task_config,
    COUNT(c.id) as total_calls,
    COUNT(CASE WHEN c.status = 'completed' THEN 1 END) as completed_calls,
    COALESCE(SUM(c.credits_used), 0) as total_credits_used
FROM agents a
LEFT JOIN calls c ON a.id = c.agent_id
WHERE a.is_active = true
GROUP BY a.id, a.user_id, a.name, a.description, a.agent_type, a.is_active, 
         a.created_at, a.updated_at, a.bolna_agent_id, a.bolna_webhook_url,
         a.bolna_voice_config, a.bolna_llm_config, a.bolna_task_config;

-- Step 9: Create updated user stats view (Bolna.ai only)
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
    COUNT(DISTINCT c.id) as bolna_calls,
    COUNT(DISTINCT CASE WHEN a.bolna_agent_id IS NOT NULL THEN a.id END) as bolna_agents
FROM users u
LEFT JOIN agents a ON u.id = a.user_id AND a.is_active = true
LEFT JOIN calls c ON u.id = c.user_id
LEFT JOIN contacts ct ON u.id = ct.user_id
GROUP BY u.id, u.email, u.name, u.credits, u.is_active, u.created_at;

-- Step 10: Log the cleanup completion
INSERT INTO migration_log (migration_name, notes) 
VALUES ('bolna_migration_complete_cleanup', 'Removed all ElevenLabs columns and references, finalized Bolna.ai schema');

COMMIT;

-- Verification queries (run these after the migration)
/*
-- Verify no ElevenLabs columns remain
SELECT column_name, table_name 
FROM information_schema.columns 
WHERE column_name LIKE '%elevenlabs%' 
  AND table_schema = 'public';

-- Verify Bolna.ai constraints
SELECT constraint_name, constraint_type, table_name
FROM information_schema.table_constraints 
WHERE constraint_name LIKE '%bolna%' 
  AND table_schema = 'public';

-- Check agent structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'agents' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check calls structure  
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'calls' 
  AND table_schema = 'public'
ORDER BY ordinal_position;
*/