# Call Queue Database Schema Explanation

## Table: `call_queue`

The `call_queue` table manages all scheduled and pending calls for campaigns. It acts as the queue that the QueueProcessor reads from to initiate calls.

---

## Column Descriptions

### **Identity Columns**

#### `id` (UUID, PRIMARY KEY)
- **Purpose**: Unique identifier for each queue item
- **Type**: UUID
- **Generated**: Automatically by PostgreSQL
- **Example**: `'a1b2c3d4-e5f6-7890-abcd-ef1234567890'`

#### `user_id` (UUID, NOT NULL)
- **Purpose**: Links the queue item to the user who owns it
- **Foreign Key**: References `users(id)`
- **Data Isolation**: Ensures users can only access their own queue items
- **Example**: `'789895c8-4bd6-43e9-bfea-a4171ec47197'`

---

### **Campaign & Agent Relationship**

#### `campaign_id` (UUID, NOT NULL)
- **Purpose**: Links queue item to its parent campaign
- **Foreign Key**: References `call_campaigns(id)` with CASCADE DELETE
- **Behavior**: When campaign is deleted, all its queue items are automatically deleted
- **Example**: `'ccc34390-edf1-4b57-89c4-aefc092cb8d8'`

#### `agent_id` (UUID, NOT NULL)
- **Purpose**: Specifies which AI agent will handle this call
- **Foreign Key**: References `agents(id)`
- **Usage**: QueueProcessor uses this to initialize the call with the correct agent
- **Example**: `'bb2adc43-aac6-49ff-8ab4-162f229b9cae'`

---

### **Contact Information**

#### `contact_id` (UUID, NULLABLE)
- **Purpose**: Links to an existing contact in the contacts table
- **Foreign Key**: References `contacts(id)` with SET NULL on delete
- **Optional**: Can be null if contact was provided directly via CSV
- **Behavior**: If contact is deleted, this becomes null but queue item remains
- **Example**: `'12345678-1234-5678-1234-567812345678'`

#### `phone_number` (VARCHAR(20), NOT NULL)
- **Purpose**: The actual phone number to call
- **Format**: E.164 format recommended (e.g., `+1234567890`)
- **Required**: Always needed even if contact_id exists
- **Example**: `'+919876543210'`

#### `contact_name` (VARCHAR(255), NULLABLE)
- **Purpose**: Name of the person to call
- **Source**: Copied from contact or CSV at queue creation
- **Usage**: Displayed in call logs, passed to agent for personalization
- **Example**: `'John Doe'`

---

### **Call Scheduling**

#### `scheduled_for` (TIMESTAMP WITH TIME ZONE, NOT NULL)
- **Purpose**: When the call should be attempted
- **Default**: Campaign's `start_date`
- **Time Window Check**: QueueProcessor also checks campaign's `first_call_time` and `last_call_time`
- **Format**: `'2025-10-09 05:30:00+05:30'` (shown in your screenshot)
- **Timezone**: Stored with timezone information
- **Example**: 
  ```
  2025-10-09 05:30:00+05:30  (5:30 AM India Time)
  2025-10-09 00:00:00Z       (Midnight UTC)
  ```

**Why you see `2025-10-09 05:30:00+05:30`**:
- This is `2025-10-08T18:30:00.000Z` (UTC) converted to your local timezone (IST/India +05:30)
- So the call is scheduled for October 9, 2025 at 5:30 AM IST
- Which equals October 8, 2025 at 6:30 PM UTC (18:30)

---

### **Queue Management**

#### `status` (VARCHAR(20), NOT NULL)
- **Purpose**: Current state of the queue item
- **Default**: `'queued'`
- **Possible Values**:
  - `'queued'` - Waiting to be processed
  - `'processing'` - Currently being called
  - `'completed'` - Call finished successfully
  - `'failed'` - Call failed or skipped
- **QueueProcessor Logic**:
  ```sql
  WHERE status = 'queued'  -- Only picks up queued items
  ```

#### `priority` (INTEGER, DEFAULT 0)
- **Purpose**: Determines call order (higher = earlier)
- **Default**: `0`
- **Special Logic**: Contacts with names get `priority = 100`, others get `priority = 0`
- **Usage**: QueueProcessor sorts by priority DESC, then position ASC
- **Example**:
  ```
  Priority 100: Named contacts (called first)
  Priority 0:   Unnamed contacts (called later)
  ```

#### `position` (INTEGER, NOT NULL)
- **Purpose**: Order within same priority level (FIFO - First In First Out)
- **Value**: Sequential number (1, 2, 3, etc.)
- **Usage**: Ensures calls are made in the order they were added
- **Example**: If 5 contacts added, they get positions 1-5

---

### **Call Result Tracking**

#### `call_id` (UUID, NULLABLE)
- **Purpose**: Links to the actual call record once call is initiated
- **Foreign Key**: References `calls(id)` with SET NULL on delete
- **Initially**: `NULL` when queued
- **After Call**: Set to the created call's ID when QueueProcessor initiates the call
- **Example**: `'abc12345-def6-7890-ghij-klmnopqrstuv'`

#### `attempts` (INTEGER, DEFAULT 0)
- **Purpose**: Number of times this call has been attempted
- **Default**: `0`
- **Incremented**: Each time QueueProcessor tries to call
- **Usage**: Can implement max retry logic (e.g., skip after 3 attempts)
- **Example**: `0` (not yet attempted), `1` (one attempt), `2` (retried once)

#### `last_attempt_at` (TIMESTAMP WITH TIME ZONE, NULLABLE)
- **Purpose**: Timestamp of the most recent call attempt
- **Initially**: `NULL`
- **Updated**: Each time QueueProcessor processes this item
- **Usage**: Track when last attempt was made, calculate retry delays
- **Example**: `'2025-10-09T12:30:45.123Z'`

---

### **Metadata & Context**

#### `user_data` (JSONB, DEFAULT '{}')
- **Purpose**: Flexible storage for additional contact information and AI agent context
- **Type**: JSONB (JSON Binary - queryable, indexable)
- **Default**: Empty JSON object `{}`
- **Structure**:
  ```json
  {
    "summary": "Previous conversation summary",
    "next_action": "call",  // or "message", "email"
    "email": "john@example.com",
    "company": "Acme Corp",
    "notes": "VIP customer, prefers morning calls",
    "custom_field_1": "value1",
    "custom_field_2": "value2"
  }
  ```
- **Usage**: 
  - Passed to AI agent for personalized conversation
  - Stores campaign-specific data
  - Can be queried with PostgreSQL JSON operators
- **Example Query**:
  ```sql
  SELECT * FROM call_queue 
  WHERE user_data->>'company' = 'Acme Corp';
  ```

---

### **Timestamps**

#### `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())
- **Purpose**: When this queue item was created
- **Auto-set**: Automatically set by database
- **Example**: `'2025-10-09T17:03:38.228Z'`

#### `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())
- **Purpose**: When this queue item was last modified
- **Auto-updated**: Automatically updated by database trigger
- **Example**: `'2025-10-09T17:05:42.123Z'`

---

## How QueueProcessor Uses This Table

### 1. **Finding Next Call to Make**

```sql
SELECT q.*
FROM call_queue q
JOIN call_campaigns c ON q.campaign_id = c.id
WHERE 
  q.user_id = $1                    -- User's queue items only
  AND q.status = 'queued'           -- Only queued items
  AND c.status = 'active'           -- Campaign must be active
  AND q.scheduled_for <= NOW()      -- Time has come
  AND CURRENT_TIME >= c.first_call_time::time  -- Within time window
  AND CURRENT_TIME <= c.last_call_time::time   -- Within time window
ORDER BY 
  q.priority DESC,                  -- Higher priority first
  q.position ASC                    -- Then FIFO order
LIMIT 1;
```

### 2. **Initiating the Call**

1. QueueProcessor finds a queued item (as above)
2. Updates status to `'processing'`
3. Increments `attempts` counter
4. Sets `last_attempt_at` to now
5. Calls the Bolna API to initiate call
6. Creates a `call` record and sets `call_id`
7. Updates status to `'completed'` or `'failed'` based on result

### 3. **Time Window Logic**

The screenshot shows `scheduled_for: 2025-10-09 05:30:00+05:30`

**QueueProcessor checks**:
- ✅ Is current date/time >= scheduled_for? (Is it October 9, 5:30 AM or later?)
- ✅ Is current time >= first_call_time? (Is it 9:00 AM or later?)
- ✅ Is current time <= last_call_time? (Is it before 5:00 PM?)
- ✅ Is campaign status = 'active'?
- ✅ Are there available call slots (user limit, system limit)?

If ALL conditions met → Call initiated!

---

## Example Queue Item Lifecycle

### **Stage 1: Created (Queued)**
```json
{
  "id": "queue-item-uuid",
  "user_id": "user-uuid",
  "campaign_id": "campaign-uuid",
  "agent_id": "agent-uuid",
  "contact_id": "contact-uuid",
  "phone_number": "+919876543210",
  "contact_name": "John Doe",
  "scheduled_for": "2025-10-09T00:00:00Z",
  "status": "queued",           // ← Waiting to be called
  "priority": 100,
  "position": 1,
  "call_id": null,              // ← No call yet
  "attempts": 0,                // ← Not attempted yet
  "last_attempt_at": null,
  "user_data": {
    "summary": "",
    "next_action": "call",
    "email": "john@example.com",
    "company": "Acme Corp"
  }
}
```

### **Stage 2: Processing (Call Initiated)**
```json
{
  "status": "processing",       // ← Currently calling
  "attempts": 1,                // ← First attempt
  "last_attempt_at": "2025-10-09T09:15:30Z"
}
```

### **Stage 3: Completed (Call Finished)**
```json
{
  "status": "completed",        // ← Call done
  "call_id": "call-uuid",       // ← Link to call record
  "attempts": 1,
  "last_attempt_at": "2025-10-09T09:15:30Z"
}
```

### **Stage 4: Failed (Call Failed)**
```json
{
  "status": "failed",           // ← Call failed
  "attempts": 3,                // ← Tried 3 times
  "last_attempt_at": "2025-10-09T09:45:30Z"
}
```

---

## Common Queries

### Get all queued calls for a campaign:
```sql
SELECT * FROM call_queue
WHERE campaign_id = 'campaign-uuid'
  AND status = 'queued'
ORDER BY priority DESC, position ASC;
```

### Count calls by status:
```sql
SELECT status, COUNT(*) 
FROM call_queue
WHERE campaign_id = 'campaign-uuid'
GROUP BY status;
```

### Find failed calls to retry:
```sql
SELECT * FROM call_queue
WHERE status = 'failed'
  AND attempts < 3  -- Max retry limit
ORDER BY last_attempt_at ASC;
```

### Check queue for a specific contact:
```sql
SELECT q.*, c.name as campaign_name, c.status as campaign_status
FROM call_queue q
JOIN call_campaigns c ON q.campaign_id = c.id
WHERE q.phone_number = '+919876543210';
```

---

## Why Your Screenshot Shows That Timestamp

Your screenshot shows: `2025-10-09 05:30:00+05:30`

**Breakdown**:
- **Date**: October 9, 2025
- **Time**: 5:30 AM
- **Timezone**: +05:30 (India Standard Time / IST)

**In the database**, it's stored as: `2025-10-08T18:30:00.000Z` (UTC)

**Conversion**:
- Your browser/database client converts UTC to your local timezone
- `2025-10-08 18:30 UTC` + 5.5 hours = `2025-10-09 00:00 IST`
- Then you added "First Call Time" = `09:00`
- So the effective scheduled time = `2025-10-09 05:30 IST`

**When will the call happen**?
- If current time is October 9, 2025 at 9:05 AM IST or later
- AND campaign is active
- AND within time window (9 AM - 5 PM or 9 AM - 11 PM based on your settings)
- THEN call will be initiated!

---

## Summary

The `call_queue` table is the **heart of the campaign calling system**:

1. **Queuing**: Campaigns add contacts here when created
2. **Scheduling**: Each item has a scheduled time and respects time windows
3. **Prioritization**: Named contacts called before unnamed ones
4. **Processing**: QueueProcessor picks items and initiates calls
5. **Tracking**: Status, attempts, and results are recorded
6. **Lifecycle**: queued → processing → completed/failed

**Key Takeaway**: The QueueProcessor continuously scans this table (every 5 seconds) looking for items that are:
- ✅ `status = 'queued'`
- ✅ `scheduled_for <= NOW()`
- ✅ Campaign is `'active'`
- ✅ Within time window
- ✅ User has available call slots

Then it initiates the call! 🚀
