# 🎯 Call Campaign System - Quick Start Guide

## ✅ What's Been Done (Phase 1 Complete)

### **1. Database Schema** ✅
- Created migration file: `043_add_call_campaigns_and_queue.sql`
- Added to `users` table:
  - `concurrent_calls_limit` (default: 2)
  - `system_concurrent_calls_limit` (default: 10)
- Created `call_campaigns` table (campaign management)
- Created `call_queue` table (queue management with round-robin)
- Added indexes for performance
- Created helper functions for queue processing

### **2. Type Definitions** ✅
- Created comprehensive TypeScript types in `backend/src/types/campaign.ts`
- Defined all interfaces for campaigns, queue, CSV upload, analytics

### **3. CSV Templates** ✅
- Created template documentation: `CSV_UPLOAD_TEMPLATE.md`
- Created basic template: `public/templates/call-campaign-basic-template.csv`
- Created advanced template: `public/templates/call-campaign-advanced-template.csv`

### **4. Documentation** ✅
- Created implementation summary: `CALL_CAMPAIGN_IMPLEMENTATION_SUMMARY.md`
- Documented all workflows, algorithms, and UI designs

---

## 🚀 Next Steps (What to Implement)

### **Immediate Next Steps** (Recommended Order)

#### **Step 1: Run Database Migration** 🔴 START HERE
```bash
# Connect to your database
psql $DATABASE_URL

# Run the migration
\i backend/src/migrations/043_add_call_campaigns_and_queue.sql

# Verify tables created
\dt call_campaigns
\dt call_queue
\d users  # Check new columns added
```

#### **Step 2: Create Database Models**
Create these files:
- `backend/src/models/CallCampaign.ts`
- `backend/src/models/CallQueue.ts`

#### **Step 3: Create Services**
Create these files:
- `backend/src/services/callCampaignService.ts`
- `backend/src/services/callQueueService.ts`
- `backend/src/services/queueProcessorService.ts`
- `backend/src/services/csvUploadService.ts`

#### **Step 4: Create API Routes**
Create these files:
- `backend/src/routes/campaignRoutes.ts`
- Update: `backend/src/routes/index.ts` (register routes)

#### **Step 5: Update Webhook Service**
Update: `backend/src/services/webhookService.clean.ts`
- Add queue slot release logic

#### **Step 6: Frontend Components**
Create these files:
- `frontend/src/pages/Campaigns.tsx`
- `frontend/src/components/campaigns/CampaignDashboard.tsx`
- `frontend/src/components/campaigns/CampaignCard.tsx`
- `frontend/src/components/campaigns/CreateCampaignModal.tsx`
- `frontend/src/components/campaigns/BulkCallModal.tsx`
- `frontend/src/components/campaigns/CSVUploadForm.tsx`

#### **Step 7: Update Sidebar**
Update: `frontend/src/components/Sidebar.tsx`
- Add "Call Campaigns" section

---

## 📋 Key Features to Implement

### **Feature 1: Create Campaign from Contacts**
**User Flow**: Select contacts → Open modal → Fill form → Create campaign

**Backend**:
```typescript
POST /api/campaigns/bulk-call
Body: {
  contact_ids: string[],
  agent_id: string,
  next_action: string,
  first_call_time: "09:00",
  last_call_time: "18:00",
  start_date: "2025-10-09",
  campaign_name?: string
}
```

**Frontend**:
- Add "Bulk Call" button to contacts page
- Modal with form (agent, next_action, time_window, start_date)
- Submit → Create campaign → Navigate to campaigns page

### **Feature 2: CSV Upload**
**User Flow**: Upload CSV → Fill campaign settings → Import

**Backend**:
```typescript
POST /api/campaigns/upload-csv
Body: FormData with:
  - file: CSV file
  - campaign_name: string
  - agent_id: string
  - next_action: string
  - first_call_time: string
  - last_call_time: string
  - start_date: string
```

**Frontend**:
- CSV upload dropzone
- Download template links
- Import summary display

### **Feature 3: Campaign Management**
**User Flow**: View campaigns → Edit/Pause/Resume/Cancel

**Backend**:
```typescript
GET    /api/campaigns              // List all
GET    /api/campaigns/:id          // Get one
PATCH  /api/campaigns/:id          // Update
POST   /api/campaigns/:id/pause    // Pause
POST   /api/campaigns/:id/resume   // Resume
POST   /api/campaigns/:id/cancel   // Cancel
DELETE /api/campaigns/:id          // Delete
```

**Frontend**:
- Campaign list with filters (active, scheduled, completed)
- Campaign cards with stats and actions
- Campaign detail page with analytics

### **Feature 4: Queue Processing (Background)**
**Backend**: Background job that runs every 10 seconds

```typescript
// In server.ts or separate worker
setInterval(async () => {
  await queueProcessorService.processQueue();
}, 10000); // 10 seconds
```

**Logic**:
1. Check system concurrency limit
2. Apply round-robin allocation
3. For each allocated user:
   - Get next queued call (priority + FIFO)
   - Check time window
   - Initiate call via Bolna API
   - Update queue status

### **Feature 5: Webhook Integration**
**Update**: `webhookService.clean.ts`

```typescript
// On call completion (call-disconnected, busy, no-answer, failed, cancelled)
async handleCallCompletion(payload) {
  // Existing logic...
  
  // NEW: Free queue slot
  await queueProcessorService.freeQueueSlot(call.user_id);
  
  // NEW: Process next in queue
  await queueProcessorService.processQueue();
}
```

---

## 🎨 UI Reference (Match Existing Style)

### **Colors (Use Existing Tailwind Classes)**
```typescript
// Campaign Status
'draft': 'bg-gray-100 text-gray-700'
'scheduled': 'bg-blue-100 text-blue-700'
'active': 'bg-green-100 text-green-700'
'paused': 'bg-yellow-100 text-yellow-700'
'completed': 'bg-gray-100 text-gray-500'
'cancelled': 'bg-red-100 text-red-700'
```

### **Icons (Use Existing Icon Library)**
```typescript
import { Phone, Calendar, Clock, Users, TrendingUp } from 'lucide-react';
```

### **Components (Use Existing Shadcn)**
```typescript
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog } from '@/components/ui/dialog';
```

---

## 🔍 Testing Checklist

### **Manual Testing**
- [ ] Create campaign from contacts (10 contacts)
- [ ] Upload CSV (20 contacts)
- [ ] View campaign list
- [ ] View campaign details
- [ ] Pause campaign
- [ ] Resume campaign
- [ ] Cancel campaign
- [ ] Check queue updates in real-time
- [ ] Verify time window respected (no calls outside window)
- [ ] Verify concurrency limits (user and system)
- [ ] Verify round-robin allocation (multiple users)
- [ ] Verify priority (named contacts called first)

### **Edge Cases**
- [ ] Campaign with 1 contact
- [ ] Campaign with 100+ contacts
- [ ] Multiple users with campaigns simultaneously
- [ ] System limit reached
- [ ] User limit reached
- [ ] Time window crosses midnight
- [ ] Campaign scheduled for future date
- [ ] Delete contact while in queue
- [ ] Delete agent with active campaign

---

## 📞 Support & Questions

If you need help implementing any part:

1. **Database Issues**: Check migration file, verify connections
2. **Service Logic**: Refer to CALL_CAMPAIGN_IMPLEMENTATION_SUMMARY.md
3. **UI Components**: Follow existing patterns in contacts/agents pages
4. **API Integration**: Check existing API patterns in callService.ts

---

## 🎯 Success Metrics

Once implemented, verify:
- ✅ User can create campaign in < 2 minutes
- ✅ CSV upload processes 100 contacts in < 30 seconds
- ✅ Queue processes calls within 10 seconds of slot availability
- ✅ Time window respected 100% of the time
- ✅ Concurrency limits never exceeded
- ✅ Campaign analytics update in real-time

---

## 🚦 Current Status

**Phase 1 Complete**: ✅ Database schema, types, templates, documentation  
**Phase 2 Next**: 🔴 Models, services, API endpoints  
**Phase 3 After**: 🟡 Frontend components  
**Phase 4 Final**: 🟡 Testing and optimization  

**Estimated Time to Complete**: 3-5 days (full implementation)

---

**Ready to Start?** 🚀

Run the database migration first, then I can help you implement the models and services!

```bash
# Start here:
psql $DATABASE_URL -f backend/src/migrations/043_add_call_campaigns_and_queue.sql
```

Then let me know when you're ready for the next step!
