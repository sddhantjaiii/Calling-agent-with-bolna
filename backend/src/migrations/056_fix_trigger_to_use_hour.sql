BEGIN;

-- Fix trigger to use (agent_id, date, hour) to match the table's UNIQUE constraint
CREATE OR REPLACE FUNCTION trg_calls_daily_analytics()
RETURNS TRIGGER AS $$
DECLARE
    call_date DATE;
    call_hour INTEGER;
    status_changed BOOLEAN := (TG_OP = 'UPDATE' AND (OLD.status IS DISTINCT FROM NEW.status));
BEGIN
    -- Only act when:
    -- 1) INSERT of a completed/failed call, or
    -- 2) UPDATE where status changed to completed/failed
    IF (
         (TG_OP = 'INSERT' AND NEW.status IN ('completed','failed'))
         OR (status_changed AND NEW.status IN ('completed','failed'))
       ) THEN
        call_date := CAST(NEW.created_at AS DATE);
        call_hour := EXTRACT(HOUR FROM NEW.created_at)::INTEGER;

        IF NEW.status = 'completed' THEN
          INSERT INTO agent_analytics (agent_id, user_id, date, hour, total_calls, successful_calls, failed_calls, total_duration_minutes, credits_used)
          VALUES (NEW.agent_id, NEW.user_id, call_date, call_hour, 1, 1, 0, NEW.duration_minutes, NEW.credits_used)
          ON CONFLICT (agent_id, date, hour)
          DO UPDATE SET
            total_calls = agent_analytics.total_calls + 1,
            successful_calls = agent_analytics.successful_calls + 1,
            total_duration_minutes = agent_analytics.total_duration_minutes + NEW.duration_minutes,
            credits_used = agent_analytics.credits_used + NEW.credits_used,
            updated_at = NOW();
        ELSIF NEW.status = 'failed' THEN
          INSERT INTO agent_analytics (agent_id, user_id, date, hour, total_calls, successful_calls, failed_calls, total_duration_minutes, credits_used)
          VALUES (NEW.agent_id, NEW.user_id, call_date, call_hour, 1, 0, 1, 0, 0)
          ON CONFLICT (agent_id, date, hour)
          DO UPDATE SET
            total_calls = agent_analytics.total_calls + 1,
            failed_calls = agent_analytics.failed_calls + 1,
            updated_at = NOW();
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
