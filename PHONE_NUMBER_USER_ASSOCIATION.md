# Phone Number User Association Implementation

## Overview
Phone numbers are now associated with specific users. Each phone number belongs to one user and can optionally be assigned to one of that user's agents.

## Database Changes

### Migration: `add_user_id_to_phone_numbers.sql`

**Changes Made:**
1. Added `user_id` column to `phone_numbers` table (NOT NULL, FK to users table)
2. Migrated existing data: `user_id = created_by_admin_id`
3. Added indexes for performance:
   - `idx_phone_numbers_user_id`
   - `idx_phone_numbers_user_agent` (user_id + assigned_to_agent_id)
4. Added check constraint: Agent must belong to same user as phone number

**Schema:**
```sql
phone_numbers
├── id (UUID, PRIMARY KEY)
├── name (VARCHAR)
├── phone_number (VARCHAR, UNIQUE)
├── user_id (UUID, NOT NULL, FK → users.id) ← NEW
├── assigned_to_agent_id (UUID, NULLABLE, FK → agents.id)
├── created_by_admin_id (UUID, NOT NULL)
├── is_active (BOOLEAN)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

## Backend Changes

### 1. Model Updates (`PhoneNumber.ts`)

**Interface Update:**
```typescript
export interface PhoneNumberInterface {
  // ... existing fields
  user_id: string;  // NEW
  // ... rest
}
```

**Method Update - `createPhoneNumber`:**
- Now requires `user_id` parameter
- Validates agent belongs to same user before assignment
- Enforces user-agent ownership constraint

### 2. Controller Updates (`phoneNumberController.ts`)

**`createPhoneNumber` endpoint:**
- Requires `user_id` in request body
- Validates agent belongs to selected user
- Returns error if user-agent mismatch

### 3. New Route (`userPhoneNumbers.ts`)

**Endpoint:** `GET /api/phone-numbers`

**Purpose:** Regular users fetch their own phone numbers

**Query:**
```sql
SELECT pn.*, a.name as agent_name
FROM phone_numbers pn
LEFT JOIN agents a ON pn.assigned_to_agent_id = a.id 
  AND a.user_id = pn.user_id
WHERE pn.user_id = $1
```

**Returns:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "My Business Number",
      "phoneNumber": "+919876543210",
      "assignedToAgentId": "uuid",
      "agentName": "Sales Agent",
      "isActive": true
    }
  ]
}
```

## Frontend Changes

### CallAgentModal Component

**Features:**
1. **Phone Number Dropdown**
   - Shows only user's own phone numbers
   - Displays agent assignment status
   - Auto-selects agent's assigned number

2. **Display Format:**
   ```
   +91 9876543210
   My Business Number • Linked to Sales Agent
   ```

3. **API Integration:**
   - Fetches from `/api/phone-numbers`
   - Sends `callerPhoneNumberId` in call initiation

## Admin Panel Workflow

### Creating Phone Number (New Flow)

**Step 1: Select User**
```
User Dropdown → Fetch user's agents
```

**Step 2: Enter Phone Details**
```
- Name: [My Business Number]
- Phone: [+919876543210]
```

**Step 3: Assign to Agent (Optional)**
```
Agent Dropdown → Shows only selected user's agents
```

**Validation:**
- ✅ Phone number unique across system
- ✅ Agent belongs to selected user
- ✅ Agent doesn't already have a phone number
- ✅ E.164 format required

## Security & Data Isolation

### User-Level Isolation
```
User A ─┬─ Phone 1 ──→ Agent A1
        └─ Phone 2 ──→ Agent A2

User B ─┬─ Phone 3 ──→ Agent B1
        └─ Phone 4 ──→ (unassigned)
```

**Rules:**
1. Users only see their own phone numbers
2. Users can only assign phone numbers to their own agents
3. Database constraint enforces user-agent relationship
4. API filters by `user_id` automatically

## API Endpoints

### User Endpoints
- `GET /api/phone-numbers` - Get user's phone numbers

### Admin Endpoints
- `GET /api/admin/phone-numbers` - List all phone numbers (all users)
- `POST /api/admin/phone-numbers` - Create phone number (requires `user_id`)
- `PUT /api/admin/phone-numbers/:id` - Update phone number
- `POST /api/admin/phone-numbers/:id/assign` - Assign to agent
- `POST /api/admin/phone-numbers/:id/unassign` - Unassign from agent

## Migration Steps

1. **Run Migration:**
   ```bash
   psql -U postgres -d your_database -f backend/migrations/add_user_id_to_phone_numbers.sql
   ```

2. **Restart Backend:**
   ```bash
   cd backend
   npm run dev
   ```

3. **Test:**
   - Create phone number via admin panel
   - Verify user can see only their numbers
   - Test call initiation with phone number selection

## Testing Checklist

- [ ] Migration runs successfully
- [ ] Existing phone numbers migrated with correct `user_id`
- [ ] Admin can create phone number with user selection
- [ ] Admin can assign phone to user's agent only
- [ ] User sees only their own phone numbers
- [ ] Call initiation works with selected phone number
- [ ] Phone number dropdown shows correct agent assignments
- [ ] Cannot assign agent from different user

## Notes

- `created_by_admin_id` remains for audit trail (who created it)
- `user_id` defines ownership (who owns it)
- Admin can create numbers for any user
- Users can only use their own numbers for calls
