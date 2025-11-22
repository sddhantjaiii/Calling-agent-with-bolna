BEGIN;

-- Clean up the mess from migration 054
-- It accidentally created idx_agent_analytics_unique_agent_user_date on lead_analytics 
-- when it should have been named idx_lead_analytics_*

-- Drop the wrongly named index on lead_analytics
DROP INDEX IF EXISTS idx_agent_analytics_unique_agent_user_date;

-- The correct index already exists from migration 054, so we're done

COMMIT;
