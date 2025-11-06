# 📋 How Queue Processing Works Automatically (Without Manual Deletion)

## 🔄 **Normal Call Lifecycle**

### **1. Call Initiation → Active Call Reservation**

When you initiate a call:

```
CallController.initiateCall()
  ├─→ concurrencyManager.atomicReserveDirectCallSlot(userId, callId)
  │     └─→ INSERT INTO active_calls (id, user_id, call_type)
  │           VALUES (callId, userId, 'direct')
  │
  ├─→ CallService.initiateCall()
  │     └─→ POST to Bolna.ai API
  │
  └─→ Returns response to user
```

**At this point:**
- Active calls table: **1 entry** (your call)
- Call queue: Any queued calls stay in 'queued' status
- User's concurrent limit: **1/2 used**

---

### **2. Call Progresses → Webhooks Come In**

Bolna.ai sends 4 webhooks during call:

```
1. initiated       → Update calls.status = 'initiated'
2. ringing         → Update calls.status = 'ringing'
3. in-progress     → Update calls.status = 'in-progress'
4. call-disconnected → Transcript + duration saved
5. completed       → Final processing + SLOT RELEASE
```

**Active calls table stays at 1** during webhooks 1-4.

---

### **3. Call Completes → Automatic Slot Release**

When webhook 5 (`completed`) arrives:

```typescript
webhookService.handleCompleted(payload)
  ├─→ Update call status to 'completed'
  ├─→ Process transcript with OpenAI
  ├─→ Deduct credits from user
  │
  ├─→ 🔓 concurrencyManager.releaseCallSlot(call.id)
  │     └─→ DELETE FROM active_calls WHERE id = callId
  │           ✅ Slot freed!
  │
  └─→ updateQueueItemStatus(callId, 'completed')
        └─→ Mark queue item as completed (if campaign call)
```

**After this:**
- Active calls table: **0 entries** ✅
- User's concurrent limit: **0/2 used** ✅
- Queue has space for next call ✅

---

### **4. Queue Processor Picks Up Next Call**

The **InMemoryCampaignScheduler** wakes up periodically and:

```typescript
InMemoryCampaignScheduler.wakeAndProcessQueue()
  │
  ├─→ loadCampaignSchedules()  // Runs every ~1 minute
  │     └─→ Check for queued direct calls ← OUR FIX!
  │           └─→ "🔥 Found 4 queued direct calls - waking database NOW"
  │
  └─→ queueProcessor.processQueue()
        ├─→ Check system limit: 0/10 active ✅
        ├─→ Check user limit: 0/2 active ✅
        ├─→ Get next queued call (priority 100 = direct)
        ├─→ Reserve slot atomically
        ├─→ Initiate call via Bolna.ai
        └─→ Active calls: 1/10, User: 1/2
```

---

## 🤔 **Why Your Calls Weren't Being Picked**

### **The Problem:**

1. You initiated 3 calls when limit was 2
   - First 2 calls: Reserved slots immediately
   - 3rd call: Went to queue (limit reached)

2. You then **manually deleted** active calls from database
   - Active calls table: 0 ✅
   - BUT: Scheduler didn't know slots were freed!

3. The scheduler only checks every ~1 minute
   - It last checked when there were 3 active calls
   - Next check scheduled for 60 seconds later
   - Your manual deletion happened in between

### **The Fix We Applied:**

Modified `loadCampaignSchedules()` to check for direct calls **every time it runs**:

```typescript
// Check for queued direct calls FIRST
const directCallsResult = await pool.query(`
  SELECT COUNT(*) as direct_count
  FROM call_queue 
  WHERE status = 'queued' 
    AND campaign_id IS NULL
`);

const directCallCount = parseInt(directCallsResult.rows[0]?.direct_count || '0');

if (directCallCount > 0) {
  logger.info(`🔥 Found ${directCallCount} queued direct calls - processing immediately`);
  
  // Process queue immediately for direct calls
  void this.wakeAndProcessQueue();
}
```

---

## ✅ **Normal Flow (Without Manual Deletion)**

### **Scenario: 3 Calls with Limit of 2**

```
Timeline:
--------
00:00 - Initiate Call 1 → Active calls: 1/2 ✅
00:05 - Initiate Call 2 → Active calls: 2/2 ✅ (LIMIT REACHED)
00:10 - Initiate Call 3 → QUEUED (position: 1) ❌

... Call 1 in progress ...

00:35 - Call 1 completes → Webhook arrives
          └─→ releaseCallSlot(call1)
          └─→ Active calls: 1/2 ✅ (slot freed)
          └─→ Scheduler wakes within 10s
          └─→ Finds queued Call 3
          └─→ Reserves slot for Call 3
          └─→ Initiates Call 3
          └─→ Active calls: 2/2
```

### **Key Points:**

1. **Webhook `completed` ALWAYS releases slot**
   - Automatic via `concurrencyManager.releaseCallSlot()`
   - No manual intervention needed

2. **Scheduler wakes periodically**
   - Every ~10-60 seconds (depends on campaign schedules)
   - Checks for queued calls
   - Processes if slots available

3. **Direct calls get priority 100**
   - Campaign calls get priority 0
   - Direct calls always processed first

---

## 🚨 **When Manual Deletion is Needed**

Only in these rare cases:

1. **Zombie/orphaned calls**
   - Calls stuck in `active_calls` table
   - Webhook never arrived (API failure)
   - Need manual cleanup

2. **Testing/debugging**
   - Simulating call completion
   - Testing queue behavior

3. **Emergency situations**
   - User stuck at limit
   - System needs reset

For normal operations, **webhooks handle everything automatically**!

---

## 📊 **Monitoring Queue Health**

Run `debug-queue.js` to check:
- Queued calls count
- Active calls count
- User concurrent limits
- System capacity

```bash
cd backend
node debug-queue.js
```

Look for:
- ✅ Active calls < limits
- ✅ Queue processing regularly
- ❌ Calls stuck in queue for >5 minutes
- ❌ Active calls without matching `calls` records (zombies)

