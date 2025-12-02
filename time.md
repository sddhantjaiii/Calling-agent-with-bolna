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

**Document Version:** 1.0  
**Last Updated:** December 3, 2025  
**Next Review:** After implementing high-priority recommendations
