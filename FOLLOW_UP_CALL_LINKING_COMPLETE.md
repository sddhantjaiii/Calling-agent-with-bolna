# Follow-Up Call Linking Implementation - Complete

## Summary
Implemented a system to link follow-ups to specific calls. When creating a follow-up from the lead intelligence page, it automatically links to the most recent call for that lead. One lead can have multiple follow-ups for different calls.

## Database Changes

### Migration: 052_add_call_id_to_followups.sql
```sql
-- Add call_id column with foreign key to calls table
ALTER TABLE follow_ups
ADD COLUMN call_id UUID REFERENCES calls(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX idx_follow_ups_call_id ON follow_ups(call_id);

-- Add comment to document the column
COMMENT ON COLUMN follow_ups.call_id IS 'Reference to the specific call that triggered this follow-up';
```

**Key Points:**
- `call_id` is optional (nullable) - follow-ups can exist without being linked to a call
- Uses `ON DELETE SET NULL` - if the call is deleted, follow-up remains but loses the link
- Indexed for performance when querying follow-ups by call

## Backend Changes

### 1. LeadsController (`backend/src/controllers/leadsController.ts`)

#### Updated `createFollowUp` method:
```typescript
async createFollowUp(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { leadPhone, leadEmail, leadName, followUpDate, remark, callId } = req.body;
  
  const followUp = await this.createFollowUpInDB({
    userId,
    leadPhone,
    leadEmail,
    leadName,
    followUpDate: new Date(followUpDate),
    remark,
    createdBy: userId,
    callId: callId || null  // ✅ NEW: Accept callId from request
  });
}
```

#### Updated `createFollowUpInDB` helper:
```typescript
private async createFollowUpInDB(data: any): Promise<any> {
  const query = `
    INSERT INTO follow_ups (
      user_id, lead_phone, lead_email, lead_name, 
      follow_up_date, remark, created_by,
      call_id  -- ✅ NEW: Include call_id in insert
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *;
  `;
  
  const result = await pool.query(query, [
    data.userId,
    data.leadPhone || null,
    data.leadEmail || null,
    data.leadName || null,
    data.followUpDate,
    data.remark || null,
    data.createdBy,
    data.callId || null  // ✅ NEW: Pass callId to database
  ]);
  
  return {
    // ... other fields
    callId: result.rows[0].call_id  // ✅ NEW: Return callId
  };
}
```

### 2. LeadIntelligenceController (`backend/src/controllers/leadIntelligenceController.ts`)

#### Updated LeadTimelineEntry interface:
```typescript
export interface LeadTimelineEntry {
  // ... existing fields
  followUpDate?: string;
  followUpRemark?: string;
  followUpStatus?: string;
  followUpCompleted?: boolean;
  followUpCallId?: string;  // ✅ NEW: Shows which call triggered the follow-up
}
```

#### Updated Timeline SQL Queries:

**Phone Timeline:**
```sql
SELECT 
  -- ... other fields
  fu.follow_up_date,
  fu.remark as follow_up_remark,
  fu.follow_up_status,
  fu.is_completed as follow_up_completed,
  fu.call_id as follow_up_call_id  -- ✅ NEW
FROM calls c
LEFT JOIN follow_ups fu ON fu.lead_phone = c.phone_number AND fu.user_id = $1
```

**Email Timeline:**
```sql
SELECT 
  -- ... other fields
  fu.call_id as follow_up_call_id  -- ✅ NEW
FROM calls c
LEFT JOIN follow_ups fu ON fu.lead_email = la.extracted_email AND fu.user_id = $1
```

**Individual Timeline:**
```sql
SELECT 
  -- ... other fields
  NULL as follow_up_call_id  -- ✅ NEW: No follow-up for individual calls
FROM calls c
```

#### Updated Response Mapper:
```typescript
const timeline: LeadTimelineEntry[] = result.rows.map(row => ({
  // ... existing fields
  followUpDate: row.follow_up_date,
  followUpRemark: row.follow_up_remark,
  followUpStatus: row.follow_up_status,
  followUpCompleted: row.follow_up_completed,
  followUpCallId: row.follow_up_call_id,  // ✅ NEW
}));
```

## Frontend Changes

### 1. LeadIntelligence Component (`Frontend/src/components/dashboard/LeadIntelligence.tsx`)

#### Updated Interfaces:

**LeadTimelineEntry:**
```typescript
interface LeadTimelineEntry {
  id: string;
  interactionAgent: string;
  interactionDate: string;
  platform: string;
  phoneNumber?: string;
  callStatus?: string;
  callLifecycleStatus?: string;
  companyName?: string;
  status: string;
  useCase: string;
  duration?: string;
  
  // ✅ NEW: Analytics fields
  extractedName?: string;
  extractedEmail?: string;
  totalScore?: number;
  intentScore?: number;
  urgencyScore?: number;
  budgetScore?: number;
  fitScore?: number;
  engagementScore?: number;
  
  // ✅ NEW: CTA interactions
  ctaPricingClicked?: boolean;
  ctaDemoClicked?: boolean;
  ctaFollowupClicked?: boolean;
  ctaSampleClicked?: boolean;
  ctaEscalatedToHuman?: boolean;
  
  // ✅ NEW: Follow-up fields
  followUpDate?: string;
  followUpRemark?: string;
  followUpStatus?: string;
  followUpCompleted?: boolean;
  followUpCallId?: string;  // Link to call
}
```

**CreateFollowUpRequest:**
```typescript
interface CreateFollowUpRequest {
  leadPhone?: string;
  leadEmail?: string;
  leadName?: string;
  followUpDate: string;
  remark?: string;
  callId?: string;  // ✅ NEW: Link to specific call
}
```

#### Updated `handleSaveFollowUp`:
```typescript
const handleSaveFollowUp = async () => {
  if (followUpDate && currentFollowUpContact) {
    try {
      // ✅ NEW: Get the most recent call ID from timeline
      const mostRecentCall = timeline.length > 0 ? timeline[0] : null;
      
      const followUpData: CreateFollowUpRequest = {
        leadPhone: currentFollowUpContact.phone,
        leadEmail: currentFollowUpContact.email,
        leadName: currentFollowUpContact.name,
        followUpDate: format(followUpDate, 'yyyy-MM-dd'),
        remark: followUpRemark || undefined,
        callId: mostRecentCall?.id  // ✅ NEW: Link to most recent call
      };

      await createFollowUp(followUpData);
      // ... rest of the code
    }
  }
};
```

## How It Works

### 1. **Creating a Follow-up from Lead Intelligence**

**User Flow:**
1. User views lead intelligence table
2. Clicks "Schedule Follow-up" button for a lead
3. System fetches timeline for that lead
4. Most recent call is automatically selected
5. When saving follow-up, `callId` is sent to backend

**API Request:**
```json
POST /api/follow-ups
{
  "leadPhone": "+918979556941",
  "leadEmail": "user@example.com",
  "leadName": "John Doe",
  "followUpDate": "2025-11-10",
  "remark": "Call back after 2 PM",
  "callId": "13f904b7-39a0-47a8-a473-808938f93741"  // Most recent call
}
```

### 2. **Viewing Follow-ups in Timeline**

**Timeline Response:**
```json
[
  {
    "id": "13f904b7-39a0-47a8-a473-808938f93741",
    "interactionAgent": "My New Agent",
    "interactionDate": "2025-11-08T12:35:52.478Z",
    "platform": "Phone",
    "phoneNumber": "+91 8979556941",
    "callStatus": "failed",
    "callLifecycleStatus": "no-answer",
    "status": "no-answer",
    "useCase": "No summary available",
    "duration": "00:00",
    "followUpDate": "2025-11-10",
    "followUpRemark": "Call back after 2 PM",
    "followUpStatus": "pending",
    "followUpCompleted": false,
    "followUpCallId": "13f904b7-39a0-47a8-a473-808938f93741"  // ✅ Links back to this call
  }
]
```

### 3. **Multiple Follow-ups per Lead**

**Scenario:** Lead has 3 calls, follow-ups created after each call

```
Lead: +918979556941

Call 1 (Nov 1): Status = "completed"
  └─ Follow-up 1: "Ask about pricing" (callId = call_1)
  
Call 2 (Nov 3): Status = "failed", Lifecycle = "busy"  
  └─ Follow-up 2: "Try again tomorrow" (callId = call_2)
  
Call 3 (Nov 8): Status = "failed", Lifecycle = "no-answer"
  └─ Follow-up 3: "Call back after 2 PM" (callId = call_3)
```

**Database:**
```sql
SELECT * FROM follow_ups WHERE lead_phone = '+918979556941';

-- Result:
-- id  | call_id | follow_up_date | remark
-- 001 | call_1  | 2025-11-02     | "Ask about pricing"
-- 002 | call_2  | 2025-11-04     | "Try again tomorrow"
-- 003 | call_3  | 2025-11-10     | "Call back after 2 PM"
```

## Benefits

### 1. **Call Traceability**
- Know exactly which call prompted each follow-up
- Track follow-up effectiveness per call type (answered, no-answer, busy)

### 2. **Better Context**
- When viewing follow-up, see the original call details
- Understand what happened in the call that led to follow-up

### 3. **Analytics Opportunities**
- Analyze which call outcomes require more follow-ups
- Track conversion rates by follow-up call type
- Measure time between call and follow-up action

### 4. **Flexible System**
- Follow-ups can exist without calls (manual entry)
- One lead can have multiple follow-ups for different calls
- Deleting a call doesn't delete the follow-up (just removes link)

## Database Relationships

```
┌─────────────┐         ┌──────────────┐
│   calls     │         │  follow_ups  │
├─────────────┤         ├──────────────┤
│ id (PK)     │◄────────│ call_id (FK) │
│ user_id     │         │ id (PK)      │
│ phone_number│         │ user_id      │
│ status      │         │ lead_phone   │
│ ...         │         │ lead_email   │
└─────────────┘         │ follow_up_date│
                        │ remark       │
                        │ is_completed │
                        └──────────────┘

Relationship: One call can have many follow-ups (1:N)
Foreign Key: follow_ups.call_id → calls.id (ON DELETE SET NULL)
```

## API Endpoints

### Create Follow-up
**POST** `/api/follow-ups`

**Request Body:**
```json
{
  "leadPhone": "+918979556941",
  "leadEmail": "user@example.com",
  "leadName": "John Doe",
  "followUpDate": "2025-11-10",
  "remark": "Call back after 2 PM",
  "callId": "13f904b7-39a0-47a8-a473-808938f93741"  // Optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "follow_up_uuid",
    "userId": "user_uuid",
    "leadPhone": "+918979556941",
    "leadEmail": "user@example.com",
    "leadName": "John Doe",
    "followUpDate": "2025-11-10",
    "remark": "Call back after 2 PM",
    "isCompleted": false,
    "callId": "13f904b7-39a0-47a8-a473-808938f93741",
    "createdAt": "2025-11-08T12:00:00Z"
  }
}
```

### Get Timeline (includes follow-up info)
**GET** `/api/lead-intelligence/:groupId/timeline`

**Response:** (See Timeline Response example above)

## Testing

### 1. Run Migration
```bash
cd backend
psql -U postgres -d calling_agent_db -f src/migrations/052_add_call_id_to_followups.sql
```

### 2. Test Follow-up Creation
```bash
# Create follow-up with call link
curl -X POST http://localhost:3000/api/follow-ups \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "leadPhone": "+918979556941",
    "followUpDate": "2025-11-10",
    "remark": "Test follow-up",
    "callId": "13f904b7-39a0-47a8-a473-808938f93741"
  }'
```

### 3. Verify Timeline
```bash
# Check timeline includes follow-up data
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/lead-intelligence/phone_+918979556941/timeline
```

### 4. Verify Database
```sql
-- Check follow-ups have call_id
SELECT id, lead_phone, call_id, follow_up_date, remark 
FROM follow_ups 
WHERE lead_phone = '+918979556941';

-- Verify foreign key relationship
SELECT 
  fu.id as followup_id,
  fu.remark,
  c.id as call_id,
  c.status as call_status,
  c.call_lifecycle_status
FROM follow_ups fu
LEFT JOIN calls c ON fu.call_id = c.id
WHERE fu.lead_phone = '+918979556941';
```

## Frontend Display Enhancement Needed

The backend is correctly returning all fields, but the frontend timeline display needs to be updated to show:

1. **Call Status Badge** - Show callLifecycleStatus for failed calls
2. **Analytics Scores** - Display intent, urgency, budget, fit, engagement scores
3. **CTA Interactions** - Show which CTAs were clicked
4. **Follow-up Info** - Display follow-up date, remark, and link to originating call
5. **Extracted Data** - Show extracted name, email, company

**Recommended UI Components:**
- Score progress bars for analytics
- Badge components for call status
- Collapsible sections for detailed info
- Link to jump to the call that created the follow-up

## Files Modified

### Backend:
1. ✅ `backend/src/migrations/052_add_call_id_to_followups.sql` - New migration
2. ✅ `backend/src/controllers/leadsController.ts` - Accept and store callId
3. ✅ `backend/src/controllers/leadIntelligenceController.ts` - Return followUpCallId in timeline

### Frontend:
4. ✅ `Frontend/src/components/dashboard/LeadIntelligence.tsx` - Pass callId when creating follow-up, update interfaces

## Status
✅ **BACKEND COMPLETE** - All API endpoints updated, timeline returns full data
🔄 **FRONTEND DISPLAY** - UI components need enhancement to show all the new fields
⏳ **MIGRATION PENDING** - Need to run migration to add call_id column

## Next Steps
1. **Run Migration:** Execute `052_add_call_id_to_followups.sql` on database
2. **Enhance Timeline UI:** Create components to display all the new timeline fields
3. **Add Follow-up Badge:** Show which calls have associated follow-ups
4. **Test End-to-End:** Create follow-up → verify it appears in timeline with call link
