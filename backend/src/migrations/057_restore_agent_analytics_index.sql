BEGIN;

-- Restore the agent_analytics unique index that was accidentally dropped in migration 054
-- The trigger trg_calls_daily_analytics uses ON CONFLICT (agent_id, date, hour) 
-- which requires this unique constraint to exist

-- First drop the UNIQUE constraint from the table if it exists
ALTER TABLE agent_analytics DROP CONSTRAINT IF EXISTS agent_analytics_agent_id_date_hour_key;

-- Create the unique index to match what the trigger expects
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_analytics_unique_agent_date_hour
ON agent_analytics(agent_id, date, hour);

COMMIT;
