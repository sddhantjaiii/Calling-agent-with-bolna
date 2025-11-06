# Complete Analysis Unique Constraint Fix

## 🐛 Issue

**Error Message:**
```
there is no unique or exclusion constraint matching the ON CONFLICT specification
```

**Root Cause:**
The code tries to upsert complete analysis using:
```sql
ON CONFLICT (user_id, phone_number, analysis_type)
```

But the database doesn't have a unique constraint on these three columns.

---

## ✅ Solution

Add a **partial unique index** that ensures only ONE complete analysis record exists per `user_id + phone_number` combination.

**Why partial index?**
- Only `analysis_type = 'complete'` needs to be unique per user+phone
- Individual analyses (`analysis_type = 'individual'`) should allow duplicates (one per call)

---

## 🚀 How to Apply the Fix

### Option 1: Using psql (Recommended)

```bash
# Connect to your database
psql -U postgres -d your_database_name

# Run the migration script
\i database-migrations/add-complete-analysis-unique-constraint.sql
```

### Option 2: Using SQL directly

```sql
-- 1. Clean up any existing duplicates
DELETE FROM lead_analytics
WHERE id IN (
  SELECT id
  FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, phone_number, analysis_type 
        ORDER BY analysis_timestamp DESC
      ) as rn
    FROM lead_analytics
    WHERE analysis_type = 'complete'
  ) sub
  WHERE rn > 1
);

-- 2. Create the partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_analytics_complete_unique
ON lead_analytics (user_id, phone_number, analysis_type)
WHERE analysis_type = 'complete';
```

### Option 3: Quick one-liner

```bash
psql -U postgres -d your_database_name -f database-migrations/add-complete-analysis-unique-constraint.sql
```

---

## 🔍 Verify the Fix

After running the migration, verify the constraint exists:

```sql
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'lead_analytics' 
  AND indexname = 'idx_lead_analytics_complete_unique';
```

Expected output:
```
           indexname              |                                     indexdef
----------------------------------+-----------------------------------------------------------------------------------
 idx_lead_analytics_complete_unique | CREATE UNIQUE INDEX idx_lead_analytics_complete_unique ON lead_analytics 
                                  | USING btree (user_id, phone_number, analysis_type) 
                                  | WHERE (analysis_type = 'complete'::text)
```

---

## 📋 What This Fix Does

### Before:
- Multiple complete analysis records could exist for same user+phone
- Upsert query would fail with constraint error
- No way to reliably update existing complete analysis

### After:
- Only ONE complete analysis record per user+phone combination
- First call: Inserts new complete analysis record
- Subsequent calls: Updates the existing complete analysis record
- Individual analyses remain unaffected (still one per call)

---

## 🔄 How Upsert Works Now

### First Call to a Phone Number:
```sql
-- No existing record, INSERT happens
INSERT INTO lead_analytics (...) 
VALUES (...)
ON CONFLICT (user_id, phone_number, analysis_type) 
DO UPDATE SET ...
-- Result: New record created
```

### Second Call to Same Phone Number:
```sql
-- Record exists, UPDATE happens (via DO UPDATE SET)
INSERT INTO lead_analytics (...) 
VALUES (...)
ON CONFLICT (user_id, phone_number, analysis_type) 
DO UPDATE SET 
  total_score = EXCLUDED.total_score,
  analysis_timestamp = CURRENT_TIMESTAMP,
  ...
-- Result: Existing record updated with latest scores
```

---

## 🎯 Testing

After applying the migration:

1. **Restart your backend server**
2. **Make a test call**
3. **Check logs** - should see successful complete analysis upsert:

```
[INFO] Upserting complete analysis {
  latestCallId: '...',
  previousCallsCount: 0,
  total_score: 85
}
```

4. **Make another call to same number**
5. **Verify only one complete analysis exists**:

```sql
SELECT 
  phone_number,
  analysis_type,
  previous_calls_analyzed,
  total_score,
  created_at,
  analysis_timestamp
FROM lead_analytics
WHERE analysis_type = 'complete'
  AND phone_number = '+91 8979556941'
ORDER BY analysis_timestamp DESC;
```

Expected: Only **1 row** returned, with `previous_calls_analyzed` incremented

---

## ⚠️ Important Notes

1. **Partial Index**: The constraint only applies to `analysis_type = 'complete'`
   - Individual analyses can still have multiple records per phone number
   - This is the desired behavior (one individual analysis per call)

2. **Data Cleanup**: The migration first removes any duplicate complete analysis records
   - Keeps the most recent one (by `analysis_timestamp`)
   - Older duplicates are deleted

3. **No Rollback Needed**: If duplicates were created during testing, this migration cleans them up

---

## 🔧 Alternative Approach (If Migration Fails)

If you can't run the migration immediately, you can temporarily change the code to use `call_id` for conflict resolution:

```typescript
// Temporary workaround - change ON CONFLICT clause
ON CONFLICT (call_id)
DO UPDATE SET ...
```

But this is **NOT recommended** because:
- It would create multiple complete analysis records per phone number
- Defeats the purpose of having a "complete" aggregated analysis
- Should only be used as emergency workaround

---

## ✅ Summary

**Problem**: Missing unique constraint for complete analysis upsert  
**Solution**: Add partial unique index on `(user_id, phone_number, analysis_type)` WHERE `analysis_type = 'complete'`  
**Result**: Complete analysis properly upserts (insert or update) based on user+phone combination

**Run this command:**
```bash
psql -U postgres -d your_database_name -f database-migrations/add-complete-analysis-unique-constraint.sql
```

Then restart your backend and test! 🚀
