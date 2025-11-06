# User-Specific OpenAI Prompts Implementation

## ✅ Completed Changes

### 1. Database Migration
- **Added columns** to `users` table:
  - `openai_individual_prompt_id` (VARCHAR 255, nullable)
  - `openai_complete_prompt_id` (VARCHAR 255, nullable)
- **Auto-populated** all 23 existing users with system default prompt IDs
- **Created index** for faster lookups

### 2. Backend Implementation

#### Models Updated
- ✅ `backend/src/models/User.ts` - Added prompt fields to UserInterface

#### New Services
- ✅ `backend/src/services/openaiPromptService.ts`
  - `validatePromptId()` - Test prompt with OpenAI API before saving
  - `getEffectivePromptId()` - User prompt → System default → Error
  - `validateBothPrompts()` - Validate individual + complete prompts together

#### Services Updated
- ✅ `backend/src/services/openaiExtractionService.ts`
  - `extractIndividualCallData()` - Now accepts optional `userPromptId` parameter
  - `extractCompleteAnalysis()` - Now accepts optional `userPromptId` parameter
  - Uses `openaiPromptService.getEffectivePromptId()` for fallback logic

- ✅ `backend/src/services/webhookService.ts`
  - Fetches user's prompt configuration before analysis
  - Passes user prompts to extraction methods

#### New API Endpoints
- ✅ `GET /api/openai-prompts/my-prompts` - Get own prompt configuration
- ✅ `PUT /api/openai-prompts/my-prompts` - Update own prompts (with validation)
- ✅ `POST /api/openai-prompts/validate` - Test prompt ID without saving
- ✅ `GET /api/openai-prompts/admin/users/:userId/prompts` - Admin: view user prompts
- ✅ `PUT /api/openai-prompts/admin/users/:userId/prompts` - Admin: update user prompts

### 3. Configuration
- ✅ `.env` file updated:
  - Removed `OPENAI_MODEL` (configured in prompt)
  - Removed `OPENAI_TIMEOUT` (configured in prompt)
  - Updated comments: system prompts are now **fallback defaults**

---

## 📋 API Usage Examples

### User: Get Own Prompts
```bash
GET /api/openai-prompts/my-prompts
Authorization: Bearer <token>

Response:
{
  "openai_individual_prompt_id": "pmpt_...",
  "openai_complete_prompt_id": "pmpt_...",
  "system_defaults": {
    "individual": "pmpt_68df0dca...",
    "complete": "pmpt_68df0dca..."
  }
}
```

### User: Update Own Prompts
```bash
PUT /api/openai-prompts/my-prompts
Authorization: Bearer <token>
Content-Type: application/json

{
  "openai_individual_prompt_id": "pmpt_abc123...",
  "openai_complete_prompt_id": "pmpt_xyz789..."
}

Response:
{
  "message": "Prompts updated successfully",
  "openai_individual_prompt_id": "pmpt_abc123...",
  "openai_complete_prompt_id": "pmpt_xyz789..."
}
```

### Validate Prompt Before Saving
```bash
POST /api/openai-prompts/validate
Authorization: Bearer <token>
Content-Type: application/json

{
  "prompt_id": "pmpt_test123..."
}

Response:
{
  "valid": true,
  "details": {
    "model": "gpt-4o-2024-08-06",
    "promptId": "pmpt_test123..."
  }
}
```

### Admin: Update User Prompts
```bash
PUT /api/openai-prompts/admin/users/{userId}/prompts
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "openai_individual_prompt_id": "pmpt_custom123...",
  "openai_complete_prompt_id": "pmpt_custom456..."
}
```

---

## 🔄 How It Works

### Analysis Flow with User Prompts

1. **Webhook receives call completion**
2. **Fetch user from database** (includes prompt IDs)
3. **Extract Individual Analysis**:
   - Check if user has `openai_individual_prompt_id`
   - If yes → use user's prompt
   - If no → fallback to `OPENAI_INDIVIDUAL_PROMPT_ID` from .env
   - If .env also missing → throw error
4. **Extract Complete Analysis** (same logic for complete prompt)
5. **Save to lead_analytics table**

### Prompt Priority
```
User Custom Prompt
    ↓ (if null)
System Default (.env)
    ↓ (if missing)
Error: No prompt configured
```

---

## 🎨 Frontend TODO

### Settings/Profile Page
Add a new section "OpenAI Analysis Configuration":

```jsx
<section>
  <h3>OpenAI Analysis Configuration</h3>
  <p>Customize how AI analyzes your call transcripts</p>
  
  <div>
    <label>Individual Call Analysis Prompt ID</label>
    <input 
      type="text" 
      placeholder="pmpt_..."
      value={individualPromptId}
    />
    <button onClick={validatePrompt}>Validate</button>
  </div>
  
  <div>
    <label>Complete Analysis Prompt ID</label>
    <input 
      type="text" 
      placeholder="pmpt_..."
      value={completePromptId}
    />
    <button onClick={validatePrompt}>Validate</button>
  </div>
  
  <button onClick={savePrompts}>Save Configuration</button>
  
  <small>
    Leave blank to use system defaults. 
    Create custom prompts at <a href="https://platform.openai.com/prompts">OpenAI Platform</a>
  </small>
</section>
```

### Admin: Integrations Page
Create new admin route `/admin/integrations`:

```jsx
<AdminLayout>
  <h2>User Integrations Management</h2>
  
  <UserSelector onChange={setSelectedUser} />
  
  {selectedUser && (
    <IntegrationsPanel user={selectedUser}>
      <OpenAIPromptsConfig 
        userId={selectedUser.id}
        onUpdate={refreshUserList}
      />
      {/* Future: Add other integrations here */}
    </IntegrationsPanel>
  )}
</AdminLayout>
```

---

## ✅ Testing Checklist

### Backend Tests
- [ ] User can retrieve their prompt configuration
- [ ] User can update their prompt IDs (with validation)
- [ ] Invalid prompt IDs are rejected
- [ ] Admin can view/update any user's prompts
- [ ] Analysis uses user prompt when available
- [ ] Analysis falls back to system default when user prompt is null
- [ ] Error thrown when neither user nor system prompt exists

### Integration Tests
- [ ] Make test call with user having custom prompts
- [ ] Make test call with user having null prompts (uses defaults)
- [ ] Verify correct prompt ID is logged in analysis
- [ ] Update user prompts via API, verify next call uses new prompts

---

## 🚀 Deployment Steps

1. **Run migration** (already done):
   ```bash
   node backend/src/migrations/run-add-user-openai-prompts.js
   ```

2. **Restart backend** to load new routes and services

3. **Test API endpoints** with Postman/curl

4. **Update frontend**:
   - Add Settings page integration UI
   - Add Admin integrations page
   
5. **Update documentation** for users on how to create custom prompts

---

## 📝 User Guide (for documentation)

### How to Use Custom OpenAI Prompts

1. **Create Your Prompt**:
   - Go to [OpenAI Platform](https://platform.openai.com/prompts)
   - Create a new prompt for call analysis
   - Copy the prompt ID (starts with `pmpt_`)

2. **Configure in Your Account**:
   - Navigate to Settings → Integrations
   - Paste your prompt IDs
   - Click "Validate" to test
   - Save configuration

3. **Prompt Types**:
   - **Individual Analysis**: Analyzes single call transcripts
   - **Complete Analysis**: Analyzes all historical calls for a contact

4. **System Defaults**:
   - If you don't set custom prompts, system defaults are used
   - System defaults are maintained by administrators

---

## 🔧 Troubleshooting

### "Invalid prompt ID" error
- Ensure prompt ID starts with `pmpt_`
- Verify prompt exists in your OpenAI account
- Check API key has access to the prompt

### Analysis still using old prompt
- Clear any caching
- Restart backend if prompts were just updated
- Verify user record was actually updated in database

### "No prompt configured" error
- Check user's prompt fields in database
- Verify system defaults exist in `.env`
- Ensure at least one fallback is available

---

**Status**: ✅ Backend Complete | ⏳ Frontend Pending
**Date**: 2025-11-02
