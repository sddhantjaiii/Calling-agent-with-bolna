# 📅 Meeting Scheduling Pipeline - Complete Analysis

## 🔄 Auto-Schedule Flow (Webhook Trigger)

### Pipeline Overview
```
1. Call Ends
   ↓
2. Webhook Received (Bolna/Bland AI)
   ↓
3. Transcript Fetched & Saved
   ↓
4. OpenAI Analyzes Call → Returns demo_book_datetime
   ↓
5. Lead Analytics Saved (with demo_book_datetime)
   ↓
6. Contact Updated (if exists) OR Created (if new)
   ↓
7. Email Extraction & Validation
   ↓
8. Auto-Schedule Check
   ↓
9. Google Calendar Event Creation
   ↓
10. Calendar Meeting Record Saved
   ↓
11. Email Invite Sent (optional)
```

---

## 📍 Current Implementation (webhookService.ts lines 890-986)

### Step 1: Email Resolution
```typescript
// Priority order for email:
let attendeeEmail = contact?.email || null;  // 1. Contact email (if exists)
if (!attendeeEmail) {
  attendeeEmail = individualData?.extraction?.email_address || null;  // 2. AI extracted email
}
```

### Step 2: Auto-Schedule Trigger Condition
```typescript
if (individualData?.demo_book_datetime && attendeeEmail) {
  // ✅ Schedule meeting
} else {
  // ⏭️ Skip scheduling
  // Logs reason: no datetime OR no email
}
```

### Step 3: Lead Analytics Lookup
```typescript
// Query for lead_analytics.id by call_id
const leadAnalyticsResult = await database.query(
  'SELECT id FROM lead_analytics WHERE call_id = $1 AND analysis_type = $2',
  [updatedCall.id, 'individual']
);
leadAnalyticsId = leadAnalyticsResult.rows[0]?.id;
```

### Step 4: Call Meeting Scheduler
```typescript
const meeting = await MeetingSchedulerService.scheduleCalendarMeeting({
  userId: updatedCall.user_id,
  leadAnalyticsId,
  callId: updatedCall.id,
  contactId: contactResult.contactId || undefined,
  meetingDateTime: individualData.demo_book_datetime,
  attendeeEmail,  // ⚠️ No email validation here
  leadName: individualData.extraction?.name || undefined,
  companyName: individualData.extraction?.company_name || undefined,
  callDetails: { transcript, recording_url, tags, reasoning, smart_notification }
});
```

### Step 5: Error Handling
```typescript
catch (meetingError) {
  logger.error('❌ Failed to schedule Google Calendar meeting');
  // ⚠️ Don't fail webhook - meeting scheduling is optional
}
```

---

## 🚨 EDGE CASES & ISSUES

### 1️⃣ **No Email Validation** ❌
**Current State:**
- No regex validation before sending to Google Calendar API
- Invalid emails (e.g., "test", "abc@", "user@domain") pass through

**What Happens:**
- Google Calendar API **rejects** invalid emails with error
- Meeting creation **fails**
- Error logged but webhook continues
- Contact shows in Lead Intelligence **without** meeting

**Risk Level:** 🔴 HIGH
- AI might extract wrong email from transcript
- Typos in customer-provided email
- Contact record has outdated/invalid email

**Fix Needed:**
```typescript
// Add email validation before scheduling
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// In webhook:
if (attendeeEmail && !isValidEmail(attendeeEmail)) {
  logger.warn('Invalid email format, skipping meeting schedule', {
    email: attendeeEmail,
    call_id: updatedCall.id
  });
  attendeeEmail = null;  // Reset to skip scheduling
}
```

---

### 2️⃣ **Missing Email Scenarios** ⚠️

#### Scenario A: Inbound Call, No Contact Exists
- **Phone Number:** ✅ Available
- **Contact Record:** ❌ Doesn't exist
- **AI Extraction:** ❌ Customer didn't share email in call
- **Result:** `attendeeEmail = null` → **No meeting scheduled**

#### Scenario B: Outbound Call, Contact Without Email
- **Phone Number:** ✅ Available
- **Contact Record:** ✅ Exists
- **Contact Email:** ❌ `null` or empty
- **AI Extraction:** ❌ Customer didn't share email in call
- **Result:** `attendeeEmail = null` → **No meeting scheduled**

#### Scenario C: Contact Email Exists BUT AI Extracted Different Email
- **Contact Email:** `old@company.com`
- **AI Extracted Email:** `new@company.com`
- **Current Behavior:** Uses **contact email** (priority 1)
- **Risk:** Customer might have said "use my new email" but system uses old one

**Current Logging:**
```typescript
logger.debug('⏭️ Skipping calendar meeting scheduling', {
  has_demo_datetime: !!individualData?.demo_book_datetime,
  has_email: !!attendeeEmail,
  reason: !individualData?.demo_book_datetime 
    ? 'No demo_book_datetime in AI analysis'
    : 'No email address available (extracted or contact)'
});
```

---

### 3️⃣ **Phone Number Without leadAnalyticsId** ⚠️

**Current Flow:**
1. Webhook tries to get `leadAnalyticsId` by querying `call_id`
2. If query fails → `leadAnalyticsId = undefined`
3. Meeting scheduler called **with undefined leadAnalyticsId**
4. Phone-based lookup runs **BEFORE** creating meeting (lines 167-201)
5. If phone number provided → looks up via phone → populates IDs

**Edge Case:**
- If `leadAnalyticsId` query fails AND `phoneNumber` not passed
- **Result:** Meeting created with **NULL foreign keys**
- Foreign Keys: `lead_analytics_id`, `call_id`, `contact_id` all NULL
- **Impact:** Meeting won't show in Lead Intelligence (LATERAL JOIN fails)

**Current Code (webhookService.ts):**
```typescript
// ❌ phoneNumber NOT passed to scheduler
const meeting = await MeetingSchedulerService.scheduleCalendarMeeting({
  userId: updatedCall.user_id,
  leadAnalyticsId,
  callId: updatedCall.id,
  contactId: contactResult.contactId || undefined,
  meetingDateTime: individualData.demo_book_datetime,
  attendeeEmail,
  // ❌ Missing: phoneNumber: updatedCall.phone_number
  ...
});
```

**Fix Needed:**
Add `phoneNumber` to the meeting scheduler call in webhook:
```typescript
const meeting = await MeetingSchedulerService.scheduleCalendarMeeting({
  userId: updatedCall.user_id,
  leadAnalyticsId,
  callId: updatedCall.id,
  contactId: contactResult.contactId || undefined,
  phoneNumber: updatedCall.phone_number,  // ✅ ADD THIS
  meetingDateTime: individualData.demo_book_datetime,
  attendeeEmail,
  ...
});
```

---

### 4️⃣ **Google Calendar API Rejection Scenarios** 🔴

#### Case A: Invalid Email Format
```
Error: "Invalid value for: attendee.email"
Code: 400
```
- **Current Handling:** Caught, logged, webhook continues
- **Result:** No meeting created, no user notification

#### Case B: User Revoked Google OAuth
```
Error: "Invalid Credentials"
Code: 401
```
- **Check:** `user.google_calendar_connected` flag might be **stale**
- **Result:** All auto-schedules fail until user re-authenticates

#### Case C: Calendar Rate Limit Hit
```
Error: "Rate Limit Exceeded"
Code: 429
```
- **Risk:** Bulk calls processed, all try to schedule meetings
- **Current Handling:** Each fails individually, no retry logic

#### Case D: Past Meeting Time
```
AI returns: "2025-11-08T10:00:00+05:30"
Current date: 2025-11-09
```
- **Current Behavior:** Warning logged, scheduling continues
- **Google Calendar:** Accepts past events (creates them in the past)
- **User Experience:** Confusing - shows past meeting in calendar

---

### 5️⃣ **Concurrent Calls from Same Contact** ⚠️

**Scenario:**
1. Call 1 ends → Webhook processes → Schedules meeting for Nov 10
2. Call 2 ends (same phone) → Webhook processes → Schedules meeting for Nov 15
3. Both meetings created successfully

**Current Behavior:**
- **No duplicate check** - multiple meetings can be scheduled
- Lead Intelligence shows **most recent** meeting (ORDER BY meeting_start_time DESC LIMIT 1)
- Older meeting exists but hidden from UI

**Risk:**
- Customer gets 2+ Google Meet invites
- Only latest meeting visible in Lead Intelligence
- Orphaned meetings in database

---

### 6️⃣ **demo_book_datetime Parsing Issues** ⚠️

**AI System Prompt (agentService.ts):**
```
- Output format: "2025-09-18T17:00:00+05:30" (Asia/Kolkata)
- If UTC provided: Convert to IST
- If no timezone: Assume IST
```

**Edge Cases:**

#### Case A: AI Returns UTC
```
AI: "2025-11-10T04:30:00Z"
Backend receives: "2025-11-10T04:30:00Z"
Parsed as: 2025-11-10 04:30 UTC
```
- **Issue:** Meeting created at 4:30 AM UTC = 10:00 AM IST
- **Expected:** Customer said "10:00 AM IST" but meeting is 5.5 hours earlier

#### Case B: AI Returns Ambiguous Format
```
AI: "2025-11-10T10:00:00" (no timezone)
```
- **Current Parsing:** `new Date(meetingDateTime)` → Uses **server timezone**
- **Risk:** Server in UTC, customer in IST → wrong time

#### Case C: Invalid Date String
```
AI: "Tomorrow at 3 PM" (not ISO format)
```
- **Check:** `isNaN(startTime.getTime())` → Throws error
- **Result:** Meeting scheduling fails

---

### 7️⃣ **Contact Update Race Condition** ⚠️

**Current Flow:**
```typescript
// 1. Update contact
await contactService.updateContact(contact.id, {
  email: extractedEmail,
  ...
});

// 2. Fetch updated contact
let attendeeEmail = contact?.email || null;
```

**Edge Case:**
- If contact update **fails** (validation, constraint, etc.)
- Code continues with old contact data
- `attendeeEmail` might still be null even if AI extracted valid email

---

## ✅ RECOMMENDATIONS

### High Priority Fixes

1. **Add Email Validation** (5 min)
```typescript
// In webhookService.ts before auto-schedule check
if (attendeeEmail) {
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(attendeeEmail)) {
    logger.warn('❌ Invalid email format detected', {
      email: attendeeEmail,
      call_id: updatedCall.id,
      source: contact?.email ? 'contact' : 'AI extraction'
    });
    attendeeEmail = null;
  }
}
```

2. **Pass phoneNumber to Meeting Scheduler** (2 min)
```typescript
const meeting = await MeetingSchedulerService.scheduleCalendarMeeting({
  // ... existing params
  phoneNumber: updatedCall.phone_number,  // ADD THIS
});
```

3. **Check Meeting Time Validity** (5 min)
```typescript
const startTime = new Date(meetingDateTime);
const now = new Date();

if (startTime < now) {
  logger.warn('⚠️ Meeting time is in the past, not scheduling', {
    meetingDateTime,
    currentTime: now.toISOString()
  });
  // Skip scheduling for past times
  return;
}
```

### Medium Priority Enhancements

4. **Duplicate Meeting Check** (15 min)
```typescript
// Check if meeting already exists for this contact within next 30 days
const existingMeeting = await database.query(
  `SELECT id FROM calendar_meetings 
   WHERE user_id = $1 AND status = 'scheduled'
   AND (lead_analytics_id = $2 OR contact_id = $3 OR call_id = $4)
   AND meeting_start_time > NOW() 
   AND meeting_start_time < NOW() + INTERVAL '30 days'`,
  [userId, leadAnalyticsId, contactId, callId]
);

if (existingMeeting.rows.length > 0) {
  logger.info('⏭️ Skipping: Meeting already exists for this contact', {
    existingMeetingId: existingMeeting.rows[0].id
  });
  return;
}
```

5. **Google OAuth Freshness Check** (10 min)
```typescript
// In meetingSchedulerService.ts before creating event
try {
  // Test calendar access
  const calendar = await this.getCalendarClient(userId);
  await calendar.calendarList.list({ maxResults: 1 });
} catch (authError) {
  // Mark as disconnected
  await UserModel.update(userId, { google_calendar_connected: false });
  throw new MeetingSchedulingError(
    'Google Calendar access revoked. Please reconnect.',
    'AUTH_EXPIRED'
  );
}
```

### Low Priority Improvements

6. **Email Preference Logic** (20 min)
```typescript
// If AI extracted email is different from contact email, let user choose
if (contact?.email && extractedEmail && contact.email !== extractedEmail) {
  logger.info('📧 Multiple emails detected', {
    contactEmail: contact.email,
    extractedEmail: extractedEmail,
    usingEmail: contact.email  // Currently defaults to contact
  });
  // Future: Add UI prompt to select which email
}
```

7. **Retry Logic for Rate Limits** (30 min)
```typescript
// Exponential backoff for Google API calls
async function createEventWithRetry(params, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await googleCalendarService.createEvent(params);
    } catch (error) {
      if (error.code === 429 && i < maxRetries - 1) {
        await sleep(Math.pow(2, i) * 1000);  // 1s, 2s, 4s
        continue;
      }
      throw error;
    }
  }
}
```

---

## 📊 Complete Edge Case Matrix

| Scenario | demo_book_datetime | attendeeEmail | Contact | Result | Risk |
|----------|-------------------|---------------|---------|--------|------|
| Happy Path | ✅ Valid ISO | ✅ Valid | ✅ Exists | Meeting created | ✅ |
| No email in call | ✅ Valid ISO | ❌ null | ❌ None | Skipped | 🟡 Expected |
| Invalid email | ✅ Valid ISO | ❌ "abc@" | ✅ Has it | **API Error** | 🔴 **FIX NEEDED** |
| Past datetime | ✅ Past date | ✅ Valid | ✅ Exists | Created in past | 🟡 Confusing |
| No datetime | ❌ null | ✅ Valid | ✅ Exists | Skipped | 🟡 Expected |
| Duplicate call | ✅ Valid ISO | ✅ Valid | ✅ Same | 2 meetings | 🟠 Enhancement |
| Revoked OAuth | ✅ Valid ISO | ✅ Valid | ✅ Exists | **Auth Error** | 🟠 Check needed |
| Wrong timezone | ✅ No +offset | ✅ Valid | ✅ Exists | Wrong time | 🟠 AI issue |
| No phone passed | ✅ Valid ISO | ✅ Valid | ✅ Exists | NULL foreign keys | 🔴 **FIX NEEDED** |

---

## 🎯 Action Items Summary

### Must Fix (Critical)
1. ✅ Email validation before Google API call
2. ✅ Pass phoneNumber to meeting scheduler in webhook
3. ✅ Reject past meeting times

### Should Fix (Important)
4. Duplicate meeting prevention
5. OAuth token freshness validation
6. Better error messages to frontend

### Nice to Have (Enhancement)
7. Email preference selection UI
8. Retry logic for rate limits
9. Timezone parsing improvements in AI prompt

---

## 📝 Testing Checklist

- [ ] Test with invalid email: "test@"
- [ ] Test with no email (inbound call)
- [ ] Test with past datetime
- [ ] Test with concurrent calls (same phone)
- [ ] Test after revoking Google OAuth
- [ ] Test with AI returning UTC vs IST
- [ ] Test with phoneNumber missing
- [ ] Test with contact having old email, AI extracts new one
- [ ] Test reschedule flow end-to-end
- [ ] Test meeting link appearing in Lead Intelligence

---

**Last Updated:** 2025-11-09  
**Status:** ✅ Reschedule working, ⚠️ Edge cases need fixes
