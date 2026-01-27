-- Migration: Add Salesperson Analytics and Follow-up Assignment
-- Description: Extends team_members infrastructure for salesperson performance tracking
--              Adds follow-up assignment to team members and creates analytics table

-- ============================================================================
-- STEP 1: Add follow-up assignment to team members
-- ============================================================================

-- Add assigned_to_team_member_id to follow_ups table
ALTER TABLE follow_ups 
ADD COLUMN IF NOT EXISTS assigned_to_team_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_follow_ups_assigned_to_team_member 
ON follow_ups(assigned_to_team_member_id) WHERE assigned_to_team_member_id IS NOT NULL;

-- Index for team member's follow-ups
CREATE INDEX IF NOT EXISTS idx_follow_ups_team_member_status 
ON follow_ups(assigned_to_team_member_id, follow_up_status) WHERE assigned_to_team_member_id IS NOT NULL;

-- ============================================================================
-- STEP 2: Create team_member_analytics table
-- ============================================================================

CREATE TABLE IF NOT EXISTS team_member_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
    tenant_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    
    -- Lead metrics
    leads_assigned_count INTEGER NOT NULL DEFAULT 0,
    leads_active_count INTEGER NOT NULL DEFAULT 0,
    qualified_leads_count INTEGER NOT NULL DEFAULT 0,  -- total_score >= 70
    
    -- Follow-up metrics
    follow_ups_assigned_count INTEGER NOT NULL DEFAULT 0,
    follow_ups_completed_count INTEGER NOT NULL DEFAULT 0,
    follow_ups_pending_count INTEGER NOT NULL DEFAULT 0,
    
    -- Activity metrics
    lead_edits_count INTEGER NOT NULL DEFAULT 0,  -- Manual edits from lead_intelligence_events
    notes_added_count INTEGER NOT NULL DEFAULT 0,  -- Notes from lead_intelligence_events
    status_changes_count INTEGER NOT NULL DEFAULT 0,  -- Status changes
    
    -- Manual call tracking (when team member adds lead intelligence with mode selection)
    manual_calls_logged_count INTEGER NOT NULL DEFAULT 0,
    
    -- Conversion metrics
    demos_scheduled_count INTEGER NOT NULL DEFAULT 0,  -- Leads with demo_book_datetime set
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint: one row per team member per date
    CONSTRAINT team_member_analytics_unique_member_date UNIQUE (team_member_id, date)
);

-- ============================================================================
-- STEP 3: Create indexes for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_team_member_analytics_member_date 
ON team_member_analytics(team_member_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_team_member_analytics_tenant_date 
ON team_member_analytics(tenant_user_id, date DESC);

-- Note: Removed partial index with CURRENT_DATE as it's not IMMUTABLE
-- Query optimizer will still use the tenant_date index efficiently

-- ============================================================================
-- STEP 4: Create trigger for automatic update of updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_team_member_analytics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_team_member_analytics_updated_at ON team_member_analytics;
CREATE TRIGGER trg_team_member_analytics_updated_at
    BEFORE UPDATE ON team_member_analytics
    FOR EACH ROW
    EXECUTE FUNCTION update_team_member_analytics_updated_at();

-- ============================================================================
-- STEP 5: Add comments for documentation
-- ============================================================================

COMMENT ON TABLE team_member_analytics IS 'Daily analytics for team member (salesperson) performance tracking';
COMMENT ON COLUMN team_member_analytics.team_member_id IS 'Reference to team member';
COMMENT ON COLUMN team_member_analytics.tenant_user_id IS 'Reference to tenant/owner for quick filtering';
COMMENT ON COLUMN team_member_analytics.date IS 'Date for these analytics (daily aggregation)';
COMMENT ON COLUMN team_member_analytics.leads_assigned_count IS 'Total leads assigned to this team member on this date';
COMMENT ON COLUMN team_member_analytics.leads_active_count IS 'Active leads (not closed) assigned to team member';
COMMENT ON COLUMN team_member_analytics.qualified_leads_count IS 'Qualified leads (total_score >= 70) assigned to team member';
COMMENT ON COLUMN team_member_analytics.follow_ups_assigned_count IS 'Follow-ups assigned to this team member';
COMMENT ON COLUMN team_member_analytics.follow_ups_completed_count IS 'Follow-ups marked as completed by this team member';
COMMENT ON COLUMN team_member_analytics.follow_ups_pending_count IS 'Follow-ups still pending for this team member';
COMMENT ON COLUMN team_member_analytics.lead_edits_count IS 'Number of lead edits made by team member';
COMMENT ON COLUMN team_member_analytics.notes_added_count IS 'Number of notes added by team member';
COMMENT ON COLUMN team_member_analytics.manual_calls_logged_count IS 'Number of manual calls logged when adding lead intelligence';
COMMENT ON COLUMN team_member_analytics.demos_scheduled_count IS 'Number of demos scheduled for assigned leads';

COMMENT ON COLUMN follow_ups.assigned_to_team_member_id IS 'Team member assigned to complete this follow-up';
