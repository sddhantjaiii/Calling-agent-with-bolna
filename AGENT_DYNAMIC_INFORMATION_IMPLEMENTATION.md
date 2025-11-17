# Agent Dynamic Information Implementation

## Overview
This feature allows admins to store agent system prompts and enables users to manage dynamic information that gets appended to the system prompt for agent customization.

## Features Implemented

### 1. Database Schema Changes
**File:** `backend/src/migrations/053_add_agent_system_prompt_dynamic_info.sql`

Added two new columns to the `agents` table:
- `system_prompt` (TEXT, nullable) - Stores the base system prompt fetched from Bolna API
- `dynamic_information` (TEXT, nullable) - Stores user-configurable dynamic data

### 2. Backend Implementation

#### Model Updates
**File:** `backend/src/models/Agent.ts`

Updated `AgentInterface` to include:
```typescript
system_prompt?: string | null;
dynamic_information?: string | null;
```

#### Bolna Service Enhancement
**File:** `backend/src/services/bolnaService.ts`

Added new method:
```typescript
async patchAgentSystemPrompt(agentId: string, systemPrompt: string)
```
- Uses PATCH request to `/v2/agent/:agent_id`
- Updates only `agent_prompts.task_1.system_prompt` without affecting other config

#### Admin Service Updates
**File:** `backend/src/services/adminService.ts`

Enhanced `createAgent` method:
- When registering existing Bolna agent by ID:
  1. Fetches agent details from Bolna API (GET `/v2/agent/:agent_id`)
  2. Extracts `agent_prompts.task_1.system_prompt`
  3. Stores both `system_prompt` and `dynamic_information` in database
  4. Admin can optionally provide `dynamic_information` during registration

#### Integration Controller
**File:** `backend/src/controllers/integrationController.ts`

Added three new methods:
1. `getUserAgents()` - Get all active agents for the user
2. `getAgentDynamicInfo()` - Get dynamic information for specific agent
3. `updateAgentDynamicInfo()` - Update dynamic info and sync with Bolna

**Update Logic:**
- Validates agent ownership
- Checks agent has Bolna ID and system prompt
- Updates `dynamic_information` in database
- Combines `system_prompt` + `dynamic_information`
- Calls `patchAgentSystemPrompt()` to update Bolna

#### API Routes
**File:** `backend/src/routes/integrations.ts`

Added new endpoints:
- `GET /api/integrations/agents` - List user's agents
- `GET /api/integrations/agents/:agentId/dynamic-info` - Get dynamic info
- `PUT /api/integrations/agents/:agentId/dynamic-info` - Update dynamic info

### 3. Frontend Implementation

#### Integration Tab Updates
**File:** `Frontend/src/components/dashboard/Integrations.tsx`

**Removed:**
- "Data Collection & Forms" section (mock feature)

**Added:**
- "Agent Dynamic Information" section with:
  - Agent selection dropdown
  - Dynamic information textarea
  - Loading states
  - Save functionality

**State Management:**
```typescript
const [dynamicInfoAgents, setDynamicInfoAgents] = useState([]);
const [selectedDynamicAgent, setSelectedDynamicAgent] = useState("");
const [dynamicInformation, setDynamicInformation] = useState("");
const [loadingDynamicInfo, setLoadingDynamicInfo] = useState(false);
const [savingDynamicInfo, setSavingDynamicInfo] = useState(false);
```

**Functions:**
- `fetchDynamicInfoAgents()` - Loads user's agents on mount
- `fetchDynamicInfo()` - Loads dynamic info when agent selected
- `saveDynamicInfo()` - Saves and syncs to Bolna

## User Flow

### Admin Flow (Agent Registration)
1. Admin enters Bolna agent ID
2. System fetches agent from Bolna API
3. Extracts `agent_prompts.task_1.system_prompt`
4. Admin can optionally enter `dynamic_information`
5. Both stored in database

### User Flow (Dynamic Information Management)
1. User goes to Integration tab
2. Sees "Agent Dynamic Information" section
3. Selects agent from dropdown
4. System loads current `dynamic_information`
5. User edits dynamic information
6. Clicks "Save Dynamic Information"
7. Backend:
   - Updates database
   - Combines: `final_prompt = system_prompt + "\n\n" + dynamic_information`
   - PATCHes Bolna agent with combined prompt

## API Examples

### Fetch Agent System Prompt (Admin Registration)
```bash
GET https://api.bolna.ai/v2/agent/4465a06c-4405-4fee-bff5-672940e9921b
Authorization: Bearer bn-3b93b7afd716411195065b9e69711448
```

Response extracts: `agent_prompts.task_1.system_prompt`

### Update Agent System Prompt (User Update)
```bash
PATCH https://api.bolna.ai/v2/agent/4465a06c-4405-4fee-bff5-672940e9921b
Authorization: Bearer bn-3b93b7afd716411195065b9e69711448
Content-Type: application/json

{
  "agent_prompts": {
    "task_1": {
      "system_prompt": "Base prompt...\n\nUser's dynamic info here"
    }
  }
}
```

## Security & Permissions

### Role-Based Access
- **Admin:** Can edit `system_prompt` in database
- **User:** Can only edit `dynamic_information` for their own agents

### Validation
- Agent ownership verification
- Bolna agent ID presence check
- System prompt existence check

## Testing

### Database Migration
```bash
cd backend
node -e "require('dotenv').config(); const { Pool } = require('pg'); const fs = require('fs'); const pool = new Pool({ connectionString: process.env.DATABASE_URL }); const sql = fs.readFileSync('./src/migrations/053_add_agent_system_prompt_dynamic_info.sql', 'utf8'); pool.query(sql).then(() => { console.log('Migration completed successfully'); process.exit(0); }).catch(err => { console.error('Migration failed:', err); process.exit(1); });"
```

### API Testing
1. **Register Agent (Admin)**
```bash
POST /api/admin/agents
{
  "bolna_agent_id": "4465a06c-4405-4fee-bff5-672940e9921b",
  "name": "Test Agent",
  "dynamic_information": "Optional initial dynamic info"
}
```

2. **Get User Agents**
```bash
GET /api/integrations/agents
```

3. **Get Dynamic Info**
```bash
GET /api/integrations/agents/{agentId}/dynamic-info
```

4. **Update Dynamic Info**
```bash
PUT /api/integrations/agents/{agentId}/dynamic-info
{
  "dynamicInformation": "Updated dynamic information here"
}
```

## Files Changed

### Backend
1. `backend/src/migrations/053_add_agent_system_prompt_dynamic_info.sql` (NEW)
2. `backend/src/models/Agent.ts` (MODIFIED)
3. `backend/src/services/bolnaService.ts` (MODIFIED - added patchAgentSystemPrompt)
4. `backend/src/services/adminService.ts` (MODIFIED - enhanced createAgent)
5. `backend/src/controllers/integrationController.ts` (MODIFIED - added 3 methods)
6. `backend/src/routes/integrations.ts` (MODIFIED - added 3 routes)

### Frontend
1. `Frontend/src/components/dashboard/Integrations.tsx` (MODIFIED - replaced Data Collection with Dynamic Information)

## Notes

- Dynamic information is appended to system prompt with `\n\n` separator
- Formatting is preserved when appending
- Only `task_1` system prompt is updated (as per requirement)
- PATCH request ensures other agent config remains unchanged
- Migration adds columns with comments for documentation

## Migration Status
✅ Database migration completed successfully
✅ All backend APIs implemented
✅ Frontend UI updated and tested
✅ Role-based permissions enforced
