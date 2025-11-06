-- Migration: Unified Notification System
-- Date: 2025-11-05
-- Purpose: Replace scattered notification tracking with unified system

BEGIN;

-- =====================================================
-- STEP 1: Create Notifications Table
-- =====================================================

-- Main notification tracking table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Notification classification
  notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN (
    'email_verification',
    'email_verification_reminder',
    'credit_low_15',
    'credit_low_5',
    'credit_exhausted_0',
    'credits_added',
    'campaign_summary',
    'marketing'  -- Future use
  )),
  
  -- Delivery details
  recipient_email VARCHAR(255) NOT NULL,
  
  -- Status tracking (fire-and-forget)
  status VARCHAR(20) NOT NULL DEFAULT 'sent' CHECK (status IN (
    'sent',      -- Successfully sent
    'failed',    -- Delivery failed
    'skipped'    -- User preference disabled
  )),
  
  -- Related entities (nullable)
  related_campaign_id UUID REFERENCES call_campaigns(id) ON DELETE SET NULL,
  related_transaction_id UUID REFERENCES credit_transactions(id) ON DELETE SET NULL,
  
  -- Notification payload
  notification_data JSONB, -- {credits_amount, campaign_name, hot_leads_count, etc.}
  
  -- Atomicity & deduplication
  idempotency_key VARCHAR(255) NOT NULL,
  
  -- Error tracking
  error_message TEXT,
  
  -- Timestamps
  sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Data isolation
  UNIQUE(id, user_id),
  UNIQUE(idempotency_key) -- Atomic claim mechanism
);

-- Indexes for performance
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_user_type ON notifications(user_id, notification_type);
CREATE INDEX idx_notifications_type_status ON notifications(notification_type, status);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_notifications_idempotency ON notifications(idempotency_key);
CREATE INDEX idx_notifications_campaign ON notifications(related_campaign_id) WHERE related_campaign_id IS NOT NULL;

-- Comments
COMMENT ON TABLE notifications IS 'Unified notification tracking for all email notifications with atomicity guarantees';
COMMENT ON COLUMN notifications.idempotency_key IS 'Unique constraint ensures atomic claims. Format: {user_id}:{type}:{related_id}:{date_or_window}';
COMMENT ON COLUMN notifications.notification_data IS 'JSONB payload for template rendering';
COMMENT ON COLUMN notifications.status IS 'Fire-and-forget: sent (success), failed (error), skipped (preference disabled)';

-- =====================================================
-- STEP 2: Create Notification Preferences Table
-- =====================================================

-- User notification preferences
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  
  -- Preference toggles (all enabled by default)
  low_credit_alerts BOOLEAN NOT NULL DEFAULT true,
  credits_added_emails BOOLEAN NOT NULL DEFAULT true,
  campaign_summary_emails BOOLEAN NOT NULL DEFAULT true,
  email_verification_reminders BOOLEAN NOT NULL DEFAULT true,
  marketing_emails BOOLEAN NOT NULL DEFAULT true, -- Future use
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(id, user_id) -- Data isolation pattern
);

-- Index
CREATE INDEX idx_notification_preferences_user ON notification_preferences(user_id);

-- Trigger for updated_at
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE notification_preferences IS 'Per-user notification opt-in/opt-out controls';
COMMENT ON COLUMN notification_preferences.low_credit_alerts IS 'Allow credit threshold notifications (15, 5, 0 credits)';
COMMENT ON COLUMN notification_preferences.campaign_summary_emails IS 'Allow campaign completion summary emails';
COMMENT ON COLUMN notification_preferences.credits_added_emails IS 'Allow purchase confirmation emails';
COMMENT ON COLUMN notification_preferences.marketing_emails IS 'Allow marketing emails (future use)';

-- =====================================================
-- STEP 3: Initialize Preferences for Existing Users
-- =====================================================

-- Create default preferences for all existing users
INSERT INTO notification_preferences (user_id, low_credit_alerts, credits_added_emails, campaign_summary_emails, email_verification_reminders, marketing_emails)
SELECT 
  id,
  true, -- low_credit_alerts
  true, -- credits_added_emails
  true, -- campaign_summary_emails
  true, -- email_verification_reminders
  true  -- marketing_emails
FROM users
ON CONFLICT (user_id) DO NOTHING;

-- =====================================================
-- STEP 4: Drop Old System
-- =====================================================

-- Drop trigger and function
DROP TRIGGER IF EXISTS trigger_reset_credit_warnings ON users;
DROP FUNCTION IF EXISTS reset_credit_warnings();

-- Drop old table
DROP TABLE IF EXISTS credit_notifications CASCADE;

-- Drop old columns from users table
ALTER TABLE users DROP COLUMN IF EXISTS credit_warning_level;
ALTER TABLE users DROP COLUMN IF EXISTS last_credit_warning_at;

COMMIT;
