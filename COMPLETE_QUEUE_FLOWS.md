# 📊 Complete Queue Processing Flows - All Scenarios

## 🎯 **Scenario 1: Campaign Started at 12 PM (Window: 9 AM - 5 PM)**

### **Initial State:**
```
Current Time: 12:00 PM (Noon)
Campaign Window: 9:00 AM - 5:00 PM
Campaign Status: Active
Queue: 50 contacts
System Limit: 10 concurrent calls
User Limit: 2 concurrent calls
```

### **Flow:**

```
12:00 PM - Campaign Created
  │
  ├─→ Admin creates campaign via UI
  │     └─→ POST /api/campaigns
  │           └─→ Campaign status = 'active'
  │           └─→ 50 contacts added to call_queue
  │                 - Priority: 0 (campaign)
  │                 - Status: 'queued'
  │
  ├─→ campaignScheduler.onCampaignChange() triggered
  │     └─→ loadCampaignSchedules()
  │           └─→ Query: Find active campaigns
  │           └─→ Campaign found with 50 queued calls
  │
  └─→ calculateNextWakeTimeForCampaign()
        └─→ Current time: 12:00 PM (12:00:00)
        └─→ Campaign window: 09:00:00 - 17:00:00
        └─→ Check: 12:00:00 >= 09:00:00 AND 12:00:00 <= 17:00:00
        └─→ ✅ WITHIN WINDOW!
        └─→ Return: NOW (immediate wake)

12:00 PM - Immediate Processing
  │
  └─→ wakeAndProcessQueue()
        └─→ queueProcessor.processQueue()
              │
              ├─→ Check System Limit
              │     └─→ active_calls: 0/10 ✅
              │
              ├─→ Get users with pending calls
              │     └─→ Found 1 user (campaign owner)
              │
              └─→ Round-robin allocation
                    │
                    ├─→ Check user limit: 0/2 ✅
                    │
                    ├─→ Available slots: min(2-0, 10-0) = 2
                    │
                    └─→ Allocate 2 calls:
                          │
                          ├─→ Call 1:
                          │     ├─→ getNextQueued(userId)
                          │     │     └─→ SELECT * WHERE call_type='campaign'
                          │     │           ORDER BY priority DESC, position ASC
                          │     │           └─→ Contact #1 (priority: 0)
                          │     │
                          │     ├─→ atomicReserveCampaignCallSlot()
                          │     │     └─→ INSERT INTO active_calls
                          │     │           (id, user_id, call_type)
                          │     │           VALUES (uuid1, userId, 'campaign')
                          │     │
                          │     └─→ CallService.initiateCampaignCall()
                          │           └─→ POST to Bolna.ai API
                          │           └─→ active_calls: 1/10, user: 1/2
                          │
                          └─→ Call 2:
                                ├─→ getNextQueued(userId)
                                │     └─→ Contact #2 (priority: 0)
                                │
                                ├─→ atomicReserveCampaignCallSlot()
                                │     └─→ INSERT INTO active_calls
                                │           └─→ active_calls: 2/10, user: 2/2
                                │
                                └─→ CallService.initiateCampaignCall()

12:00 PM - State After Initial Processing
  │
  └─→ active_calls: 2/10 (system)
  └─→ User active: 2/2 (user AT LIMIT)
  └─→ call_queue: 48 queued, 2 processing
  └─→ Scheduler: Checks every ~10s for completed calls
```

---

## 🚨 **Scenario 2: Direct Call Initiated DURING Campaign**

### **Initial State:**
```
12:05 PM - Campaign running
Active Calls: 2/10 (system), 2/2 (user AT LIMIT)
Queue: 48 campaign calls waiting
```

### **Flow:**

```
12:05 PM - User Initiates Direct Call
  │
  └─→ POST /api/calls/initiate
        └─→ CallController.initiateCall()
              │
              ├─→ concurrencyManager.atomicReserveDirectCallSlot(userId, callId)
              │     │
              │     └─→ Query active_calls:
              │           SELECT COUNT(*) 
              │           FROM active_calls 
              │           WHERE user_id = userId
              │           └─→ Result: 2 active calls
              │
              │     └─→ Get user limit from users table:
              │           └─→ concurrent_calls_limit: 2
              │
              │     └─→ Check: active_calls (2) < user_limit (2)?
              │           └─→ ❌ FALSE - User at limit!
              │
              │     └─→ Return: {
              │           success: false,
              │           reason: 'User at concurrency limit',
              │           shouldQueue: true ← KEY!
              │         }
              │
              └─→ Direct call NOT initiated immediately
                    └─→ Add to queue instead:
                          │
                          └─→ CallQueueModel.addDirectCallToQueue({
                                user_id: userId,
                                agent_id: agentId,
                                contact_id: contactId,
                                phone_number: phone,
                                priority: 100 ← HIGHEST!
                              })
                              │
                              └─→ INSERT INTO call_queue
                                    (user_id, campaign_id, call_type, priority, ...)
                                    VALUES
                                    (userId, NULL, 'direct', 100, ...)
                                    │
                                    └─→ Queue state:
                                          - 48 campaign calls (priority: 0)
                                          - 1 direct call (priority: 100) ← TOP!

12:05 PM - Scheduler Notification
  │
  └─→ campaignScheduler.onDirectCallQueued(userId)
        └─→ Triggers immediate wake
        └─→ wakeAndProcessQueue()
              │
              └─→ queueProcessor.processQueue()
                    │
                    ├─→ Check system limit: 2/10 ✅ (slots available)
                    │
                    ├─→ Check user limit: 2/2 ❌ (user at limit)
                    │     └─→ Skip allocation for this user
                    │
                    └─→ Log: "User at limit: 2/2"
                          Direct call stays in queue!

12:06 PM - Campaign Call Completes
  │
  └─→ Webhook: completed
        └─→ webhookService.handleCompleted()
              │
              ├─→ Process transcript, deduct credits
              │
              ├─→ concurrencyManager.releaseCallSlot(callId1)
              │     └─→ DELETE FROM active_calls WHERE id = callId1
              │           └─→ active_calls: 1/10, user: 1/2 ✅ SLOT FREED!
              │
              └─→ updateQueueItemStatus(callId1, 'completed')

12:06 PM - Scheduler Wakes Up (10s after call completion)
  │
  └─→ Periodic reload (every 6 cycles or direct call trigger)
        └─→ loadCampaignSchedules()
              │
              ├─→ Check for direct calls:
              │     SELECT COUNT(*) FROM call_queue
              │     WHERE status = 'queued' 
              │       AND campaign_id IS NULL
              │     └─→ Result: 1 direct call found
              │
              └─→ "🔥 Found 1 queued direct calls - waking database NOW"
                    └─→ wakeAndProcessQueue()
                          │
                          └─→ queueProcessor.processQueue()
                                │
                                ├─→ System limit: 1/10 ✅
                                ├─→ User limit: 1/2 ✅ (slot available now!)
                                │
                                └─→ allocateNextCall(userId)
                                      │
                                      └─→ getNextQueued(userId)
                                            │
                                            └─→ Database function priority logic:
                                                  -- First try DIRECT calls
                                                  SELECT * FROM call_queue
                                                  WHERE user_id = userId
                                                    AND call_type = 'direct'
                                                    AND status = 'queued'
                                                  ORDER BY priority DESC ← 100 first!
                                                  LIMIT 1
                                                  │
                                                  └─→ ✅ Returns: Direct call
                                                  
                                      └─→ initiateCall(directCallQueueItem)
                                            │
                                            ├─→ atomicReserveDirectCallSlot()
                                            │     └─→ INSERT INTO active_calls
                                            │           (id, user_id, call_type)
                                            │           VALUES (uuid2, userId, 'direct')
                                            │
                                            └─→ CallService.initiateCall()
                                                  └─→ POST to Bolna.ai
                                                  └─→ active_calls: 2/10, user: 2/2
                                                  └─→ Direct call now IN PROGRESS!

Result:
  ✅ Direct call got picked before campaign calls
  ✅ Priority 100 > Priority 0
  ✅ User back at limit: 2/2 (1 campaign + 1 direct)
```

---

## 🏢 **Scenario 3: Multiple Users + System Limit Reached**

### **Initial State:**
```
System Limit: 10 concurrent calls
User A: Limit 2, Active 2 (campaign calls)
User B: Limit 3, Active 3 (campaign calls)
User C: Limit 2, Active 2 (campaign calls)
User D: Limit 3, Active 3 (campaign calls)

Total Active: 10/10 ← SYSTEM LIMIT REACHED!
```

### **Flow:**

```
12:10 PM - User E (Limit: 2) Starts Campaign
  │
  └─→ Campaign with 20 contacts created
        └─→ 20 calls added to call_queue
        └─→ User E active calls: 0/2
        └─→ System active calls: 10/10 ← FULL!

12:10 PM - Scheduler Processes Queue
  │
  └─→ queueProcessor.processQueue()
        │
        ├─→ Step 1: Check system limit
        │     └─→ countSystemActiveCalls()
        │           └─→ SELECT COUNT(*) FROM active_calls
        │           └─→ Result: 10
        │
        └─→ Check: 10 >= 10? ✅ TRUE
              └─→ Log: "System limit reached: 10/10"
              └─→ STOP PROCESSING
              └─→ ❌ No calls allocated for ANY user!

User E's Campaign:
  └─→ All 20 calls stay in 'queued' status
  └─→ Waiting for other users to complete calls

12:12 PM - User A's Call Completes
  │
  └─→ Webhook: completed
        └─→ releaseCallSlot(userA_call1)
              └─→ DELETE FROM active_calls
              └─→ System: 9/10 ← SLOT FREED!
              └─→ User A: 1/2

12:12 PM - Scheduler Wakes Up
  │
  └─→ queueProcessor.processQueue()
        │
        ├─→ System limit: 9/10 ✅ (1 slot available)
        │
        ├─→ Get users with pending calls:
        │     └─→ SELECT DISTINCT user_id, concurrent_calls_limit
        │           FROM call_queue
        │           WHERE status = 'queued'
        │     └─→ Found: User A, User E
        │
        └─→ Round-robin allocation:
              │
              ├─→ User A:
              │     └─→ Active: 1/2 ✅
              │     └─→ Available slots: 1
              │     └─→ Allocate 1 campaign call
              │     └─→ System: 10/10 ← FULL AGAIN!
              │
              └─→ System limit reached during allocation
                    └─→ Log: "System limit reached during allocation"
                    └─→ BREAK LOOP
                    └─→ User E not processed yet

Result:
  ✅ System enforces 10 concurrent calls STRICTLY
  ✅ User E waits even though they have 0/2 active
  ✅ Round-robin ensures fair distribution
```

---

## 🔥 **Scenario 4: System Full BUT User Free - Direct Call**

### **Critical Scenario:**

```
System Limit: 10/10 ← FULL!
User A: 2/2 (campaign)
User B: 3/3 (campaign)
User C: 2/2 (campaign)
User D: 3/3 (campaign)
User E: 0/2 ← FREE! No active calls

12:15 PM - User E Initiates Direct Call
  │
  └─→ POST /api/calls/initiate
        └─→ atomicReserveDirectCallSlot(userE, callId)
              │
              ├─→ Query system calls:
              │     SELECT COUNT(*) FROM active_calls
              │     └─→ Result: 10
              │
              ├─→ Check: system_calls (10) >= systemLimit (10)?
              │     └─→ ✅ TRUE - System is FULL!
              │
              └─→ Return: {
                    success: false,
                    reason: 'System concurrent call limit reached - call will be queued',
                    shouldQueue: true ← CHANGED!
                  }
                  
✅ Direct call QUEUED with priority 100!
   └─→ CallQueueModel.addDirectCallToQueue()
   └─→ INSERT INTO call_queue
         (user_id, call_type, priority, status)
         VALUES (userE, 'direct', 100, 'queued')
   
   └─→ Response to user (202 Accepted):
         {
           "message": "Call queued successfully",
           "reason": "System concurrent call limit reached",
           "queue": {
             "id": "queue-id",
             "position": 15,
             "total_in_queue": 50,
             "estimated_wait": 30 minutes
           }
         }

WHY QUEUE NOW? (FIXED)
  └─→ User E has available slots (0/2)
  └─→ System is temporarily full due to OTHER users
  └─→ Fair to let User E wait in line
  └─→ When ANY call completes, User E's direct call (priority 100)
        will be picked BEFORE any campaign calls (priority 0)

12:16 PM - User D's Call Completes
  │
  └─→ releaseCallSlot()
        └─→ System: 9/10 ← 1 SLOT AVAILABLE
        └─→ Scheduler wakes up
        └─→ queueProcessor.processQueue()
              │
              ├─→ System limit: 9/10 ✅
              │
              ├─→ Get users with pending calls
              │     └─→ SELECT DISTINCT user_id FROM call_queue
              │           WHERE status = 'queued'
              │     └─→ Found: User A, B, C, D, E
              │
              └─→ Round-robin allocation
                    │
                    └─→ For each user, getNextQueued(userId)
                          │
                          └─→ Database function checks DIRECT FIRST:
                                SELECT * FROM call_queue
                                WHERE user_id = userId
                                  AND call_type = 'direct'
                                  AND status = 'queued'
                                ORDER BY priority DESC
                                LIMIT 1
                                
                                ✅ User E has a direct call queued!
                                └─→ Priority 100 > all campaigns (0)
                                └─→ User E: 0/2 (has available slots)
                                └─→ System: 9/10 (has available slot)
                                └─→ Reserve slot for User E
                                └─→ Initiate User E's direct call
                                └─→ System: 10/10

Result:
  ✅ User E's direct call was queued fairly
  ✅ Got picked FIRST when slot became available
  ✅ Priority system ensures direct > campaign
  ✅ User didn't get rejected, just had to wait
```

---

## 📊 **Priority Matrix Summary**

| Scenario | System Limit | User Limit | Direct Call | Campaign Call | Result |
|----------|--------------|------------|-------------|---------------|---------|
| 1 | 5/10 ✅ | 1/2 ✅ | Queued | Running | ✅ Direct picked first (priority 100) |
| 2 | 5/10 ✅ | 2/2 ❌ | Queued | Queued | ⏳ Direct queued, waits for slot |
| 3 | 10/10 ❌ | 0/2 ✅ | New | Queued | ✅ QUEUED with priority 100 (FIXED) |
| 4 | 9/10 ✅ | 2/2 ❌ | New | Running | ⏳ QUEUED - User at limit |
| 5 | 9/10 ✅ | 1/2 ✅ | New | Running | ✅ IMMEDIATE - Both have slots |

---

## 🔑 **Key Behaviors**

### **1. Priority Ordering (Database Function)**
```sql
-- Step 1: Try direct calls FIRST
SELECT * FROM call_queue
WHERE call_type = 'direct'
  AND status = 'queued'
ORDER BY priority DESC  -- 100 > 0
LIMIT 1;

-- Step 2: If no direct calls, get campaign
SELECT * FROM call_queue
WHERE call_type = 'campaign'
  AND status = 'queued'
  AND (campaign window check)
ORDER BY priority DESC, position ASC
LIMIT 1;
```

### **2. Concurrency Checks (Hierarchical)**
```
1. SYSTEM LIMIT (highest priority)
   └─→ If system >= 10: REJECT ALL CALLS
   
2. USER LIMIT (per-user check)
   └─→ If user >= limit: QUEUE or REJECT
   
3. SLOT RESERVATION (atomic)
   └─→ INSERT INTO active_calls
   └─→ Prevents race conditions
```

### **3. Campaign Time Window**
```
Current Time: 12:00 PM
Campaign: 9 AM - 5 PM

Check: 12:00:00 >= 09:00:00 AND 12:00:00 <= 17:00:00
Result: ✅ TRUE - Process campaign calls

Outside window: ❌ Campaign calls skipped
```

### **4. Direct Call Behavior**
```
Direct Call Initiated:
  ├─→ Check system limit FIRST
  │     └─→ If full: REJECT (don't queue)
  │
  ├─→ Check user limit
  │     └─→ If at limit: QUEUE with priority 100
  │
  └─→ Reserve slot atomically
        └─→ Initiate call immediately
```

---

## 🎯 **Your Specific Scenarios - Final Answers**

### **Q1: Campaign at 12 PM (window 9 AM - 5 PM)**
**A:** ✅ Campaign processes IMMEDIATELY because current time (12:00) is within window (09:00-17:00). Scheduler wakes NOW and starts allocating calls up to limits.

### **Q2: Direct call during campaign**
**A:** ✅ Direct call gets QUEUED with priority 100. When next slot frees, direct call is picked BEFORE campaign calls (priority 0). Database function ensures direct > campaign.

### **Q3: Multiple users + system limit reached**
**A:** ❌ ALL users wait when system hits 10/10. Round-robin allocation starts only after ANY user completes. First slot goes to user with oldest allocation timestamp (fair distribution).

### **Q4: System full, user free, direct call**
**A:** ✅ **FIXED** - Direct call is now QUEUED with priority 100 (not rejected). When next slot frees, User E's direct call will be picked FIRST due to highest priority. Fair queuing ensures users with available slots aren't rejected when system is temporarily full due to other users.

