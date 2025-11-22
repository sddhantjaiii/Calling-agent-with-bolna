-- Migration 012: Contact Enhancements - Tags, Last Contact, Call Attempts
-- Date: November 23, 2025
-- Purpose: Add tags, last contact tracking, and call attempt counters to contacts table

-- ============================================
-- 1. Add new columns to contacts table
-- ============================================

-- Add tags array column for custom user tags
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}' NOT NULL;

-- Add last contact timestamp (auto-updated from calls)
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add call attempt counters (auto-incremented from webhook)
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS call_attempted_busy INTEGER DEFAULT 0 NOT NULL CHECK (call_attempted_busy >= 0);

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS call_attempted_no_answer INTEGER DEFAULT 0 NOT NULL CHECK (call_attempted_no_answer >= 0);

-- ============================================
-- 2. Update auto_creation_source constraint
-- ============================================

-- Drop old constraint if exists
ALTER TABLE contacts
DROP CONSTRAINT IF EXISTS contacts_auto_creation_source_check;

-- Add new constraint with 'bulk_upload' value
ALTER TABLE contacts
ADD CONSTRAINT contacts_auto_creation_source_check 
CHECK (auto_creation_source IN ('webhook', 'manual', 'bulk_upload'));

-- ============================================
-- 3. Add indexes for performance
-- ============================================

-- Index for tags filtering (GIN index for array operations)
CREATE INDEX IF NOT EXISTS idx_contacts_tags 
ON contacts USING GIN (tags);

-- Index for last_contact_at sorting
CREATE INDEX IF NOT EXISTS idx_contacts_last_contact_at 
ON contacts(last_contact_at DESC NULLS LAST);

-- Index for call attempt filtering
CREATE INDEX IF NOT EXISTS idx_contacts_call_attempts 
ON contacts(call_attempted_busy, call_attempted_no_answer);

-- Composite index for source filtering
CREATE INDEX IF NOT EXISTS idx_contacts_source 
ON contacts(auto_creation_source) WHERE auto_creation_source IS NOT NULL;

-- ============================================
-- 4. Backfill last_contact_at from existing calls
-- ============================================

-- Update contacts with their last call completion time
UPDATE contacts c
SET last_contact_at = (
  SELECT MAX(COALESCE(completed_at, call_answered_at, created_at))
  FROM calls 
  WHERE contact_id = c.id
    AND (completed_at IS NOT NULL OR call_answered_at IS NOT NULL)
)
WHERE EXISTS (
  SELECT 1 FROM calls 
  WHERE contact_id = c.id
    AND (completed_at IS NOT NULL OR call_answered_at IS NOT NULL)
);

-- ============================================
-- 5. Backfill call attempt counters from existing calls
-- ============================================

-- Update busy attempt counts
UPDATE contacts c
SET call_attempted_busy = (
  SELECT COUNT(*)
  FROM calls 
  WHERE contact_id = c.id
    AND call_lifecycle_status = 'busy'
)
WHERE EXISTS (
  SELECT 1 FROM calls 
  WHERE contact_id = c.id
    AND call_lifecycle_status = 'busy'
);

-- Update no-answer attempt counts
UPDATE contacts c
SET call_attempted_no_answer = (
  SELECT COUNT(*)
  FROM calls 
  WHERE contact_id = c.id
    AND call_lifecycle_status = 'no-answer'
)
WHERE EXISTS (
  SELECT 1 FROM calls 
  WHERE contact_id = c.id
    AND call_lifecycle_status = 'no-answer'
);

-- ============================================
-- 6. Add comments for documentation
-- ============================================

COMMENT ON COLUMN contacts.tags IS 
'Array of custom user-created tags for contact categorization and filtering';

COMMENT ON COLUMN contacts.last_contact_at IS 
'Timestamp of last call interaction, auto-updated from calls table';

COMMENT ON COLUMN contacts.call_attempted_busy IS 
'Counter for number of calls that resulted in busy status, auto-incremented';

COMMENT ON COLUMN contacts.call_attempted_no_answer IS 
'Counter for number of calls that resulted in no-answer status, auto-incremented';

COMMENT ON COLUMN contacts.auto_creation_source IS 
'Source of contact creation: webhook (inbound call), manual (form), bulk_upload (excel)';

-- ============================================
-- 7. Verification queries
-- ============================================

DO $$
DECLARE
  total_contacts INTEGER;
  contacts_with_tags INTEGER;
  contacts_with_last_contact INTEGER;
  contacts_with_busy_attempts INTEGER;
  contacts_with_no_answer_attempts INTEGER;
  bulk_upload_source_enabled BOOLEAN;
BEGIN
  -- Get statistics
  SELECT COUNT(*) INTO total_contacts FROM contacts;
  SELECT COUNT(*) INTO contacts_with_tags FROM contacts WHERE array_length(tags, 1) > 0;
  SELECT COUNT(*) INTO contacts_with_last_contact FROM contacts WHERE last_contact_at IS NOT NULL;
  SELECT COUNT(*) INTO contacts_with_busy_attempts FROM contacts WHERE call_attempted_busy > 0;
  SELECT COUNT(*) INTO contacts_with_no_answer_attempts FROM contacts WHERE call_attempted_no_answer > 0;
  
  -- Check if new source value works
  BEGIN
    INSERT INTO contacts (user_id, name, phone_number, auto_creation_source, tags)
    VALUES (
      (SELECT id FROM users LIMIT 1),
      '_test_contact_migration_012',
      '+1234567890123',
      'bulk_upload',
      ARRAY['test', 'migration']
    );
    
    DELETE FROM contacts WHERE name = '_test_contact_migration_012';
    bulk_upload_source_enabled := TRUE;
  EXCEPTION WHEN OTHERS THEN
    bulk_upload_source_enabled := FALSE;
  END;

  -- Log results
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Migration 012 - Contact Enhancements Complete';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Total contacts: %', total_contacts;
  RAISE NOTICE 'Contacts with tags: %', contacts_with_tags;
  RAISE NOTICE 'Contacts with last_contact_at: %', contacts_with_last_contact;
  RAISE NOTICE 'Contacts with busy attempts: %', contacts_with_busy_attempts;
  RAISE NOTICE 'Contacts with no-answer attempts: %', contacts_with_no_answer_attempts;
  RAISE NOTICE 'Bulk upload source enabled: %', bulk_upload_source_enabled;
  RAISE NOTICE '================================================';
  
  -- Verify columns exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contacts' AND column_name = 'tags') THEN
    RAISE EXCEPTION 'Migration failed: tags column not created';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contacts' AND column_name = 'last_contact_at') THEN
    RAISE EXCEPTION 'Migration failed: last_contact_at column not created';
  END IF;
  
  RAISE NOTICE 'All columns created successfully ✓';
END $$;
