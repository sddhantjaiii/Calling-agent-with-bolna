-- Migration: Add user-specific OpenAI prompt IDs
-- Date: 2025-11-02
-- Purpose: Move OpenAI prompt configuration from system-wide to per-user

-- Add columns for user-specific prompt IDs
ALTER TABLE users
ADD COLUMN IF NOT EXISTS openai_individual_prompt_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS openai_complete_prompt_id VARCHAR(255);

-- Add comments for documentation
COMMENT ON COLUMN users.openai_individual_prompt_id IS 
  'OpenAI Response API prompt ID for individual call analysis. Falls back to system default if NULL.';
COMMENT ON COLUMN users.openai_complete_prompt_id IS 
  'OpenAI Response API prompt ID for complete/aggregated analysis across multiple calls. Falls back to system default if NULL.';

-- Populate existing users with current system default
-- Replace with your actual default prompt ID
UPDATE users 
SET 
  openai_individual_prompt_id = 'pmpt_68df0dca1f3c81908f78bd0fa1cdddbb0be29b61af4419d7',
  openai_complete_prompt_id = 'pmpt_68df0dca1f3c81908f78bd0fa1cdddbb0be29b61af4419d7'
WHERE openai_individual_prompt_id IS NULL 
   OR openai_complete_prompt_id IS NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_openai_prompts 
ON users(openai_individual_prompt_id, openai_complete_prompt_id)
WHERE openai_individual_prompt_id IS NOT NULL 
   OR openai_complete_prompt_id IS NOT NULL;
