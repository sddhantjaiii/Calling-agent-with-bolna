-- Migration 1005: Create Email Campaigns Table
-- Date: December 13, 2025
-- Purpose: Add email_campaigns table for email campaign management

-- ============================================
-- Create email_campaigns table
-- ============================================

CREATE TABLE IF NOT EXISTS email_campaigns (
  -- Primary identifiers
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Campaign details
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Email content (template for campaign)
  subject TEXT NOT NULL,
  body_html TEXT,
  body_text TEXT,
  
  -- Campaign status
  status VARCHAR(20) NOT NULL DEFAULT 'draft' 
    CHECK (status IN ('draft', 'scheduled', 'in_progress', 'completed', 'cancelled')),
  
  -- Statistics
  total_contacts INTEGER NOT NULL DEFAULT 0,
  completed_emails INTEGER NOT NULL DEFAULT 0,
  successful_emails INTEGER NOT NULL DEFAULT 0,
  failed_emails INTEGER NOT NULL DEFAULT 0,
  opened_emails INTEGER NOT NULL DEFAULT 0,
  
  -- Scheduling
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  scheduled_at TIMESTAMP WITH TIME ZONE, -- When to start sending
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for email_campaigns
CREATE INDEX IF NOT EXISTS idx_email_campaigns_user_id ON email_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_scheduled_at ON email_campaigns(scheduled_at) WHERE status = 'scheduled';

-- Comments
COMMENT ON TABLE email_campaigns IS 'Manages batch email campaigns with scheduling';
COMMENT ON COLUMN email_campaigns.status IS 'Campaign status: draft, scheduled, in_progress, completed, cancelled';

-- ============================================
-- Add campaign_id to emails table if not exists
-- ============================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'emails' AND column_name = 'campaign_id'
    ) THEN
        ALTER TABLE emails ADD COLUMN campaign_id UUID REFERENCES email_campaigns(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_emails_campaign_id ON emails(campaign_id);
    END IF;
END $$;
