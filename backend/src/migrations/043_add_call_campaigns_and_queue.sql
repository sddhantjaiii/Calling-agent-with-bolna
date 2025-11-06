-- Migration: Add Call Campaigns and Queue System
-- Description: Implements batch calling functionality with campaign management and queue system
-- Date: 2025-10-08

-- =====================================================
-- 0. Add Unique Constraint to Contacts Table (for data isolation)
-- =====================================================

-- Add unique constraint on (id, user_id) for contacts table to support data isolation FKs
ALTER TABLE contacts 
ADD CONSTRAINT contacts_id_user_id_unique UNIQUE (id, user_id);

-- =====================================================
-- 1. Add Concurrency Limits to Users Table
-- =====================================================

-- Add user-level concurrent calls limit (default 2)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS concurrent_calls_limit INTEGER NOT NULL DEFAULT 2 
CHECK (concurrent_calls_limit >= 1 AND concurrent_calls_limit <= 100);

-- Add system-level concurrent calls limit (admin-configurable, default 10)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS system_concurrent_calls_limit INTEGER NOT NULL DEFAULT 10 
CHECK (system_concurrent_calls_limit >= 1 AND system_concurrent_calls_limit <= 1000);

-- Add comment
COMMENT ON COLUMN users.concurrent_calls_limit IS 'Maximum number of concurrent calls allowed for this user (user-level limit)';
COMMENT ON COLUMN users.system_concurrent_calls_limit IS 'System-wide concurrent calls limit (applies to all users collectively)';

-- =====================================================
-- 2. Create Call Campaigns Table
-- =====================================================

CREATE TABLE IF NOT EXISTS call_campaigns (
  -- Primary identifiers
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Campaign details
  name VARCHAR(255) NOT NULL,
  description TEXT,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  
  -- Campaign configuration
  next_action TEXT NOT NULL, -- What user wants to achieve with this campaign
  
  -- Time window configuration
  first_call_time TIME NOT NULL, -- e.g., '12:00:00' (daily recurring)
  last_call_time TIME NOT NULL, -- e.g., '18:00:00' (daily recurring)
  
  -- Campaign status
  status VARCHAR(20) NOT NULL DEFAULT 'draft' 
    CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled')),
  
  -- Statistics
  total_contacts INTEGER NOT NULL DEFAULT 0,
  completed_calls INTEGER NOT NULL DEFAULT 0,
  successful_calls INTEGER NOT NULL DEFAULT 0,
  failed_calls INTEGER NOT NULL DEFAULT 0,
  
  -- Scheduling
  start_date DATE NOT NULL, -- When campaign should start
  end_date DATE, -- Optional: when campaign should end
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMPTZ, -- When campaign actually started
  completed_at TIMESTAMPTZ, -- When all calls completed
  
  -- Data isolation
  UNIQUE(id, user_id),
  FOREIGN KEY (agent_id, user_id) REFERENCES agents(id, user_id) ON DELETE RESTRICT
);

-- Indexes for campaigns
CREATE INDEX idx_call_campaigns_user_id ON call_campaigns(user_id);
CREATE INDEX idx_call_campaigns_status ON call_campaigns(status);
CREATE INDEX idx_call_campaigns_agent_id ON call_campaigns(agent_id);
CREATE INDEX idx_call_campaigns_start_date ON call_campaigns(start_date) WHERE status IN ('scheduled', 'active');

-- Comments
COMMENT ON TABLE call_campaigns IS 'Manages batch calling campaigns with scheduling and time windows';
COMMENT ON COLUMN call_campaigns.next_action IS 'User-defined goal for this campaign (e.g., "Schedule demos", "Follow up on pricing")';
COMMENT ON COLUMN call_campaigns.first_call_time IS 'Daily start time for calls (recurring)';
COMMENT ON COLUMN call_campaigns.last_call_time IS 'Daily end time for calls (recurring)';

-- =====================================================
-- 3. Create Call Queue Table
-- =====================================================

CREATE TABLE IF NOT EXISTS call_queue (
  -- Primary identifiers
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES call_campaigns(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  -- Contact details (denormalized for performance)
  phone_number VARCHAR(50) NOT NULL,
  contact_name VARCHAR(255), -- From contacts table
  
  -- Call configuration
  user_data JSONB NOT NULL DEFAULT '{}', -- Contains summary + next_action for Bolna API
  
  -- Queue management
  status VARCHAR(20) NOT NULL DEFAULT 'queued' 
    CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled', 'skipped')),
  
  priority INTEGER NOT NULL DEFAULT 0, -- Higher = called first (contacts with names get priority)
  position INTEGER NOT NULL, -- Position in user's queue
  
  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL, -- Specific time this call should be made
  
  -- Execution tracking
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Result tracking
  call_id UUID REFERENCES calls(id) ON DELETE SET NULL, -- Set when call actually starts
  failure_reason TEXT, -- If failed, why?
  
  -- Round-robin tracking (for system-level concurrency)
  last_system_allocation_at TIMESTAMPTZ, -- Last time this user got a system slot
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Data isolation
  UNIQUE(id, user_id),
  FOREIGN KEY (campaign_id, user_id) REFERENCES call_campaigns(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id, user_id) REFERENCES agents(id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (contact_id, user_id) REFERENCES contacts(id, user_id) ON DELETE CASCADE
);

-- Indexes for queue
CREATE INDEX idx_call_queue_user_status ON call_queue(user_id, status);
CREATE INDEX idx_call_queue_campaign_status ON call_queue(campaign_id, status);
CREATE INDEX idx_call_queue_scheduled_for ON call_queue(scheduled_for) WHERE status = 'queued';
CREATE INDEX idx_call_queue_priority_position ON call_queue(user_id, priority DESC, position ASC) WHERE status = 'queued';
CREATE INDEX idx_call_queue_round_robin ON call_queue(user_id, last_system_allocation_at) WHERE status = 'queued';

-- Comments
COMMENT ON TABLE call_queue IS 'Queue for managing batch call execution with time-based scheduling';
COMMENT ON COLUMN call_queue.priority IS 'Priority score (contacts with names get higher priority)';
COMMENT ON COLUMN call_queue.position IS 'FIFO position within user queue';
COMMENT ON COLUMN call_queue.scheduled_for IS 'Exact timestamp when this call should be initiated';
COMMENT ON COLUMN call_queue.user_data IS 'JSON payload for Bolna API containing summary and next_action';
COMMENT ON COLUMN call_queue.last_system_allocation_at IS 'Used for round-robin system-level concurrency allocation';

-- =====================================================
-- 4. Create Update Triggers
-- =====================================================

-- Auto-update updated_at for campaigns
CREATE OR REPLACE FUNCTION update_call_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_call_campaigns_updated_at
  BEFORE UPDATE ON call_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_call_campaigns_updated_at();

-- Auto-update updated_at for queue
CREATE OR REPLACE FUNCTION update_call_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_call_queue_updated_at
  BEFORE UPDATE ON call_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_call_queue_updated_at();

-- =====================================================
-- 5. Create Campaign Statistics Update Trigger
-- =====================================================

-- Auto-update campaign statistics when queue items complete
CREATE OR REPLACE FUNCTION update_campaign_statistics()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE call_campaigns
    SET 
      completed_calls = completed_calls + 1,
      successful_calls = CASE 
        WHEN NEW.call_id IS NOT NULL THEN successful_calls + 1 
        ELSE successful_calls 
      END
    WHERE id = NEW.campaign_id;
  END IF;
  
  IF NEW.status = 'failed' AND OLD.status != 'failed' THEN
    UPDATE call_campaigns
    SET failed_calls = failed_calls + 1
    WHERE id = NEW.campaign_id;
  END IF;
  
  -- Mark campaign as completed if all calls done
  UPDATE call_campaigns
  SET 
    status = 'completed',
    completed_at = CURRENT_TIMESTAMP
  WHERE 
    id = NEW.campaign_id 
    AND status = 'active'
    AND completed_calls + failed_calls >= total_contacts;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_campaign_statistics
  AFTER UPDATE OF status ON call_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_campaign_statistics();

-- =====================================================
-- 6. Create Helper Functions
-- =====================================================

-- Function to get next queued call for a user (respects priority and FIFO)
CREATE OR REPLACE FUNCTION get_next_queued_call(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_queue_id UUID;
BEGIN
  SELECT id INTO v_queue_id
  FROM call_queue
  WHERE 
    user_id = p_user_id
    AND status = 'queued'
    AND scheduled_for <= CURRENT_TIMESTAMP
  ORDER BY priority DESC, position ASC
  LIMIT 1;
  
  RETURN v_queue_id;
END;
$$ LANGUAGE plpgsql;

-- Function to count active calls for a user
CREATE OR REPLACE FUNCTION count_active_calls(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM calls
  WHERE 
    user_id = p_user_id
    AND status IN ('in_progress', 'initiated', 'ringing');
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Function to count system-wide active calls
CREATE OR REPLACE FUNCTION count_system_active_calls()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM calls
  WHERE status IN ('in_progress', 'initiated', 'ringing');
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7. Grant Permissions (if using RLS)
-- =====================================================

-- Grant access to authenticated users
-- (Adjust based on your RLS policy)

COMMENT ON TABLE call_campaigns IS 'Campaign management for batch calling - User can only access their own campaigns';
COMMENT ON TABLE call_queue IS 'Call queue with time-based scheduling - User can only access their own queue items';

-- =====================================================
-- Migration Complete
-- =====================================================
