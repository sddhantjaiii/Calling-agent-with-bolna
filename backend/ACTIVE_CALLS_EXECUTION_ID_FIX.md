# Active Calls Execution ID Fix

## 🐛 Problem Identified

The `active_calls` table had a `bolna_execution_id` column, but it was **never being populated** when calls were initiated.

### Original Flow (BROKEN):
```
1. Reserve slot in active_calls:
   INSERT INTO active_calls (id, user_id, call_type, started_at)
   ❌ bolna_execution_id = NULL

2. Call Bolna API → Get execution_id
   
3. Create call record with execution_id ✅

4. Never update active_calls with execution_id ❌
```

### Impact:
- Could only release slots by `call.id`
- No way to release by `execution_id` (which webhooks use)
- Missing correlation between active slots and execution IDs
- Harder to debug concurrency issues

---

## ✅ Solution Implemented

### 1. Added Method to Update Execution ID

**File:** `backend/src/services/ConcurrencyManager.ts`

```typescript
/**
 * Update active call with execution ID after Bolna API responds
 * This is called immediately after call initiation succeeds
 */
async updateActiveCallWithExecutionId(callId: string, executionId: string): Promise<void> {
  try {
    await pool.query(`
      UPDATE active_calls 
      SET bolna_execution_id = $2
      WHERE id = $1
    `, [callId, executionId]);

    logger.info('Updated active call with execution ID', {
      callId,
      executionId
    });
  } catch (error) {
    logger.error('Error updating active call with execution ID:', error);
    // Don't throw - this is not critical, we can still release by call ID
  }
}
```

### 2. Added Method to Release by Execution ID

```typescript
/**
 * Release a call slot by execution ID
 * Used when we only have execution ID from webhooks
 */
async releaseCallSlotByExecutionId(executionId: string): Promise<void> {
  try {
    const result = await pool.query(`
      DELETE FROM active_calls 
      WHERE bolna_execution_id = $1 
      RETURNING id, user_id, call_type
    `, [executionId]);

    if (result.rows.length > 0) {
      const { id, user_id, call_type } = result.rows[0];
      logger.info(`Released ${call_type} call slot for user ${user_id}, execution ${executionId}`, {
        callId: id
      });
    } else {
      logger.warn('No active call found with execution ID', { executionId });
    }
  } catch (error) {
    logger.error('Error releasing call slot by execution ID:', error);
    throw error;
  }
}
```

### 3. Updated Call Initiation Flow

**File:** `backend/src/services/callService.ts`

#### For Direct Calls:
```typescript
// Make the call via Bolna.ai
const bolnaResponse = await bolnaService.makeCall(bolnaCallData);

// ✅ NEW: Update active_calls with execution_id immediately
await concurrencyManager.updateActiveCallWithExecutionId(
  preReservedCallId, 
  bolnaResponse.execution_id
);

// Create call record in database
const callRecord = await Call.createCall({
  id: preReservedCallId,
  bolna_execution_id: bolnaResponse.execution_id,
  // ... other fields
});
```

#### For Campaign Calls:
```typescript
// Make the call via Bolna.ai
const bolnaResponse = await bolnaService.makeCall(bolnaCallData);

// ✅ NEW: Update active_calls with execution_id immediately
await concurrencyManager.updateActiveCallWithExecutionId(
  preReservedCallId, 
  bolnaResponse.execution_id
);

// Create call record in database
const callRecord = await Call.createCall({
  id: preReservedCallId,
  bolna_execution_id: bolnaResponse.execution_id,
  // ... other fields
});
```

---

## 🔄 New Flow (FIXED):

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Reserve Slot                                             │
│    INSERT INTO active_calls (id, user_id, call_type)       │
│    Values: (uuid, user_id, 'direct')                       │
│    bolna_execution_id = NULL (initially)                   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Call Bolna API                                           │
│    POST /call → Response: { execution_id: "abc123" }       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. ✅ NEW: Update Active Call with Execution ID            │
│    UPDATE active_calls                                      │
│    SET bolna_execution_id = 'abc123'                        │
│    WHERE id = uuid                                          │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Create Call Record                                       │
│    INSERT INTO calls (id, bolna_execution_id, ...)         │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Call Progresses...                                       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Webhook: call-completed (execution_id: "abc123")        │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. Release Slot (TWO OPTIONS NOW):                         │
│                                                             │
│    Option A: By Call ID                                    │
│    DELETE FROM active_calls WHERE id = uuid                │
│                                                             │
│    Option B: By Execution ID (NEW) ✅                      │
│    DELETE FROM active_calls WHERE bolna_execution_id =     │
│    'abc123'                                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Database State Example

### Before Fix:
```sql
SELECT * FROM active_calls;

+--------------------------------------+--------------------------------------+-----------+-------------------------+--------------------+
| id                                   | user_id                              | call_type | started_at              | bolna_execution_id |
+--------------------------------------+--------------------------------------+-----------+-------------------------+--------------------+
| 2d06a329-2460-472e-85b7-cf08a88897a6 | 789895c8-4bd6-43e9-bfea-a4171ec47197 | direct    | 2025-10-10 16:58:12.068 | NULL               | ❌
| b68a5e6f-adae-4b44-85b9-5c646076acd9 | 789895c8-4bd6-43e9-bfea-a4171ec47197 | direct    | 2025-10-10 13:06:22.091 | NULL               | ❌
+--------------------------------------+--------------------------------------+-----------+-------------------------+--------------------+
```

### After Fix:
```sql
SELECT * FROM active_calls;

+--------------------------------------+--------------------------------------+-----------+-------------------------+--------------------------------------+
| id                                   | user_id                              | call_type | started_at              | bolna_execution_id                   |
+--------------------------------------+--------------------------------------+-----------+-------------------------+--------------------------------------+
| 2d06a329-2460-472e-85b7-cf08a88897a6 | 789895c8-4bd6-43e9-bfea-a4171ec47197 | direct    | 2025-10-10 16:58:12.068 | 3c96c6a4-0e5b-438b-b3f7-32b43008b71c | ✅
| b68a5e6f-adae-4b44-85b9-5c646076acd9 | 789895c8-4bd6-43e9-bfea-a4171ec47197 | direct    | 2025-10-10 13:06:22.091 | 7f12c3d5-9a2e-4f1c-b8d6-51e34a19c82f | ✅
+--------------------------------------+--------------------------------------+-----------+-------------------------+--------------------------------------+
```

---

## 🎯 Benefits

### 1. Better Webhook Handling
```typescript
// Webhooks can now release slots directly by execution_id
await concurrencyManager.releaseCallSlotByExecutionId(payload.id);
```

### 2. Improved Debugging
```sql
-- Can now correlate active calls with Bolna execution IDs
SELECT 
  ac.id as call_id,
  ac.bolna_execution_id,
  ac.call_type,
  ac.started_at,
  c.status as call_status
FROM active_calls ac
LEFT JOIN calls c ON c.id = ac.id
WHERE ac.user_id = '789895c8-4bd6-43e9-bfea-a4171ec47197';
```

### 3. Failsafe Release
```typescript
// If webhooks fail, can still release by call.id
await concurrencyManager.releaseCallSlot(call.id);

// But now also have option to release by execution_id
await concurrencyManager.releaseCallSlotByExecutionId(executionId);
```

### 4. Better Monitoring
```sql
-- Find active calls that are "stuck" (older than 1 hour)
SELECT 
  ac.*,
  c.status,
  c.bolna_execution_id
FROM active_calls ac
LEFT JOIN calls c ON c.id = ac.id
WHERE ac.started_at < NOW() - INTERVAL '1 hour'
  AND ac.bolna_execution_id IS NOT NULL;
```

---

## 🧪 Testing

### Test 1: Verify Execution ID is Populated
```sql
-- Start a direct call
-- Then immediately check active_calls table

SELECT id, bolna_execution_id, call_type 
FROM active_calls 
ORDER BY started_at DESC 
LIMIT 1;

-- Expected: bolna_execution_id should NOT be NULL ✅
```

### Test 2: Release by Execution ID
```typescript
// In webhook handler
const executionId = payload.id;
await concurrencyManager.releaseCallSlotByExecutionId(executionId);

// Check logs: Should see "Released direct call slot..."
```

### Test 3: Queue Processing Still Works
```
1. Start 2 direct calls (user at 2/2 limit)
2. Try 3rd direct call → Should queue
3. Wait for one call to complete
4. Check queue processor picks up queued call
5. Verify execution_id is set in active_calls
```

---

## 📝 Changes Summary

| File | Changes |
|------|---------|
| `ConcurrencyManager.ts` | ✅ Added `updateActiveCallWithExecutionId()` method |
| `ConcurrencyManager.ts` | ✅ Added `releaseCallSlotByExecutionId()` method |
| `ConcurrencyManager.ts` | ✅ Updated `releaseCallSlot()` to return execution_id in logs |
| `callService.ts` | ✅ Call `updateActiveCallWithExecutionId()` after Bolna responds (direct calls) |
| `callService.ts` | ✅ Call `updateActiveCallWithExecutionId()` after Bolna responds (campaign calls) |

---

## 🚀 Next Steps

### Optional Enhancements:

1. **Add Index for Better Performance:**
```sql
-- Already exists from migration 049
CREATE INDEX idx_active_calls_bolna_execution_id 
ON active_calls(bolna_execution_id) 
WHERE bolna_execution_id IS NOT NULL;
```

2. **Update Webhook Service** (Optional):
```typescript
// Could use execution_id directly in webhooks
// Instead of looking up call.id first
await concurrencyManager.releaseCallSlotByExecutionId(payload.id);
```

3. **Add Monitoring Query:**
```sql
-- Find active calls with missing execution IDs (should be 0)
SELECT COUNT(*) as missing_execution_ids
FROM active_calls 
WHERE bolna_execution_id IS NULL 
  AND started_at < NOW() - INTERVAL '10 seconds';
```

---

## ✅ Verification

After deploying, verify:

1. ✅ New calls have `bolna_execution_id` populated in `active_calls`
2. ✅ Queue processing still works correctly
3. ✅ Webhooks can release slots successfully
4. ✅ Concurrency limits still enforced properly
5. ✅ No slots get "stuck" due to missing execution IDs

---

## 🎉 Result

The `active_calls` table now maintains full traceability between:
- Call IDs (internal UUID)
- Execution IDs (Bolna API)
- User IDs (for limit enforcement)
- Call Types (direct vs campaign)

This makes the concurrency system **more robust, debuggable, and maintainable**.
