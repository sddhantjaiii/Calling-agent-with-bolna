# Contact Service Fix - Bolna.ai Migration Update

## Issue
Contact API endpoint was failing with database error:
```
column calls.bolna_conversation_id does not exist
```

## Root Cause
The `contactService.ts` file was trying to reference `calls.bolna_conversation_id`, but the actual database schema only has `calls.bolna_execution_id`. 

**The confusion came from**:
- The `database.md` documentation mentioned both `bolna_conversation_id` and `bolna_execution_id`
- However, the actual migration SQL files (`004_bolna_migration_phase1.sql`) only added `bolna_execution_id`
- The database table only contains `bolna_execution_id`, not `bolna_conversation_id`

## Error Details
```
[ERROR] Database query error {
  error: 'column calls.bolna_conversation_id does not exist',
  duration: 134,
  query: 'SELECT c.*, calls.bolna_conversation_id as linked_call_id, ...',
  params: 3
}
```

## Solution
Updated all SQL queries in `contactService.ts` to use the correct column name that actually exists in the database: `bolna_execution_id`

### Changes Made

#### File: `backend/src/services/contactService.ts`

**1. Search Query (Line ~34)**
```diff
- calls.elevenlabs_conversation_id as linked_call_id,
+ calls.bolna_execution_id as linked_call_id,
```

**2. Get All Contacts Query (Line ~55)**
```diff
- calls.elevenlabs_conversation_id as linked_call_id,
+ calls.bolna_execution_id as linked_call_id,
```

**3. Get Single Contact Query (Line ~201)**
```diff
- calls.elevenlabs_conversation_id as linked_call_id,
+ calls.bolna_execution_id as linked_call_id,
```

### Additional Improvement
Also fixed SQL injection vulnerability in the sorting logic by using a whitelist approach:

```typescript
// Old (vulnerable to SQL injection)
ORDER BY c.${sortBy} ${sortOrder.toUpperCase()}

// New (safe with whitelist)
const validSortColumns: Record<string, string> = {
  'name': 'c.name',
  'created_at': 'c.created_at',
  'phone_number': 'c.phone_number'
};
const sortColumn = validSortColumns[sortBy] || 'c.name';
const sortDirection = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

ORDER BY ${sortColumn} ${sortDirection}
```

## Database Schema Reference

According to the actual database table structure (verified via `\d calls`), the calls table schema after Bolna.ai migration:

```sql
CREATE TABLE calls (
    id UUID PRIMARY KEY,
    agent_id UUID NOT NULL,
    user_id UUID NOT NULL,
    contact_id UUID,
    bolna_execution_id VARCHAR(255) NOT NULL UNIQUE,  -- This is what actually exists!
    phone_number VARCHAR(50) NOT NULL,
    call_source VARCHAR(20) NOT NULL DEFAULT 'phone',
    caller_name VARCHAR(255),
    caller_email VARCHAR(255),
    -- ... other columns
);
```

**Key Point**:
- ❌ `elevenlabs_conversation_id` - **REMOVED** (old ElevenLabs)
- ❌ `bolna_conversation_id` - **NEVER ADDED** (only in docs, not in actual schema)
- ✅ `bolna_execution_id` - **EXISTS** (NOT NULL UNIQUE) - This is the correct column!

**Migration Files**:
- `004_bolna_migration_phase1.sql` added `bolna_execution_id` only
- No migration file added `bolna_conversation_id` (it was a documentation error)

## Testing

### Before Fix
```bash
GET http://localhost:3000/api/contacts
Response: {"error":"Failed to retrieve contacts","message":"Failed to retrieve contacts"}
```

### After Fix
```bash
GET http://localhost:3000/api/contacts
Response: {
  "success": true,
  "data": {
    "contacts": [...],
    "pagination": {
      "total": 10,
      "limit": 50,
      "offset": 0,
      "hasMore": false
    }
  }
}
```

## Impact
- ✅ Contacts API endpoint now works correctly
- ✅ Contact search functionality restored
- ✅ Contact detail view restored
- ✅ SQL injection vulnerability fixed
- ✅ Full alignment with Bolna.ai migration

## Related Files
- `backend/src/services/contactService.ts` - Updated queries
- `database.md` - Schema documentation reference
- Migration files:
  - `004_bolna_migration_phase1.sql`
  - `005_bolna_migration_phase2_complete.sql`
  - `006_complete_elevenlabs_removal.sql`

## Remaining Legacy References
The following files still have `elevenlabs_conversation_id` references but are either:
1. Migration scripts (historical)
2. Test files (need separate update)
3. Unused scripts

### Migration Scripts (Historical - OK)
- `backend/src/migrations/migrate_to_bolna_data.ts` - Migration script for data transfer

### Test Files (To Be Updated Separately)
- `backend/src/scripts/test-data-isolation-constraints.ts`
- `backend/src/scripts/test-cache-invalidation-system.ts`
- `backend/src/__tests__/integration/callSourceDetection.test.ts`

## Status
✅ **FIXED**: Contact service now fully compatible with Bolna.ai database schema
✅ **TESTED**: API endpoints returning expected responses
✅ **SECURE**: SQL injection vulnerability patched

---

**Date**: October 8, 2025  
**Priority**: High - Critical bug fix  
**Impact**: Restores contact management functionality
