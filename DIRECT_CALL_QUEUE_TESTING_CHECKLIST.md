# Direct Call Queue - Testing Checklist

## Pre-Testing Setup

### 1. Database Migration
- [ ] Run migration: `psql -U your_user -d your_database -f migrations/050_add_direct_calls_to_queue.sql`
- [ ] Verify `call_type` column exists in `call_queue` table
- [ ] Verify `campaign_id` is now nullable
- [ ] Check database functions created:
  - [ ] `get_next_direct_call_queued()`
  - [ ] `count_user_direct_calls_queued()`
  - [ ] `get_call_queue_position()`
- [ ] Verify indexes created for direct call queries

### 2. Backend Restart
- [ ] Stop backend if running
- [ ] Clear any build cache if needed
- [ ] Start backend: `npm run dev`
- [ ] Check for TypeScript compilation errors
- [ ] Verify server starts without errors

### 3. Check Logs on Startup
- [ ] No errors about missing columns
- [ ] No errors about missing functions
- [ ] ConcurrencyManager loads correctly
- [ ] QueueProcessor starts successfully

---

## Phase 1: Basic Functionality Testing

### Test 1.1: Queue Status Endpoint (Empty State)
**Goal**: Verify new endpoint works with no queued calls

```bash
curl http://localhost:3001/api/calls/queue/status \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response**:
```json
{
  "direct_calls": {
    "queued": 0,
    "processing": 0,
    "total": 0,
    "next_call": null
  },
  "campaign_calls": {
    "queued": 0,
    "processing": 0,
    "total": 0
  }
}
```

- [ ] Returns 200 OK
- [ ] Returns correct structure
- [ ] All counts are 0
- [ ] next_call is null

### Test 1.2: Direct Call with Available Slot
**Goal**: Verify normal direct call still works when under limit

**Setup**: Ensure user has 0 active calls

```bash
curl -X POST http://localhost:3001/api/calls/initiate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "valid-agent-id",
    "contactId": "valid-contact-id"
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "callId": "...",
  "executionId": "...",
  "message": "Call initiated successfully"
}
```

- [ ] Returns 200 OK (not 202)
- [ ] Call initiates immediately
- [ ] No queue involved
- [ ] active_calls table updated
- [ ] Check `call_source` is NOT 'direct_queue'

---

## Phase 2: Queue Behavior Testing

### Test 2.1: Queue Direct Call at Concurrency Limit
**Goal**: Verify call gets queued when limit reached

**Setup**: 
1. Get user's concurrency limit (e.g., 2)
2. Make 2 direct calls to reach limit
3. Verify both are active

**Test Call #3**:
```bash
curl -X POST http://localhost:3001/api/calls/initiate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "valid-agent-id",
    "contactId": "valid-contact-id"
  }'
```

**Expected Response**:
```json
{
  "message": "Call queued successfully",
  "reason": "User has reached concurrency limit (2/2 active calls)",
  "queue": {
    "id": "queue-item-uuid",
    "position": 1,
    "total_in_queue": 1,
    "estimated_wait": 2
  }
}
```

- [ ] Returns 202 Accepted (NOT 429)
- [ ] Message says "queued"
- [ ] Queue ID provided
- [ ] Position is 1 (first in queue)
- [ ] Total in queue is 1
- [ ] Estimated wait > 0

### Test 2.2: Verify Call in Database Queue
**Goal**: Check call_queue table has correct data

```sql
SELECT 
  id, user_id, campaign_id, agent_id, contact_id,
  call_type, priority, position, status
FROM call_queue
WHERE user_id = 'your-user-id'
  AND call_type = 'direct'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected**:
- [ ] call_type = 'direct'
- [ ] campaign_id IS NULL
- [ ] priority = 100
- [ ] position = 1
- [ ] status = 'queued'
- [ ] agent_id matches request
- [ ] contact_id matches request

### Test 2.3: Check Queue Status After Queueing
```bash
curl http://localhost:3001/api/calls/queue/status \
  -H "Authorization: Bearer $TOKEN"
```

**Expected**:
```json
{
  "direct_calls": {
    "queued": 1,
    "processing": 0,
    "total": 1,
    "next_call": {
      "id": "queue-uuid",
      "phone_number": "+1234567890",
      "contact_name": "John Doe",
      "position": 1,
      "queued_at": "2024-01-15T..."
    }
  },
  "campaign_calls": {
    "queued": 0,
    "processing": 0,
    "total": 0
  }
}
```

- [ ] direct_calls.queued = 1
- [ ] next_call is populated
- [ ] Position is 1
- [ ] Phone number correct

### Test 2.4: Queue Multiple Direct Calls
**Goal**: Verify position increments correctly

**Test**: Make 2 more direct calls (total 3 in queue)

**Check positions**:
```sql
SELECT id, position, priority 
FROM call_queue 
WHERE user_id = 'your-user-id' AND call_type = 'direct'
ORDER BY position;
```

**Expected**:
- [ ] First call: position = 1, priority = 100
- [ ] Second call: position = 2, priority = 100
- [ ] Third call: position = 3, priority = 100

---

## Phase 3: Queue Processing Testing

### Test 3.1: Auto-Process When Slot Opens
**Goal**: Verify queue processor picks up queued call automatically

**Setup**:
1. Have 2 active calls + 1 queued direct call
2. Complete one active call (hangup or wait for completion)

**Wait 10-15 seconds** (queue processor runs every 10s)

**Check Logs**:
```
[QueueProcessor] Processing direct call from queue
[QueueProcessor] Reserved direct call slot <callId> for user <userId>
[QueueProcessor] Direct call initiated from queue
```

- [ ] Queued call processed automatically
- [ ] Logs show "direct" call type
- [ ] Call initiated successfully
- [ ] active_calls updated

**Check Database**:
```sql
SELECT status, call_id 
FROM call_queue 
WHERE id = 'queued-call-id';
```

**Expected**:
- [ ] status = 'processing' (or 'completed' if fast)
- [ ] call_id is populated

### Test 3.2: Verify Call Source Metadata
**Goal**: Check call was marked as from queue

```sql
SELECT metadata 
FROM calls 
WHERE id = (SELECT call_id FROM call_queue WHERE id = 'queued-call-id');
```

**Expected metadata**:
```json
{
  "queue_id": "...",
  "call_source": "direct_queue",
  "preReservedCallId": "..."
}
```

- [ ] call_source = 'direct_queue'
- [ ] queue_id present
- [ ] preReservedCallId present

---

## Phase 4: Priority Testing (Direct vs Campaign)

### Test 4.1: Setup Mixed Queue
**Goal**: Verify direct calls processed before campaign calls

**Setup**:
1. Create a campaign with 5 contacts
2. Start campaign (will queue all 5 calls since limit is 2)
3. Queue 2 direct calls

**Check Queue**:
```sql
SELECT id, call_type, priority, position, status
FROM call_queue
WHERE user_id = 'your-user-id'
ORDER BY priority DESC, position ASC;
```

**Expected Order**:
- [ ] Direct call #1 (priority 100, position 1)
- [ ] Direct call #2 (priority 100, position 2)
- [ ] Campaign call #1 (priority 0, position 1)
- [ ] Campaign call #2 (priority 0, position 2)
- [ ] ... (remaining campaign calls)

### Test 4.2: Verify Processing Order
**Goal**: Confirm direct calls processed first

**Test**:
1. Keep monitoring which calls get processed
2. Complete active calls to free slots
3. Watch queue processor logs

**Expected Sequence**:
```
[QueueProcessor] Processing direct call from queue (priority: 100)
[QueueProcessor] Processing direct call from queue (priority: 100)
[QueueProcessor] Processing campaign call from queue (priority: 0)
...
```

- [ ] All direct calls processed before any campaign calls
- [ ] Campaign calls only start after all direct calls completed
- [ ] No priority violations

### Test 4.3: Database Function Test
**Goal**: Verify `get_next_queued()` prioritizes correctly

```sql
-- Should return direct call first
SELECT * FROM get_next_queued('your-user-id');
```

**Expected**:
- [ ] Returns direct call (not campaign call)
- [ ] call_type = 'direct'
- [ ] Highest priority

---

## Phase 5: Edge Cases & Error Handling

### Test 5.1: Queue Call with No Campaign ID
**Goal**: Ensure direct calls don't require campaign_id

**Database Check**:
```sql
SELECT campaign_id 
FROM call_queue 
WHERE call_type = 'direct';
```

- [ ] campaign_id IS NULL for all direct calls
- [ ] No constraint violations

### Test 5.2: Insufficient Credits with Queue
**Goal**: Verify credit check happens before queueing

**Setup**: Set user credits to 0

**Test**:
```bash
curl -X POST http://localhost:3001/api/calls/initiate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agentId": "...", "contactId": "..."}'
```

**Expected**:
```json
{
  "error": "Insufficient credits",
  "message": "You have no credits remaining...",
  "credits": 0
}
```

- [ ] Returns 402 Payment Required
- [ ] Call NOT queued
- [ ] Credit check happens first

### Test 5.3: Invalid Agent/Contact
**Goal**: Verify validation happens before queueing

**Test**: Send invalid agent_id

**Expected**:
- [ ] Returns 400 or 404 error
- [ ] Call NOT queued
- [ ] Validation happens first

### Test 5.4: Queue Processor Handles Missing Campaign ID
**Goal**: Ensure processor doesn't crash on direct calls

**Setup**: Queue a direct call and let processor handle it

**Check Logs**:
```
[QueueProcessor] Processing direct call from queue
Call type: direct, priority: 100
```

- [ ] No errors about missing campaign_id
- [ ] Processes successfully
- [ ] Uses `CallService.initiateCall()` not `initiateCampaignCall()`

---

## Phase 6: Concurrency Safety Testing

### Test 6.1: Race Condition Test
**Goal**: Verify atomic slot reservation prevents double-booking

**Test**: Make 3 simultaneous API calls when 1 slot available

```bash
# Terminal 1
curl -X POST http://localhost:3001/api/calls/initiate ... &

# Terminal 2
curl -X POST http://localhost:3001/api/calls/initiate ... &

# Terminal 3
curl -X POST http://localhost:3001/api/calls/initiate ... &
```

**Expected**:
- [ ] Exactly 1 call gets slot (200 OK)
- [ ] Exactly 2 calls get queued (202 Accepted)
- [ ] No concurrency violations
- [ ] Active calls never exceeds limit

### Test 6.2: Verify Slot Release on Failure
**Goal**: Ensure failed calls release slots properly

**Test**: 
1. Force call initiation to fail (e.g., invalid phone number)
2. Check if slot is released

**Expected**:
- [ ] Slot released immediately
- [ ] Next queued call can take the slot
- [ ] No leaked reservations

---

## Phase 7: Performance Testing

### Test 7.1: Queue Status Performance
**Goal**: Ensure endpoint is fast even with many queued calls

**Setup**: Queue 50+ calls

**Test**:
```bash
time curl http://localhost:3001/api/calls/queue/status \
  -H "Authorization: Bearer $TOKEN"
```

- [ ] Response time < 500ms
- [ ] No timeout errors
- [ ] Correct counts

### Test 7.2: Queue Processing Performance
**Goal**: Verify processor handles large queue efficiently

**Setup**: Queue 100+ calls across direct and campaign

**Monitor**:
- [ ] Processor completes cycle in < 5 seconds
- [ ] No memory leaks
- [ ] CPU usage reasonable

---

## Phase 8: Integration Testing

### Test 8.1: Full Workflow Test
**Goal**: End-to-end test of complete queue lifecycle

**Workflow**:
1. [ ] User at 0 active calls
2. [ ] Make 2 direct calls → Both succeed immediately (200)
3. [ ] Make 3rd direct call → Gets queued (202)
4. [ ] Check queue status → Shows 1 queued
5. [ ] Complete 1 active call → Slot opens
6. [ ] Wait for processor → Queued call auto-processed
7. [ ] Check queue status → Shows 0 queued
8. [ ] Verify call completed successfully

### Test 8.2: Mixed Campaign + Direct Workflow
1. [ ] Start campaign with 10 contacts
2. [ ] Campaign queues all calls
3. [ ] Make 2 direct calls → Both queued
4. [ ] Wait for processing
5. [ ] Verify direct calls processed first
6. [ ] Verify campaign calls processed after
7. [ ] All calls complete successfully

---

## Test Results Summary

### Critical Tests (Must Pass)
- [ ] Test 1.2: Direct call works normally
- [ ] Test 2.1: Call queued at limit (no 429 error)
- [ ] Test 3.1: Queued call auto-processed
- [ ] Test 4.2: Direct calls processed before campaign
- [ ] Test 6.1: No race conditions

### Important Tests (Should Pass)
- [ ] Test 1.1: Queue status endpoint
- [ ] Test 2.2: Correct database data
- [ ] Test 5.2: Credit check before queue
- [ ] Test 8.1: Full workflow

### Nice to Have (Can Fix Later)
- [ ] Test 7.1: Performance under load
- [ ] Test 7.2: Large queue handling

---

## Common Issues & Troubleshooting

### Issue: 429 Still Returned Instead of 202
**Check**:
- ConcurrencyManager returns `shouldQueue: true`
- CallController checks `shouldQueue` flag
- Backend restarted after code changes

### Issue: Call Not Queued in Database
**Check**:
- Migration ran successfully
- `call_type` column exists
- CallQueue model methods imported correctly

### Issue: Queued Call Not Processed
**Check**:
- Queue processor is running
- User has available credits
- Slot actually available
- Database function `get_next_queued()` works

### Issue: Wrong Priority Order
**Check**:
- Direct calls have priority = 100
- Campaign calls have priority = 0
- Database function sorts by priority DESC

### Issue: Campaign ID Constraint Error
**Check**:
- Migration removed NOT NULL constraint
- Direct calls set campaign_id = NULL
- Database allows null values

---

## Sign-off

- [ ] All critical tests passed
- [ ] All important tests passed
- [ ] No TypeScript errors
- [ ] No runtime errors
- [ ] Logs look clean
- [ ] Performance acceptable
- [ ] Ready for production

**Tested By**: _______________
**Date**: _______________
**Notes**: _______________
