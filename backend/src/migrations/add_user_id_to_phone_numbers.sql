-- Migration: Add user_id to phone_numbers table
-- This associates phone numbers with specific users
-- Phone numbers can be owned by a user and optionally assigned to an agent

-- Add user_id column (nullable initially for existing data)
ALTER TABLE phone_numbers 
ADD COLUMN user_id UUID;

-- Add foreign key constraint to users table
ALTER TABLE phone_numbers
ADD CONSTRAINT fk_phone_numbers_user_id 
FOREIGN KEY (user_id) 
REFERENCES users(id) 
ON DELETE CASCADE;

-- For existing phone numbers, set user_id to created_by_admin_id
UPDATE phone_numbers
SET user_id = created_by_admin_id
WHERE user_id IS NULL;

-- Now make user_id NOT NULL
ALTER TABLE phone_numbers
ALTER COLUMN user_id SET NOT NULL;

-- Add index for better query performance
CREATE INDEX idx_phone_numbers_user_id ON phone_numbers(user_id);

-- Add index for user_id + assigned_to_agent_id combination
CREATE INDEX idx_phone_numbers_user_agent ON phone_numbers(user_id, assigned_to_agent_id);

-- Add comments
COMMENT ON COLUMN phone_numbers.user_id IS 'The user who owns this phone number';
COMMENT ON COLUMN phone_numbers.assigned_to_agent_id IS 'Optional: The agent this phone number is assigned to (must belong to same user)';

-- Note: We enforce agent-user relationship at the application level
-- (PostgreSQL does not support subqueries in CHECK constraints)
