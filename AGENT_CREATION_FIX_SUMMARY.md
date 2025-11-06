# Agent Creation Debugging Summary

## Issue
When creating an agent from the admin panel at `http://localhost:3000/api/admin/agents/voices`, the system was saying "these fields are required".

## Root Cause Analysis

### 1. Missing `first_message` Field ✅ FIXED
**Problem**: The frontend was NOT sending the `first_message` field, but the backend's `agentService.ts` requires it for Bolna's `agent_welcome_message`.

**Code Reference (agentService.ts, line 109)**:
```typescript
agent_welcome_message: agentData.first_message || 'Hello! How can I help you today?',
```

**Fix Applied**:
- Added `firstMessage` field to the form state in `AdminCreateAgent.tsx`
- Set default value: `'Hello! How can I help you today!'`
- Added UI field for Welcome Message in the form
- Updated agent data payload to include `first_message: formData.firstMessage`

### 2. Voice Selection Requirements
**Current State**: Voice field exists but may not be properly validated or required.

**Required for Bolna**: 
- `voice_id` is needed for TTS configuration
- Maps to Polly voice names via `mapVoiceIdToPollyVoice()`
- Default fallback: `'Joanna'` if no voice_id provided

### 3. System Prompt Requirements
**Current State**: Form has `prompt` field, mapped to `system_prompt` in backend ✅

### 4. Data Collection Description
**Current State**: Properly initialized with default long description ✅

## Required Fields for Bolna Agent Creation

### Backend Requirements (bolnaService.ts):
```typescript
CreateBolnaAgentRequest {
  agent_config: {
    agent_name: string;              // ✅ From formData.name
    agent_welcome_message: string;   // ✅ FIXED - From formData.firstMessage
    webhook_url: string | null;       // ✅ Auto-generated
    tasks: [...]                     // ✅ Auto-configured
  },
  agent_prompts: {
    task_1: {
      system_prompt: string;         // ✅ From formData.prompt
    }
  }
}
```

### Task Configuration (auto-generated in agentService.ts):
- `llm_agent`: Uses formData.llm (model, temperature, max_tokens) ✅
- `synthesizer`: Uses mapped voice + polly configuration ✅
- `transcriber`: Deepgram configuration (auto-set) ✅
- `input/output`: Twilio configuration (auto-set) ✅

## Files Modified

### Frontend:
✅ `Frontend/src/components/admin/agents/AdminCreateAgent.tsx`
- Added `firstMessage` field to state
- Added Welcome Message input field to UI
- Updated `agentData` payload to include `first_message`
- Fixed form reset to include `firstMessage`

## Testing Checklist

### Before Testing:
- [ ] Backend server is running (`npm run dev` in backend/)
- [ ] Frontend is running (`npm run dev` in Frontend/)
- [ ] Admin user exists and can log in
- [ ] `BOLNA_API_KEY` is set in backend/.env
- [ ] `WEBHOOK_BASE_URL` is set in backend/.env

### Test Steps:
1. [ ] Log in as admin user
2. [ ] Navigate to Agent Management
3. [ ] Click "Create Agent"
4. [ ] Verify voices are loading (GET /api/admin/agents/voices)
5. [ ] Fill in all required fields:
   - [ ] Agent Name
   - [ ] Description
   - [ ] Welcome Message (new field)
   - [ ] Voice (select from dropdown)
   - [ ] Language
   - [ ] AI Model
   - [ ] System Prompt
   - [ ] Data Collection Description (pre-filled)
6. [ ] Submit the form
7. [ ] Check browser console for any errors
8. [ ] Check backend logs for Bolna API response
9. [ ] Verify agent was created successfully

### Expected Errors to Watch For:

#### 1. Voice API Error:
```
Failed to fetch voices
```
**Solution**: Check if Bolna API key is valid and `/me/voices` endpoint is accessible.

#### 2. Agent Creation Error:
```
Bolna API validation error: Invalid request data
```
**Solution**: Check backend logs to see which field Bolna is rejecting.

#### 3. Authentication Error:
```
User must be authenticated
```
**Solution**: Verify admin token is valid and being sent in Authorization header.

## Next Steps for Full Resolution

### 1. Add Voice Field Validation
Make voice selection required in form validation:
```typescript
// In formValidation.ts or AdminCreateAgent.tsx
if (!formData.voice) {
  errors.voice = 'Please select a voice';
}
```

### 2. Add Better Error Messages
When Bolna returns errors, parse and display them to the user:
```typescript
catch (error) {
  if (error.response?.data?.error?.message) {
    // Parse Bolna error and show which field is problematic
    toast.error('Agent creation failed', {
      description: error.response.data.error.message
    });
  }
}
```

### 3. Add Form Field Descriptions
Help users understand what each field does:
- Welcome Message: "The first message your AI agent says when answering"
- System Prompt: "Defines your agent's personality and behavior"
- Data Collection: "Instructions for how the agent evaluates conversations"

### 4. Test Voice Selection
Ensure voices are properly fetched and displayed:
```javascript
// Debug in browser console:
adminApiService.getVoices().then(console.log)
```

### 5. Add Logging for Debugging
Add more detailed logs in backend:
```typescript
logger.info('[AgentService] Creating Bolna agent with config:', {
  agentName: createRequest.agent_config.agent_name,
  welcomeMessage: createRequest.agent_config.agent_welcome_message,
  hasSystemPrompt: !!createRequest.agent_prompts.task_1.system_prompt,
  voiceId: createRequest.agent_config.tasks[0].tools_config.synthesizer.provider_config.voice
});
```

## Bolna API Documentation Reference

### Agent Creation Endpoint:
- **URL**: `POST https://api.bolna.ai/v2/agent`
- **Auth**: `Bearer ${BOLNA_API_KEY}`
- **Required Fields**:
  - `agent_config.agent_name`
  - `agent_config.agent_welcome_message`
  - `agent_config.tasks` (array with at least one task)
  - `agent_prompts.task_1.system_prompt`

### Voices Endpoint:
- **URL**: `GET https://api.bolna.ai/me/voices`
- **Auth**: `Bearer ${BOLNA_API_KEY}`
- **Returns**: Array of available voices for your account

## Common Bolna Errors and Solutions

### 422 Validation Error:
**Cause**: Missing or invalid required fields  
**Fix**: Check all required fields are present and properly formatted

### 401 Authentication Error:
**Cause**: Invalid or expired API key  
**Fix**: Verify `BOLNA_API_KEY` in .env file

### 404 Not Found:
**Cause**: Agent ID doesn't exist or wrong endpoint  
**Fix**: Double-check endpoint URL and agent ID

### 500 Server Error:
**Cause**: Bolna server issue or invalid configuration  
**Fix**: Check Bolna status page and retry

## Summary

✅ **Primary Issue FIXED**: Added missing `first_message` field
⚠️ **Still Need to Test**: Whether agent creation now works end-to-end
📋 **Recommended**: Add voice field validation and better error messages

The main issue was that Bolna requires `agent_welcome_message` which comes from the `first_message` field, and this was not being sent from the frontend. This has now been fixed.
