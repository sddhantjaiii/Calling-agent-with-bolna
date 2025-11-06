-- =====================================================
-- Migration 046: Add bolna_conversation_id column
-- =====================================================
-- The system was migrated from ElevenLabs to Bolna
-- This adds the bolna_conversation_id column alongside bolna_execution_id
-- Note: bolna_execution_id already exists, this adds conversation tracking
-- =====================================================

-- Add the new column (nullable initially)
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS bolna_conversation_id VARCHAR(255);

-- For existing records that only have bolna_execution_id, 
-- we'll set bolna_conversation_id to be the same as bolna_execution_id
-- This ensures backward compatibility
UPDATE calls 
SET bolna_conversation_id = bolna_execution_id
WHERE bolna_conversation_id IS NULL AND bolna_execution_id IS NOT NULL;

-- Add unique constraint (allowing NULL values for now)
CREATE UNIQUE INDEX IF NOT EXISTS calls_bolna_conversation_id_unique 
ON calls (bolna_conversation_id) 
WHERE bolna_conversation_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN calls.bolna_conversation_id IS 'Bolna AI conversation ID for tracking conversation state';

-- Note: We keep this column nullable as not all calls may have conversation tracking
-- bolna_execution_id remains the primary identifier for call execution
