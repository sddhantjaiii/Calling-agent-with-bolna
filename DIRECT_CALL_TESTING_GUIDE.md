# Direct Call Testing Guide

## Prerequisites
1. Backend server running
2. Frontend dev server running  
3. At least one active agent created
4. At least one contact in the system
5. User has sufficient credits

## Test Steps

### 1. Basic Direct Call Flow

**Steps:**
1. Navigate to Contacts page
2. Find any contact in the list
3. Click the action menu (three dots) on the contact row
4. Click "Call" option
5. **Expected**: CallAgentModal opens

**Verify Modal Content:**
- ✅ Modal title: "Initiate Direct Call"
- ✅ Contact name and phone number displayed
- ✅ Agent dropdown loads (shows spinning loader first)
- ✅ Agent dropdown populated with active agents
- ✅ "Call Now" button present
- ✅ Cancel button present

**Initiate Call:**
6. Select an agent from dropdown
7. Click "Call Now" button
8. **Expected**: 
   - Button shows "Initiating..." with spinner
   - After ~1-2 seconds, success toast appears
   - Modal closes automatically
   - Toast message: "Calling [Contact Name] ([Phone])..."

### 2. Check Network Request

**Using Browser DevTools:**
1. Open Network tab (F12)
2. Filter by "initiate"
3. Perform call from step 1
4. **Verify Request:**
   ```
   URL: POST /api/calls/initiate
   Headers:
     Authorization: Bearer <token>
     Content-Type: application/json
   Body:
     {
       "contactId": "...",
       "agentId": "...",
       "phoneNumber": "+1..."
     }
   ```
5. **Verify Response (201):**
   ```json
   {
     "success": true,
     "call": {
       "id": "uuid",
       "execution_id": "...",
       "status": "initiated",
       "recipient": "+1..."
     }
   }
   ```

### 3. Error Scenarios

#### A. No Active Agents
1. Deactivate all agents
2. Try to initiate call
3. **Expected**: Modal shows "No active agents available. Please create an agent first."
4. "Call Now" button disabled

#### B. Insufficient Credits
1. Set user credits to 0 in database
2. Try to initiate call
3. **Expected**: 
   - 402 error from API
   - Toast: "Insufficient credits. Please purchase more credits to make calls."

#### C. Missing Phone Number
1. Create contact without phone number
2. Try to call that contact
3. **Expected**: Toast: "Contact does not have a phone number."

#### D. Network Error
1. Stop backend server
2. Try to initiate call
3. **Expected**: Toast: "Failed to initiate call. Please try again."

### 4. Database Verification

**After successful call:**
1. Check `calls` table:
   ```sql
   SELECT * FROM calls 
   WHERE bolna_execution_id = '<execution_id_from_response>'
   ORDER BY created_at DESC 
   LIMIT 1;
   ```
2. **Verify fields:**
   - `user_id` matches current user
   - `agent_id` matches selected agent
   - `contact_id` matches contact
   - `phone_number` matches contact phone
   - `status` = 'in_progress'
   - `call_source` = 'phone' (or check what CallService sets)
   - `bolna_execution_id` populated
   - `created_at` is recent

### 5. User Credits Check

**Before call:**
```sql
SELECT credits FROM users WHERE id = '<user_id>';
```
Record the value.

**After call completes:**
- Credits should be decremented based on call duration
- Check billing/transaction records

### 6. Console Logs

**Backend logs should show:**
```
[CallController] Initiating direct call { userId: '...', agentId: '...', contactId: '...', phoneNumber: '+1...' }
Initiating call for user ... to +1...
Call initiated successfully. Execution ID: ..., Call ID: ...
[CallController] Direct call initiated successfully { callId: '...', executionId: '...' }
```

**Frontend console should show:**
```
Call initiated: <callId>
```

### 7. Integration Testing

**Full Flow:**
1. Create a new contact
2. Create a new agent
3. Initiate call to new contact with new agent
4. Verify call appears in Calls page
5. Check call status in Calls list
6. Verify contact shows call history

### 8. UI/UX Testing

**Modal Behavior:**
- [ ] Modal backdrop clicks don't close modal (only Cancel button)
- [ ] ESC key closes modal
- [ ] Loading states show properly
- [ ] Buttons disable during loading
- [ ] Toast notifications auto-dismiss
- [ ] Modal state clears on close

**Accessibility:**
- [ ] Tab navigation works
- [ ] Focus management correct
- [ ] Screen reader compatible
- [ ] Keyboard shortcuts work

## Quick Test Script

```javascript
// Run in browser console after opening ContactList
const testDirectCall = async () => {
  // Get first contact
  const contactRow = document.querySelector('[data-contact-row]');
  if (!contactRow) {
    console.error('No contacts found');
    return;
  }
  
  // Click action menu
  const actionButton = contactRow.querySelector('[data-action-button]');
  actionButton?.click();
  
  // Wait for menu
  await new Promise(r => setTimeout(r, 100));
  
  // Click Call option
  const callOption = document.querySelector('[data-call-option]');
  callOption?.click();
  
  console.log('Modal should be open now');
};

testDirectCall();
```

## Expected Results Summary

✅ **Success Path:**
- Modal opens quickly (< 500ms)
- Agents load within 1-2 seconds
- Call initiates within 2-3 seconds
- Success feedback immediate
- Modal closes automatically
- Call record created in DB
- Bolna.ai receives call request

❌ **Failure Paths Handled:**
- No agents → Clear error message
- No credits → Purchase prompt
- Invalid data → Validation errors
- Network issues → Retry suggestion
- API errors → User-friendly messages

## Performance Benchmarks

- Agent loading: < 2s
- Call initiation: < 3s
- Modal open/close: < 300ms
- Network request: < 1s (excluding Bolna.ai processing)

## Known Issues / Limitations

1. No call preview/confirmation step
2. Cannot edit phone number before calling
3. No "recent agents" quick select
4. Modal doesn't remember last selected agent
5. No bulk direct calling (use campaign for that)

## Future Enhancements

- [ ] Add call notes field
- [ ] Show estimated cost before calling
- [ ] Add "Call & Record" option
- [ ] Recent agents quick select
- [ ] Call scheduling
- [ ] Call retry on failure
- [ ] Call quality feedback
