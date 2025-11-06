# User-Specific OpenAI Prompts - Testing Checklist

## ✅ Implementation Status: COMPLETE
All code changes have been implemented successfully. This checklist will guide you through testing.

---

## 🗄️ Phase 1: Database Verification ✅ COMPLETE

### 1.1 Verify Migration Executed
```bash
# Check migration log
cat backend/src/migrations/migration.log
```
**Expected**: Migration success message, 23 users updated

### 1.2 Verify Database Schema
```sql
-- Connect to database and run:
\d users

-- Expected: Two new columns
-- openai_individual_prompt_id | character varying(255)
-- openai_complete_prompt_id   | character varying(255)
```

### 1.3 Verify Data Population
```sql
-- Check that existing users have default prompts
SELECT 
  id, 
  name, 
  email, 
  openai_individual_prompt_id, 
  openai_complete_prompt_id 
FROM users 
LIMIT 5;
```
**Expected**: All users should have non-null prompt values

### 1.4 Verify Index Created
```sql
-- Check indexes
\di

-- Expected: Index on openai_individual_prompt_id and openai_complete_prompt_id
```

---

## 🔧 Phase 2: Backend API Testing ⏳ PENDING

### 2.1 Start Backend Server
```bash
cd backend
npm run dev
```
**Expected**: Server starts on port 3000

### 2.2 Test User Endpoints

#### Get My Prompts
```bash
# Replace YOUR_JWT_TOKEN with actual token
curl -X GET http://localhost:3000/api/openai-prompts/my-prompts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```
**Expected Response:**
```json
{
  "success": true,
  "data": {
    "openai_individual_prompt_id": "pmpt_...",
    "openai_complete_prompt_id": "pmpt_...",
    "system_defaults": {
      "individual": "pmpt_...",
      "complete": "pmpt_..."
    }
  }
}
```

#### Update My Prompts
```bash
curl -X PUT http://localhost:3000/api/openai-prompts/my-prompts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "openai_individual_prompt_id": "pmpt_test123",
    "openai_complete_prompt_id": "pmpt_test456"
  }'
```
**Expected**: Success response with updated values

#### Validate Prompt
```bash
curl -X POST http://localhost:3000/api/openai-prompts/validate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt_id": "pmpt_test123"}'
```
**Expected**: Validation result with model details or error

### 2.3 Test Admin Endpoints (requires admin JWT)

#### Get User Prompts
```bash
curl -X GET http://localhost:3000/api/openai-prompts/admin/users/USER_ID/prompts \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN"
```
**Expected**: User's prompt configuration

#### Update User Prompts
```bash
curl -X PUT http://localhost:3000/api/openai-prompts/admin/users/USER_ID/prompts \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "openai_individual_prompt_id": "pmpt_admin_set",
    "openai_complete_prompt_id": "pmpt_admin_set2"
  }'
```
**Expected**: Success response

### 2.4 Test Prompt Service

#### Validation Service
```bash
# In backend/src directory, create test file:
# test-prompt-validation.js
```
```javascript
const { openaiPromptService } = require('./services/openaiPromptService');

async function test() {
  try {
    // Test valid prompt
    const result = await openaiPromptService.validatePromptId('pmpt_...');
    console.log('Valid prompt:', result);
    
    // Test invalid prompt
    const result2 = await openaiPromptService.validatePromptId('invalid');
    console.log('Invalid prompt:', result2);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test();
```

#### Fallback Logic
```javascript
// Test fallback chain
async function testFallback() {
  const prompts = [
    { user: 'pmpt_custom', type: 'individual' },
    { user: null, type: 'individual' },
    { user: undefined, type: 'individual' },
  ];
  
  for (const p of prompts) {
    const effective = await openaiPromptService.getEffectivePromptId(
      p.user, 
      p.type
    );
    console.log(`User: ${p.user}, Effective: ${effective}`);
  }
}
```

### 2.5 Test Webhook Integration

#### Simulate Webhook Call
```bash
curl -X POST http://localhost:3000/api/webhook/bolna \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "call_completed",
    "call_id": "test_call_123",
    "transcript": "Test transcript...",
    "duration": 60
  }'
```
**Expected**: Webhook processes call using user's custom prompts

**Check Logs:**
```bash
tail -f backend/logs/app.log | grep "openai"
```
**Expected**: Should see prompt IDs being used

---

## 🎨 Phase 3: Frontend Testing ⏳ PENDING

### 3.1 Start Frontend Server
```bash
cd frontend
npm run dev
```
**Expected**: Frontend starts (usually port 5173)

### 3.2 Test User Settings UI

#### Navigate to Settings
1. Login as regular user
2. Go to Settings page
3. Scroll to "OpenAI Prompts Configuration" section

**Verify:**
- [ ] Section is visible
- [ ] Two input fields present
- [ ] Validate buttons appear
- [ ] System defaults shown
- [ ] Save/Reset buttons visible

#### Test Prompt Loading
**Verify:**
- [ ] Current prompts load automatically
- [ ] Loading indicator shows during fetch
- [ ] System defaults display in placeholders

#### Test Validation
1. Enter invalid prompt (e.g., "invalid")
2. Click "Validate"

**Verify:**
- [ ] Loading spinner appears
- [ ] Red X icon shows
- [ ] Error message displays
- [ ] Toast notification appears

3. Enter valid prompt (e.g., "pmpt_...")
4. Click "Validate"

**Verify:**
- [ ] Loading spinner appears
- [ ] Green checkmark shows
- [ ] "Valid prompt" message displays
- [ ] Model information shown
- [ ] Success toast appears

#### Test Save/Reset
1. Modify both prompts
2. Validate both
3. Click "Save Configuration"

**Verify:**
- [ ] Loading state on button
- [ ] Success toast appears
- [ ] Values persist after reload
- [ ] Status badges update

4. Modify values again
5. Click "Reset"

**Verify:**
- [ ] Values revert to original
- [ ] Validation states clear
- [ ] No API calls made

### 3.3 Test Admin Integrations UI

#### Navigate to Admin Page
1. Login as admin
2. Go to Admin Panel
3. Click "Integrations" in sidebar

**Verify:**
- [ ] Menu item visible with Plug icon
- [ ] Page loads successfully
- [ ] User dropdown present

#### Test User Selection
1. Click user dropdown

**Verify:**
- [ ] All users load
- [ ] Loading indicator during fetch
- [ ] Users displayed with name/email/role

2. Select a user

**Verify:**
- [ ] User info displays
- [ ] Current prompts load
- [ ] Input fields populate
- [ ] System defaults shown

#### Test Admin Validation
1. Modify user's prompts
2. Validate each prompt

**Verify:**
- [ ] Validation works same as user UI
- [ ] Visual feedback correct
- [ ] Toast notifications appear

#### Test Admin Save
1. Modify and validate prompts
2. Click "Save Configuration"

**Verify:**
- [ ] Loading state shows
- [ ] Success message includes user name
- [ ] Values persist in database
- [ ] Can reload and see changes

#### Test User Switching
1. Select different user
2. Verify previous user's changes saved
3. New user's config loads correctly

**Verify:**
- [ ] No data leakage between users
- [ ] Proper isolation
- [ ] Loading states work

---

## 🔗 Phase 4: Integration Testing ⏳ PENDING

### 4.1 End-to-End Call Flow

#### Setup
1. Login as user
2. Configure custom prompts in Settings
3. Validate and save

#### Make Test Call
1. Create or select a contact
2. Initiate call
3. Complete call (or simulate)
4. Wait for webhook processing

#### Verify Analysis Used Custom Prompts
**Check Database:**
```sql
SELECT 
  c.id,
  c.name,
  l.individual_data,
  l.complete_analysis,
  l.updated_at
FROM calls c
JOIN leads l ON c.lead_id = l.id
WHERE c.user_id = 'USER_ID'
ORDER BY c.created_at DESC
LIMIT 1;
```

**Check Logs:**
```bash
grep "Using OpenAI prompt" backend/logs/app.log | tail -5
```

**Expected**: Should see user's custom prompt ID being used

### 4.2 Test Fallback Scenario

#### Remove User Prompts
1. Go to Settings
2. Clear both prompt fields
3. Save

#### Make Another Call
**Expected**: System should use .env defaults

**Verify in Logs:**
```bash
grep "Falling back to system default" backend/logs/app.log
```

### 4.3 Test Admin Override

#### Admin Sets User Prompts
1. Admin goes to Integrations
2. Selects user
3. Sets different prompts
4. Saves

#### User Makes Call
**Expected**: Call should use admin-set prompts, not user's

**Verify:**
- [ ] Admin changes take effect immediately
- [ ] User sees updated prompts in Settings
- [ ] Analysis uses new prompts

---

## 🛡️ Phase 5: Security Testing ⏳ PENDING

### 5.1 Authentication Tests

#### Test Unauthenticated Access
```bash
# Try without token
curl -X GET http://localhost:3000/api/openai-prompts/my-prompts
```
**Expected**: 401 Unauthorized

#### Test Expired Token
```bash
# Use old/invalid token
curl -X GET http://localhost:3000/api/openai-prompts/my-prompts \
  -H "Authorization: Bearer EXPIRED_TOKEN"
```
**Expected**: 401 Unauthorized

### 5.2 Authorization Tests

#### Test Non-Admin User Accessing Admin Endpoints
```bash
# Regular user token on admin endpoint
curl -X GET http://localhost:3000/api/openai-prompts/admin/users/OTHER_USER_ID/prompts \
  -H "Authorization: Bearer USER_JWT_TOKEN"
```
**Expected**: 403 Forbidden

#### Test User Accessing Other User's Prompts
```bash
# User A tries to update User B's prompts
curl -X PUT http://localhost:3000/api/openai-prompts/my-prompts \
  -H "Authorization: Bearer USER_A_TOKEN" \
  -d '{"userId": "USER_B_ID", ...}'
```
**Expected**: Should only affect User A

### 5.3 Validation Security

#### Test SQL Injection
```bash
curl -X PUT http://localhost:3000/api/openai-prompts/my-prompts \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"openai_individual_prompt_id": "pmpt_\"; DROP TABLE users; --"}'
```
**Expected**: Sanitized, no SQL execution

#### Test XSS Attempts
```bash
curl -X PUT http://localhost:3000/api/openai-prompts/my-prompts \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"openai_individual_prompt_id": "<script>alert(1)</script>"}'
```
**Expected**: Validation fails (invalid format)

---

## 📊 Phase 6: Performance Testing ⏳ PENDING

### 6.1 Load Testing

#### Concurrent Requests
```bash
# Use tool like Apache Bench
ab -n 100 -c 10 -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/openai-prompts/my-prompts
```
**Expected**: Consistent response times

### 6.2 Database Performance

#### Query Performance
```sql
EXPLAIN ANALYZE 
SELECT * FROM users 
WHERE openai_individual_prompt_id = 'pmpt_test';
```
**Expected**: Index used, fast lookup

### 6.3 API Response Times

**Benchmark:**
- Get my prompts: < 100ms
- Update prompts: < 200ms
- Validate prompt: < 2000ms (OpenAI API call)
- Admin operations: < 150ms

---

## 🐛 Phase 7: Error Handling ⏳ PENDING

### 7.1 Network Errors

#### Test OpenAI API Timeout
- Temporarily block OpenAI API access
- Try to validate prompt
**Expected**: Graceful error message

#### Test Database Connection Loss
- Stop database temporarily
- Try to fetch prompts
**Expected**: Error handling, no crash

### 7.2 Invalid Data

#### Test Invalid Prompt Format
```bash
curl -X PUT http://localhost:3000/api/openai-prompts/my-prompts \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"openai_individual_prompt_id": "invalid_format"}'
```
**Expected**: 400 Bad Request

#### Test Non-Existent Prompt
```bash
curl -X POST http://localhost:3000/api/openai-prompts/validate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt_id": "pmpt_nonexistent"}'
```
**Expected**: Validation error

---

## ✅ Final Checklist

### Code Quality
- [ ] No TypeScript compilation errors
- [ ] No ESLint warnings
- [ ] Code formatted consistently
- [ ] All imports resolve correctly

### Documentation
- [ ] Implementation doc created
- [ ] Quick reference created
- [ ] Testing checklist created
- [ ] API endpoints documented

### Deployment Readiness
- [ ] .env.example updated
- [ ] Migration scripts tested
- [ ] Rollback plan documented
- [ ] Performance acceptable

### User Experience
- [ ] UI responsive on mobile
- [ ] Loading states clear
- [ ] Error messages helpful
- [ ] Toast notifications work

### Security
- [ ] Authentication enforced
- [ ] Authorization verified
- [ ] Input validation working
- [ ] SQL injection prevented

---

## 📝 Test Results Log

### Test Session: [DATE]

**Tester**: _______________

**Environment**:
- Backend: http://localhost:3000
- Frontend: http://localhost:5173
- Database: PostgreSQL (Neon)

**Results**:

| Phase | Test | Status | Notes |
|-------|------|--------|-------|
| 1.1 | Migration Verified | ⏳ |  |
| 1.2 | Schema Correct | ⏳ |  |
| 1.3 | Data Populated | ⏳ |  |
| 2.1 | Backend Starts | ⏳ |  |
| 2.2 | User API Works | ⏳ |  |
| 2.3 | Admin API Works | ⏳ |  |
| 3.1 | Frontend Starts | ⏳ |  |
| 3.2 | User UI Works | ⏳ |  |
| 3.3 | Admin UI Works | ⏳ |  |
| 4.1 | E2E Call Flow | ⏳ |  |
| 4.2 | Fallback Works | ⏳ |  |
| 5.1 | Auth Enforced | ⏳ |  |
| 5.2 | Authz Enforced | ⏳ |  |

**Issues Found**: _______________

**Overall Status**: ⏳ PENDING

---

## 🚀 Next Steps After Testing

1. ✅ Fix any bugs found during testing
2. ✅ Update documentation with test results
3. ✅ Create user announcement/guide
4. ✅ Deploy to staging environment
5. ✅ Final staging tests
6. ✅ Deploy to production
7. ✅ Monitor logs and metrics
8. ✅ Collect user feedback

---

**Document Status**: Ready for Testing  
**Last Updated**: December 2024
