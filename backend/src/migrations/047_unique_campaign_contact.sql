-- =====================================================
-- Migration 047: Add unique constraint to prevent duplicate queue entries
-- =====================================================
-- Prevents the same contact from being added multiple times 
-- to the same campaign in the queue
-- =====================================================

-- Add unique constraint on (campaign_id, contact_id)
-- This ensures one contact can only be in a campaign queue once
ALTER TABLE call_queue
ADD CONSTRAINT call_queue_campaign_contact_unique 
UNIQUE (campaign_id, contact_id);

-- Add comment
COMMENT ON CONSTRAINT call_queue_campaign_contact_unique ON call_queue IS 
'Ensures a contact can only be added once per campaign to prevent duplicate calls';
