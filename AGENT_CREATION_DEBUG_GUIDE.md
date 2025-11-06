# Agent Creation Debug Guide for Bolna.ai Integration

## Current Flow:
1. Frontend (AdminCreateAgent.tsx) → Sends agent data
2. Backend (adminController.ts) → Receives request
3. AdminService (adminService.ts) → Adds data_collection defaults
4. AgentService (agentService.ts) → Creates Bolna agent config
5. BolnaService (bolnaService.ts) → POST to Bolna API

## Required Fields for Bolna.ai Agent Creation:

### Core Agent Config:
- `agent_name` (string, required)
- `agent_welcome_message` (string, required) 
- `webhook_url` (string, nullable)
- `tasks` (array, required) - Must have at least one task

### Task Structure (within tasks array):
Each task must have:
- `task_type`: "conversation"
- `tools_config`: Object containing:
  - `llm_agent`: LLM configuration
  - `synthesizer`: TTS/voice configuration  
  - `transcriber`: Speech-to-text configuration
  - `input`: Input provider config
  - `output`: Output provider config
- `toolchain`: Execution pipeline definition
- `task_config`: Optional task settings

### Agent Prompts:
- `task_1`: Object with `system_prompt` (required)

## Common Issues:

### 1. Missing first_message
**Problem**: `first_message` is not being set from frontend
**Fix**: Ensure `agent_welcome_message` is populated

### 2. Voice ID Mapping
**Problem**: Voice IDs from frontend may not map to Polly voices
**Fix**: Use `mapVoiceIdToPollyVoice()` function

### 3. Data Collection Description
**Problem**: May be too long or not properly formatted
**Fix**: Validate length, ensure it's a string

### 4. System Prompt Missing
**Problem**: Frontend sends `prompt` but backend needs `system_prompt`
**Fix**: Proper field mapping

## Debug Steps:

1. **Check Frontend Payload**:
```javascript
console.log('Creating agent with data:', { agentData, assignToUserId });
```

2. **Check Backend Receipt**:
```typescript
logger.info('[AdminController] Received agentData:', agentData);
```

3. **Check Bolna Payload**:
```typescript
logger.info('[Bolna] Creating agent with config', createRequest);
```

4. **Check Bolna Response**:
```typescript
logger.error('Bolna API Error:', error.response?.data);
```

## Required Environment Variables:
- `BOLNA_API_KEY`: Your Bolna API key
- `BOLNA_BASE_URL`: https://api.bolna.ai
- `WEBHOOK_BASE_URL`: Your webhook endpoint base URL
- `OPENAI_API_KEY`: For LLM provider (if using OpenAI)

## Testing Checklist:
- [ ] Admin user can authenticate
- [ ] GET /api/admin/agents/voices returns voice list
- [ ] Voice list is properly fetched and displayed
- [ ] Form validation passes for all required fields
- [ ] agent_welcome_message is set (maps from first_message or default)
- [ ] system_prompt is set (maps from prompt field)
- [ ] voice_id is properly mapped to Polly voice
- [ ] Bolna API credentials are correct
- [ ] Webhook URL is accessible from Bolna
