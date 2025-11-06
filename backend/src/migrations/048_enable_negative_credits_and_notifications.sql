-- Migration: Enable negative credits and add email notification tracking
-- Date: 2025-10-10
-- Purpose: Allow users to have negative credits and track email notifications

BEGIN;

-- 1. Remove the CHECK constraint that prevents negative credits
ALTER TABLE users 
DROP CONSTRAINT IF EXISTS users_credits_check;

-- 2. Create table for tracking email notifications to prevent spam
CREATE TABLE IF NOT EXISTS credit_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(20) NOT NULL CHECK (notification_type IN ('credits_15', 'credits_5', 'credits_0')),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    credits_at_time INTEGER NOT NULL,
    email_sent_to VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create basic indexes for performance (no complex constraints)
-- We'll handle duplicate prevention in application logic with 24-hour checks

-- 4. Create indexes for performance
CREATE INDEX idx_credit_notifications_user_id ON credit_notifications (user_id);
CREATE INDEX idx_credit_notifications_type_sent ON credit_notifications (notification_type, sent_at);

-- 5. Add columns to users table for tracking credit notification states
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS last_credit_warning_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS credit_warning_level INTEGER DEFAULT 0 CHECK (credit_warning_level >= 0 AND credit_warning_level <= 3);

-- credit_warning_level meanings:
-- 0: No warnings needed (credits > 15)
-- 1: Warning sent for credits <= 15  
-- 2: Critical sent for credits <= 5
-- 3: Zero credits reached

-- 6. Create function to reset warning levels when credits are added
CREATE OR REPLACE FUNCTION reset_credit_warnings()
RETURNS TRIGGER AS $$
BEGIN
    -- If credits increased, reset warning level appropriately
    IF NEW.credits > OLD.credits THEN
        IF NEW.credits > 15 THEN
            NEW.credit_warning_level = 0;
            NEW.last_credit_warning_at = NULL;
        ELSIF NEW.credits > 5 THEN
            NEW.credit_warning_level = 1;
        ELSIF NEW.credits > 0 THEN
            NEW.credit_warning_level = 2;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Create trigger to automatically reset warning levels
DROP TRIGGER IF EXISTS trigger_reset_credit_warnings ON users;
CREATE TRIGGER trigger_reset_credit_warnings
    BEFORE UPDATE OF credits ON users
    FOR EACH ROW
    EXECUTE FUNCTION reset_credit_warnings();

-- 8. Add comments for documentation
COMMENT ON TABLE credit_notifications IS 'Tracks email notifications sent to users about low credit balances';
COMMENT ON COLUMN users.credit_warning_level IS 'Tracks which credit warning level has been sent: 0=none, 1=<=15, 2=<=5, 3=<=0';
COMMENT ON COLUMN users.last_credit_warning_at IS 'Timestamp of last credit warning email sent';

COMMIT;