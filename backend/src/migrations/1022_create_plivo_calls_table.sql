-- Migration: Create plivo_calls table for Phase-1 CRM dialer (Plivo Browser SDK v2)
-- Goal: persist outbound dialer call logs without coupling to Bolna-centric public.calls.

CREATE TABLE IF NOT EXISTS plivo_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Optional attribution when a team member places the call
    team_member_id UUID NULL REFERENCES team_members(id) ON DELETE SET NULL,

    -- Caller ID selection (snapshot + optional FK)
    from_phone_number_id UUID NULL REFERENCES phone_numbers(id) ON DELETE SET NULL,
    from_phone_number VARCHAR(50) NOT NULL,

    -- Destination
    to_phone_number VARCHAR(50) NOT NULL,

    -- Plivo identifiers
    plivo_call_uuid VARCHAR(128) NULL,

    -- Lifecycle
    status VARCHAR(50) NOT NULL DEFAULT 'initiated',
    status_updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    answered_at TIMESTAMPTZ NULL,
    ended_at TIMESTAMPTZ NULL,
    duration_seconds INTEGER NULL,

    -- Hangup diagnostics
    hangup_by VARCHAR(50) NULL,
    hangup_reason TEXT NULL,
    raw_hangup_payload JSONB NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_plivo_calls_user_id ON plivo_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_plivo_calls_user_created_at ON plivo_calls(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plivo_calls_status ON plivo_calls(status);
CREATE INDEX IF NOT EXISTS idx_plivo_calls_to_phone_number ON plivo_calls(to_phone_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plivo_calls_plivo_call_uuid_unique
    ON plivo_calls(plivo_call_uuid)
    WHERE plivo_call_uuid IS NOT NULL;

-- Keep updated_at fresh
DROP TRIGGER IF EXISTS update_plivo_calls_updated_at ON plivo_calls;
CREATE TRIGGER update_plivo_calls_updated_at
  BEFORE UPDATE ON plivo_calls
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
