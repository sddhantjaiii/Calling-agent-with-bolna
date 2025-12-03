# Timezone Standardization - Complete Implementation Plan

**Project:** Calling Agent with Bolna  
**Document Type:** Implementation Plan  
**Created:** December 3, 2025  
**Status:** Ready for Implementation  
**Estimated Total Time:** 8-12 hours (including testing)  
**Risk Level:** Medium (mitigated with comprehensive testing)

---

## 🎯 Executive Summary

### Current State
Your application has **critical timezone configuration issues**:
- Database sessions configured for `Asia/Kolkata` (IST)
- Node.js process configured for `Asia/Kolkata` (IST)
- Documentation claims UTC storage
- System works "by accident" due to double-conversion cancellation

### Target State
- All timestamps stored in **UTC**
- All database sessions use **UTC**
- Node.js process runs in **UTC**
- User-specific timezone conversions only for display
- Single, predictable conversion path

### Success Criteria
- ✅ All timestamps stored as UTC in database
- ✅ Analytics aggregated correctly for all timezones
- ✅ Campaign time windows work across timezones
- ✅ No double-conversion issues
- ✅ All tests pass
- ✅ Zero production incidents

---

## 📋 Table of Contents

1. [Pre-Implementation Phase](#phase-0-pre-implementation)
2. [Investigation & Validation](#phase-1-investigation--validation)
3. [Environment Setup](#phase-2-environment-setup)
4. [Code Changes](#phase-3-code-changes)
5. [Database Updates](#phase-4-database-updates)
6. [Testing Strategy](#phase-5-testing-strategy)
7. [Deployment Plan](#phase-6-deployment-plan)
8. [Rollback Procedures](#phase-7-rollback-procedures)
9. [Post-Deployment Monitoring](#phase-8-post-deployment-monitoring)

---

## Phase 0: Pre-Implementation

### Duration: 2 hours
### Risk: Low

### 0.1 Team Preparation

**Checklist:**
- [ ] Schedule implementation window (recommend: low-traffic period)
- [ ] Notify stakeholders of planned changes
- [ ] Ensure team availability for rollback if needed
- [ ] Backup current database
- [ ] Document current production behavior

**Commands:**
```bash
# Create database backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Or via Neon dashboard:
# 1. Go to Neon Console
# 2. Select your database
# 3. Create a manual backup/snapshot
```

### 0.2 Create Feature Branch

```bash
cd "c:\Users\sddha\Coding\Sniperthinkv2\calling agent migration to bolna ai\Calling agent-kiro before going for bolna ai\Calling agent-kiro"

# Create feature branch
git checkout -b fix/timezone-standardization-utc

# Create tracking document
echo "# Timezone Fix Progress" > TIMEZONE_FIX_PROGRESS.md
git add TIMEZONE_FIX_PROGRESS.md
git commit -m "docs: initialize timezone fix tracking"
```

### 0.3 Environment Preparation

**Create test environment variables file:**
```bash
# .env.test
DATABASE_URL=your_test_database_url
DB_TIMEZONE=UTC
APP_TIMEZONE=UTC
TZ=UTC
NODE_ENV=test
```

---

## Phase 1: Investigation & Validation

### Duration: 1.5 hours
### Risk: Low (read-only operations)

### 1.1 Current State Verification

**Script: `scripts/verify-current-timezone-state.js`**
```javascript
const { pool } = require('./backend/src/config/database');

async function verifyCurrentState() {
  console.log('\n=== TIMEZONE VERIFICATION REPORT ===\n');
  
  try {
    // Test 1: Database timezone
    const tzResult = await pool.query('SHOW timezone');
    console.log('✓ Database Session Timezone:', tzResult.rows[0].TimeZone);
    
    // Test 2: Current timestamp comparison
    const tsResult = await pool.query(`
      SELECT 
        CURRENT_TIMESTAMP as session_time,
        NOW() AT TIME ZONE 'UTC' as utc_time,
        CURRENT_TIMESTAMP = (NOW() AT TIME ZONE 'UTC') as is_utc
    `);
    console.log('✓ Session Time:', tsResult.rows[0].session_time);
    console.log('✓ UTC Time:', tsResult.rows[0].utc_time);
    console.log('✓ Session is UTC:', tsResult.rows[0].is_utc);
    
    // Test 3: Sample call timestamps
    const callResult = await pool.query(`
      SELECT 
        id,
        created_at,
        created_at AT TIME ZONE 'UTC' as explicit_utc,
        EXTRACT(TIMEZONE FROM created_at) / 60 as offset_minutes
      FROM calls 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    console.log('\n✓ Sample Call Timestamps:');
    callResult.rows.forEach(row => {
      console.log(`  ID: ${row.id.slice(0, 8)}`);
      console.log(`  Stored: ${row.created_at}`);
      console.log(`  As UTC: ${row.explicit_utc}`);
      console.log(`  Offset: ${row.offset_minutes} minutes`);
      console.log('  ---');
    });
    
    // Test 4: Node.js timezone
    console.log('\n✓ Node.js Process:');
    console.log('  TZ env:', process.env.TZ);
    console.log('  Date():', new Date().toString());
    console.log('  Date() ISO:', new Date().toISOString());
    console.log('  Timezone offset:', new Date().getTimezoneOffset(), 'minutes');
    
    // Test 5: Analytics aggregation sample
    const analyticsResult = await pool.query(`
      SELECT 
        date,
        user_id,
        COUNT(*) as records
      FROM agent_analytics
      WHERE date >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY date, user_id
      ORDER BY date DESC
      LIMIT 10
    `);
    console.log('\n✓ Sample Analytics Aggregations:');
    analyticsResult.rows.forEach(row => {
      console.log(`  Date: ${row.date}, User: ${row.user_id.slice(0, 8)}, Records: ${row.records}`);
    });
    
    console.log('\n=== END REPORT ===\n');
  } catch (error) {
    console.error('❌ Error during verification:', error);
  } finally {
    await pool.end();
  }
}

verifyCurrentState();
```

**Run verification:**
```bash
cd backend
node ../scripts/verify-current-timezone-state.js > ../CURRENT_STATE_REPORT.txt
```

**Expected Output Analysis:**
- Database timezone: `Asia/Kolkata` (current) → should be `UTC` (target)
- `is_utc`: `false` (current) → should be `true` (target)
- Offset minutes: `330` or `-330` (IST) → should be `0` (UTC target)
- Node timezone offset: `-330` (IST) → should be `0` (UTC target)

### 1.2 Impact Assessment

**Create impact analysis script: `scripts/analyze-timezone-impact.sql`**
```sql
-- Analyze data that will be affected by timezone change
\echo '=== TIMEZONE IMPACT ANALYSIS ==='

-- Count total calls
\echo '\n1. Total Calls:'
SELECT COUNT(*) as total_calls FROM calls;

-- Count calls by date (current timezone)
\echo '\n2. Calls by Date (Current TZ):'
SELECT 
  DATE(created_at) as call_date,
  COUNT(*) as count
FROM calls 
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY call_date DESC
LIMIT 10;

-- Analytics records
\echo '\n3. Agent Analytics Records:'
SELECT 
  COUNT(*) as total_records,
  MIN(date) as earliest_date,
  MAX(date) as latest_date
FROM agent_analytics;

-- Active campaigns
\echo '\n4. Active Campaigns:'
SELECT 
  id,
  name,
  first_call_time,
  last_call_time,
  campaign_timezone,
  use_custom_timezone
FROM call_campaigns 
WHERE status = 'active';

-- User timezones
\echo '\n5. User Timezone Distribution:'
SELECT 
  COALESCE(timezone, 'NULL') as timezone,
  COUNT(*) as user_count
FROM users 
GROUP BY timezone
ORDER BY user_count DESC;

-- Queued calls
\echo '\n6. Queued Calls:'
SELECT 
  campaign_id,
  COUNT(*) as queued_count
FROM call_queue 
WHERE status = 'queued'
GROUP BY campaign_id;
```

**Run analysis:**
```bash
psql $DATABASE_URL -f scripts/analyze-timezone-impact.sql > IMPACT_ANALYSIS.txt
```

### 1.3 Create Validation Dataset

**Script: `scripts/create-validation-dataset.sql`**
```sql
-- Create a snapshot of current data for validation after changes
CREATE TABLE IF NOT EXISTS timezone_fix_validation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID,
  original_created_at TIMESTAMPTZ,
  original_date_ist DATE,
  user_timezone TEXT,
  expected_analytics_date DATE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Capture sample calls for validation
INSERT INTO timezone_fix_validation (
  call_id, 
  original_created_at, 
  original_date_ist,
  user_timezone,
  expected_analytics_date
)
SELECT 
  c.id,
  c.created_at,
  DATE(c.created_at) as original_date_ist,
  u.timezone,
  DATE(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE COALESCE(u.timezone, 'UTC')) as expected_date
FROM calls c
JOIN users u ON c.user_id = u.id
WHERE c.created_at >= CURRENT_DATE - INTERVAL '7 days'
LIMIT 100;

SELECT COUNT(*) as validation_records FROM timezone_fix_validation;
```

---

## Phase 2: Environment Setup

### Duration: 30 minutes
### Risk: Low

### 2.1 Update Environment Variables

**Development Environment:**
```bash
# .env.development
DB_TIMEZONE=UTC
APP_TIMEZONE=UTC
TZ=UTC
NODE_ENV=development
```

**Production Environment (update on deployment platform):**
```bash
# Railway / Vercel / etc.
DB_TIMEZONE=UTC
APP_TIMEZONE=UTC
TZ=UTC
```

### 2.2 Database-Level Timezone Setting

**Script: `scripts/set-database-timezone.sql`**
```sql
-- Set database default timezone to UTC
-- Replace 'neondb' with your actual database name
ALTER DATABASE neondb SET timezone TO 'UTC';

-- Verify
SHOW timezone;

-- Test in new connection
\c neondb
SHOW timezone;
SELECT 
  CURRENT_TIMESTAMP,
  NOW() AT TIME ZONE 'UTC',
  CURRENT_TIMESTAMP = (NOW() AT TIME ZONE 'UTC') as is_utc;
```

**Run (requires superuser or database owner):**
```bash
psql $DATABASE_URL -f scripts/set-database-timezone.sql
```

---

## Phase 3: Code Changes

### Duration: 2-3 hours
### Risk: Medium (requires careful testing)

### 3.1 Connection Pool Service

**File: `backend/src/services/connectionPoolService.ts`**

**Change 1: Update default timezone**
```typescript
// BEFORE (Line 38):
private sessionTimeZone: string = (process.env.DB_TIMEZONE || 'Asia/Kolkata').trim();

// AFTER:
private sessionTimeZone: string = (process.env.DB_TIMEZONE || 'UTC').trim();
```

**Change 2: Update fallback in validation**
```typescript
// BEFORE (Line 95):
const tzSql = tzIsValid ? tz : 'Asia/Kolkata';
if (!tzIsValid) {
  logger.warn('Invalid DB_TIMEZONE provided, falling back to Asia/Kolkata', { provided: tz });
}

// AFTER:
const tzSql = tzIsValid ? tz : 'UTC';
if (!tzIsValid) {
  logger.warn('Invalid DB_TIMEZONE provided, falling back to UTC', { provided: tz });
}
```

**Change 3: Add connection verification**
```typescript
// Add after SET TIME ZONE query (around line 98):
client.query(`SET TIME ZONE '${tzSql}'`).catch((err) => {
  logger.warn('Failed to set session time zone', { tz: tzSql, error: err?.message });
});

// ADD THIS:
// Verify timezone was set correctly
client.query('SHOW timezone').then((result) => {
  const actualTz = result.rows[0].TimeZone;
  if (actualTz.toUpperCase() !== 'UTC') {
    logger.warn('Session timezone is not UTC', { 
      expected: 'UTC', 
      actual: actualTz 
    });
  }
}).catch((err) => {
  logger.warn('Failed to verify session timezone', { error: err?.message });
});
```

### 3.2 Server Configuration

**File: `backend/src/server.ts`**

**Change 1: Update timezone configuration**
```typescript
// BEFORE (Lines 40-44):
const timezone = process.env.APP_TIMEZONE || process.env.TZ || 'Asia/Kolkata';
process.env.TZ = timezone;
logger.info(`Server default timezone set to: ${timezone} (user-specific timezones are cached per-request)`);
console.log(`🌍 Server default timezone: ${timezone} (users can have their own timezones)`);

// AFTER:
const timezone = process.env.APP_TIMEZONE || process.env.TZ || 'UTC';
process.env.TZ = 'UTC'; // Always force UTC for consistent behavior
logger.info(`Server process timezone set to: UTC (user-specific timezones are cached per-request)`);
console.log(`🌍 Server process timezone: UTC (users can have their own timezones)`);
```

**Change 2: Add startup verification**
```typescript
// Add after timezone setting:
// Verify Node.js is using UTC
const testDate = new Date();
const timezoneOffset = testDate.getTimezoneOffset();
if (timezoneOffset !== 0) {
  logger.warn('Node.js process timezone is not UTC', { 
    offset: timezoneOffset,
    expected: 0
  });
  console.warn(`⚠️ Warning: Node.js timezone offset is ${timezoneOffset} minutes (expected 0 for UTC)`);
}
```

### 3.3 Follow-Up Controller

**File: `backend/src/controllers/followUpController.ts`**

**Change: Update timezone default**
```typescript
// BEFORE (Line 46):
const tz = (process.env.DB_TIMEZONE || 'Asia/Kolkata').trim();

// AFTER:
const tz = (process.env.DB_TIMEZONE || 'UTC').trim();
```

### 3.4 Campaign Scheduler

**File: `backend/src/services/InMemoryCampaignScheduler.ts`**

**Changes: Update timezone references**
```typescript
// BEFORE (Line 700):
timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata'

// AFTER:
timeZone: process.env.APP_TIMEZONE || 'UTC'

// BEFORE (Line 705):
const timezone = process.env.APP_TIMEZONE || 'Asia/Kolkata';

// AFTER:
const timezone = process.env.APP_TIMEZONE || 'UTC';

// BEFORE (Line 740):
const timezone = process.env.APP_TIMEZONE || 'Asia/Kolkata';

// AFTER:
const timezone = process.env.APP_TIMEZONE || 'UTC';
```

### 3.5 Timezone Utils Documentation

**File: `backend/src/utils/timezoneUtils.ts`**

**Add JSDoc comments to clarify UTC base:**
```typescript
/**
 * Timezone Utilities
 * 
 * IMPORTANT: All functions assume timestamps are stored in UTC.
 * Database session timezone MUST be set to UTC.
 * Node.js process.env.TZ MUST be set to UTC.
 * 
 * Centralized timezone conversion and formatting logic
 */
```

### 3.6 Batch Changes Script

**Create: `scripts/apply-code-changes.sh`**
```bash
#!/bin/bash
set -e

echo "Applying timezone standardization code changes..."

cd backend/src

# Backup files before changes
cp services/connectionPoolService.ts services/connectionPoolService.ts.backup
cp server.ts server.ts.backup
cp controllers/followUpController.ts controllers/followUpController.ts.backup
cp services/InMemoryCampaignScheduler.ts services/InMemoryCampaignScheduler.ts.backup

# Apply changes using sed
sed -i "s/(process\.env\.DB_TIMEZONE || 'Asia\/Kolkata')/(process.env.DB_TIMEZONE || 'UTC')/g" \
  services/connectionPoolService.ts

sed -i "s/const timezone = process\.env\.APP_TIMEZONE || process\.env\.TZ || 'Asia\/Kolkata'/const timezone = process.env.APP_TIMEZONE || process.env.TZ || 'UTC'/g" \
  server.ts

sed -i "s/process\.env\.APP_TIMEZONE || 'Asia\/Kolkata'/process.env.APP_TIMEZONE || 'UTC'/g" \
  services/InMemoryCampaignScheduler.ts

sed -i "s/(process\.env\.DB_TIMEZONE || 'Asia\/Kolkata')/(process.env.DB_TIMEZONE || 'UTC')/g" \
  controllers/followUpController.ts

echo "✓ Code changes applied"
echo "✓ Backups created with .backup extension"
echo "✓ Review changes with: git diff"
```

---

## Phase 4: Database Updates

### Duration: 1 hour
### Risk: Low (triggers already handle UTC correctly)

### 4.1 Verify Trigger Functions

**Script: `scripts/verify-trigger-timezone-handling.sql`**
```sql
-- Verify triggers are using proper timezone conversion
\echo '=== TRIGGER TIMEZONE VERIFICATION ==='

-- Check trg_calls_daily_analytics
\echo '\n1. trg_calls_daily_analytics source:'
SELECT pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname = 'trg_calls_daily_analytics';

-- Verify it contains: AT TIME ZONE 'UTC' AT TIME ZONE user_tz
-- This is CORRECT - converts UTC to user timezone

-- Check get_next_queued_call
\echo '\n2. get_next_queued_call source:'
SELECT pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname = 'get_next_queued_call';

-- Verify it contains: CURRENT_TIMESTAMP AT TIME ZONE campaign_timezone
-- This is CORRECT - converts current UTC time to campaign timezone
```

**Result:** Triggers are already correct! They assume UTC input and convert to user/campaign timezone.

### 4.2 Validation Query

**Script: `scripts/test-timezone-conversion.sql`**
```sql
-- Test timezone conversion logic with UTC base
\echo '=== TIMEZONE CONVERSION TEST ==='

-- Create test timestamp
DO $$
DECLARE
  test_utc TIMESTAMPTZ := '2025-12-03 10:00:00+00';  -- UTC timestamp
  test_ist_date DATE;
  test_ny_date DATE;
BEGIN
  -- Convert to IST date
  test_ist_date := DATE(test_utc AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata');
  RAISE NOTICE 'UTC: %, IST Date: %', test_utc, test_ist_date;
  
  -- Convert to NY date
  test_ny_date := DATE(test_utc AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York');
  RAISE NOTICE 'UTC: %, NY Date: %', test_utc, test_ny_date;
  
  -- Verify different dates for different timezones
  IF test_ist_date != test_ny_date THEN
    RAISE NOTICE '✓ Timezone conversion working correctly';
  ELSE
    RAISE WARNING '✗ Timezone conversion may have issues';
  END IF;
END $$;
```

---

## Phase 5: Testing Strategy

### Duration: 3-4 hours
### Risk: Critical (ensures nothing breaks)

### 5.1 Unit Tests

**Create: `backend/src/__tests__/timezone-standardization.test.ts`**
```typescript
import { pool } from '../config/database';

describe('Timezone Standardization', () => {
  
  test('Database session should be UTC', async () => {
    const result = await pool.query('SHOW timezone');
    expect(result.rows[0].TimeZone.toUpperCase()).toBe('UTC');
  });
  
  test('CURRENT_TIMESTAMP should equal NOW() AT TIME ZONE UTC', async () => {
    const result = await pool.query(`
      SELECT CURRENT_TIMESTAMP = (NOW() AT TIME ZONE 'UTC') as is_utc
    `);
    expect(result.rows[0].is_utc).toBe(true);
  });
  
  test('Node.js process should use UTC', () => {
    expect(process.env.TZ).toBe('UTC');
    const offset = new Date().getTimezoneOffset();
    expect(offset).toBe(0);
  });
  
  test('new Date() should create UTC timestamps', () => {
    const date = new Date();
    const iso = date.toISOString();
    // ISO string should end with Z (UTC marker)
    expect(iso).toMatch(/Z$/);
  });
  
  test('Timezone conversion should work correctly', async () => {
    const result = await pool.query(`
      SELECT 
        DATE('2025-12-03 10:00:00+00' AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') as ist_date,
        DATE('2025-12-03 10:00:00+00' AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York') as ny_date
    `);
    
    // 10:00 UTC = 15:30 IST = 05:00 NY (previous day in winter)
    expect(result.rows[0].ist_date).toBe('2025-12-03');
    expect(result.rows[0].ny_date).toBe('2025-12-03');
  });
});
```

**Run tests:**
```bash
cd backend
npm test -- timezone-standardization.test.ts
```

### 5.2 Integration Tests

**Create: `backend/src/__tests__/integration/call-creation-timezone.test.ts`**
```typescript
import { CallModel } from '../../models/Call';
import { pool } from '../../config/database';

describe('Call Creation with UTC Timezone', () => {
  
  test('Call created_at should be in UTC', async () => {
    const testCall = await CallModel.create({
      agent_id: 'test-agent-id',
      user_id: 'test-user-id',
      phone_number: '+1234567890',
      // ... other required fields
    });
    
    // Query the timestamp directly
    const result = await pool.query(
      `SELECT 
        created_at,
        EXTRACT(TIMEZONE FROM created_at) / 60 as offset_minutes
       FROM calls WHERE id = $1`,
      [testCall.id]
    );
    
    // Offset should be 0 for UTC
    expect(result.rows[0].offset_minutes).toBe(0);
  });
  
  test('Analytics should aggregate by user timezone', async () => {
    // Create call at 23:00 UTC
    const utcTime = new Date('2025-12-03T23:00:00Z');
    
    const call = await CallModel.create({
      // ... fields
      created_at: utcTime
    });
    
    // For IST user (UTC+5:30), this should be next day
    // Check agent_analytics
    const analyticsResult = await pool.query(`
      SELECT date 
      FROM agent_analytics 
      WHERE agent_id = $1 
        AND user_id = $2
        AND date = DATE($3::timestamptz AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')
    `, [call.agent_id, call.user_id, utcTime]);
    
    expect(analyticsResult.rows[0].date).toBe('2025-12-04');
  });
});
```

### 5.3 Campaign Time Window Test

**Create: `scripts/test-campaign-time-window.js`**
```javascript
const { pool } = require('./backend/src/config/database');

async function testCampaignTimeWindow() {
  console.log('Testing campaign time window logic...\n');
  
  // Test 1: IST campaign during business hours
  console.log('Test 1: IST campaign (09:00-17:00)');
  const istTest = await pool.query(`
    WITH test_data AS (
      SELECT 
        '09:00:00'::TIME as first_call_time,
        '17:00:00'::TIME as last_call_time,
        'Asia/Kolkata' as timezone,
        CURRENT_TIMESTAMP as current_utc,
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::TIME as current_ist_time
    )
    SELECT 
      current_ist_time,
      current_ist_time BETWEEN first_call_time AND last_call_time as in_window
    FROM test_data
  `);
  console.log('Current IST time:', istTest.rows[0].current_ist_time);
  console.log('In window:', istTest.rows[0].in_window);
  
  // Test 2: NY campaign during business hours
  console.log('\nTest 2: NY campaign (09:00-17:00)');
  const nyTest = await pool.query(`
    WITH test_data AS (
      SELECT 
        '09:00:00'::TIME as first_call_time,
        '17:00:00'::TIME as last_call_time,
        'America/New_York' as timezone,
        CURRENT_TIMESTAMP as current_utc,
        (CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::TIME as current_ny_time
    )
    SELECT 
      current_ny_time,
      current_ny_time BETWEEN first_call_time AND last_call_time as in_window
    FROM test_data
  `);
  console.log('Current NY time:', nyTest.rows[0].current_ny_time);
  console.log('In window:', nyTest.rows[0].in_window);
  
  await pool.end();
}

testCampaignTimeWindow();
```

### 5.4 Regression Test Suite

**Create: `scripts/run-regression-tests.sh`**
```bash
#!/bin/bash
set -e

echo "=== TIMEZONE FIX REGRESSION TEST SUITE ==="

cd backend

# 1. Unit tests
echo "\n1. Running unit tests..."
npm test -- --testPathPattern=timezone

# 2. Integration tests
echo "\n2. Running integration tests..."
npm test -- --testPathPattern=integration

# 3. API tests
echo "\n3. Testing API endpoints..."
npm test -- --testPathPattern=api

# 4. Campaign scheduler tests
echo "\n4. Testing campaign scheduler..."
npm test -- --testPathPattern=campaign

# 5. Analytics tests
echo "\n5. Testing analytics aggregation..."
npm test -- --testPathPattern=analytics

echo "\n=== ALL TESTS PASSED ==="
```

### 5.5 Manual Test Checklist

**Test Document: `MANUAL_TEST_CHECKLIST.md`**

```markdown
# Manual Testing Checklist

## Pre-Deployment Tests (Development)

### 1. Call Creation
- [ ] Create direct call
- [ ] Verify `created_at` is UTC in database
- [ ] Verify timezone offset is 0

### 2. Campaign Calls
- [ ] Create campaign with IST timezone
- [ ] Create campaign with NY timezone
- [ ] Verify time window logic works
- [ ] Check queued calls are processed at correct times

### 3. Analytics
- [ ] Trigger analytics recalculation
- [ ] Verify analytics `date` matches user timezone
- [ ] Check CTA metrics aggregation
- [ ] Validate weekly/monthly trends

### 4. Webhooks
- [ ] Send test webhook
- [ ] Verify timestamp parsing
- [ ] Check call lifecycle tracking

### 5. Dashboard
- [ ] Load dashboard analytics
- [ ] Verify leads over time chart
- [ ] Check date labels are correct
- [ ] Test date range filters

## Post-Deployment Tests (Staging/Production)

### 1. Smoke Tests
- [ ] Application starts without errors
- [ ] Database connection successful
- [ ] No timezone warnings in logs

### 2. Functional Tests
- [ ] Make a real call
- [ ] Create a campaign
- [ ] Upload contacts
- [ ] View analytics

### 3. User Experience
- [ ] Check dates display correctly for IST users
- [ ] Verify dates for non-IST test users
- [ ] Test across different browsers/timezones

### 4. Performance
- [ ] Monitor query performance
- [ ] Check analytics load times
- [ ] Verify no new slow queries
```

---

## Phase 6: Deployment Plan

### Duration: 1-2 hours
### Risk: Medium

### 6.1 Pre-Deployment Checklist

```markdown
## Pre-Deployment Verification

- [ ] All code changes committed
- [ ] All tests passing locally
- [ ] Database backup created
- [ ] Validation dataset created
- [ ] Rollback plan documented
- [ ] Team notified
- [ ] Monitoring alerts configured
```

### 6.2 Deployment Steps

**Step 1: Deploy to Staging**
```bash
# 1. Push changes to staging branch
git checkout fix/timezone-standardization-utc
git push origin fix/timezone-standardization-utc

# 2. Update staging environment variables
# Via platform dashboard:
# - Set DB_TIMEZONE=UTC
# - Set APP_TIMEZONE=UTC
# - Set TZ=UTC

# 3. Set database timezone (staging)
psql $STAGING_DATABASE_URL -c "ALTER DATABASE <staging_db_name> SET timezone TO 'UTC';"

# 4. Deploy application
# (depends on your platform)

# 5. Verify staging
curl https://staging.your-app.com/api/health
```

**Step 2: Staging Validation** (30 minutes)
```bash
# Run verification script on staging
node scripts/verify-current-timezone-state.js

# Check logs for timezone warnings
# View staging dashboard
# Create test call
# Trigger analytics
```

**Step 3: Production Deployment**
```bash
# 1. Create production PR
git checkout main
git merge fix/timezone-standardization-utc

# 2. Wait for CI/CD checks
# 3. Get team approval
# 4. Merge to main

# 5. Update production environment variables
# Via platform dashboard:
# - Set DB_TIMEZONE=UTC
# - Set APP_TIMEZONE=UTC  
# - Set TZ=UTC

# 6. Set database timezone (production)
psql $PRODUCTION_DATABASE_URL -c "ALTER DATABASE <production_db_name> SET timezone TO 'UTC';"

# 7. Deploy application
# Wait for deployment to complete

# 8. Immediate verification
curl https://your-app.com/api/health
```

### 6.3 Post-Deployment Validation

**Script: `scripts/post-deployment-validation.js`**
```javascript
const { pool } = require('./backend/src/config/database');

async function validateDeployment() {
  console.log('=== POST-DEPLOYMENT VALIDATION ===\n');
  
  const checks = [];
  
  // Check 1: Database timezone
  try {
    const tz = await pool.query('SHOW timezone');
    const isUTC = tz.rows[0].TimeZone.toUpperCase() === 'UTC';
    checks.push({ 
      name: 'Database Timezone', 
      passed: isUTC, 
      value: tz.rows[0].TimeZone 
    });
  } catch (e) {
    checks.push({ name: 'Database Timezone', passed: false, error: e.message });
  }
  
  // Check 2: Recent calls have UTC timestamps
  try {
    const calls = await pool.query(`
      SELECT 
        COUNT(*) as count,
        BOOL_AND(EXTRACT(TIMEZONE FROM created_at) = 0) as all_utc
      FROM calls 
      WHERE created_at >= NOW() - INTERVAL '1 hour'
    `);
    checks.push({ 
      name: 'Recent Calls UTC', 
      passed: calls.rows[0].all_utc, 
      value: `${calls.rows[0].count} calls` 
    });
  } catch (e) {
    checks.push({ name: 'Recent Calls UTC', passed: false, error: e.message });
  }
  
  // Check 3: Analytics still working
  try {
    const analytics = await pool.query(`
      SELECT COUNT(*) as count 
      FROM agent_analytics 
      WHERE date = CURRENT_DATE
    `);
    checks.push({ 
      name: 'Analytics Today', 
      passed: analytics.rows[0].count > 0, 
      value: `${analytics.rows[0].count} records` 
    });
  } catch (e) {
    checks.push({ name: 'Analytics Today', passed: false, error: e.message });
  }
  
  // Check 4: Validation dataset comparison
  try {
    const validation = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (
          WHERE DATE(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE COALESCE(u.timezone, 'UTC'))
                = v.expected_analytics_date
        ) as matching
      FROM timezone_fix_validation v
      JOIN calls c ON v.call_id = c.id
      JOIN users u ON c.user_id = u.id
    `);
    const matchRate = validation.rows[0].matching / validation.rows[0].total;
    checks.push({ 
      name: 'Analytics Accuracy', 
      passed: matchRate > 0.95, 
      value: `${(matchRate * 100).toFixed(1)}%` 
    });
  } catch (e) {
    checks.push({ name: 'Analytics Accuracy', passed: false, error: e.message });
  }
  
  // Print results
  console.log('Validation Results:\n');
  checks.forEach(check => {
    const status = check.passed ? '✓' : '✗';
    const value = check.value || check.error || '';
    console.log(`${status} ${check.name}: ${value}`);
  });
  
  const allPassed = checks.every(c => c.passed);
  console.log('\n' + (allPassed ? '✓ ALL CHECKS PASSED' : '✗ SOME CHECKS FAILED'));
  
  await pool.end();
  process.exit(allPassed ? 0 : 1);
}

validateDeployment();
```

---

## Phase 7: Rollback Procedures

### Duration: 30 minutes (if needed)
### Risk: Low

### 7.1 Rollback Trigger Conditions

Rollback immediately if:
- ❌ Database timezone not UTC after deployment
- ❌ Analytics aggregation showing wrong dates
- ❌ Campaign time windows not working
- ❌ More than 5% error rate increase
- ❌ User-reported date/time issues

### 7.2 Quick Rollback Steps

```bash
#!/bin/bash
# scripts/rollback-timezone-fix.sh

echo "=== EMERGENCY ROLLBACK: TIMEZONE FIX ==="

# 1. Revert code deployment
echo "1. Reverting code..."
git revert <commit-hash> --no-edit
git push origin main
# Or use platform's rollback feature

# 2. Restore environment variables
echo "2. Restoring environment variables..."
# Set DB_TIMEZONE=Asia/Kolkata
# Set APP_TIMEZONE=Asia/Kolkata
# Set TZ=Asia/Kolkata

# 3. Revert database timezone
echo "3. Reverting database timezone..."
psql $DATABASE_URL -c "ALTER DATABASE <db_name> SET timezone TO 'Asia/Kolkata';"

# 4. Restart application
echo "4. Restarting application..."
# Platform-specific restart command

# 5. Verify rollback
echo "5. Verifying rollback..."
node scripts/verify-current-timezone-state.js

echo "=== ROLLBACK COMPLETE ==="
```

### 7.3 Post-Rollback Actions

1. Document what went wrong
2. Analyze root cause
3. Update plan
4. Schedule retry

---

## Phase 8: Post-Deployment Monitoring

### Duration: 1 week
### Risk: Low

### 8.1 Immediate Monitoring (First 24 hours)

**Metrics to watch:**
```bash
# Error rate
SELECT 
  DATE_TRUNC('hour', timestamp) as hour,
  COUNT(*) as error_count
FROM error_logs
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour;

# Call creation rate
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as calls
FROM calls
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour;

# Analytics update lag
SELECT 
  MAX(date) as latest_analytics_date,
  CURRENT_DATE as today,
  CURRENT_DATE - MAX(date) as lag_days
FROM agent_analytics;
```

**Alert conditions:**
- Error rate > 2x baseline
- Call creation drops > 20%
- Analytics lag > 1 day
- User complaints about dates

### 8.2 Extended Monitoring (First Week)

**Daily checks:**
```markdown
## Day 1-7 Checklist

### Day 1
- [ ] Check error logs every 2 hours
- [ ] Verify analytics updated
- [ ] Monitor user feedback channels
- [ ] Review support tickets

### Day 2-3
- [ ] Check error logs twice daily
- [ ] Verify weekend date handling
- [ ] Test campaigns scheduled over weekend

### Day 4-7
- [ ] Daily error log review
- [ ] Weekly analytics comparison
- [ ] Performance baseline comparison
```

### 8.3 Success Metrics

**Criteria for declaring success:**
- ✅ Zero timezone-related errors for 7 days
- ✅ Analytics accuracy > 99.9%
- ✅ No user complaints about dates
- ✅ Campaign time windows working correctly
- ✅ Performance same or better than baseline

---

## 📊 Summary Tables

### Timeline Overview

| Phase | Duration | Parallel Work | Total Calendar Time |
|-------|----------|---------------|---------------------|
| 0. Pre-Implementation | 2 hrs | No | 2 hrs |
| 1. Investigation | 1.5 hrs | Yes | 1.5 hrs |
| 2. Environment Setup | 0.5 hrs | Yes | 0.5 hrs |
| 3. Code Changes | 2-3 hrs | No | 2-3 hrs |
| 4. Database Updates | 1 hr | Yes | 1 hr |
| 5. Testing | 3-4 hrs | No | 3-4 hrs |
| 6. Deployment | 1-2 hrs | No | 1-2 hrs |
| **Total** | | | **12-14 hours** |

### Risk Matrix

| Risk Area | Probability | Impact | Mitigation |
|-----------|-------------|--------|------------|
| Analytics break | Low | High | Comprehensive testing, rollback ready |
| Campaigns fail | Medium | High | Time window testing, staging validation |
| Data loss | Very Low | Critical | Database backup, validation dataset |
| User confusion | Low | Medium | Monitoring, quick response |
| Performance issues | Very Low | Medium | Performance testing, monitoring |

### Resource Requirements

| Resource | Quantity | Duration | Notes |
|----------|----------|----------|-------|
| Backend Developer | 1 | 12-14 hrs | Lead implementation |
| QA Engineer | 1 | 4-6 hrs | Testing support |
| DevOps Engineer | 1 | 2-3 hrs | Deployment support |
| Database Admin | 1 | 1-2 hrs | Database timezone change |
| Support Team | On-call | 1 week | User issue monitoring |

---

## 🎯 Decision Points

### Go/No-Go Criteria

**Before Phase 3 (Code Changes):**
- ✅ Investigation complete
- ✅ Impact understood
- ✅ Team aligned
- ✅ Backup created

**Before Phase 6 (Deployment):**
- ✅ All tests passing
- ✅ Staging validated
- ✅ Rollback plan ready
- ✅ Monitoring configured

**Post-Deployment:**
- ✅ All validation checks pass
- ✅ No critical errors
- ✅ Analytics working
- ✅ Campaigns functioning

---

## 📝 Communication Plan

### Stakeholder Updates

**Before Implementation:**
```
Subject: Timezone Standardization - Implementation Plan

We will be implementing timezone standardization to improve 
data accuracy and enable global scaling.

Timeline: [DATE]
Impact: Minimal user impact expected
Downtime: None expected
```

**During Implementation:**
```
Subject: Timezone Fix - In Progress

Status: [Phase X/8]
Progress: [X]%
Next: [Phase Y]
ETA: [TIME]
```

**After Completion:**
```
Subject: Timezone Standardization - Complete

✓ Successfully migrated to UTC
✓ All tests passed
✓ Analytics verified
✓ Monitoring active
```

---

## 🔧 Troubleshooting Guide

### Common Issues

**Issue 1: Database timezone not changing**
```sql
-- Check if you have permission
ALTER DATABASE <db_name> SET timezone TO 'UTC';
-- Error: must be owner of database

-- Solution: Use superuser or request from provider
-- For Neon: Contact support or use UI
```

**Issue 2: Session timezone reverts**
```typescript
// Verify connectionPoolService is setting timezone
// Check logs for: "Failed to set session time zone"
// Ensure DB_TIMEZONE environment variable is set
```

**Issue 3: Tests fail with "Connection timed out"**
```bash
# Increase test timeout
# jest.config.js:
testTimeout: 30000
```

**Issue 4: Analytics dates off by one**
```sql
-- Check user timezone
SELECT id, timezone FROM users WHERE id = '<user_id>';

-- Verify trigger logic
SELECT pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname = 'trg_calls_daily_analytics';
```

---

## ✅ Final Checklist

```markdown
## Implementation Readiness

### Pre-Implementation
- [ ] Plan reviewed by team
- [ ] Resources allocated
- [ ] Timeline approved
- [ ] Backup procedures tested
- [ ] Rollback plan documented

### Implementation
- [ ] All phases completed
- [ ] All tests passed
- [ ] Validation successful
- [ ] Documentation updated

### Post-Implementation
- [ ] Monitoring active
- [ ] Team trained
- [ ] Support ready
- [ ] Success metrics defined

## Sign-off

Implementation Lead: _________________
Date: _________________

QA Lead: _________________
Date: _________________

DevOps Lead: _________________
Date: _________________
```

---

**END OF PLAN**

*This plan is comprehensive and production-ready. Follow each phase sequentially, complete all checkpoints, and maintain clear communication throughout the implementation.*
