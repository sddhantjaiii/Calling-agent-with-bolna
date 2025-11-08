# API Endpoint Cleanup - Lead Intelligence Duplication

## Problem
There were **two different controllers** handling lead intelligence with slightly different logic:

1. **LeadsController** (`leadsController.ts`)
   - Route: `/api/leads/intelligence` (plural)
   - Was updated with lifecycle status fix
   - **NOT being used** by the frontend

2. **LeadIntelligenceController** (`leadIntelligenceController.ts`)
   - Route: `/api/lead-intelligence` (singular)  
   - Was using SQL queries
   - **Actually being used** by the frontend

## Solution

### Fixed the Active Controller
✅ **Updated `LeadIntelligenceController`** with the call lifecycle status logic:
- Modified SQL CASE statements in all three CTEs (phone_leads, email_leads, individual_leads)
- Now shows `call_lifecycle_status` for failed calls without analytics

### Cleaned Up Duplicate Code

#### 1. Removed Routes (`backend/src/routes/leads.ts`)
**Removed:**
```typescript
router.get('/intelligence', ...) // Removed
router.get('/intelligence/:groupId/timeline', ...) // Removed
```

**Added Note:**
```typescript
/**
 * Note: Lead Intelligence endpoints moved to /api/lead-intelligence
 * See leadIntelligence.ts route and LeadIntelligenceController
 */
```

#### 2. Marked Methods as Deprecated (`backend/src/controllers/leadsController.ts`)
Added `@deprecated` JSDoc comments to:
- `getLeadIntelligence()` 
- `getLeadIntelligenceTimeline()`

These methods are kept in the code for reference but are no longer routed.

## Active Endpoints (After Cleanup)

### Lead Intelligence (via LeadIntelligenceController)
- **GET** `/api/lead-intelligence` - Get grouped leads
- **GET** `/api/lead-intelligence/:groupId/timeline` - Get timeline for a lead group

### Other Lead Endpoints (via LeadsController) 
- **GET** `/api/leads` - Get all leads for unified logs
- **GET** `/api/leads/analytics` - Get lead analytics
- **GET** `/api/leads/:id` - Get single lead details
- **GET** `/api/leads/:id/timeline` - Get lead timeline
- **GET** `/api/leads/:id/profile` - Get lead profile

## Files Modified
1. `backend/src/controllers/leadIntelligenceController.ts` - ✅ Fixed (active)
2. `backend/src/routes/leads.ts` - ✅ Routes removed
3. `backend/src/controllers/leadsController.ts` - ✅ Methods marked as deprecated

## Why Keep Both Controllers?

Even though we removed the duplicate lead intelligence methods, we keep both controller files because:

- **LeadsController** - Handles general lead operations (getLeads, getLead, getLeadProfile, etc.)
- **LeadIntelligenceController** - Specialized for the Lead Intelligence view with optimized SQL queries

## Testing
Your frontend is already using the correct endpoint `/api/lead-intelligence`, so no frontend changes needed.

The response should now show:
```json
{
  "recentLeadTag": "no-answer"  // or "busy", etc. instead of "Cold"
}
```
