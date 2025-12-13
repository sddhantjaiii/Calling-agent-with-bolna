-- Migration 1004: Email Tracking System
-- Date: December 13, 2025
-- Purpose: Add email tracking functionality for contacts

-- ============================================
-- 1. Create email_campaigns table
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
    CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled')),
  
  -- Statistics
  total_contacts INTEGER NOT NULL DEFAULT 0,
  completed_emails INTEGER NOT NULL DEFAULT 0,
  successful_emails INTEGER NOT NULL DEFAULT 0,
  failed_emails INTEGER NOT NULL DEFAULT 0,
  opened_emails INTEGER NOT NULL DEFAULT 0,
  
  -- Scheduling
  start_date DATE NOT NULL,
  end_date DATE,
  scheduled_at TIMESTAMP WITH TIME ZONE, -- When to start sending
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Data isolation
  UNIQUE(id, user_id)
);

-- Indexes for email_campaigns
CREATE INDEX IF NOT EXISTS idx_email_campaigns_user_id ON email_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_start_date ON email_campaigns(start_date) WHERE status IN ('scheduled', 'active');

-- Comments
COMMENT ON TABLE email_campaigns IS 'Manages batch email campaigns with scheduling';
COMMENT ON COLUMN email_campaigns.status IS 'Campaign status: draft, scheduled, active, paused, completed, cancelled';

-- ============================================
-- 2. Create emails table
-- ============================================

CREATE TABLE IF NOT EXISTS emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE SET NULL,
  
  -- Email details
  from_email VARCHAR(255) NOT NULL,
  from_name VARCHAR(255),
  to_email VARCHAR(255) NOT NULL,
  to_name VARCHAR(255),
  cc_emails TEXT[], -- Array of CC email addresses
  bcc_emails TEXT[], -- Array of BCC email addresses
  
  -- Content
  subject TEXT NOT NULL,
  body_html TEXT,
  body_text TEXT,
  has_attachments BOOLEAN DEFAULT false,
  attachment_count INTEGER DEFAULT 0,
  
  -- Tracking
  status VARCHAR(50) DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'opened', 'bounced', 'failed')),
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  delivered_at TIMESTAMP WITH TIME ZONE,
  opened_at TIMESTAMP WITH TIME ZONE,
  bounced_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,
  
  -- External tracking
  external_message_id VARCHAR(500), -- ZeptoMail message ID
  error_message TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Data isolation
  UNIQUE(id, user_id)
);

-- ============================================
-- 3. Create indexes for emails table
-- ============================================

CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails(user_id);
CREATE INDEX IF NOT EXISTS idx_emails_contact_id ON emails(contact_id);
CREATE INDEX IF NOT EXISTS idx_emails_campaign_id ON emails(campaign_id);
CREATE INDEX IF NOT EXISTS idx_emails_sent_at ON emails(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);
CREATE INDEX IF NOT EXISTS idx_emails_to_email ON emails(to_email);

-- ============================================
-- 4. Create email_attachments table
-- ============================================

CREATE TABLE IF NOT EXISTS email_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  
  -- Attachment details
  filename VARCHAR(500) NOT NULL,
  content_type VARCHAR(255) NOT NULL,
  file_size INTEGER NOT NULL, -- Size in bytes
  file_data TEXT, -- Base64 encoded file data
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for attachments
CREATE INDEX IF NOT EXISTS idx_email_attachments_email_id ON email_attachments(email_id);

-- ============================================
-- 5. Update contacts table
-- ============================================

-- Add email tracking fields to contacts
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS last_email_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS total_emails_sent INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS total_emails_opened INTEGER DEFAULT 0 NOT NULL;

-- Create index for email tracking
CREATE INDEX IF NOT EXISTS idx_contacts_last_email_sent_at ON contacts(last_email_sent_at DESC NULLS LAST);

-- ============================================
-- 6. Create trigger to update contact email stats
-- ============================================

CREATE OR REPLACE FUNCTION update_contact_email_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update contact's last email sent timestamp and count
  UPDATE contacts
  SET 
    last_email_sent_at = NEW.sent_at,
    total_emails_sent = total_emails_sent + 1,
    updated_at = NOW()
  WHERE id = NEW.contact_id;
  
  -- If email was opened, increment opened count
  IF NEW.status = 'opened' AND OLD.status != 'opened' THEN
    UPDATE contacts
    SET 
      total_emails_opened = total_emails_opened + 1,
      updated_at = NOW()
    WHERE id = NEW.contact_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for new emails
DROP TRIGGER IF EXISTS trigger_update_contact_email_stats_insert ON emails;
CREATE TRIGGER trigger_update_contact_email_stats_insert
AFTER INSERT ON emails
FOR EACH ROW
WHEN (NEW.contact_id IS NOT NULL)
EXECUTE FUNCTION update_contact_email_stats();

-- Create trigger for email status updates (e.g., opened)
DROP TRIGGER IF EXISTS trigger_update_contact_email_stats_update ON emails;
CREATE TRIGGER trigger_update_contact_email_stats_update
AFTER UPDATE ON emails
FOR EACH ROW
WHEN (NEW.contact_id IS NOT NULL AND NEW.status = 'opened' AND OLD.status != 'opened')
EXECUTE FUNCTION update_contact_email_stats();

-- ============================================
-- 6. Create email_attachments table for file tracking
-- ============================================

CREATE TABLE IF NOT EXISTS email_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(255),
  file_size INTEGER, -- in bytes
  storage_path TEXT, -- Optional: if storing files locally/cloud
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_attachments_email_id ON email_attachments(email_id);

-- ============================================
-- 7. Add comment for documentation
-- ============================================

COMMENT ON TABLE emails IS 'Tracks all emails sent to contacts, including campaign emails';
COMMENT ON TABLE email_attachments IS 'Stores metadata about email attachments';
COMMENT ON COLUMN emails.status IS 'Email delivery status: sent, delivered, opened, bounced, failed';
COMMENT ON COLUMN contacts.last_email_sent_at IS 'Timestamp of the last email sent to this contact';
COMMENT ON COLUMN contacts.total_emails_sent IS 'Total number of emails sent to this contact';
COMMENT ON COLUMN contacts.total_emails_opened IS 'Total number of emails opened by this contact';
