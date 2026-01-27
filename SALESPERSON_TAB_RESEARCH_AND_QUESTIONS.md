# Salesperson Tab - Deep Research & Implementation Questions

## 📋 PRD Summary
Add a **Salesperson tab** (new) - A separate space to track human sales team performance, just like calling/chat agents:

### Required Features:
1. **KPIs**: calls made, leads assigned, follow-ups assigned/done, etc.
2. **Filters by salesperson**
3. **Ability to see salesperson-wise logs and follow-up status**

---

## 🔍 Deep Research Findings

### 1. **Existing Team Members Infrastructure** ✅

I found that the system **already has a `team_members` table** with full implementation:

#### Database Schema (`team_members` table):
```sql
CREATE TABLE team_members (
    id UUID PRIMARY KEY,
    tenant_user_id UUID NOT NULL REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'agent',  -- manager/agent/viewer
    is_active BOOLEAN NOT NULL DEFAULT true,
    invite_token VARCHAR(255),
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

#### Roles Available:
- **Manager**: Full access to all leads and campaigns. Can manage team members
- **Agent**: Can only view and edit leads assigned to them
- **Viewer**: Read-only access

#### Existing Features:
- ✅ Team member invite system
- ✅ Authentication via `team_member_sessions` table
- ✅ Role-based access control
- ✅ Lead assignment to team members (`lead_analytics.assigned_to_team_member_id`)
- ✅ Activity tracking in `lead_intelligence_events` table
- ✅ Frontend UI in Settings → Team Management
- ✅ Backend APIs: `/api/team-members/*`

---

### 2. **Lead Assignment System** ✅

The system tracks which leads are assigned to which team member:

```sql
-- lead_analytics table has:
assigned_to_team_member_id UUID REFERENCES team_members(id)

-- Relationship:
Lead → assigned_to_team_member_id → team_members → name/role
```

**Current Usage:**
- Leads can be assigned to team members
- Team members with "agent" role can only see their assigned leads
- Displayed in LeadIntelligence UI with assignedTo object

---

### 3. **Follow-ups Tracking** ✅

Follow-ups are stored in `follow_ups` table:

```sql
CREATE TABLE follow_ups (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    lead_phone VARCHAR(20) NOT NULL,
    lead_name VARCHAR(255),
    follow_up_date DATE NOT NULL,
    remark TEXT,
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP,
    completed_by UUID REFERENCES users(id),
    follow_up_status VARCHAR(20) DEFAULT 'pending',  -- pending/completed/cancelled
    call_id UUID  -- Linked to specific call
);
```

**Key Insight:** 
- Follow-ups are currently linked to **user_id** (tenant owner), NOT team_member_id
- No direct tracking of which team member created/completed follow-ups
- `completed_by` field exists but references `users` table, not `team_members`

---

### 4. **Activity & Event Tracking** ✅

`lead_intelligence_events` table tracks all team member actions:

```sql
CREATE TABLE lead_intelligence_events (
    id UUID PRIMARY KEY,
    tenant_user_id UUID NOT NULL,
    phone_number VARCHAR(50),
    actor_type VARCHAR(20) NOT NULL,  -- owner/team_member/ai/system
    actor_id UUID,  -- team_member.id for team members
    actor_name VARCHAR(255) NOT NULL,
    event_type VARCHAR(50) NOT NULL,  -- edit/assign/note/status_change/call/email/meeting
    field_changes JSONB DEFAULT '{}',
    created_at TIMESTAMP
);
```

**This tracks:**
- Manual edits by team members
- Lead assignments
- Notes added
- Status changes

---

### 5. **Existing Analytics Infrastructure** ✅

Currently, there's `agent_analytics` table for AI agents:

```sql
CREATE TABLE agent_analytics (
    id UUID PRIMARY KEY,
    agent_id UUID NOT NULL REFERENCES agents(id),
    user_id UUID NOT NULL,
    date DATE NOT NULL,
    hour INTEGER,
    total_calls INTEGER DEFAULT 0,
    successful_calls INTEGER DEFAULT 0,
    leads_generated INTEGER DEFAULT 0,
    qualified_leads INTEGER DEFAULT 0,
    -- ... more metrics
);
```

**Pattern:** Daily/hourly aggregation of agent performance metrics

---

## ❓ Critical Questions Before Implementation

### Question 1: **Team Member vs Salesperson Terminology**
The database uses `team_members` with roles (manager/agent/viewer). The PRD mentions "Salesperson".

**Question:** 
- Should we treat "Salesperson" as a **new role** in `team_members` table? (e.g., add 'salesperson' role)
- OR should we create a **separate `salespersons` table** entirely?
- OR should "Salesperson" just be a **filter/view** showing team_members with role='agent'?

**Recommendation:** Likely we should **reuse team_members with role='agent'** and just add a dedicated "Salesperson" tab that filters/displays agent metrics.

---

### Question 2: **What "Calls Made" Means for Human Salespersons?**
The system has:
- AI agent calls tracked in `calls` table with `agent_id` (Bolna AI agents)
- No tracking of **human-initiated calls** by team members

**Questions:**
- Are salespersons making **outbound calls manually** (outside the AI system)?
- Do we need to track **manual call logs** for team members?
- OR should we track calls they **initiated via the platform** (if this exists)?
- OR should "calls made" refer to **calls assigned to them** that they followed up on?

**Clarification Needed:** How do salespersons make calls in your workflow?

---

### Question 3: **Follow-ups Assignment Tracking**
Currently, `follow_ups` table has:
- `user_id` - tenant owner who owns the follow-up
- `completed_by` - who marked it complete (currently references users, not team_members)
- NO field for "assigned_to_team_member_id"

**Questions:**
- Should follow-ups be **assignable to team members**?
- Do we need to add `assigned_to_team_member_id` column to `follow_ups` table?
- Should "follow-ups assigned" mean:
  - Follow-ups they **created**?
  - Follow-ups **assigned to them** to complete?
  - Follow-ups for **leads assigned to them**?

**Recommendation:** Add `assigned_to_team_member_id` to `follow_ups` table for proper tracking.

---

### Question 4: **KPI Definitions - What to Track?**
PRD mentions: "calls made, leads assigned, follow-ups assigned/done, etc."

**Proposed KPIs for Salesperson Tab:**

#### Core Metrics:
1. **Leads Assigned** - Count of leads where `lead_analytics.assigned_to_team_member_id = salesperson_id`
2. **Follow-ups Assigned** - Count of follow-ups assigned to this salesperson
3. **Follow-ups Done** - Count of completed follow-ups (is_completed=true OR follow_up_status='completed')
4. **Active Leads** - Current assigned leads with lead_stage != 'closed'

#### Call-Related Metrics (Need Clarification):
5. **Calls Made** - How to track? (see Question 2)
6. **Calls Connected** - Subset of calls made that connected
7. **Average Call Duration** - If tracking manual calls

#### Interaction Metrics:
8. **Lead Edits** - Count from `lead_intelligence_events` where actor_id = team_member_id, event_type='edit'
9. **Notes Added** - Count from `lead_intelligence_events` where actor_id = team_member_id, event_type='note'
10. **Status Changes** - Count of lead stage changes

#### Conversion Metrics:
11. **Qualified Leads** - Assigned leads with high scores (total_score >= 70)
12. **Demo Scheduled** - Leads assigned to them with demo_book_datetime set
13. **Converted to Customer** - Leads converted (requires customers table link)

**Question:** Which of these KPIs are most important? Any missing?

---

### Question 5: **Data Aggregation - Daily/Hourly?**
Looking at `agent_analytics` pattern, it stores daily + hourly aggregates.

**Questions:**
- Should we create a **`team_member_analytics`** table similar to `agent_analytics`?
- Should it aggregate daily? Hourly? Or just real-time query?
- Should we use **materialized views** for performance?

**Schema Proposal:**
```sql
CREATE TABLE team_member_analytics (
    id UUID PRIMARY KEY,
    team_member_id UUID NOT NULL REFERENCES team_members(id),
    tenant_user_id UUID NOT NULL REFERENCES users(id),
    date DATE NOT NULL,
    -- KPIs
    leads_assigned_count INTEGER DEFAULT 0,
    leads_active_count INTEGER DEFAULT 0,
    follow_ups_assigned_count INTEGER DEFAULT 0,
    follow_ups_completed_count INTEGER DEFAULT 0,
    lead_edits_count INTEGER DEFAULT 0,
    notes_added_count INTEGER DEFAULT 0,
    calls_made_count INTEGER DEFAULT 0,  -- If applicable
    qualified_leads_count INTEGER DEFAULT 0,
    demos_scheduled_count INTEGER DEFAULT 0,
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(team_member_id, date)
);
```

---

### Question 6: **Logs & Timeline - What to Show?**
PRD mentions: "Ability to see salesperson-wise logs and follow-up status"

**Questions:**
- Should we show **all lead_intelligence_events** for that salesperson?
- Should we show **call timeline** for leads assigned to them?
- Should we show **follow-up timeline** specific to them?
- Should logs be paginated or infinite scroll?

**Proposed UI:**
```
┌─────────────────────────────────────────────────────────┐
│ Salesperson: John Doe (Agent)                          │
│ Period: Last 30 days                          [Filter] │
├─────────────────────────────────────────────────────────┤
│ KPIs:                                                   │
│ 📋 Leads Assigned: 45    ✅ Follow-ups Done: 32/40    │
│ 📞 Calls Made: 28        📈 Qualified Leads: 12       │
├─────────────────────────────────────────────────────────┤
│ Activity Timeline:                                      │
│ ─────────────────────────────────────────────────────── │
│ ✏️ 2h ago - Edited lead "ABC Corp" (Budget High)      │
│ 📞 4h ago - Follow-up completed for "XYZ Ltd"          │
│ 📝 1d ago - Added note to "Tech Startup Inc"          │
│ 🎯 2d ago - Lead assigned "New Lead Co"                │
└─────────────────────────────────────────────────────────┘
```

---

### Question 7: **Filters - What Options?**
PRD: "Filters by salesperson"

**Questions:**
- Filter by **date range** (last 7/30/90 days)?
- Filter by **team member** (dropdown of all team members with role='agent')?
- Filter by **lead status** (active/qualified/closed)?
- Filter by **follow-up status** (pending/completed)?
- Filter by **activity type** (all/edits/calls/notes)?

---

### Question 8: **Where to Place This Tab?**
**Frontend Location Options:**

1. **Option A:** New top-level tab in main dashboard
   - Path: `/dashboard/salesperson`
   - Same level as Leads, Contacts, Campaigns

2. **Option B:** Sub-tab under existing section
   - Path: `/dashboard/analytics/salesperson`
   - Under Analytics section

3. **Option C:** Extend Team Management
   - Path: `/settings/team-management` → Add "Performance" tab
   - Click team member → See their analytics

**Question:** Which approach fits your UX vision?

**Recommendation:** Option A for visibility and parity with "calling/chat agents" tabs.

---

### Question 9: **Permissions & Access Control**
**Questions:**
- Who can see the Salesperson tab?
  - **Only tenant owner (user)**?
  - **Managers** (team members with role='manager')?
  - **Each salesperson sees only their own** stats?
  
- Should salespersons be able to see:
  - Their own performance only?
  - Compare with other salespersons (leaderboard)?

**Recommendation:** 
- Tenant owner + managers: See ALL salespersons
- Agent role: See only their own stats (if they have access)

---

### Question 10: **Real-time vs Batch Updates?**
**Questions:**
- Should analytics update **real-time** (on every action)?
- OR should we run **daily batch jobs** to aggregate?
- OR use **database triggers** to update counters?

**Trade-offs:**
- Real-time: Accurate but heavy queries
- Batch: Efficient but delayed data
- Triggers: Good middle ground

---

## 🎯 Proposed Implementation Approach

### Phase 1: Database Schema Updates
1. Add `assigned_to_team_member_id` to `follow_ups` table
2. Create `team_member_analytics` table for aggregated metrics
3. Add indexes for performance

### Phase 2: Backend APIs
1. `GET /api/team-members/analytics` - Get all salespersons' KPIs
2. `GET /api/team-members/:id/analytics` - Get specific salesperson KPIs
3. `GET /api/team-members/:id/activity-log` - Get activity timeline
4. Add filters: date range, team member ID, activity type

### Phase 3: Analytics Aggregation Service
1. Create service to calculate metrics from raw data
2. Decide: Real-time calculation vs pre-aggregated table
3. Implement caching if needed

### Phase 4: Frontend UI
1. Create `SalespersonTab.tsx` component
2. Add route `/dashboard/salesperson`
3. Implement KPI cards
4. Implement activity timeline
5. Implement filters

### Phase 5: Testing & Optimization
1. Test with multiple team members
2. Performance optimization
3. Add pagination for logs

---

## 🚨 Blocker Questions (MUST ANSWER BEFORE CODING)

1. **What does "calls made" mean for human salespersons?** (See Question 2)
2. **Should follow-ups be assignable to team members?** (See Question 3)
3. **Which KPIs are priority?** (See Question 4)
4. **Where should the Salesperson tab be placed in UI?** (See Question 8)
5. **Who can access this tab - permissions?** (See Question 9)

---

## 💡 My Recommendations Summary

1. **Reuse `team_members` table** - Don't create separate salespersons table
2. **Add `assigned_to_team_member_id` to `follow_ups`** - Essential for tracking
3. **Create `team_member_analytics` table** - For efficient querying
4. **Use daily aggregation** - Balance between accuracy and performance
5. **Place as top-level tab** - Better visibility
6. **Start with core KPIs** - Leads assigned, follow-ups done, activity count
7. **Owner + Manager access** - Agents see only their own

---

## 📁 Relevant Files to Modify

### Database:
- Create new migration: `backend/src/migrations/XXXX_add_salesperson_analytics.sql`

### Backend:
- `backend/src/models/TeamMember.ts` - Extend if needed
- `backend/src/controllers/teamMemberController.ts` - Add analytics endpoints
- `backend/src/services/teamMemberAnalyticsService.ts` - NEW SERVICE
- `backend/src/routes/teamMembers.ts` - Add new routes

### Frontend:
- `Frontend/src/components/dashboard/SalespersonTab.tsx` - NEW COMPONENT
- `Frontend/src/services/apiService.ts` - Add API methods
- `Frontend/src/hooks/useSalespersonAnalytics.ts` - NEW HOOK
- `Frontend/src/App.tsx` or router - Add new route

---

## ⏭️ Next Steps

**Please answer the blocker questions above so I can:**
1. Design the exact database schema
2. Define the precise KPIs to track
3. Create the API contracts
4. Build the UI mockup
5. Start implementation

Let me know your answers and any additional requirements! 🎯
