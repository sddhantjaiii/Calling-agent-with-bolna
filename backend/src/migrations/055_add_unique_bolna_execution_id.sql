BEGIN;

-- Make bolna_execution_id unique to prevent duplicate calls
-- First, drop the old non-unique index
DROP INDEX IF EXISTS idx_calls_bolna_execution_id;

-- Create a unique constraint on bolna_execution_id
-- This will prevent duplicate calls from being created for the same execution
CREATE UNIQUE INDEX idx_calls_bolna_execution_id_unique
ON calls(bolna_execution_id)
WHERE bolna_execution_id IS NOT NULL;

COMMIT;
