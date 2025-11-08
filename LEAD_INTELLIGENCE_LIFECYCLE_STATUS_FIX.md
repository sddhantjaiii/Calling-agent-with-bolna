# Lead Intelligence Display Fix - Call Lifecycle Status

## Problem
In the Lead Intelligence view, calls with `status = 'failed'` (not answered, busy, etc.) were showing "Cold" as the Recent Lead Tag instead of showing meaningful status information like "no-answer" or "busy" from the `call_lifecycle_status` field.

## Root Cause
1. Failed calls don't generate lead analytics because the conversation never happened
2. The default fallback was "Cold" for all calls without analytics
3. The `call_lifecycle_status` field contains useful information (no-answer, busy, ringing, etc.) but wasn't being used

## Solution Implemented

### 1. Updated Call Model (`backend/src/models/Call.ts`)
**Added `call_lifecycle_status` to query and mapping:**
- Updated `findByUserId()` to include lead analytics in the JOIN query
- Added `call_lifecycle_status` field to `mapRowWithAnalytics()` helper
- Now fetches individual lead analytics (not complete analysis) for each call

```typescript
// Added to SELECT query
SELECT c.*, ..., la.lead_status_tag, ...
LEFT JOIN lead_analytics la ON c.id = la.call_id AND la.analysis_type = 'individual'

// Added to mapping
call_lifecycle_status: row.call_lifecycle_status
```

### 2. Updated Lead Intelligence Logic (`backend/src/controllers/leadsController.ts`)

**Modified `getLeadIntelligence()` method:**

#### Initial Tag Assignment (when creating new lead group):
```typescript
let initialLeadTag = 'Cold';
if (call.status === 'failed' && !call.lead_analytics?.lead_status_tag) {
  // For failed calls without analytics, show the call lifecycle status
  initialLeadTag = call.call_lifecycle_status || 'Not Connected';
} else if (call.lead_analytics?.lead_status_tag) {
  initialLeadTag = call.lead_analytics.lead_status_tag;
}
```

#### Tag Updates (when processing additional calls in the group):
- **Key Fix**: Only update `recentLeadTag` if the current call is MORE RECENT than previous calls
- Prevents older calls from overriding the status of newer calls
- Uses same logic: analytics > lifecycle_status > existing tag

```typescript
const isMoreRecent = new Date(call.created_at) > new Date(leadGroup.lastContact);
if (isMoreRecent) {
  leadGroup.lastContact = call.created_at;
  
  if (call.lead_analytics?.lead_status_tag) {
    leadGroup.recentLeadTag = call.lead_analytics.lead_status_tag;
  } else if (call.status === 'failed' && call.call_lifecycle_status) {
    leadGroup.recentLeadTag = call.call_lifecycle_status;
  }
}
```

### 3. Applied Same Fix to Other Methods
Updated the same logic in:
- `getLeads()` - Unified call logs
- `getLead()` - Single lead details
- `getLeadProfile()` - Lead profile tab

## Expected Behavior

### Before Fix:
```json
{
  "phone": "+91 8979556941",
  "recentLeadTag": "Cold",  // ❌ Not helpful
  "status": "failed"
}
```

### After Fix:
```json
{
  "phone": "+91 8979556941",
  "recentLeadTag": "no-answer",  // ✅ Shows actual call status
  "status": "failed"
}
```

## Call Lifecycle Status Values
From the database, possible values include:
- `no-answer` - Call went to voicemail or wasn't picked up
- `busy` - Line was busy
- `ringing` - Call is still ringing
- `in-progress` - Call is ongoing
- `completed` - Call finished successfully
- `call-disconnected` - Call was disconnected
- `initiated` - Call was just started

## Priority Logic
The system now uses this priority for determining the Recent Lead Tag:

1. **Highest Priority**: `lead_analytics.lead_status_tag` (Hot/Warm/Cold from AI analysis)
   - Only available for completed calls with successful conversations
   
2. **Medium Priority**: `call_lifecycle_status` (no-answer/busy/etc.)
   - Used when call status is 'failed' and no analytics exist
   
3. **Lowest Priority**: "Cold" (default fallback)
   - Only used when neither of the above are available

## Files Modified
1. `backend/src/models/Call.ts`
   - Updated `findByUserId()` query
   - Updated `mapRowWithAnalytics()` mapping

2. `backend/src/controllers/leadsController.ts`
   - Updated `getLeadIntelligence()` - Lead Intelligence view
   - Updated `getLeads()` - Unified call logs
   - Updated `getLead()` - Single lead details
   - Updated `getLeadProfile()` - Lead profile tab

## Testing
Run the check script to verify call data:
```bash
cd backend
node check-calls.js
```

This will show:
- Call status (failed/completed)
- Call lifecycle status (no-answer/busy/etc.)
- Whether lead analytics exist

## Debug Logging
Added detailed logging to trace the tag selection:
- Logs when using lifecycle status
- Logs when using analytics tag
- Logs when using default
- Logs tag updates and whether they're from the most recent call

Check backend logs when loading Lead Intelligence to see the decision process.
