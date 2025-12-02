-- Migration: Add city, country, and business_context fields to contacts table
-- These fields are optional and support location-based filtering and business context information

-- Add new columns
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS city VARCHAR(255);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS country VARCHAR(255);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS business_context TEXT;

-- Add indexes for filtering
CREATE INDEX IF NOT EXISTS idx_contacts_city ON contacts(city) WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_country ON contacts(country) WHERE country IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_city_country ON contacts(city, country) WHERE city IS NOT NULL OR country IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN contacts.city IS 'City of the contact (optional)';
COMMENT ON COLUMN contacts.country IS 'Country of the contact (optional)';
COMMENT ON COLUMN contacts.business_context IS 'Industry/sector-level high-level description of the contact business (optional)';
