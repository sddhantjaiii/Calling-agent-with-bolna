-- Migration: Add system_prompt and dynamic_information columns to agents table
-- Description: Enables admin to store Bolna agent system prompts and users to manage dynamic information
-- that gets appended to the system prompt for agent customization

-- Add system_prompt column to store the base system prompt fetched from Bolna
ALTER TABLE agents
ADD COLUMN IF NOT EXISTS system_prompt TEXT;

-- Add dynamic_information column to store user-configurable dynamic data
ALTER TABLE agents
ADD COLUMN IF NOT EXISTS dynamic_information TEXT;

-- Add comments for documentation
COMMENT ON COLUMN agents.system_prompt IS 'Base system prompt fetched from Bolna API (editable by admin only)';
COMMENT ON COLUMN agents.dynamic_information IS 'User-configurable dynamic information appended to system prompt';
