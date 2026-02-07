-- Migration: Create email_templates table for auto-engagement flows
-- This table stores reusable email templates with variable support

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Template metadata
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Email content
  subject TEXT NOT NULL,
  body_html TEXT,
  body_text TEXT,
  
  -- Template variables (JSON array of variable names used in template)
  -- Example: ["name", "email", "company", "meeting_link"]
  variables JSONB DEFAULT '[]'::jsonb,
  
  -- Template category/type
  category VARCHAR(50) DEFAULT 'general',
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Multi-tenant isolation
  CONSTRAINT email_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_email_templates_user_id ON email_templates(user_id);
CREATE INDEX idx_email_templates_is_active ON email_templates(user_id, is_active);
CREATE INDEX idx_email_templates_category ON email_templates(user_id, category);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_email_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_email_templates_updated_at();

-- Add some default templates for users
-- Note: These will be added per-user when they first use the feature
COMMENT ON TABLE email_templates IS 'Reusable email templates for auto-engagement flows with variable substitution support';
COMMENT ON COLUMN email_templates.variables IS 'JSON array of variable names that can be replaced in subject and body (e.g., ["name", "email", "company"])';
