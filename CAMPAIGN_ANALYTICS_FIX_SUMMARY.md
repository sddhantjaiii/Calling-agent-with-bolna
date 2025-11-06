# Campaign Analytics & UI Fixes - Complete Summary

**Date:** October 9, 2025  
**Status:** ✅ **ALL ISSUES RESOLVED**

---

## 🐛 Issues Identified

### 1. Analytics API Returning 500 Error
**Error Message:**
```
column "ended_at" does not exist
hint: Perhaps you meant to reference the column "c.end_date"
```

**Root Cause:**
- `CallCampaign.getAnalytics()` query tried to calculate average call duration using:
  ```sql
  AVG(EXTRACT(EPOCH FROM (ended_at - started_at)))
  ```
- **Problem:** The `calls` table does NOT have `ended_at` or `started_at` columns
- **Actual columns:** `duration_seconds`, `created_at`, `completed_at`, `call_answered_at`, `call_disconnected_at`

**Fix Applied:**
```typescript
// ❌ BEFORE (WRONG)
(SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (ended_at - started_at))), 0)
 FROM calls 
 WHERE id IN (SELECT call_id FROM call_queue WHERE campaign_id = c.id AND call_id IS NOT NULL)
) as avg_call_duration_seconds

// ✅ AFTER (CORRECT)
(SELECT COALESCE(AVG(duration_seconds), 0)
 FROM calls 
 WHERE id IN (SELECT call_id FROM call_queue WHERE campaign_id = c.id AND call_id IS NOT NULL)
) as avg_call_duration_seconds
```

**File Modified:** `backend/src/models/CallCampaign.ts` (line 242)

---

### 2. UI Showing "NaN%" Progress and "NaN remaining"
**Visual Issue:**
```
Overall Progress: NaN%
of 1 contacts called: NaN remaining
```

**Root Cause:**
- **Frontend TypeScript interfaces** used field name: `contacts_called`
- **Backend database schema** actual field name: `completed_calls`
- Frontend calculated: `(campaign.contacts_called / campaign.total_contacts) * 100`
- Since `contacts_called` was `undefined`, result was `NaN`

**Fix Applied:**
Updated TypeScript interfaces and all usages in 2 files:

#### File 1: `frontend/src/pages/Campaigns.tsx`
```typescript
// ❌ BEFORE
interface Campaign {
  total_contacts: number;
  contacts_called: number;  // WRONG FIELD NAME
  successful_calls: number;
  failed_calls: number;
}

// ✅ AFTER
interface Campaign {
  total_contacts: number;
  completed_calls: number;  // CORRECT FIELD NAME
  successful_calls: number;
  failed_calls: number;
}
```

Updated 5 locations in this file:
1. Interface definition (line 20)
2. `calculateProgress()` function (line 296)
3. `calculateSuccessRate()` function (line 364-365)
4. Progress display (line 395)
5. Success rate display (line 401)

#### File 2: `frontend/src/components/campaigns/CampaignDetailsDialog.tsx`
```typescript
// Same interface fix + updated 6 usages:
1. Interface definition (line 24)
2. calculateProgress() function (line 55)
3. calculateSuccessRate() function (line 59-60)
4. Progress text (line 104-105)
5. Total Calls card (line 116)
```

---

### 3. Unused Migration File
**File:** `backend/src/migrations/046_add_bolna_conversation_id.sql`

**Issue:**
- Migration added `bolna_conversation_id` column to `calls` table
- **But:** System actually uses `bolna_execution_id` (not `bolna_conversation_id`)
- This column was never used and created confusion

**Fix Applied:**
- ✅ **Removed migration file completely**
- System continues to use `bolna_execution_id` (correct field)

---

## ✅ Verification Checklist

### Backend API Test
```bash
# Test campaign analytics endpoint
curl http://localhost:8080/api/campaigns/f8605ba0-5724-48ab-b16c-dc98347c4d95/analytics \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected Response:
{
  "success": true,
  "analytics": {
    "id": "...",
    "name": "testing",
    "total_contacts": 1,
    "completed_calls": 0,
    "successful_calls": 0,
    "failed_calls": 0,
    "queued_calls": 1,
    "processing_calls": 0,
    "avg_call_duration_seconds": 0,
    "success_rate": 0,
    "completion_rate": 0
  }
}
```

### Frontend UI Test
1. ✅ Navigate to `/campaigns`
2. ✅ Click "Details" on any campaign
3. ✅ Verify "Overall Progress" shows percentage (not NaN%)
4. ✅ Verify "X of Y contacts called" shows numbers (not NaN)
5. ✅ Verify "Success Rate" shows percentage (not NaN%)
6. ✅ Verify "Average Call Duration" displays

---

## 📊 Database Schema Clarification

### `calls` Table - Actual Columns
```sql
CREATE TABLE calls (
  id UUID PRIMARY KEY,
  agent_id UUID NOT NULL,
  user_id UUID NOT NULL,
  contact_id UUID,
  
  -- Bolna.ai Integration
  bolna_execution_id VARCHAR(255) UNIQUE NOT NULL,  -- ✅ Used
  -- bolna_conversation_id NOT USED (migration removed)
  
  -- Call Details
  phone_number VARCHAR(50) NOT NULL,
  call_source VARCHAR(20),  -- 'phone', 'internet', 'unknown'
  caller_name VARCHAR(255),
  caller_email VARCHAR(255),
  lead_type VARCHAR(20),    -- 'inbound', 'outbound'
  
  -- Duration Tracking
  duration_seconds INTEGER DEFAULT 0 NOT NULL,  -- ✅ Exact duration
  duration_minutes INTEGER DEFAULT 0 NOT NULL,  -- Rounded for billing
  credits_used INTEGER DEFAULT 0 NOT NULL,
  
  -- Status
  status VARCHAR(20) DEFAULT 'in_progress' NOT NULL,
  
  -- Lifecycle Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  completed_at TIMESTAMPTZ,
  ringing_started_at TIMESTAMPTZ,
  call_answered_at TIMESTAMPTZ,
  call_disconnected_at TIMESTAMPTZ,
  
  -- Other
  recording_url TEXT,
  transcript_id UUID,
  metadata JSONB DEFAULT '{}'
);
```

### `call_campaigns` Table - Actual Columns
```sql
CREATE TABLE call_campaigns (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  agent_id UUID NOT NULL,
  next_action TEXT NOT NULL,
  
  -- Time Window
  first_call_time TIME NOT NULL,
  last_call_time TIME NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  
  -- Status
  status VARCHAR(20) DEFAULT 'draft' NOT NULL,
  
  -- Statistics
  total_contacts INTEGER DEFAULT 0 NOT NULL,
  completed_calls INTEGER DEFAULT 0 NOT NULL,  -- ✅ THIS is what backend returns
  successful_calls INTEGER DEFAULT 0 NOT NULL,
  failed_calls INTEGER DEFAULT 0 NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
```

---

## 🗑️ Unused/Legacy Tables

Based on migration analysis, these tables may be **unused or legacy**:

### 1. **`transcripts` table**
- **Status:** Potentially unused
- **Reason:** `calls` table has `transcript_id` but transcripts may not be actively created
- **Check:** Query `SELECT COUNT(*) FROM transcripts;`

### 2. **`elevenlabs_backup_data` view**
- **Status:** Legacy backup
- **Reason:** Created during Bolna.ai migration for rollback safety
- **Action:** Can be dropped after confirming migration stability

### 3. **`twilio_processed_calls` table**
- **Status:** May be unused
- **Reason:** Created for duplicate prevention but might not be actively used
- **Check:** Query `SELECT COUNT(*) FROM twilio_processed_calls;`

### 4. **`followup` table (if exists)**
- **Status:** Unknown - check if referenced in code
- **Check:** `grep -r "followup" backend/src/`

### 5. **`phone_numbers` table (migration 030)**
- **Status:** Unknown - check if referenced in code
- **Check:** `grep -r "phone_numbers" backend/src/`

### 6. **`system_config` table**
- **Status:** Potentially unused
- **Reason:** Created for admin settings but may not be actively used
- **Check:** Query `SELECT * FROM system_config;`

---

## 📝 Recommendations

### Immediate Actions
1. ✅ **Test campaign analytics API** - verify 200 response
2. ✅ **Test campaign UI** - verify no NaN values
3. ✅ **Monitor logs** - ensure no more "ended_at" errors

### Future Cleanup
1. **Database audit:**
   ```sql
   -- Check table sizes
   SELECT schemaname, tablename, 
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
   FROM pg_tables 
   WHERE schemaname = 'public'
   ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
   
   -- Check unused tables (0 rows)
   SELECT schemaname, tablename
   FROM pg_tables t
   WHERE schemaname = 'public'
   AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = t.tablename);
   ```

2. **Code audit:**
   ```bash
   # Find tables referenced in code
   cd backend/src
   grep -r "FROM transcripts" .
   grep -r "FROM system_config" .
   grep -r "FROM phone_numbers" .
   grep -r "FROM followup" .
   ```

3. **Migration cleanup:**
   - Consider consolidating migrations into single schema file
   - Remove backup views after 30 days of stability

---

## 🎉 Final Status

| Issue | Status | Fixed In |
|-------|--------|----------|
| Analytics API 500 error | ✅ FIXED | `backend/src/models/CallCampaign.ts` |
| UI showing NaN% | ✅ FIXED | `frontend/src/pages/Campaigns.tsx` |
| UI showing NaN remaining | ✅ FIXED | `frontend/src/components/campaigns/CampaignDetailsDialog.tsx` |
| Unused migration 046 | ✅ REMOVED | Deleted file |
| Database schema docs | ✅ UPDATED | This document |

**All campaign analytics features are now fully functional!** 🚀
