# Lead Analytics Database Column Fix

## 🐛 Issues Fixed

### Issue 1: Column "updated_at" does not exist
**Error Message:**
```
column "updated_at" of relation "lead_analytics" does not exist
```

**Root Cause:**
The code was referencing `updated_at` column in the `lead_analytics` table, but the database schema only has:
- `created_at` (TIMESTAMP WITH TIME ZONE, NOT NULL, DEFAULT CURRENT_TIMESTAMP)
- `analysis_timestamp` (TIMESTAMP WITH TIME ZONE, DEFAULT CURRENT_TIMESTAMP)

### Issue 2: Multiple assignments to same column
**Error Message:**
```
multiple assignments to same column "analysis_timestamp"
```

**Root Cause:**
In the upsert query, `analysis_timestamp` was being set twice:
1. Line 177: `analysis_timestamp = EXCLUDED.analysis_timestamp`
2. Line 202: `analysis_timestamp = CURRENT_TIMESTAMP`

PostgreSQL doesn't allow the same column to be assigned twice in an UPDATE statement.

---

## ✅ Solutions Applied

### Fix 1: Changed `updated_at` to `analysis_timestamp`

Changed all references from `updated_at` to `analysis_timestamp` in the LeadAnalytics model.

#### File: `backend/src/models/LeadAnalytics.ts`

**Line 277 - Get Complete Analysis by Phone:**
```sql
-- Before
ORDER BY updated_at DESC

-- After
ORDER BY analysis_timestamp DESC
```

**Line 293 - Get Complete Analyses by User:**
```sql
-- Before
ORDER BY updated_at DESC

-- After
ORDER BY analysis_timestamp DESC
```

---

### Fix 2: Removed Duplicate `analysis_timestamp` Assignment

In the upsert query, removed the duplicate assignment and kept only `CURRENT_TIMESTAMP` to ensure the timestamp is always updated on upsert.

#### File: `backend/src/models/LeadAnalytics.ts`

**Lines 172-202 - Upsert Complete Analysis:**

**Before (WRONG - Had duplicate):**
```sql
ON CONFLICT (user_id, phone_number, analysis_type)
DO UPDATE SET
  call_id = EXCLUDED.call_id,
  previous_calls_analyzed = EXCLUDED.previous_calls_analyzed,
  latest_call_id = EXCLUDED.latest_call_id,
  analysis_timestamp = EXCLUDED.analysis_timestamp,  -- ❌ Assignment #1
  intent_level = EXCLUDED.intent_level,
  ...
  demo_book_datetime = EXCLUDED.demo_book_datetime,
  analysis_timestamp = CURRENT_TIMESTAMP  -- ❌ Assignment #2 (DUPLICATE!)
```

**After (CORRECT - Single assignment):**
```sql
ON CONFLICT (user_id, phone_number, analysis_type)
DO UPDATE SET
  call_id = EXCLUDED.call_id,
  previous_calls_analyzed = EXCLUDED.previous_calls_analyzed,
  latest_call_id = EXCLUDED.latest_call_id,
  intent_level = EXCLUDED.intent_level,
  ...
  demo_book_datetime = EXCLUDED.demo_book_datetime,
  analysis_timestamp = CURRENT_TIMESTAMP  -- ✅ Single assignment, always uses current time
```

**Why CURRENT_TIMESTAMP is correct:**
- When upserting a complete analysis, we want to track when the LAST update happened
- Using `EXCLUDED.analysis_timestamp` would preserve the timestamp from the input data
- Using `CURRENT_TIMESTAMP` ensures the timestamp reflects when the record was actually updated
- This is the correct behavior for tracking "last modified" time

---

## 📋 Database Schema Verification

### Lead Analytics Table - Timestamp Columns:
```sql
created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
analysis_timestamp  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
```

**Note:** There is NO `updated_at` column in this table.

### Usage:
- **`created_at`**: Set when the record is first inserted (never changes)
- **`analysis_timestamp`**: Updated to current timestamp whenever the record is inserted or updated (tracks last modification)

---

## 🔄 Data Flow Impact

### Individual Analysis:
1. Insert new record → `created_at` and `analysis_timestamp` both set to current timestamp
2. Record is never updated → timestamps remain the same

### Complete Analysis:
1. **First call**: Insert new record → both timestamps set to current timestamp
2. **Subsequent calls**: Upsert existing record:
   - `created_at` stays the same (from first insert)
   - `analysis_timestamp` updated to current timestamp (tracks last update)
3. This allows tracking when the complete analysis was first created vs last updated

---

## ✅ Testing Commands

### Verify the fix works:
```bash
# Restart backend server
cd backend
npm run dev
```

### Make a test call and check logs:
```bash
# Should see successful complete analysis upsert without database errors
```

### Query database to verify:
```sql
-- Check complete analysis records
SELECT 
  phone_number,
  analysis_type,
  previous_calls_analyzed,
  created_at,
  analysis_timestamp,
  total_score,
  (analysis_timestamp - created_at) as time_since_first_call
FROM lead_analytics
WHERE analysis_type = 'complete'
ORDER BY analysis_timestamp DESC
LIMIT 5;
```

Expected behavior:
- `created_at`: When the first call was made to this phone number (doesn't change)
- `analysis_timestamp`: When the most recent call was made (updates with each call)
- `time_since_first_call`: Shows duration between first and last call

---

## 🎯 Key Points

1. ✅ All `updated_at` references in LeadAnalytics model changed to `analysis_timestamp`
2. ✅ Removed duplicate `analysis_timestamp` assignment in upsert query
3. ✅ Kept `CURRENT_TIMESTAMP` assignment to track actual update time
4. ✅ Complete analysis upserts will now work correctly
5. ✅ Queries ordering by timestamp will work correctly
6. ✅ No compilation errors
7. ✅ Database schema matches code expectations

---

## 📝 Related Files

Only one file was modified:
- `backend/src/models/LeadAnalytics.ts`

Other files that reference `updated_at` are for different tables (calls, users, campaigns, contacts) and were not affected.

---

## 🚀 Status

✅ **Fixed and ready for testing!**

The webhook should now successfully complete OpenAI analysis and save both individual and complete analytics to the database without errors.

---

**Last Updated:** 2025-10-10  
**Issues Fixed:**
1. Column "updated_at" does not exist → Changed to `analysis_timestamp`
2. Multiple assignments to same column → Removed duplicate, kept `CURRENT_TIMESTAMP`
