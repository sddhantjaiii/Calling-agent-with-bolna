-- Migration: Update phone_numbers table for agent-level assignment
-- This migration changes phone number assignment from user-level to agent-level
-- and removes the legacy bolna_phone_number_id column

-- Drop old indexes
DROP INDEX IF EXISTS idx_phone_numbers_elevenlabs_id;
DROP INDEX IF EXISTS idx_phone_numbers_bolna_phone_number_id;
DROP INDEX IF EXISTS idx_phone_numbers_assigned_to_user_id;

-- Drop old columns
ALTER TABLE phone_numbers 
DROP COLUMN IF EXISTS elevenlabs_phone_number_id,
DROP COLUMN IF EXISTS bolna_phone_number_id,
DROP COLUMN IF EXISTS assigned_to_user_id;

-- Add new agent assignment column
ALTER TABLE phone_numbers 
ADD COLUMN assigned_to_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL;

-- Create new indexes
CREATE INDEX idx_phone_numbers_assigned_to_agent_id ON phone_numbers(assigned_to_agent_id);

-- Create unique constraint to ensure one phone number per agent (when assigned)
-- This prevents multiple phone numbers being assigned to the same agent
CREATE UNIQUE INDEX idx_phone_numbers_unique_agent_assignment 
ON phone_numbers(assigned_to_agent_id) 
WHERE assigned_to_agent_id IS NOT NULL;

-- Update table comment
COMMENT ON TABLE phone_numbers IS 'Manages phone numbers for batch calling functionality with Bolna.ai integration. Phone numbers are assigned to agents.';

-- Update column comments
COMMENT ON COLUMN phone_numbers.id IS 'Primary key UUID';
COMMENT ON COLUMN phone_numbers.name IS 'Friendly name for the phone number to help admins remember its purpose';
COMMENT ON COLUMN phone_numbers.phone_number IS 'The actual phone number in E.164 format (e.g., +19876543007)';
COMMENT ON COLUMN phone_numbers.assigned_to_agent_id IS 'Agent this phone number is assigned to (NULL means unassigned). Each agent can have only one phone number.';
COMMENT ON COLUMN phone_numbers.created_by_admin_id IS 'Admin who created this phone number entry';
COMMENT ON COLUMN phone_numbers.is_active IS 'Whether this phone number is active and available for use';
COMMENT ON COLUMN phone_numbers.created_at IS 'Timestamp when the phone number was created';
COMMENT ON COLUMN phone_numbers.updated_at IS 'Timestamp when the phone number was last updated';

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 031: Phone numbers table updated for agent-level assignment';
    RAISE NOTICE '  - Removed legacy columns: elevenlabs_phone_number_id, bolna_phone_number_id, assigned_to_user_id';
    RAISE NOTICE '  - Added: assigned_to_agent_id with foreign key to agents table';
    RAISE NOTICE '  - Created unique constraint: one phone number per agent';
    RAISE NOTICE '  - Phone numbers can now be assigned directly to agents for Bolna.ai call initiation';
END $$;
