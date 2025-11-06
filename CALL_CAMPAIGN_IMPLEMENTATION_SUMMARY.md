# Call Campaign & Queue System - Implementation Summary

**Date**: October 8, 2025  
**Feature**: Batch Calling with Campaign Management and Intelligent Queue System  
**Status**: ✅ In Progress - Database & Types Complete

---

## 📋 Overview

This document outlines the complete implementation of a sophisticated batch calling system with campaign management, intelligent queue processing, round-robin concurrency allocation, and CSV bulk upload capabilities.

---

## 🎯 Feature Requirements (Confirmed)

### **Core Features**
1. ✅ **Campaign Management** - Create, edit, pause, resume, and cancel call campaigns
2. ✅ **CSV Bulk Upload** - Upload 100+ contacts via CSV with template
3. ✅ **Bulk Call from Contacts** - Select multiple contacts and create campaign directly
4. ✅ **Time Window Scheduling** - Define daily calling hours (e.g., 12 PM - 6 PM)
5. ✅ **Two-Level Concurrency Control**:
   - User-level limit (e.g., User A: 2 concurrent calls)
   - System-level limit (e.g., Max 10 concurrent calls total)
6. ✅ **Round-Robin Allocation** - Fair distribution when system limit reached
7. ✅ **Priority Queue** - Contacts with names get higher priority
8. ✅ **Call Continuation** - Unfinished calls continue next day within time window
9. ✅ **Queue Slot Release** - Free slots on call-disconnected, busy, no-answer, failed, cancelled

### **User Experience**
1. ✅ **Campaign Dashboard** - View active, scheduled, and completed campaigns
2. ✅ **Queue Status** - See position, estimated wait time, next call
3. ✅ **Settings** - View concurrency limits
4. ✅ **Analytics** - Campaign success rate, call outcomes, daily stats

---

## 📊 Database Schema

### **1. Users Table (Modified)**
```sql
ALTER TABLE users 
ADD COLUMN concurrent_calls_limit INTEGER DEFAULT 2;
ADD COLUMN system_concurrent_calls_limit INTEGER DEFAULT 10;
```

**Fields Added**:
- `concurrent_calls_limit`: User-specific limit (admin-configurable)
- `system_concurrent_calls_limit`: System-wide limit

### **2. call_campaigns Table (New)**
```sql
CREATE TABLE call_campaigns (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  agent_id UUID NOT NULL,
  next_action TEXT NOT NULL,
  
  -- Time window (daily recurring)
  first_call_time TIME NOT NULL,
  last_call_time TIME NOT NULL,
  
  -- Status and stats
  status VARCHAR(20) DEFAULT 'draft',
  total_contacts INTEGER DEFAULT 0,
  completed_calls INTEGER DEFAULT 0,
  successful_calls INTEGER DEFAULT 0,
  failed_calls INTEGER DEFAULT 0,
  
  -- Scheduling
  start_date DATE NOT NULL,
  end_date DATE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
```

**Status Flow**:
```
draft → scheduled → active → completed
                  ↓       ↓
                paused  cancelled
```

### **3. call_queue Table (New)**
```sql
CREATE TABLE call_queue (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  campaign_id UUID NOT NULL,
  agent_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  
  phone_number VARCHAR(50) NOT NULL,
  contact_name VARCHAR(255),
  user_data JSONB NOT NULL DEFAULT '{}',
  
  -- Queue management
  status VARCHAR(20) DEFAULT 'queued',
  priority INTEGER DEFAULT 0,
  position INTEGER NOT NULL,
  
  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL,
  
  -- Execution
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  call_id UUID,
  failure_reason TEXT,
  
  -- Round-robin
  last_system_allocation_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

**Status Flow**:
```
queued → processing → completed
                  ↓
                failed
                cancelled
                skipped
```

### **Key Indexes**
```sql
-- Campaign indexes
CREATE INDEX idx_call_campaigns_user_id ON call_campaigns(user_id);
CREATE INDEX idx_call_campaigns_status ON call_campaigns(status);
CREATE INDEX idx_call_campaigns_start_date ON call_campaigns(start_date);

-- Queue indexes (optimized for priority + FIFO)
CREATE INDEX idx_call_queue_priority_position 
  ON call_queue(user_id, priority DESC, position ASC) 
  WHERE status = 'queued';

-- Round-robin index
CREATE INDEX idx_call_queue_round_robin 
  ON call_queue(user_id, last_system_allocation_at) 
  WHERE status = 'queued';
```

---

## 🔧 Backend Services Architecture

### **Service Layer Structure**
```
├── CallCampaignService
│   ├── createCampaign()
│   ├── updateCampaign()
│   ├── pauseCampaign()
│   ├── resumeCampaign()
│   ├── cancelCampaign()
│   ├── getCampaigns()
│   ├── getCampaignAnalytics()
│   └── deleteCampaign()
│
├── CallQueueService
│   ├── addToQueue()
│   ├── getNextQueuedCall()
│   ├── updateQueuePosition()
│   ├── removeFromQueue()
│   ├── getQueueStatistics()
│   ├── calculatePriority()
│   └── distributeCallsInTimeWindow()
│
├── QueueProcessorService (Background Job)
│   ├── processQueue() - Main loop
│   ├── checkConcurrencyLimits()
│   ├── allocateSystemSlots() - Round-robin
│   ├── initiateQueuedCall()
│   └── handleCallCompletion()
│
├── CSVUploadService
│   ├── parseCSV()
│   ├── validateCSVData()
│   ├── createContactsFromCSV()
│   └── createCampaignFromCSV()
│
└── Updated: WebhookService
    └── freeQueueSlot() - Called on call completion
```

---

## 🎨 Frontend Components Architecture

### **Component Structure**
```
├── Sidebar
│   └── CampaignSidebarSection (NEW)
│       ├── Active Campaigns Badge
│       ├── Quick Stats
│       └── Navigate to /campaigns
│
├── Pages
│   ├── /campaigns (NEW)
│   │   ├── CampaignDashboard
│   │   │   ├── CampaignList
│   │   │   │   ├── ActiveCampaigns
│   │   │   │   ├── ScheduledCampaigns
│   │   │   │   └── CompletedCampaigns
│   │   │   ├── CampaignCard
│   │   │   │   ├── Stats (progress bar)
│   │   │   │   ├── Actions (pause/resume/cancel)
│   │   │   │   └── Quick view
│   │   │   └── CreateCampaignButton
│   │   │
│   │   ├── CampaignDetails/:id
│   │   │   ├── Overview Stats
│   │   │   ├── QueueStatus
│   │   │   ├── CallHistory
│   │   │   ├── Analytics Chart
│   │   │   └── Edit/Pause/Cancel actions
│   │   │
│   │   └── CreateCampaign
│   │       ├── CSVUpload tab
│   │       └── SelectContacts tab
│   │
│   ├── /contacts (MODIFIED)
│   │   └── BulkCallModal (NEW)
│   │       ├── Agent Selection
│   │       ├── Next Action Input
│   │       ├── Time Window Picker
│   │       ├── Start Date Picker
│   │       ├── Campaign Name Input
│   │       └── Create Campaign Button
│   │
│   └── /settings (MODIFIED)
│       └── ConcurrencySettingsCard (NEW)
│           ├── Display current limit
│           ├── Display active calls
│           └── Display available slots
│
└── Shared Components
    ├── CampaignStatusBadge
    ├── QueuePositionIndicator
    ├── TimeWindowPicker
    ├── CampaignProgressBar
    └── CampaignAnalyticsChart
```

---

## 🔄 System Workflows

### **Workflow 1: Create Campaign from Contacts**
```
User Flow:
1. Navigate to /contacts
2. Select 10 contacts (checkboxes)
3. Click "Bulk Call" button
4. Modal opens with form:
   - Campaign name (auto-generated: "Campaign - Oct 8, 2025")
   - Agent selection (dropdown)
   - Next action (textarea: "Schedule product demo")
   - First call time (time picker: 09:00 AM)
   - Last call time (time picker: 06:00 PM)
   - Start date (date picker: tomorrow)
5. Click "Create Campaign"
6. System creates campaign + queue entries
7. Navigate to /campaigns to view
```

**Backend Processing**:
```typescript
1. CallCampaignService.createCampaign({
   name, agent_id, next_action, 
   first_call_time, last_call_time, start_date
})

2. For each contact:
   a. Calculate priority (has name? +100)
   b. Calculate scheduled_for (distribute in time window)
   c. Build user_data payload:
      {
        summary: "name: John, email: john@..., company: ABC Corp, 
                  last_conversation: 2025-09-20, 
                  transcript_summary: [from last call]",
        next_action: "Schedule product demo"
      }
   d. CallQueueService.addToQueue(queue_item)

3. Update campaign.total_contacts = 10

4. If start_date is today, set status = 'active'
   Else, set status = 'scheduled'
```

### **Workflow 2: CSV Upload**
```
User Flow:
1. Navigate to /campaigns
2. Click "+ New Campaign"
3. Select "Upload CSV" tab
4. Download template (basic or advanced)
5. Fill CSV with contacts
6. Upload CSV file
7. Fill campaign settings (agent, next_action, time_window, start_date)
8. Click "Create Campaign"
9. System validates & imports
10. Show import summary:
    - ✅ Imported: 95
    - ⚠️ Skipped: 3 (duplicates)
    - ❌ Failed: 2 (invalid phone)
```

**Backend Processing**:
```typescript
1. CSVUploadService.parseCSV(file)
   - Validate headers (name, phone_number required)
   - Parse rows
   - Return CSVContactRow[]

2. CSVUploadService.validateCSVData(rows)
   - Check phone number format
   - Check email format
   - Remove duplicates
   - Return { valid, invalid, duplicates }

3. CSVUploadService.createContactsFromCSV(valid_rows)
   - Create contacts in database (skip existing)
   - Return contact_ids[]

4. CallCampaignService.createCampaignFromCSV({
   campaign_config, contact_ids
})
   - Same as Workflow 1 backend processing
```

### **Workflow 3: Queue Processing (Background)**
```
Every 10 seconds:

1. QueueProcessorService.processQueue()
   
2. For each user with queued calls:
   a. Check user_concurrent_limit
   b. Count active_calls for user
   c. Available user slots = limit - active
   
3. Check system_concurrent_limit
   a. Count total active_calls (all users)
   b. Available system slots = limit - active
   
4. If system slots available:
   - Get users with queued calls
   - Apply round-robin:
     * Sort by last_system_allocation_at ASC
     * Allocate 1 slot to each user in order
     * Update last_system_allocation_at
   
5. For each allocated user:
   a. Get next queued call (priority DESC, position ASC)
   b. Check scheduled_for <= NOW
   c. If within time window (first_call_time - last_call_time):
      - Initiate call via Bolna API
      - Create call record
      - Update queue status = 'processing'
      - Set queue.call_id
   
6. Handle time window boundary:
   - If NOW > last_call_time:
     * Reschedule to tomorrow's first_call_time
```

### **Workflow 4: Call Completion (Webhook)**
```
Webhook receives status: call-disconnected, busy, no-answer, failed, cancelled

1. WebhookService.processWebhook(payload, status)

2. Find call record by bolna_execution_id

3. Update call status = 'completed' / 'failed'

4. Find queue item by call_id

5. Update queue status = 'completed' / 'failed'

6. QueueProcessorService.freeQueueSlot()
   - Decrement user's active_calls count
   - Decrement system's active_calls count
   - Trigger processQueue() to start next call

7. Update campaign statistics
```

---

## 📱 UI/UX Design Specifications

### **Color Scheme (Following Existing UI)**
```typescript
// Assume existing Tailwind theme
Campaign Status Colors:
- draft: gray-500
- scheduled: blue-500
- active: green-500
- paused: yellow-500
- completed: gray-400
- cancelled: red-500

Queue Status Colors:
- queued: blue-400
- processing: yellow-400 (pulsing)
- completed: green-500
- failed: red-500
- cancelled: gray-500
```

### **Campaign Dashboard Layout**
```
┌─────────────────────────────────────────────────────────┐
│ 📞 Call Campaigns                    [+ New Campaign]   │
├─────────────────────────────────────────────────────────┤
│                                                           │
│ Tabs: [ Active (2) ] [ Scheduled (1) ] [ Completed (5) ]│
│                                                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ October Leads Campaign              [⏸ Pause] [✏️]│ │
│ │ Agent: Sales Bot  |  Created: Oct 8, 2025          │ │
│ │                                                     │ │
│ │ Progress: █████░░░░░  50% (5/10 completed)        │ │
│ │                                                     │ │
│ │ ✅ Successful: 4  │  ❌ Failed: 1  │  ⏳ Queued: 5│ │
│ │ Next call: 2:30 PM (in 15 mins)                   │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Follow-up Campaign                  [▶️ Resume] [✏️]│ │
│ │ Agent: Support Bot  |  Paused: Oct 7, 2025        │ │
│ │                                                     │ │
│ │ Progress: ██░░░░░░░░  20% (2/10 completed)        │ │
│ │                                                     │ │
│ │ ✅ Successful: 2  │  ❌ Failed: 0  │  ⏸ Paused: 8 │ │
│ │ Paused by: User                                    │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

### **Bulk Call Modal (from Contacts)**
```
┌──────────────────────────────────────────────────────────┐
│ Create Call Campaign                          [✕ Close] │
├──────────────────────────────────────────────────────────┤
│                                                           │
│ Selected Contacts: 10                                     │
│ ┌─────────────────────────────────────────────────────┐  │
│ │ John Smith (+91 9876543210)                         │  │
│ │ Jane Doe (+1 5551234567)                            │  │
│ │ ... 8 more                                          │  │
│ └─────────────────────────────────────────────────────┘  │
│                                                           │
│ Campaign Name *                                           │
│ ┌─────────────────────────────────────────────────────┐  │
│ │ October Leads Campaign                              │  │
│ └─────────────────────────────────────────────────────┘  │
│                                                           │
│ Select Agent *                                            │
│ ┌─────────────────────────────────────────────────────┐  │
│ │ Sales Bot ▼                                         │  │
│ └─────────────────────────────────────────────────────┘  │
│                                                           │
│ Next Action (What should agent accomplish?) *             │
│ ┌─────────────────────────────────────────────────────┐  │
│ │ Schedule product demo and gather requirements       │  │
│ │                                                     │  │
│ └─────────────────────────────────────────────────────┘  │
│                                                           │
│ Call Time Window *                                        │
│ ┌──────────────────────┐  ┌──────────────────────┐      │
│ │ First Call: 09:00 AM │  │ Last Call: 06:00 PM  │      │
│ └──────────────────────┘  └──────────────────────┘      │
│                                                           │
│ Start Date *                                              │
│ ┌─────────────────────────────────────────────────────┐  │
│ │ Tomorrow (Oct 9, 2025) ▼                            │  │
│ └─────────────────────────────────────────────────────┘  │
│                                                           │
│ ℹ️ Calls will be distributed evenly within the time     │
│   window. Your concurrency limit: 2 calls at a time.     │
│                                                           │
│        [Cancel]           [Create Campaign →]            │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## 🚀 API Endpoints

### **Campaign Endpoints**
```typescript
POST   /api/campaigns              // Create campaign
GET    /api/campaigns              // List campaigns (with filters)
GET    /api/campaigns/:id          // Get campaign details
PATCH  /api/campaigns/:id          // Update campaign
DELETE /api/campaigns/:id          // Delete campaign
POST   /api/campaigns/:id/pause    // Pause campaign
POST   /api/campaigns/:id/resume   // Resume campaign
POST   /api/campaigns/:id/cancel   // Cancel campaign
GET    /api/campaigns/:id/analytics // Get campaign analytics
```

### **Queue Endpoints**
```typescript
GET    /api/queue                  // Get user's queue status
GET    /api/queue/statistics       // Get queue statistics
GET    /api/campaigns/:id/queue    // Get campaign queue items
```

### **CSV Upload**
```typescript
POST   /api/campaigns/upload-csv   // Upload CSV and create campaign
GET    /api/campaigns/csv-template // Download CSV template
```

### **Settings**
```typescript
GET    /api/settings/concurrency   // Get concurrency limits
```

### **Bulk Call (from Contacts)**
```typescript
POST   /api/campaigns/bulk-call    // Create campaign from selected contacts
```

---

## 📈 Priority Calculation Algorithm

```typescript
function calculateContactPriority(contact: Contact, user: User): number {
  let priority = 0;
  
  // Base priority: Has name in contact record
  if (contact.name && contact.name.trim() !== '') {
    priority += 100;
  }
  
  // Bonus: Has email
  if (contact.email) {
    priority += 10;
  }
  
  // Bonus: Has company
  if (contact.company) {
    priority += 10;
  }
  
  // Bonus: Previous successful calls
  const successfulCalls = getSuccessfulCallCount(contact.id);
  priority += Math.min(successfulCalls * 5, 20); // Max +20
  
  // Penalty: Previous failed attempts
  if (contact.not_connected > 0) {
    priority -= contact.not_connected * 10;
  }
  
  return Math.max(priority, 0); // Never negative
}
```

---

## ⏱️ Time Window Distribution Algorithm

```typescript
function distributeCallsInTimeWindow(
  contacts: Contact[],
  first_call_time: string,  // "09:00"
  last_call_time: string,    // "18:00"
  start_date: string          // "2025-10-09"
): ScheduledCall[] {
  const scheduled: ScheduledCall[] = [];
  
  // Parse times
  const [startHour, startMin] = first_call_time.split(':').map(Number);
  const [endHour, endMin] = last_call_time.split(':').map(Number);
  
  // Calculate total minutes in window
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  const totalMinutes = endMinutes - startMinutes;
  
  // Calculate interval between calls
  const interval = totalMinutes / contacts.length;
  
  // Schedule each call
  for (let i = 0; i < contacts.length; i++) {
    const offsetMinutes = Math.floor(i * interval);
    const scheduledMinutes = startMinutes + offsetMinutes;
    
    const hour = Math.floor(scheduledMinutes / 60);
    const min = scheduledMinutes % 60;
    
    scheduled.push({
      contact_id: contacts[i].id,
      scheduled_for: `${start_date}T${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:00`,
      position: i + 1
    });
  }
  
  return scheduled;
}
```

---

## 🔄 Round-Robin Allocation Algorithm

```typescript
async function allocateSystemSlots(): Promise<RoundRobinAllocation[]> {
  const systemLimit = await getSystemConcurrentLimit();
  const activeSystemCalls = await countSystemActiveCalls();
  const availableSlots = systemLimit - activeSystemCalls;
  
  if (availableSlots <= 0) {
    return []; // System at capacity
  }
  
  // Get users with queued calls
  const usersWithQueue = await getUsersWithQueuedCalls();
  
  // Sort by last allocation time (fair round-robin)
  usersWithQueue.sort((a, b) => {
    if (!a.last_allocation) return -1;
    if (!b.last_allocation) return 1;
    return a.last_allocation.getTime() - b.last_allocation.getTime();
  });
  
  const allocations: RoundRobinAllocation[] = [];
  let slotsRemaining = availableSlots;
  
  // Round-robin: Give 1 slot to each user in order
  for (const user of usersWithQueue) {
    if (slotsRemaining <= 0) break;
    
    const userActiveCount = await countActiveCallsForUser(user.id);
    const userLimit = user.concurrent_calls_limit;
    const userAvailableSlots = userLimit - userActiveCount;
    
    if (userAvailableSlots > 0) {
      // Allocate 1 slot to this user
      allocations.push({
        user_id: user.id,
        allocated_slots: 1,
        reason: 'round_robin'
      });
      
      // Update last allocation timestamp
      await updateLastAllocation(user.id);
      
      slotsRemaining--;
    }
  }
  
  // If still slots remaining, do another round
  if (slotsRemaining > 0 && allocations.length > 0) {
    return allocations.concat(await allocateSystemSlots());
  }
  
  return allocations;
}
```

---

## 🎯 Next Steps

### **Implementation Order**

**Phase 1: Backend Foundation** ✅ (Current)
- [x] Database migration
- [x] TypeScript types
- [ ] Database models (CallCampaign, CallQueue)
- [ ] CallCampaignService
- [ ] CallQueueService

**Phase 2: Queue Processing**
- [ ] QueueProcessorService (background job)
- [ ] Round-robin allocation logic
- [ ] Time window validation
- [ ] Update webhookService

**Phase 3: CSV Upload**
- [ ] CSVUploadService
- [ ] CSV parser
- [ ] CSV validation
- [ ] Template download endpoint

**Phase 4: API Endpoints**
- [ ] Campaign CRUD endpoints
- [ ] Queue status endpoints
- [ ] Bulk call endpoint
- [ ] CSV upload endpoint

**Phase 5: Frontend - Campaign Dashboard**
- [ ] Sidebar section
- [ ] Campaign list page
- [ ] Campaign detail page
- [ ] Campaign creation modal

**Phase 6: Frontend - Integrations**
- [ ] Bulk call modal in contacts
- [ ] CSV upload UI
- [ ] Settings page (concurrency display)
- [ ] Analytics charts

**Phase 7: Testing & Optimization**
- [ ] Unit tests
- [ ] Integration tests
- [ ] Load testing (100+ concurrent campaigns)
- [ ] Performance optimization

---

## 📝 Notes & Considerations

### **Performance Optimization**
1. **Queue Processing**: Run every 10 seconds (configurable)
2. **Database Indexes**: Optimized for priority + FIFO queries
3. **Batch Operations**: Process multiple queue items in parallel
4. **Caching**: Cache user limits and system limits

### **Error Handling**
1. **Call Failures**: Mark queue item as failed, don't retry
2. **System Errors**: Log and alert, pause campaign if critical
3. **Rate Limits**: Respect Bolna API rate limits
4. **Webhook Delays**: Handle out-of-order webhooks

### **Edge Cases**
1. **User Deletes Contact**: Queue item references deleted contact → mark as skipped
2. **Agent Deleted**: Prevent deletion if active campaigns exist
3. **Timezone Issues**: All times in UTC, convert for display
4. **Leap Seconds**: Use proper datetime libraries

### **Security**
1. **Data Isolation**: All queries filtered by user_id
2. **Admin Only**: Only admins can set concurrency limits
3. **Rate Limiting**: Prevent abuse of campaign creation
4. **CSV Upload**: Validate file size, format, malicious content

---

## ✅ Success Criteria

1. ✅ User can create campaign from contacts page (10 clicks max)
2. ✅ User can upload CSV with 100 contacts (< 30 seconds)
3. ✅ System respects user concurrency limits (never exceeded)
4. ✅ System respects system limits with fair round-robin
5. ✅ Calls distributed evenly in time window (±5 min variance)
6. ✅ Named contacts called before unnamed contacts
7. ✅ Queue updates in real-time (< 1 second delay)
8. ✅ Campaign analytics accurate (< 1% error)
9. ✅ No calls outside time window (100% compliance)
10. ✅ Unfinished calls continue next day automatically

---

**Document Version**: 1.0  
**Last Updated**: October 8, 2025  
**Author**: AI Assistant  
**Status**: 🟡 In Progress - Foundation Complete
