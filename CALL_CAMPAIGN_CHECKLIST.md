# 📋 Call Campaign System - Implementation Checklist

**Last Updated**: October 8, 2025  
**Current Phase**: Phase 1 Complete ✅  
**Next Phase**: Phase 2 - Backend Implementation 🔴

---

## Phase 1: Foundation ✅ COMPLETE

### Database Schema ✅
- [x] Created migration file `043_add_call_campaigns_and_queue.sql`
- [x] Designed `call_campaigns` table
- [x] Designed `call_queue` table
- [x] Added concurrency limits to `users` table
- [x] Created performance indexes
- [x] Created helper functions
- [x] Created auto-update triggers

### Type Definitions ✅
- [x] Created `backend/src/types/campaign.ts`
- [x] Defined `CallCampaign` interface
- [x] Defined `CallQueueItem` interface
- [x] Defined request/response types
- [x] Defined analytics types

### Documentation ✅
- [x] `CALL_CAMPAIGN_IMPLEMENTATION_SUMMARY.md` - Complete spec
- [x] `CALL_CAMPAIGN_QUICK_START.md` - Step-by-step guide
- [x] `CALL_CAMPAIGN_ARCHITECTURE.md` - Visual diagrams
- [x] `CALL_CAMPAIGN_PHASE1_COMPLETE.md` - Phase 1 summary
- [x] `CSV_UPLOAD_TEMPLATE.md` - CSV upload guide

### CSV Templates ✅
- [x] Basic template: `public/templates/call-campaign-basic-template.csv`
- [x] Advanced template: `public/templates/call-campaign-advanced-template.csv`
- [x] Template documentation

---

## Phase 2: Backend Implementation 🔴 IN PROGRESS

### Step 1: Run Migration 🔴 START HERE
- [ ] Connect to database
- [ ] Run migration: `043_add_call_campaigns_and_queue.sql`
- [ ] Verify tables created:
  - [ ] `call_campaigns` exists
  - [ ] `call_queue` exists
  - [ ] `users.concurrent_calls_limit` exists
  - [ ] `users.system_concurrent_calls_limit` exists
- [ ] Verify indexes created
- [ ] Verify helper functions work

**Command**:
```bash
psql $DATABASE_URL -f backend/src/migrations/043_add_call_campaigns_and_queue.sql
```

### Step 2: Create Models
- [ ] `backend/src/models/CallCampaign.ts`
  - [ ] findById()
  - [ ] findByUserId()
  - [ ] create()
  - [ ] update()
  - [ ] delete()
  - [ ] getAnalytics()

- [ ] `backend/src/models/CallQueue.ts`
  - [ ] findById()
  - [ ] findByCampaignId()
  - [ ] findByUserId()
  - [ ] getNextQueued()
  - [ ] create()
  - [ ] update()
  - [ ] delete()

### Step 3: Create Services

#### CallCampaignService
- [ ] `backend/src/services/callCampaignService.ts`
  - [ ] createCampaign()
  - [ ] updateCampaign()
  - [ ] pauseCampaign()
  - [ ] resumeCampaign()
  - [ ] cancelCampaign()
  - [ ] deleteCampaign()
  - [ ] getCampaigns()
  - [ ] getCampaignById()
  - [ ] getCampaignAnalytics()

#### CallQueueService
- [ ] `backend/src/services/callQueueService.ts`
  - [ ] addToQueue()
  - [ ] removeFromQueue()
  - [ ] getQueueStatistics()
  - [ ] calculatePriority()
  - [ ] distributeCallsInTimeWindow()
  - [ ] getNextQueuedCall()
  - [ ] updateQueuePosition()

#### QueueProcessorService
- [ ] `backend/src/services/queueProcessorService.ts`
  - [ ] processQueue() - Main loop
  - [ ] checkSystemConcurrency()
  - [ ] checkUserConcurrency()
  - [ ] allocateSystemSlots() - Round-robin
  - [ ] initiateQueuedCall()
  - [ ] freeQueueSlot()
  - [ ] validateTimeWindow()

#### CSVUploadService
- [ ] `backend/src/services/csvUploadService.ts`
  - [ ] parseCSV()
  - [ ] validateCSVData()
  - [ ] normalizePhoneNumber()
  - [ ] createContactsFromCSV()
  - [ ] createCampaignFromCSV()

### Step 4: Create API Routes

#### Campaign Routes
- [ ] `backend/src/routes/campaignRoutes.ts`
  - [ ] POST /api/campaigns - Create campaign
  - [ ] GET /api/campaigns - List campaigns
  - [ ] GET /api/campaigns/:id - Get campaign
  - [ ] PATCH /api/campaigns/:id - Update campaign
  - [ ] DELETE /api/campaigns/:id - Delete campaign
  - [ ] POST /api/campaigns/:id/pause - Pause campaign
  - [ ] POST /api/campaigns/:id/resume - Resume campaign
  - [ ] POST /api/campaigns/:id/cancel - Cancel campaign
  - [ ] GET /api/campaigns/:id/analytics - Get analytics
  - [ ] POST /api/campaigns/bulk-call - Bulk call from contacts
  - [ ] POST /api/campaigns/upload-csv - Upload CSV
  - [ ] GET /api/campaigns/csv-template - Download template

#### Queue Routes
- [ ] `backend/src/routes/queueRoutes.ts` (or add to campaign routes)
  - [ ] GET /api/queue - Get user's queue
  - [ ] GET /api/queue/statistics - Get queue stats
  - [ ] GET /api/campaigns/:id/queue - Get campaign queue

#### Settings Routes
- [ ] Update `backend/src/routes/settingsRoutes.ts`
  - [ ] GET /api/settings/concurrency - Get limits

- [ ] Register routes in `backend/src/routes/index.ts`

### Step 5: Update Webhook Service
- [ ] Update `backend/src/services/webhookService.clean.ts`
  - [ ] Import QueueProcessorService
  - [ ] On call-disconnected: call freeQueueSlot()
  - [ ] On busy: call freeQueueSlot()
  - [ ] On no-answer: call freeQueueSlot()
  - [ ] On failed: call freeQueueSlot()
  - [ ] On cancelled: call freeQueueSlot()
  - [ ] Trigger processQueue() after freeing slot

### Step 6: Background Job Setup
- [ ] Update `backend/src/server.ts`
  - [ ] Import QueueProcessorService
  - [ ] Start queue processor:
    ```typescript
    setInterval(async () => {
      await queueProcessorService.processQueue();
    }, 10000); // 10 seconds
    ```
  - [ ] Add graceful shutdown handling

### Step 7: Admin Endpoints (Optional)
- [ ] `backend/src/routes/adminRoutes.ts`
  - [ ] PATCH /api/admin/users/:id/concurrency - Set user limit
  - [ ] PATCH /api/admin/system/concurrency - Set system limit

---

## Phase 3: Frontend Implementation 🟡 WAITING

### Step 1: Setup Routes
- [ ] Update `frontend/src/App.tsx`
  - [ ] Add route: `/campaigns` → CampaignDashboard
  - [ ] Add route: `/campaigns/:id` → CampaignDetail

### Step 2: Create Shared Components

#### Campaign Components
- [ ] `frontend/src/components/campaigns/CampaignCard.tsx`
  - [ ] Display campaign name, agent, status
  - [ ] Progress bar (completed/total)
  - [ ] Action buttons (pause, resume, cancel, edit)
  - [ ] Stats display (success, failed, queued)

- [ ] `frontend/src/components/campaigns/CampaignStatusBadge.tsx`
  - [ ] Color-coded status badges

- [ ] `frontend/src/components/campaigns/CampaignProgressBar.tsx`
  - [ ] Visual progress indicator

- [ ] `frontend/src/components/campaigns/QueuePositionIndicator.tsx`
  - [ ] Show position in queue
  - [ ] Estimated wait time

#### Form Components
- [ ] `frontend/src/components/campaigns/TimeWindowPicker.tsx`
  - [ ] First call time picker
  - [ ] Last call time picker
  - [ ] Validation (first < last)

- [ ] `frontend/src/components/campaigns/CampaignForm.tsx`
  - [ ] Shared form for create/edit
  - [ ] Agent selection
  - [ ] Next action input
  - [ ] Time window picker
  - [ ] Start date picker

### Step 3: Create Pages

#### Campaign Dashboard
- [ ] `frontend/src/pages/Campaigns.tsx`
  - [ ] Page header with "New Campaign" button
  - [ ] Tabs: Active, Scheduled, Completed
  - [ ] Campaign list with filters
  - [ ] Empty state when no campaigns

- [ ] `frontend/src/components/campaigns/CampaignList.tsx`
  - [ ] Render list of CampaignCard components
  - [ ] Loading state
  - [ ] Error state

#### Campaign Detail
- [ ] `frontend/src/pages/CampaignDetail.tsx`
  - [ ] Campaign overview section
  - [ ] Statistics cards
  - [ ] Queue status table
  - [ ] Call history table
  - [ ] Analytics charts
  - [ ] Edit/Pause/Cancel buttons

- [ ] `frontend/src/components/campaigns/CampaignAnalyticsChart.tsx`
  - [ ] Daily progress chart
  - [ ] Success rate chart
  - [ ] Call outcomes pie chart

#### Campaign Creation
- [ ] `frontend/src/components/campaigns/CreateCampaignModal.tsx`
  - [ ] Tabs: Select Contacts, Upload CSV
  - [ ] Campaign form
  - [ ] Contact selection list
  - [ ] Submit button

- [ ] `frontend/src/components/campaigns/CSVUploadForm.tsx`
  - [ ] File dropzone
  - [ ] Template download links
  - [ ] Upload progress
  - [ ] Validation results
  - [ ] Error display

### Step 4: Bulk Call from Contacts
- [ ] Update `frontend/src/pages/Contacts.tsx`
  - [ ] Add "Bulk Call" button (visible when contacts selected)
  - [ ] Connect to BulkCallModal

- [ ] `frontend/src/components/contacts/BulkCallModal.tsx`
  - [ ] Display selected contacts
  - [ ] Campaign configuration form
  - [ ] Submit → Create campaign
  - [ ] Navigate to campaign detail on success

### Step 5: Update Sidebar
- [ ] Update `frontend/src/components/Sidebar.tsx`
  - [ ] Add "Call Campaigns" section
  - [ ] Show active campaigns count badge
  - [ ] Link to `/campaigns`

### Step 6: Update Settings
- [ ] Update `frontend/src/pages/Settings.tsx`
  - [ ] Add "Concurrency Settings" card
  - [ ] Display: Current limit, Active calls, Available slots
  - [ ] Read-only (admin sets limits)

### Step 7: API Integration
- [ ] `frontend/src/api/campaignApi.ts`
  - [ ] createCampaign()
  - [ ] getCampaigns()
  - [ ] getCampaignById()
  - [ ] updateCampaign()
  - [ ] pauseCampaign()
  - [ ] resumeCampaign()
  - [ ] cancelCampaign()
  - [ ] deleteCampaign()
  - [ ] getCampaignAnalytics()
  - [ ] uploadCSV()
  - [ ] bulkCall()
  - [ ] getQueueStatistics()

### Step 8: State Management
- [ ] Create Zustand store or Context:
  - [ ] `useCampaignStore` or `CampaignContext`
  - [ ] Store campaigns list
  - [ ] Store active campaign
  - [ ] Store queue statistics
  - [ ] Store concurrency settings

---

## Phase 4: Testing & Optimization 🟡 WAITING

### Unit Tests
- [ ] CallCampaignService tests
- [ ] CallQueueService tests
- [ ] QueueProcessorService tests
- [ ] CSVUploadService tests
- [ ] Priority calculation tests
- [ ] Time window distribution tests
- [ ] Round-robin allocation tests

### Integration Tests
- [ ] Create campaign → Verify queue created
- [ ] Upload CSV → Verify contacts created
- [ ] Process queue → Verify calls initiated
- [ ] Call completion → Verify slot freed
- [ ] Pause campaign → Verify queue processing stops
- [ ] Resume campaign → Verify queue processing resumes

### Manual Testing Scenarios
- [ ] **Scenario 1**: Single user, 5 contacts, concurrency 2
  - [ ] Create campaign
  - [ ] Verify 2 calls start immediately
  - [ ] Verify remaining 3 queued
  - [ ] Complete 1 call → Verify next starts

- [ ] **Scenario 2**: Multiple users, system limit reached
  - [ ] User A: 5 queued, limit 2
  - [ ] User B: 5 queued, limit 2
  - [ ] System limit: 3
  - [ ] Verify round-robin: A gets 2, B gets 1
  - [ ] Complete A's call → Verify B gets next slot

- [ ] **Scenario 3**: Time window validation
  - [ ] Campaign: 9 AM - 6 PM
  - [ ] Queue 10 calls
  - [ ] At 6 PM, verify no more calls
  - [ ] Next day 9 AM, verify calls resume

- [ ] **Scenario 4**: Priority ordering
  - [ ] Contact A: Has name → Priority 100
  - [ ] Contact B: No name → Priority 0
  - [ ] Verify Contact A called first

- [ ] **Scenario 5**: CSV upload
  - [ ] Upload CSV with 20 contacts
  - [ ] Verify validation results
  - [ ] Verify contacts created
  - [ ] Verify campaign created
  - [ ] Verify queue created with correct schedule

### Performance Testing
- [ ] Load test: 100 contacts in single campaign
- [ ] Load test: 10 concurrent campaigns
- [ ] Load test: 100 users with campaigns
- [ ] Stress test: System limit exceeded
- [ ] Database query performance
- [ ] Queue processing latency (< 10 seconds)

### Edge Case Testing
- [ ] Delete contact while in queue
- [ ] Delete agent with active campaign
- [ ] Delete user with active campaigns
- [ ] Campaign with 1 contact
- [ ] Campaign with 1000 contacts
- [ ] Time window crosses midnight
- [ ] Scheduled campaign in past
- [ ] CSV with invalid data
- [ ] CSV with duplicates
- [ ] Network failure during call initiation
- [ ] Webhook received out of order

---

## Phase 5: Deployment & Monitoring 🟡 WAITING

### Pre-Deployment
- [ ] Code review
- [ ] Security audit
- [ ] Performance optimization
- [ ] Documentation review
- [ ] User acceptance testing

### Deployment
- [ ] Database migration on production
- [ ] Backend deployment
- [ ] Frontend deployment
- [ ] Verify background job running
- [ ] Verify webhooks working

### Monitoring
- [ ] Set up logging for queue processor
- [ ] Set up alerts for:
  - [ ] Queue processing failures
  - [ ] System concurrency exceeded (shouldn't happen)
  - [ ] Call initiation failures
  - [ ] Webhook processing errors
- [ ] Monitor queue processing latency
- [ ] Monitor database performance
- [ ] Monitor Bolna API rate limits

### Post-Deployment
- [ ] Create admin user guide
- [ ] Create user documentation
- [ ] Train support team
- [ ] Monitor first campaigns closely
- [ ] Gather user feedback
- [ ] Iterate based on feedback

---

## 🎯 Success Metrics (When Complete)

### Performance Metrics
- [ ] Campaign creation: < 2 minutes
- [ ] CSV upload (100 contacts): < 30 seconds
- [ ] Queue processing latency: < 10 seconds
- [ ] Time window compliance: 100%
- [ ] Concurrency limit compliance: 100%

### User Experience Metrics
- [ ] Campaign creation success rate: > 95%
- [ ] CSV upload success rate: > 90%
- [ ] Call initiation success rate: > 90%
- [ ] User satisfaction: > 4/5 stars

### System Metrics
- [ ] Database query performance: < 100ms
- [ ] API response time: < 500ms
- [ ] Queue processor CPU usage: < 20%
- [ ] Memory usage: Stable over time

---

## 📝 Current Status

**Phase 1**: ✅ Complete (Database, Types, Documentation)  
**Phase 2**: 🔴 In Progress (Backend Implementation)  
**Phase 3**: 🟡 Waiting (Frontend Implementation)  
**Phase 4**: 🟡 Waiting (Testing)  
**Phase 5**: 🟡 Waiting (Deployment)

**Next Immediate Action**: Run database migration! 🚀

```bash
psql $DATABASE_URL -f backend/src/migrations/043_add_call_campaigns_and_queue.sql
```

---

**Last Updated**: October 8, 2025  
**Total Tasks**: 150+  
**Completed**: 25 (Phase 1)  
**Remaining**: 125+  
**Estimated Time**: 3-5 days full implementation
