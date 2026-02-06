-- Migration: Auto Engagement Flows System
-- Description: Creates tables for automated lead engagement workflows
-- Date: 2026-02-05

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- Table 1: auto_engagement_flows
-- Main flow configuration table
-- =====================================================
CREATE TABLE IF NOT EXISTS auto_engagement_flows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_enabled BOOLEAN DEFAULT false,
  priority INTEGER NOT NULL DEFAULT 0, -- Lower number = higher priority
  
  -- Business hours configuration (per-flow)
  use_custom_business_hours BOOLEAN DEFAULT false,
  business_hours_start TIME,
  business_hours_end TIME,
  business_hours_timezone VARCHAR(100),
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id),
  
  -- Ensure unique priorities per user
  CONSTRAINT unique_user_priority UNIQUE(user_id, priority)
);

-- Indexes for auto_engagement_flows
CREATE INDEX IF NOT EXISTS idx_flows_user_enabled ON auto_engagement_flows(user_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_flows_priority ON auto_engagement_flows(user_id, priority) WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_flows_created_at ON auto_engagement_flows(created_at DESC);

-- =====================================================
-- Table 2: flow_trigger_conditions
-- Defines when a flow should trigger
-- =====================================================
CREATE TABLE IF NOT EXISTS flow_trigger_conditions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_id UUID NOT NULL REFERENCES auto_engagement_flows(id) ON DELETE CASCADE,
  
  condition_type VARCHAR(50) NOT NULL, -- 'lead_source', 'entry_type', 'custom_field'
  condition_operator VARCHAR(20) NOT NULL DEFAULT 'equals', -- 'equals', 'any', 'contains', 'not_equals'
  condition_value VARCHAR(255), -- 'IndiaMART', 'Email', null for 'any'
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Validation constraint
  CONSTRAINT valid_condition_type CHECK (condition_type IN ('lead_source', 'entry_type', 'custom_field')),
  CONSTRAINT valid_condition_operator CHECK (condition_operator IN ('equals', 'any', 'contains', 'not_equals'))
);

-- Indexes for flow_trigger_conditions
CREATE INDEX IF NOT EXISTS idx_conditions_flow ON flow_trigger_conditions(flow_id);

-- =====================================================
-- Table 3: flow_actions
-- Sequential actions to execute
-- =====================================================
CREATE TABLE IF NOT EXISTS flow_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_id UUID NOT NULL REFERENCES auto_engagement_flows(id) ON DELETE CASCADE,
  
  action_order INTEGER NOT NULL, -- 1, 2, 3... (execution sequence)
  action_type VARCHAR(50) NOT NULL, -- 'ai_call', 'whatsapp_message', 'email', 'wait'
  action_config JSONB NOT NULL DEFAULT '{}',
  
  -- Conditional execution
  condition_type VARCHAR(50), -- 'call_outcome', 'always', 'previous_action_status'
  condition_value VARCHAR(50), -- 'missed', 'failed', 'answered', 'success', 'failed'
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Ensure unique action order per flow
  CONSTRAINT unique_flow_action_order UNIQUE(flow_id, action_order),
  
  -- Validation constraints
  CONSTRAINT valid_action_type CHECK (action_type IN ('ai_call', 'whatsapp_message', 'email', 'wait')),
  CONSTRAINT valid_condition_type CHECK (condition_type IS NULL OR condition_type IN ('call_outcome', 'always', 'previous_action_status')),
  CONSTRAINT positive_action_order CHECK (action_order > 0)
);

-- Indexes for flow_actions
CREATE INDEX IF NOT EXISTS idx_actions_flow_order ON flow_actions(flow_id, action_order);
CREATE INDEX IF NOT EXISTS idx_actions_type ON flow_actions(action_type);

-- =====================================================
-- Table 4: flow_executions
-- Tracks each flow execution instance
-- =====================================================
CREATE TABLE IF NOT EXISTS flow_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_id UUID NOT NULL REFERENCES auto_engagement_flows(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  triggered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'running', -- 'running', 'completed', 'failed', 'cancelled', 'skipped'
  current_action_step INTEGER DEFAULT 1,
  
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  
  -- Execution metadata
  metadata JSONB DEFAULT '{}', -- trigger_source, matched_conditions, etc.
  
  -- Test mode flag
  is_test_run BOOLEAN DEFAULT false,
  
  -- Validation constraint
  CONSTRAINT valid_execution_status CHECK (status IN ('running', 'completed', 'failed', 'cancelled', 'skipped'))
);

-- Indexes for flow_executions
CREATE INDEX IF NOT EXISTS idx_executions_flow ON flow_executions(flow_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_contact ON flow_executions(contact_id);
CREATE INDEX IF NOT EXISTS idx_executions_user_status ON flow_executions(user_id, status, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_test ON flow_executions(is_test_run) WHERE is_test_run = true;
CREATE INDEX IF NOT EXISTS idx_executions_status ON flow_executions(status, triggered_at DESC);

-- =====================================================
-- Table 5: flow_action_logs
-- Individual action execution results
-- =====================================================
CREATE TABLE IF NOT EXISTS flow_action_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_execution_id UUID NOT NULL REFERENCES flow_executions(id) ON DELETE CASCADE,
  action_id UUID NOT NULL REFERENCES flow_actions(id) ON DELETE CASCADE,
  
  action_type VARCHAR(50) NOT NULL,
  action_order INTEGER NOT NULL,
  
  started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'running', 'success', 'failed', 'skipped'
  
  -- Action results
  result_data JSONB DEFAULT '{}', -- call_id, message_id, email_id, etc.
  error_message TEXT,
  
  -- For conditional execution tracking
  skip_reason VARCHAR(255), -- "Call was answered", "DNC tag found", etc.
  
  -- Validation constraint
  CONSTRAINT valid_action_log_status CHECK (status IN ('pending', 'running', 'success', 'failed', 'skipped'))
);

-- Indexes for flow_action_logs
CREATE INDEX IF NOT EXISTS idx_action_logs_execution ON flow_action_logs(flow_execution_id, action_order);
CREATE INDEX IF NOT EXISTS idx_action_logs_status ON flow_action_logs(status);
CREATE INDEX IF NOT EXISTS idx_action_logs_started_at ON flow_action_logs(started_at DESC);

-- =====================================================
-- Trigger: Update updated_at timestamp
-- =====================================================
CREATE OR REPLACE FUNCTION update_flow_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_flow_timestamp
  BEFORE UPDATE ON auto_engagement_flows
  FOR EACH ROW
  EXECUTE FUNCTION update_flow_updated_at();

-- =====================================================
-- Comments for documentation
-- =====================================================
COMMENT ON TABLE auto_engagement_flows IS 'Main configuration table for automated engagement flows';
COMMENT ON TABLE flow_trigger_conditions IS 'Defines conditions that trigger a flow execution';
COMMENT ON TABLE flow_actions IS 'Sequential actions to be executed in a flow';
COMMENT ON TABLE flow_executions IS 'Tracks individual flow execution instances';
COMMENT ON TABLE flow_action_logs IS 'Logs individual action results within a flow execution';

COMMENT ON COLUMN auto_engagement_flows.priority IS 'Lower number = higher priority. Used to determine which flow executes when multiple flows match';
COMMENT ON COLUMN auto_engagement_flows.is_enabled IS 'Toggle to enable/disable flow without deleting it';
COMMENT ON COLUMN flow_actions.action_order IS 'Execution sequence number (1, 2, 3, ...)';
COMMENT ON COLUMN flow_actions.condition_type IS 'Type of condition to check before executing this action';
COMMENT ON COLUMN flow_executions.is_test_run IS 'If true, this is a test execution that does not trigger actual actions';
COMMENT ON COLUMN flow_action_logs.skip_reason IS 'Human-readable reason why this action was skipped';
