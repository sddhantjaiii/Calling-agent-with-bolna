# Time and Date Management - Complete Analysis

**Generated:** December 3, 2025  
**Status:** Comprehensive audit of timezone and date handling across the application

---

## 🎯 Executive Summary

### Current State
- **Primary Storage:** All timestamps stored in **UTC** using `TIMESTAMP WITH TIME ZONE`
- **User Display:** Converted to **Asia/Kolkata (IST)** or user-specific timezone
- **Analytics Impact:** Timezone-aware aggregations ensure accurate daily/hourly metrics
- **Critical Fix Applied:** `fix_all_timezone_triggers.sql` migrated all triggers to use user timezones

### Key Issues Identified
1. ❌ **Campaign date fields** (`start_date`, `end_date`) stored as DATE without timezone (recently fixed)
2. ⚠️ **Webhook timestamps** use mixed formats (ISO strings vs epoch)
3. ⚠️ **Analytics aggregations** depend on proper session timezone configuration
4. ✅ **Database triggers** now use user-specific timezones (post-migration)

---

## 📊 Database Schema Analysis

### 1. Core Tables - Timestamp Fields

#### **calls** Table
```sql
created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP  -- ✅ Stored in UTC
completed_at     TIMESTAMP WITH TIME ZONE                            -- ✅ Stored in UTC
updated_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP  -- ✅ Stored in UTC
```
- **Storage:** UTC (consistent)
- **Display:** Converted to user timezone in queries
- **Analytics Impact:** 
  - Date aggregations use `DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE user_tz)`
  - Ensures calls are grouped by user's local date, not UTC date
  - Example: A call at 11:30 PM UTC → IST (5:00 AM next day) groups to the next day in IST

#### **call_campaigns** Table
```sql
created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP  -- ✅ UTC
updated_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP  -- ✅ UTC
started_at       TIMESTAMP WITH TIME ZONE                            -- ✅ UTC
completed_at     TIMESTAMP WITH TIME ZONE                            -- ✅ UTC
start_date       DATE                                                -- ⚠️ Date-only (no timezone)
end_date         DATE                                                -- ⚠️ Date-only (no timezone)
```
- **Storage:**
  - Timestamps: UTC
  - Dates: Date-only (no timezone info)
- **Recent Fix:** Modified `CallCampaign.ts` model to preserve date-only format
  - Before: Converted dates to timestamps → timezone issues
  - After: Keep as DATE type → no timezone conversion
- **Campaign Timezone Fields:**
  ```sql
  campaign_timezone      VARCHAR(50)   -- Campaign-specific timezone (e.g., 'America/New_York')
  use_custom_timezone    BOOLEAN       -- Whether to use campaign_timezone vs user timezone
  ```

#### **lead_analytics** Table
```sql
created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP  -- ✅ UTC
updated_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP  -- ✅ UTC
```
- **Storage:** UTC
- **Analytics Impact:** Aggregations join with `calls.created_at` for timezone-aware grouping

#### **agent_analytics** Table
```sql
date             DATE NOT NULL              -- ⚠️ Date in user's timezone (not UTC!)
hour             INTEGER                    -- Hour in user's timezone (0-23)
created_at       TIMESTAMP WITH TIME ZONE   -- ✅ Record creation time in UTC
updated_at       TIMESTAMP WITH TIME ZONE   -- ✅ Record update time in UTC
```
- **Critical Design:**
  - `date` column stores the **user's local date**, not UTC date
  - Populated by triggers that convert `created_at AT TIME ZONE 'UTC' AT TIME ZONE user_tz`
  - This ensures analytics match user's perception of "today" vs "yesterday"

#### **users** Table
```sql
timezone                  VARCHAR(50) DEFAULT 'UTC'    -- User's preferred timezone
timezone_auto_detected    BOOLEAN DEFAULT false        -- Auto-detected from IP/browser
timezone_manually_set     BOOLEAN DEFAULT false        -- Manually set by user
created_at               TIMESTAMP WITH TIME ZONE      -- ✅ UTC
updated_at               TIMESTAMP WITH TIME ZONE      -- ✅ UTC
```

---

## 🔄 Timezone Conversion Flow

### 1. **Data Ingestion (Webhooks)**
```typescript
// webhookService.ts
timestamp: new Date().toISOString()  // Stores UTC ISO string
initiated_at: new Date().toISOString()  // Stores UTC ISO string
```
- **Format:** ISO 8601 string (e.g., `2025-12-03T10:30:00.000Z`)
- **Storage:** Converted to TIMESTAMPTZ (stored internally as UTC)
- **Issue:** Some webhooks use `Date.now()` (epoch milliseconds) vs `toISOString()`

### 2. **Database Storage**
```sql
-- All timestamps stored in UTC
INSERT INTO calls (created_at) VALUES (CURRENT_TIMESTAMP);
-- CURRENT_TIMESTAMP returns UTC when session timezone = 'UTC'
```
- **Session Timezone:** Set to `'UTC'` in database connection (database.ts)
- **All writes:** Stored in UTC
- **TIMESTAMPTZ vs TIMESTAMP:**
  - `TIMESTAMPTZ`: Stored in UTC, displayed in session timezone
  - `DATE`: No timezone info (calendar date only)

### 3. **Analytics Aggregation (Triggers)**
```sql
-- OLD (WRONG): Uses server timezone
_date := DATE(NEW.created_at);

-- NEW (CORRECT): Uses user timezone
_user_tz := get_user_timezone(NEW.user_id);
_date := DATE(NEW.created_at AT TIME ZONE 'UTC' AT TIME ZONE _user_tz);
```
- **Migration:** `fix_all_timezone_triggers.sql` updated all triggers
- **Impact:** Ensures analytics match user's local date boundaries
- **Example:**
  - Call at: `2025-12-03 23:30:00 UTC`
  - User timezone: `Asia/Kolkata` (UTC+5:30)
  - Local time: `2025-12-04 05:00:00 IST`
  - Aggregated under: `2025-12-04` (next day in IST)

### 4. **Query Execution (API)**
```typescript
// dashboardAnalyticsService.ts
const userTimezone = await getUserTimezoneForQuery(userId);
const query = `
  SELECT DATE(c.created_at AT TIME ZONE $2) as date,
         COUNT(*) as count
  FROM calls c
  WHERE c.user_id = $1
  GROUP BY DATE(c.created_at AT TIME ZONE $2)
`;
await pool.query(query, [userId, userTimezone]);
```
- **User Timezone Retrieval:**
  1. Check cache (TimezoneCacheService)
  2. Query database (users.timezone)
  3. Fallback to 'UTC'
- **Cache Duration:** 24 hours
- **Invalidation:** On user timezone update

### 5. **Frontend Display**
```typescript
// No date formatting found in frontend search
// Dates likely displayed as-is from API responses
```
- **Assumption:** Frontend receives pre-formatted dates from backend
- **Format:** Locale-specific formatting using Intl API

---

## 📈 Analytics Impact Analysis

### 1. **Dashboard Analytics (`dashboardAnalyticsService.ts`)**

#### ✅ **Timezone-Aware Queries**
```typescript
// Leads Over Time (last 7 days)
WITH series AS (
  SELECT generate_series(
    (NOW() AT TIME ZONE $2 - INTERVAL '6 days')::date,
    (NOW() AT TIME ZONE $2)::date,
    interval '1 day'
  ) AS day
)
SELECT s.day AS date, COUNT(la.id) AS lead_count
FROM series s
LEFT JOIN calls c ON DATE(c.created_at AT TIME ZONE $2) = s.day
```
- **Timezone Parameter:** `$2` = user timezone (e.g., 'Asia/Kolkata')
- **Impact:** 7-day window calculated in user's timezone, not UTC
- **Correctness:** ✅ Ensures "today" means user's today

#### ⚠️ **Date Formatting**
```typescript
date: new Date(row.date).toLocaleDateString('en-US', { 
  month: 'short', 
  day: 'numeric' 
})
// Output: "Dec 3" (locale-dependent)
```
- **Issue:** Uses JavaScript `Date` constructor which assumes UTC
- **Potential Fix:** Pass timezone explicitly or use ISO date strings

### 2. **Agent CTA Analytics (`agentCTAAnalyticsService.ts`)**

#### ✅ **CTA Trends (Daily/Weekly/Monthly)**
```typescript
const query = `
  WITH date_series AS (
    SELECT generate_series(
      date_trunc('${groupBy}', $2::timestamp),
      date_trunc('${groupBy}', $3::timestamp),
      interval '${dateInterval}'
    ) AS date
  )
  SELECT to_char(ds.date, '${dateFormat}') as date,
         SUM(aa.cta_pricing_clicks) as cta_pricing_clicks
  FROM date_series ds
  LEFT JOIN agent_analytics aa 
    ON date_trunc('${groupBy}', aa.date) = ds.date
  WHERE aa.user_id = $1
`;
```
- **Source:** `agent_analytics.date` (already in user timezone)
- **Aggregation:** Groups by day/week/month
- **Correctness:** ✅ Uses pre-converted dates from triggers

### 3. **Campaign Analytics**

#### ⚠️ **Campaign Duration Calculation**
```typescript
campaign_duration: 0, // TODO: Calculate from started_at to now/completed_at
```
- **Status:** Not implemented
- **Issue:** Would need timezone-aware duration if displayed to users

#### ✅ **Campaign Scheduling**
```typescript
// campaignRoutes.ts
use_custom_timezone: use_custom_timezone === 'true',
campaign_timezone: campaign_timezone || undefined,
```
- **Campaigns can have:**
  - Custom timezone (overrides user timezone)
  - User timezone (fallback)
- **Use Case:** Multi-region campaigns with specific call windows

---

## 🔧 Database Triggers & Functions

### Critical Functions (Post-Migration)

#### 1. **`get_user_timezone(user_id UUID)`**
```sql
RETURNS TEXT
-- Retrieves user timezone from users table, defaults to 'UTC'
```
- **Usage:** All trigger functions
- **Cache:** No (direct query each time)
- **Performance:** Stable query, indexed on user_id

#### 2. **`trg_calls_daily_analytics()`**
```sql
-- Fires AFTER INSERT/UPDATE on calls
-- Recomputes agent_analytics with user timezone
_user_tz := get_user_timezone(NEW.user_id);
_date := DATE(NEW.created_at AT TIME ZONE 'UTC' AT TIME ZONE _user_tz);
```
- **Impact:** Every call insert triggers analytics update
- **Timezone:** User-specific
- **Performance:** Optimized with conditional execution

#### 3. **`trg_leads_daily_analytics()`**
```sql
-- Fires AFTER INSERT/UPDATE on lead_analytics
-- Updates agent scores and CTA metrics
_user_tz := get_user_timezone(_user_id);
```
- **Impact:** Every lead analysis triggers score updates
- **Timezone:** User-specific

#### 4. **`recompute_agent_daily_from_calls(agent_id, user_id, date, user_tz)`**
```sql
-- Recomputes daily aggregates for specific agent + date
-- Uses UPSERT to update existing or insert new records
WHERE DATE(c2.created_at AT TIME ZONE 'UTC' AT TIME ZONE _user_tz) = _date
```
- **Correctness:** ✅ Uses user timezone for date filtering

#### 5. **`calculate_daily_call_analytics(user_id, date, user_tz)`**
```sql
-- Batch calculation for specific date
calc_date := COALESCE(
  target_date,
  DATE((NOW() AT TIME ZONE 'UTC') AT TIME ZONE user_timezone)
);
```
- **Default:** Today in user's timezone
- **Usage:** Manual recalculation or cron jobs

---

## 🚨 Known Issues & Discrepancies

### 1. **Campaign Date Fields** (FIXED)
**Issue:** `start_date` and `end_date` were being converted to TIMESTAMPTZ
```typescript
// Before (WRONG)
data.start_date  // JavaScript Date → UTC timestamp

// After (CORRECT) - Recent fix
data.start_date  // String 'YYYY-MM-DD' → DATE column
```
**Impact:** Campaign scheduling could show wrong dates due to timezone conversion
**Status:** ✅ Fixed in recent commit

### 2. **Webhook Timestamp Formats**
**Issue:** Mixed timestamp formats
```typescript
// ISO string (preferred)
timestamp: new Date().toISOString()  // "2025-12-03T10:30:00.000Z"

// Epoch milliseconds
timestamp: Date.now()  // 1701598200000

// Epoch seconds (Bolna webhook signature)
const timestamp = Math.floor(Date.now() / 1000);
```
**Impact:** Parsing inconsistencies, potential errors in webhook validation
**Status:** ⚠️ Needs standardization

### 3. **Frontend Date Handling**
**Issue:** No frontend date formatting code found
**Implication:** Either:
  - Backend sends formatted strings (likely)
  - Frontend uses raw ISO strings
**Recommendation:** Implement consistent frontend date formatting with timezone awareness

### 4. **Session Timezone Configuration**
**Critical Setting:**
```typescript
// database.ts - Connection pool config
// Note: No explicit timezone setting found
```
**Assumption:** PostgreSQL session defaults to UTC (or server timezone)
**Verification Needed:** Check `SHOW timezone;` in database session
**Recommendation:** Explicitly set session timezone to 'UTC' in connection:
```sql
SET timezone = 'UTC';
```

### 5. **`CURRENT_TIMESTAMP` Behavior**
**Database Usage:**
```sql
-- Call.ts model
completed_at = CURRENT_TIMESTAMP
updated_at = CURRENT_TIMESTAMP
```
**Behavior:**
- Returns timestamp in session timezone
- If session = 'UTC': returns UTC (correct)
- If session = 'Asia/Kolkata': returns IST time stored as IST (WRONG)
**Status:** ⚠️ Depends on session timezone being 'UTC'

---

## ✅ What's Working Correctly

### 1. **Storage Layer**
- ✅ All timestamps stored in UTC using TIMESTAMPTZ
- ✅ Consistent use of `TIMESTAMP WITH TIME ZONE` in schema
- ✅ Date-only fields use DATE type (no timezone)

### 2. **Analytics Triggers**
- ✅ All triggers migrated to use user-specific timezones
- ✅ `get_user_timezone()` helper function provides consistent lookup
- ✅ Daily aggregations respect user timezone boundaries

### 3. **Query Layer**
- ✅ Dashboard analytics use `getUserTimezoneForQuery()` caching
- ✅ Timezone conversions use `AT TIME ZONE` syntax
- ✅ Date series generation respects user timezone

### 4. **User Management**
- ✅ User timezone stored and retrievable
- ✅ Auto-detection and manual override supported
- ✅ Timezone cache prevents repeated database queries

---

## 🎯 Recommendations

### High Priority

1. **Verify Database Session Timezone**
   ```sql
   -- Add to database initialization
   await client.query("SET timezone = 'UTC'");
   ```
   - Ensures `CURRENT_TIMESTAMP` returns UTC
   - Prevents timezone ambiguity

2. **Standardize Webhook Timestamps**
   ```typescript
   // Use ISO strings everywhere
   timestamp: new Date().toISOString()
   // Not: Date.now() or epoch seconds
   ```

3. **Add Frontend Date Formatting**
   ```typescript
   // Use Intl.DateTimeFormat with explicit timezone
   const formatter = new Intl.DateTimeFormat('en-US', {
     timeZone: userTimezone,
     dateStyle: 'medium',
     timeStyle: 'short'
   });
   ```

### Medium Priority

4. **Campaign Duration Implementation**
   ```typescript
   const duration = completed_at 
     ? completed_at.getTime() - started_at.getTime()
     : Date.now() - started_at.getTime();
   ```

5. **Add Timezone Validation**
   ```typescript
   // In campaign creation/update
   if (campaign_timezone && !isValidTimezone(campaign_timezone)) {
     throw new Error('Invalid timezone');
   }
   ```

6. **Document Timezone Expectations**
   - API documentation: "All timestamps are in UTC"
   - Frontend guide: "Convert to user timezone for display"
   - Database guide: "Session timezone must be UTC"

### Low Priority

7. **Add Timezone to API Responses**
   ```json
   {
     "created_at": "2025-12-03T10:30:00.000Z",
     "created_at_user_tz": "2025-12-03T16:00:00+05:30",
     "user_timezone": "Asia/Kolkata"
   }
   ```

8. **Timezone Migration Tool**
   - Bulk update user timezones based on historical data
   - Detect patterns in call times to suggest timezone

---

## 📋 Testing Checklist

### Manual Tests

- [ ] Create call at 11:30 PM UTC, verify it shows on next day's analytics in IST
- [ ] Update user timezone, verify cache invalidation
- [ ] Create campaign with `start_date='2025-12-03'`, verify no timezone conversion
- [ ] Check webhook with ISO timestamp vs epoch milliseconds
- [ ] Query analytics for last 7 days, verify date range in user timezone

### Automated Tests

- [ ] Unit test: `convertToUserTimezone()` function
- [ ] Unit test: `getUserTimezoneForQuery()` with cache
- [ ] Integration test: Call creation → analytics trigger → date aggregation
- [ ] Integration test: Timezone update → cache invalidation → query uses new timezone

### Database Verification

```sql
-- Verify session timezone
SHOW timezone;

-- Check user timezones
SELECT timezone, COUNT(*) FROM users GROUP BY timezone;

-- Verify analytics dates match user timezone
SELECT 
  u.timezone,
  c.created_at,
  c.created_at AT TIME ZONE 'UTC' AT TIME ZONE u.timezone as user_local_time,
  DATE(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE u.timezone) as user_local_date,
  aa.date as analytics_date
FROM calls c
JOIN users u ON c.user_id = u.id
LEFT JOIN agent_analytics aa 
  ON aa.agent_id = c.agent_id 
  AND aa.user_id = c.user_id
  AND aa.date = DATE(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE u.timezone)
LIMIT 10;
```

---

## 📚 Key Files Reference

### Backend
- `backend/src/models/CallCampaign.ts` - Campaign date handling (recently fixed)
- `backend/src/models/Call.ts` - Call timestamp management
- `backend/src/services/dashboardAnalyticsService.ts` - Analytics queries
- `backend/src/services/timezoneCacheService.ts` - Timezone caching
- `backend/src/utils/timezoneUtils.ts` - Timezone utilities
- `backend/fix_all_timezone_triggers.sql` - Trigger migration script

### Database
- All migrations: `backend/src/migrations/*.sql`
- Trigger logging: `backend/src/migrations/019_add_trigger_logging.sql`
- Trigger optimization: `backend/src/migrations/020_optimize_trigger_performance.sql`

---

## 🔍 Impact Summary

| Area | Storage Format | Display Format | Analytics Impact | Status |
|------|----------------|----------------|------------------|--------|
| **calls.created_at** | UTC (TIMESTAMPTZ) | User TZ | ✅ Converted in triggers | Working |
| **calls.completed_at** | UTC (TIMESTAMPTZ) | User TZ | ✅ Converted in queries | Working |
| **campaign.start_date** | DATE (no TZ) | Date only | ✅ No conversion | Fixed |
| **campaign.end_date** | DATE (no TZ) | Date only | ✅ No conversion | Fixed |
| **agent_analytics.date** | User's local DATE | User TZ | ✅ Pre-converted by triggers | Working |
| **lead_analytics.created_at** | UTC (TIMESTAMPTZ) | User TZ | ✅ Joined with calls | Working |
| **Webhooks** | Mixed (ISO/epoch) | N/A | ⚠️ Needs standardization | Issue |
| **Session Timezone** | Assumed UTC | N/A | ⚠️ Needs verification | Risk |
| **Frontend Display** | Unknown | Unknown | ⚠️ Not implemented | Gap |

---

## 🎓 Best Practices Summary

### ✅ DO
1. Store all timestamps in UTC using `TIMESTAMP WITH TIME ZONE`
2. Convert to user timezone only for display/aggregation
3. Use `AT TIME ZONE` for timezone conversions in SQL
4. Cache user timezones to avoid repeated queries
5. Use DATE type for date-only fields (no timezone)
6. Set database session timezone to 'UTC' explicitly

### ❌ DON'T
1. Store timestamps in local timezone
2. Use `TIMESTAMP WITHOUT TIME ZONE` for event times
3. Rely on server/session timezone for business logic
4. Mix timestamp formats (ISO strings, epoch milliseconds, epoch seconds)
5. Convert dates to timestamps unnecessarily
6. Assume JavaScript Date constructor preserves timezone

---

## 🔬 Deep Analysis - Critical Findings

### 🚨 **CRITICAL: Database Session Timezone Mismatch**

**Discovery:** Your application has **contradictory timezone settings**:

```typescript
// connectionPoolService.ts (Line 38)
private sessionTimeZone: string = (process.env.DB_TIMEZONE || 'Asia/Kolkata').trim();
// Every connection sets: SET TIME ZONE 'Asia/Kolkata'

// server.ts (Line 42)
const timezone = process.env.APP_TIMEZONE || process.env.TZ || 'Asia/Kolkata';
process.env.TZ = timezone;
// Node.js process timezone: Asia/Kolkata

// BUT migrations say:
// run-timezone-fix.sql: ALTER DATABASE neondb SET timezone TO 'UTC';
// 051_fix_campaign_timezone_time_window.sql: SET TIME ZONE 'UTC';
```

**Impact:** 🔴 **SEVERE**
1. **All database connections run in IST (Asia/Kolkata), not UTC**
2. `CURRENT_TIMESTAMP` returns IST time, not UTC
3. Timestamps written to database are IST, not UTC as documented
4. Your "UTC storage" assumption is **INCORRECT**
5. Analytics triggers use IST dates by default, then convert again to user timezone (double conversion)

**Evidence:**
```sql
-- What you THINK is happening:
-- UTC write → Store as UTC → Convert to user TZ

-- What's ACTUALLY happening:
-- IST write (from SET TIME ZONE 'Asia/Kolkata') → Store as IST → Convert to IST again
```

**Verification Test:**
```sql
-- Run this query to see current timezone:
SHOW timezone;
-- Expected: UTC
-- Actual: Varies per connection (IST from connectionPoolService)

-- Check what CURRENT_TIMESTAMP returns:
SELECT 
  CURRENT_TIMESTAMP,
  NOW() AT TIME ZONE 'UTC' as should_be_same_if_utc,
  CURRENT_TIMESTAMP = (NOW() AT TIME ZONE 'UTC') as is_utc;
-- If is_utc = false, your session is NOT UTC!
```

---

### ⚠️ **HIGH: JavaScript Date Constructor Timezone Issues**

**Discovery:** Widespread use of `new Date()` without timezone awareness:

```typescript
// webhookService.ts - Creates dates in Node process timezone (IST)
ringing_started_at: new Date()  // IST time, not UTC!
call_answered_at: new Date()    // IST time, not UTC!
completed_at: new Date()         // IST time, not UTC!

// CallCampaign.ts
started_at: new Date()           // IST time, not UTC!
updated_at: new Date()           // IST time, not UTC!
```

**Impact:** 🟠 **HIGH**
- Timestamps created in Node.js are in IST due to `process.env.TZ = 'Asia/Kolkata'`
- These are passed to PostgreSQL which also uses IST session timezone
- Result: Everything is IST, not UTC
- **Your entire "UTC storage" architecture is broken**

**Correct Approach:**
```typescript
// WRONG (current code):
ringing_started_at: new Date()

// RIGHT (should be):
ringing_started_at: new Date().toISOString()  // Always UTC string
// Or better yet, let database handle it:
ringing_started_at: CURRENT_TIMESTAMP (if session is UTC)
```

---

### ⚠️ **HIGH: Campaign Date Parsing Ambiguity**

**Discovery:** Campaign `start_date` and `end_date` are DATE fields but users input them as strings:

```typescript
// Frontend likely sends: "2025-12-25"
// JavaScript parses as: new Date("2025-12-25")
// Result: 2025-12-25T00:00:00 in LOCAL timezone (IST)
// Database receives: DATE '2025-12-25' (correct)

// But when comparing:
WHERE current_date BETWEEN start_date AND end_date
// current_date is in SESSION timezone (IST)
```

**Impact:** 🟠 **HIGH**
- Campaign date comparisons use IST "today"
- Users in other timezones may experience off-by-one-day errors
- No timezone offset stored with campaign dates

---

### ⚠️ **MEDIUM: Timezone Conversion Double-Application**

**Discovery:** Analytics triggers convert timestamps twice:

```sql
-- Trigger function (fix_all_timezone_triggers.sql):
_user_tz := get_user_timezone(NEW.user_id);  -- Returns 'Asia/Kolkata'
_date := DATE(NEW.created_at AT TIME ZONE 'UTC' AT TIME ZONE _user_tz);

-- But created_at is ALREADY in IST (not UTC)!
-- So this converts: IST → UTC → IST
-- Result: Correct by accident (IST → UTC cancels out)
```

**Impact:** 🟡 **MEDIUM**
- Currently works by accident because double conversion cancels out
- If database session changes to UTC, analytics will be 5.5 hours off
- Fragile design that breaks when configuration changes

---

### ⚠️ **MEDIUM: Campaign Time Window Timezone Logic**

**Discovery:** Campaign scheduler converts current time to campaign timezone:

```typescript
// InMemoryCampaignScheduler.ts - GOOD
// Keeps firstCallTime/lastCallTime in campaign's timezone
// Converts NOW to campaign timezone for comparison

// BUT: get_next_queued_call function (051 migration) - GOOD TOO
// Uses: (CURRENT_TIMESTAMP AT TIME ZONE campaign_timezone)::TIME
// Correctly converts UTC current time to campaign timezone
```

**Impact:** 🟢 **LOW** - This is actually correct! But relies on CURRENT_TIMESTAMP being UTC.

---

### ⚠️ **LOW: Webhook Timestamp Format Inconsistency**

**Discovery:** Three different timestamp formats in use:

```typescript
// Format 1: ISO String (preferred)
timestamp: new Date().toISOString()  // "2025-12-03T10:30:00.000Z"

// Format 2: Epoch milliseconds
timestamp: Date.now()  // 1701598200000

// Format 3: Epoch seconds (for signatures)
const timestamp = Math.floor(Date.now() / 1000);  // 1701598200
```

**Impact:** 🟢 **LOW** - All work, but inconsistent and confusing

---

## 🎯 Root Cause Analysis

### The Core Problem
Your application was **designed for UTC** but **configured for IST**:

1. **Design Assumption:** All timestamps in UTC, convert to user timezone for display
2. **Actual Configuration:** 
   - Database sessions: IST (via `SET TIME ZONE 'Asia/Kolkata'`)
   - Node.js process: IST (via `process.env.TZ`)
   - All `new Date()` calls: IST
   - All `CURRENT_TIMESTAMP`: IST

3. **Why It Works:** Double conversions cancel out
   - Write in IST → Store as IST → Read as IST → Convert IST→UTC→IST = Correct!
   - But fragile and breaks if ANY timezone config changes

### The Cascade Effect

```
❌ process.env.TZ = 'Asia/Kolkata'
   ↓
❌ new Date() returns IST time
   ↓  
❌ Sent to database with IST session
   ↓
❌ TIMESTAMPTZ stores IST as UTC offset +05:30
   ↓
❌ Triggers convert: IST→UTC→User TZ (double conversion)
   ↓
✅ Result: Correct by accident!
```

---

## 🔧 Critical Fixes Required

### Fix 1: Standardize on UTC (Recommended)

**Change database session timezone to UTC:**
```typescript
// connectionPoolService.ts - CHANGE THIS
private sessionTimeZone: string = 'UTC'; // Was: Asia/Kolkata

// server.ts - CHANGE THIS
const timezone = 'UTC'; // Was: Asia/Kolkata
process.env.TZ = 'UTC';
```

**Update all date creation:**
```typescript
// BEFORE (creates IST dates):
started_at: new Date()

// AFTER (creates UTC dates):
started_at: new Date() // Will be UTC now that process.env.TZ = 'UTC'
// OR explicitly:
started_at: new Date(Date.UTC(...)) 
```

**Update triggers:**
```sql
-- Triggers already correct - they convert UTC → User TZ
-- No changes needed if database uses UTC
```

---

### Fix 2: OR Stay with IST (Not Recommended)

**Accept IST as base timezone:**
```typescript
// Keep current settings
// But document EVERYWHERE that base timezone is IST, not UTC
```

**Update trigger logic:**
```sql
-- Change: NEW.created_at AT TIME ZONE 'UTC'
-- To:     NEW.created_at AT TIME ZONE 'Asia/Kolkata'
```

**Update documentation:**
```markdown
# Storage Format: IST (UTC+5:30)
All timestamps stored in Indian Standard Time (IST).
```

---

## 📊 Impact Analysis by Fix

### If You Switch to UTC (Recommended):

| Component | Change Required | Risk | Effort |
|-----------|----------------|------|--------|
| connectionPoolService | Change sessionTimeZone | 🟢 Low | 5 min |
| server.ts | Change TZ env | 🟢 Low | 5 min |
| Database triggers | None (already correct) | 🟢 Low | 0 min |
| Existing data | Already UTC-compatible | 🟢 Low | 0 min |
| Testing | Full regression test | 🟡 Med | 2-4 hrs |

**Total Effort:** 3-4 hours  
**Benefits:** Standards-compliant, globally compatible, matches documentation

---

### If You Keep IST:

| Component | Change Required | Risk | Effort |
|-----------|----------------|------|--------|
| Triggers | Update AT TIME ZONE logic | 🔴 High | 1-2 hrs |
| Documentation | Update all docs | 🟡 Med | 2-3 hrs |
| Future developers | Confusion | 🔴 High | Ongoing |
| Global scaling | Harder | 🔴 High | Ongoing |

**Total Effort:** 4-5 hours initially + ongoing maintenance  
**Benefits:** None (keeps current broken-by-accident state)

---

## 🧪 Verification Tests

### Test 1: Check Current Timezone
```sql
-- Run in psql or pg client:
SHOW timezone;
-- Expected after fix: UTC
-- Current: Likely varies per connection

SELECT CURRENT_TIMESTAMP, NOW() AT TIME ZONE 'UTC';
-- Should be identical if session is UTC
```

### Test 2: Check Node.js Timezone
```javascript
// Add to server.ts startup:
console.log('Node TZ:', process.env.TZ);
console.log('Date:', new Date().toISOString());
console.log('Offset:', new Date().getTimezoneOffset());
// Offset should be 0 if UTC, -330 if IST
```

### Test 3: End-to-End Call Test
```javascript
// Create call, check database:
const call = await createCall(...);
const dbResult = await pool.query(
  'SELECT created_at, created_at AT TIME ZONE \'UTC\' FROM calls WHERE id = $1',
  [call.id]
);
console.log('Stored:', dbResult.rows[0].created_at);
console.log('As UTC:', dbResult.rows[0].timezone);
// Should be identical if stored in UTC
```

### Test 4: Analytics Timezone Test
```sql
-- For a known call, check analytics date:
SELECT 
  c.created_at,
  c.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata' as ist_time,
  DATE(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') as analytics_date,
  aa.date as actual_analytics_date
FROM calls c
LEFT JOIN agent_analytics aa 
  ON aa.date = DATE(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')
WHERE c.id = '<call_id>';
-- analytics_date and actual_analytics_date should match
```

---

## 🎓 Architecture Recommendations

### Recommended Architecture (UTC Base)

```
┌─────────────────────────────────────────┐
│ Node.js Process (process.env.TZ = UTC) │
│   new Date() → UTC                      │
└────────────────┬────────────────────────┘
                 │ ISO String "2025-12-03T10:00:00.000Z"
                 ↓
┌─────────────────────────────────────────┐
│ PostgreSQL Session (timezone = UTC)    │
│   CURRENT_TIMESTAMP → UTC               │
│   TIMESTAMPTZ → Store as UTC            │
└────────────────┬────────────────────────┘
                 │ Stored: 2025-12-03 10:00:00+00
                 ↓
┌─────────────────────────────────────────┐
│ Triggers (convert to user timezone)    │
│   DATE(ts AT TIME ZONE 'UTC'           │
│       AT TIME ZONE user_tz)            │
└────────────────┬────────────────────────┘
                 │ Analytics: 2025-12-03 (IST date)
                 ↓
┌─────────────────────────────────────────┐
│ API Response (timezone-aware)          │
│   formatDateForTimezone(date, userTZ)  │
└────────────────┬────────────────────────┘
                 │ Display: "Dec 3, 3:30 PM IST"
                 ↓
           Frontend Display
```

---

## 📋 Migration Checklist

### Phase 1: Investigation (1 hour)
- [ ] Run Test 1: Check database timezone
- [ ] Run Test 2: Check Node.js timezone  
- [ ] Run Test 3: Check stored timestamp format
- [ ] Run Test 4: Check analytics timezone conversion
- [ ] Document current behavior

### Phase 2: Decision (30 minutes)
- [ ] Review findings with team
- [ ] Decide: Switch to UTC or stay with IST
- [ ] Plan downtime window if needed

### Phase 3: Implementation (2-3 hours)
- [ ] Update connectionPoolService timezone setting
- [ ] Update server.ts timezone setting
- [ ] Update environment variables (DB_TIMEZONE, APP_TIMEZONE)
- [ ] If keeping IST: Update trigger functions
- [ ] Update documentation

### Phase 4: Testing (2-3 hours)
- [ ] Run all verification tests
- [ ] Create test call, verify timestamps
- [ ] Check analytics aggregation
- [ ] Verify campaign time windows
- [ ] Test across multiple timezones

### Phase 5: Monitoring (1 week)
- [ ] Monitor analytics accuracy
- [ ] Check for timezone-related errors
- [ ] Validate user reports
- [ ] Document lessons learned

---

## 🔍 Additional Findings

### Frontend Date Handling
- **No timezone-aware date formatting found** in frontend code
- Likely relies on browser's `toLocaleString()` or receives pre-formatted strings
- **Risk:** Date parsing ambiguity for user input (e.g., campaign dates)

### Webhook Timestamp Handling  
- Multiple formats reduce reliability
- Signature validation uses epoch seconds
- Storage uses ISO strings or `new Date()` objects (IST)

### Campaign Scheduling
- Time window logic is **correct** (converts current time to campaign TZ)
- But relies on `CURRENT_TIMESTAMP` being UTC (currently IST)
- Will break if timezone config changes

---

**Document Version:** 2.0 - Deep Analysis  
**Last Updated:** December 3, 2025  
**Critical Priority:** Fix timezone configuration mismatch  
**Next Review:** After implementing timezone standardization
