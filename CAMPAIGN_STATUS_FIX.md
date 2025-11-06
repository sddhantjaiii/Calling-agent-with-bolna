# Campaign Status & Call Initiation - Complete Guide

## Current Status: Campaigns Active by Default ✅

### What Was Changed

**Backend File**: `backend/src/models/CallCampaign.ts`

**Before**:
```typescript
'draft',  // New campaigns started as draft
```

**After**:
```typescript
'active',      // New campaigns now start as active
new Date()     // started_at timestamp set immediately
```

---

## Why Calls Weren't Happening

### Issue #1: Campaign Status was 'draft' ❌
- **Problem**: QueueProcessor only processes campaigns with `status = 'active'`
- **Your campaigns**: Created with `status = 'draft'`
- **Result**: QueueProcessor skipped them with message "No pending calls in queue"
- **Solution**: Changed default status to `'active'` ✅

### Issue #2: Database Function Missing Campaign Checks ⚠️
- **Problem**: The `get_next_queued_call()` PostgreSQL function doesn't check:
  - Campaign status (`active` vs `draft`)
  - Time window (`first_call_time` to `last_call_time`)
  - Campaign expiry (`end_date`)
- **Impact**: Even with active campaigns, calls may not initiate if outside time window
- **Solution**: Created enhanced SQL function in `update-queue-function.sql` ✅

---

## How to Activate Existing Draft Campaigns

If you have existing campaigns in `draft` status, you need to manually activate them:

### SQL Query to Activate:
```sql
UPDATE call_campaigns 
SET 
  status = 'active',
  started_at = NOW()
WHERE status = 'draft' 
  AND user_id = 'your-user-id-here';
```

### Or activate a specific campaign:
```sql
UPDATE call_campaigns 
SET 
  status = 'active',
  started_at = NOW()
WHERE id = 'ccc34390-edf1-4b57-89c4-aefc092cb8d8';
```

---

## Update Database Function (IMPORTANT!)

The current database function doesn't check campaign constraints. You need to run the enhanced version:

### Steps:

1. **Connect to your database** (PostgreSQL)

2. **Run the SQL file**:
   ```bash
   psql -U your_username -d your_database -f update-queue-function.sql
   ```

3. **Or run directly**:
   ```sql
   -- Copy the entire content from update-queue-function.sql and run it
   ```

### What the Enhanced Function Does:

```sql
SELECT q.*
FROM call_queue q
INNER JOIN call_campaigns c ON q.campaign_id = c.id
WHERE 
  q.user_id = p_user_id
  AND q.status = 'queued'
  AND c.status = 'active'                           -- ✅ CHECK: Campaign active
  AND q.scheduled_for <= CURRENT_TIMESTAMP          -- ✅ CHECK: Time has come
  AND CURRENT_TIME >= c.first_call_time::time       -- ✅ CHECK: After 9 AM
  AND CURRENT_TIME <= c.last_call_time::time        -- ✅ CHECK: Before 5 PM
  AND (c.end_date IS NULL OR CURRENT_DATE <= c.end_date)  -- ✅ CHECK: Not expired
ORDER BY q.priority DESC, q.position ASC
LIMIT 1;
```

---

## QueueProcessor Workflow

### Every 5 Seconds, QueueProcessor:

1. **Checks System Capacity**
   ```
   System active calls < 10? → Continue
   ```

2. **For Each User**:
   ```
   User active calls < user.concurrent_calls_limit? → Continue
   ```

3. **Finds Next Call**:
   ```sql
   SELECT * FROM get_next_queued_call(user_id);
   ```
   This returns:
   - ✅ A queued call if all conditions met
   - ❌ NULL if no calls available

4. **Initiates Call**:
   - Updates queue status: `queued` → `processing`
   - Calls Bolna API
   - Creates call record
   - Links call to queue item

5. **On Success**:
   - Queue status: `processing` → `completed`
   - Call ID stored in queue
   - Campaign statistics updated

6. **On Failure**:
   - Queue status: `processing` → `failed`
   - Error logged
   - Can be retried later

---

## Time Window Logic

### Your Current Settings:
```json
{
  "first_call_time": "09:00:00",
  "last_call_time": "17:00:00"  // or "23:00:00"
}
```

### What This Means:
- Calls will ONLY be initiated between 9:00 AM and 5:00 PM (or 11:00 PM)
- Based on your **server's timezone** (likely UTC or IST)
- If current time is outside this window, queue items are skipped

### Example Timeline (IST):
```
08:59 AM → ❌ Too early (before first_call_time)
09:00 AM → ✅ Start calling
12:00 PM → ✅ Calling active
05:00 PM → ✅ Last minute of calling window
05:01 PM → ❌ Too late (after last_call_time)
```

---

## Timezone Considerations

### In Database:
- All timestamps stored in UTC
- `scheduled_for`: `2025-10-08T18:30:00.000Z`

### In Your View:
- Converted to IST (+05:30)
- Shows as: `2025-10-09 05:30:00+05:30`

### Time Window Check:
```sql
CURRENT_TIME >= c.first_call_time::time
```
- Uses **server's current time** (likely UTC or IST)
- Compares with `first_call_time` and `last_call_time`

**Important**: Ensure your time window matches your server's timezone!

---

## Testing Your Campaign

### Step 1: Verify Campaign is Active
```sql
SELECT id, name, status, started_at, first_call_time, last_call_time
FROM call_campaigns
WHERE user_id = 'your-user-id';
```

Expected:
```
status = 'active'
started_at = (timestamp)
```

### Step 2: Verify Queue Items Exist
```sql
SELECT q.id, q.status, q.phone_number, q.scheduled_for, c.name as campaign_name, c.status as campaign_status
FROM call_queue q
JOIN call_campaigns c ON q.campaign_id = c.id
WHERE q.user_id = 'your-user-id'
ORDER BY q.created_at DESC
LIMIT 10;
```

Expected:
```
status = 'queued'
campaign_status = 'active'
scheduled_for <= NOW()
```

### Step 3: Check Current Time vs Time Window
```sql
SELECT 
  CURRENT_TIME as current_time,
  '09:00:00'::time as first_call_time,
  '17:00:00'::time as last_call_time,
  CASE 
    WHEN CURRENT_TIME >= '09:00:00'::time AND CURRENT_TIME <= '17:00:00'::time 
    THEN '✅ WITHIN WINDOW' 
    ELSE '❌ OUTSIDE WINDOW' 
  END as status;
```

### Step 4: Manually Test Function
```sql
SELECT * FROM get_next_queued_call('your-user-id');
```

Expected:
- If within time window and campaign active → Returns queue item
- Otherwise → Returns nothing

### Step 5: Watch QueueProcessor Logs
```bash
# In backend terminal
# Watch for:
[QueueProcessor] System calls: 0/10
[QueueProcessor] Processing 1 users with pending calls
[QueueProcessor] User user-id has 0/2 active calls
[QueueProcessor] Allocating call for user user-id, queue_id: queue-item-id
```

---

## Common Issues & Solutions

### Issue: "No pending calls in queue"
**Causes**:
1. ❌ Campaign status is `draft` (not `active`)
2. ❌ Current time outside time window
3. ❌ No queued items (all completed/failed)
4. ❌ `scheduled_for` is in the future

**Solutions**:
1. ✅ Activate campaign (SQL update)
2. ✅ Adjust time window or wait for window
3. ✅ Create new campaign with contacts
4. ✅ Check `scheduled_for` timestamp

### Issue: Calls starting too early/late
**Cause**: Timezone mismatch between server and time window

**Solution**: 
- Check server timezone: `SELECT current_setting('TIMEZONE');`
- Adjust `first_call_time`/`last_call_time` accordingly
- Example: If server is UTC and you want 9 AM IST calls:
  - Set `first_call_time = '03:30:00'` (9 AM IST = 3:30 AM UTC)

### Issue: Campaign completed immediately
**Cause**: `total_contacts` = 0 or all calls already processed

**Solution**:
- Check: `SELECT total_contacts FROM call_campaigns WHERE id = 'campaign-id';`
- Create new campaign with contacts

---

## Next Steps

### 1. Update Database Function (Critical!)
```bash
# Run the enhanced SQL function
psql -U username -d database -f update-queue-function.sql
```

### 2. Activate Existing Campaigns
```sql
UPDATE call_campaigns 
SET status = 'active', started_at = NOW()
WHERE status = 'draft';
```

### 3. Create New Campaign to Test
- Use bulk call from contacts
- Should create as `active` automatically
- Verify queue items created

### 4. Monitor QueueProcessor
- Watch backend logs
- Should see call allocation messages
- Calls should initiate within time window

### 5. Optional: Add Start/Stop Buttons (Future Enhancement)
- Add UI buttons to pause/resume campaigns
- Update campaign status via API
- Useful for controlling call flow

---

## Expected Behavior After Fixes

### When you create a new campaign:
```json
{
  "status": "active",        // ✅ Immediately active
  "started_at": "2025-10-09T12:00:00Z",  // ✅ Timestamp set
  "total_contacts": 1,       // ✅ Correct count
  "first_call_time": "09:00:00",
  "last_call_time": "17:00:00"
}
```

### QueueProcessor logs (during time window):
```
[QueueProcessor] System calls: 0/10
[QueueProcessor] Processing 1 users with pending calls
[QueueProcessor] User 789895c8... has 0/2 active calls
[QueueProcessor] Allocating call for user 789895c8..., queue_id: abc123...
[QueueProcessor] Call initiated successfully
```

### Queue item lifecycle:
```
1. Created → status: 'queued'
2. Picked up → status: 'processing'
3. Call made → call_id set
4. Finished → status: 'completed'
```

### Campaign updates automatically:
```json
{
  "total_contacts": 1,
  "completed_calls": 1,      // ✅ Updated by trigger
  "successful_calls": 1,     // ✅ Updated by trigger
  "status": "completed"      // ✅ Auto-completed when all calls done
}
```

---

## Files Modified

1. ✅ `backend/src/models/CallCampaign.ts` - Default status to 'active'
2. ✅ `update-queue-function.sql` - Enhanced database function
3. ✅ `CALL_QUEUE_SCHEMA_EXPLAINED.md` - Documentation
4. ✅ `CAMPAIGN_STATUS_FIX.md` - This guide

---

## Summary

**Before**:
- ❌ Campaigns created as 'draft'
- ❌ QueueProcessor skipped them
- ❌ No calls initiated

**After**:
- ✅ Campaigns created as 'active'
- ✅ `started_at` timestamp set
- ✅ QueueProcessor picks them up
- ✅ Calls initiate during time window

**Critical**: Don't forget to run `update-queue-function.sql` to update the database function!

---

**Implementation Date**: October 9, 2025
**Status**: Ready to Test 🚀
**Next**: Update database function → Create new campaign → Watch it call!
