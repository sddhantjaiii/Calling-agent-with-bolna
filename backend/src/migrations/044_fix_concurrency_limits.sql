-- Migration: Fix Concurrency Limits - Remove Confusing Column
-- Description: Removes system_concurrent_calls_limit from users table as it's not truly system-wide
--              System-wide limit will be managed via ENV variable instead
-- Date: 2025-10-09

-- =====================================================
-- Remove Confusing Column from Users Table
-- =====================================================

-- Drop the system_concurrent_calls_limit column
-- This was confusing because it was per-user, not truly system-wide
ALTER TABLE users DROP COLUMN IF EXISTS system_concurrent_calls_limit;

-- Update comment on remaining column for clarity
COMMENT ON COLUMN users.concurrent_calls_limit IS 
  'Maximum concurrent calls for this specific user. System-wide limit (affecting all users combined) is managed via SYSTEM_CONCURRENT_CALLS_LIMIT environment variable.';

-- =====================================================
-- Update Helper Functions (No Changes Needed)
-- =====================================================

-- Note: The count_system_active_calls() function already works correctly
-- It counts ALL active calls across ALL users, which is what we want
-- No changes needed to the function itself
