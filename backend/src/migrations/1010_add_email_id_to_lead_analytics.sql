-- Migration: Add email_id to lead_analytics for email campaign tracking
-- Date: 2026-01-18
-- Purpose: Link lead analytics to sent emails from campaigns for interaction timeline

-- Add email_id column to lead_analytics table
ALTER TABLE lead_analytics 
ADD COLUMN IF NOT EXISTS email_id UUID REFERENCES emails(id) ON DELETE SET NULL;

-- Create index for efficient email lookups
CREATE INDEX IF NOT EXISTS idx_lead_analytics_email_id 
ON lead_analytics(email_id) 
WHERE email_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN lead_analytics.email_id IS 'Links to email campaigns sent to this lead for interaction timeline tracking';
