-- Migration: Bolna.ai Integration - Phase 1
-- This migration updates the database schema to support Bolna.ai instead of ElevenLabs
-- Date: September 26, 2025

-- Step 1: Add new Bolna.ai columns to agents table
ALTER TABLE agents 
ADD COLUMN bolna_agent_id VARCHAR(255);

-- Step 2: Add new Bolna.ai columns to calls table  
ALTER TABLE calls
ADD COLUMN bolna_execution_id VARCHAR(255);

-- Step 3: Add new Bolna.ai columns to phone_numbers table
ALTER TABLE phone_numbers
ADD COLUMN bolna_phone_number_id VARCHAR(255);

-- Step 4: Create indexes for new Bolna.ai columns
CREATE INDEX idx_agents_bolna_agent_id ON agents(bolna_agent_id);
CREATE INDEX idx_calls_bolna_execution_id ON calls(bolna_execution_id);
CREATE INDEX idx_phone_numbers_bolna_phone_number_id ON phone_numbers(bolna_phone_number_id);

-- Step 5: Add unique constraints for Bolna.ai IDs (after data migration)
-- These will be enabled after data migration is complete
-- ALTER TABLE agents ADD CONSTRAINT agents_user_id_bolna_agent_id_key UNIQUE(user_id, bolna_agent_id);
-- ALTER TABLE calls ADD CONSTRAINT calls_bolna_execution_id_unique UNIQUE(bolna_execution_id);
-- ALTER TABLE phone_numbers ADD CONSTRAINT phone_numbers_bolna_phone_number_id_unique UNIQUE(bolna_phone_number_id);

-- Step 6: Update the user_stats view to work with both ElevenLabs and Bolna.ai data
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
    -- Analytics for both platforms during transition
    COUNT(DISTINCT CASE WHEN c.elevenlabs_conversation_id IS NOT NULL THEN c.id END) as elevenlabs_calls,
    COUNT(DISTINCT CASE WHEN c.bolna_execution_id IS NOT NULL THEN c.id END) as bolna_calls
FROM users u
LEFT JOIN agents a ON u.id = a.user_id AND a.is_active = true
LEFT JOIN calls c ON u.id = c.user_id
LEFT JOIN contacts ct ON u.id = ct.user_id
GROUP BY u.id, u.email, u.name, u.credits, u.is_active, u.created_at;

-- Step 7: Create a migration status tracking table
CREATE TABLE IF NOT EXISTS migration_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    migration_name VARCHAR(255) NOT NULL,
    table_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
    records_total INTEGER DEFAULT 0,
    records_migrated INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial migration tracking records
INSERT INTO migration_status (migration_name, table_name, status) VALUES
('bolna_migration', 'agents', 'pending'),
('bolna_migration', 'calls', 'pending'),
('bolna_migration', 'phone_numbers', 'pending');

-- Step 8: Create function to update migration progress
CREATE OR REPLACE FUNCTION update_migration_progress(
    p_migration_name VARCHAR(255),
    p_table_name VARCHAR(255),
    p_status VARCHAR(50),
    p_records_total INTEGER DEFAULT NULL,
    p_records_migrated INTEGER DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    UPDATE migration_status 
    SET 
        status = p_status,
        records_total = COALESCE(p_records_total, records_total),
        records_migrated = COALESCE(p_records_migrated, records_migrated),
        error_message = p_error_message,
        started_at = CASE WHEN p_status = 'in_progress' AND started_at IS NULL THEN CURRENT_TIMESTAMP ELSE started_at END,
        completed_at = CASE WHEN p_status IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE completed_at END
    WHERE migration_name = p_migration_name AND table_name = p_table_name;
END;
$$ LANGUAGE plpgsql;

-- Step 9: Add comments for documentation
COMMENT ON COLUMN agents.bolna_agent_id IS 'Bolna.ai agent identifier for API integration';
COMMENT ON COLUMN calls.bolna_execution_id IS 'Bolna.ai execution/call identifier for tracking';
COMMENT ON COLUMN phone_numbers.bolna_phone_number_id IS 'Bolna.ai phone number identifier';
COMMENT ON TABLE migration_status IS 'Tracks progress of Bolna.ai migration process';

-- Step 10: Grant necessary permissions
-- GRANT SELECT, INSERT, UPDATE ON migration_status TO your_app_user;
-- GRANT EXECUTE ON FUNCTION update_migration_progress TO your_app_user;

-- Migration complete - Phase 1
-- Next steps:
-- 1. Run data migration script to populate bolna_* columns
-- 2. Update application code to use Bolna.ai APIs
-- 3. Enable unique constraints after data migration
-- 4. Remove ElevenLabs columns after successful migration