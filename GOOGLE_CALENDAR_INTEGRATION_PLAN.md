# Google Calendar Integration - Complete Implementation Plan

**Created**: November 9, 2025  
**Status**: Planning Phase  
**Integration Type**: User-level Google Calendar & Meeting Booking

---

## 📋 Table of Contents
1. [Requirements Summary](#requirements-summary)
2. [Database Schema Analysis](#database-schema-analysis)
3. [New Tables Required](#new-tables-required)
4. [Existing Tables & Columns Usage](#existing-tables--columns-usage)
5. [Integration Flow](#integration-flow)
6. [Backend Architecture](#backend-architecture)
7. [Frontend Components](#frontend-components)
8. [API Endpoints](#api-endpoints)
9. [Security Considerations](#security-considerations)
10. [Implementation Checklist](#implementation-checklist)

---

## 📝 Requirements Summary

### Core Functionality
1. **User connects their Google Calendar** via OAuth 2.0
2. **Auto-schedule meetings** 10 seconds after AI extraction completes
3. **Meeting scheduled when**:
   - `demo_book_datetime` exists in `lead_analytics`
   - `extracted_email` exists in `lead_analytics`
   - User has connected Google Calendar
4. **Meeting details**:
   - Title: `{lead_name} + {lead_company_name} + Demo`
   - Attendees: Extracted email (prioritize contact email if available)
   - Description: Full lead info (tags, reasoning, recording, transcript)
5. **Operations supported**:
   - Create meeting
   - Cancel meeting
   - Reschedule meeting (from Lead Intelligence UI)
6. **Email notification** sent with every meeting action

---

## 🗄️ Database Schema Analysis

### Existing Tables We'll Use

#### 1. **users** Table
**Purpose**: Store Google Calendar OAuth tokens

**Existing Columns**:
```sql
id UUID PRIMARY KEY
email VARCHAR(255) NOT NULL
name VARCHAR(255) NOT NULL
```

**New Columns Needed**:
```sql
google_access_token TEXT                    -- OAuth access token
google_refresh_token TEXT                   -- OAuth refresh token  
google_token_expiry TIMESTAMPTZ            -- Token expiration time
google_calendar_connected BOOLEAN DEFAULT FALSE  -- Connection status
google_calendar_id VARCHAR(255)            -- Primary calendar ID (usually 'primary')
google_email VARCHAR(255)                  -- Google account email
```

**Why These Columns**:
- `google_access_token`: Short-lived token for API calls (expires in 1 hour)
- `google_refresh_token`: Long-lived token to get new access tokens
- `google_token_expiry`: Track when to refresh access token
- `google_calendar_connected`: Quick check if user has calendar connected
- `google_calendar_id`: Store which calendar to use (default: 'primary')
- `google_email`: The actual Google account email (may differ from user.email)

**Indexes Needed**:
```sql
CREATE INDEX idx_users_google_connected ON users(google_calendar_connected) 
  WHERE google_calendar_connected = TRUE;
```

---

#### 2. **lead_analytics** Table
**Purpose**: Source of meeting booking data

**Existing Columns We'll Use**:
```sql
id UUID PRIMARY KEY
call_id UUID REFERENCES calls(id)
user_id UUID REFERENCES users(id)           -- Owner of the calendar
phone_number VARCHAR(255)                    -- Lead phone number
extracted_name VARCHAR(255)                  -- Lead name for meeting title
extracted_email VARCHAR(255)                 -- Meeting attendee email
company_name VARCHAR(255)                    -- Company for meeting title
demo_book_datetime VARCHAR(255)              -- ISO 8601 timestamp (e.g., "2025-09-18T17:00:00+05:30")
reasoning JSONB                              -- AI reasoning for email
lead_status_tag VARCHAR(50)                  -- Lead quality tag
smart_notification VARCHAR(500)              -- Summary for email
created_at TIMESTAMPTZ                       -- When analysis was done
```

**Important Notes**:
- `demo_book_datetime` is VARCHAR storing ISO 8601 format: `"2025-09-18T17:00:00+05:30"`
- We need BOTH `demo_book_datetime` AND `extracted_email` to schedule
- Prioritize `contacts.email` over `extracted_email` if contact exists

**Query Pattern**:
```sql
-- Check if meeting should be scheduled
SELECT la.*, c.email as contact_email
FROM lead_analytics la
LEFT JOIN contacts c ON c.user_id = la.user_id AND c.phone_number = la.phone_number
WHERE la.user_id = $1
  AND la.demo_book_datetime IS NOT NULL
  AND (la.extracted_email IS NOT NULL OR c.email IS NOT NULL)
  AND la.analysis_type = 'individual'
```

---

#### 3. **contacts** Table
**Purpose**: Link meetings to contact records, get preferred email

**Existing Columns We'll Use**:
```sql
id UUID PRIMARY KEY
user_id UUID REFERENCES users(id)
phone_number VARCHAR(255)
email VARCHAR(255)                          -- PRIORITIZE THIS over extracted_email
name VARCHAR(255)
company VARCHAR(255)
```

**Why We Need This**:
- Contact email is more reliable than AI-extracted email
- Link meetings to contact records for history tracking
- Get contact_id for meeting record

**Priority Logic**:
```javascript
const attendeeEmail = contact?.email || leadAnalytics.extracted_email;
```

---

#### 4. **calls** Table
**Purpose**: Link meetings to original calls, get recording and transcript

**Existing Columns We'll Use**:
```sql
id UUID PRIMARY KEY
user_id UUID REFERENCES users(id)
phone_number VARCHAR(255)
recording_url TEXT                          -- Include in meeting email
transcript_id UUID REFERENCES transcripts(id)
status VARCHAR(50)
created_at TIMESTAMPTZ
```

**Why We Need This**:
- Get recording URL for meeting email
- Get transcript for meeting context
- Track which call triggered the meeting

---

#### 5. **transcripts** Table
**Purpose**: Include full transcript in meeting email

**Existing Columns We'll Use**:
```sql
id UUID PRIMARY KEY
call_id UUID REFERENCES calls(id)
user_id UUID REFERENCES users(id)
content TEXT                                -- Full transcript for email
```

---

### New Tables Required

#### 6. **calendar_meetings** Table (NEW)
**Purpose**: Track all scheduled meetings and their status

```sql
CREATE TABLE calendar_meetings (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relationships
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lead_analytics_id UUID REFERENCES lead_analytics(id) ON DELETE SET NULL,
  call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  
  -- Google Calendar data
  google_event_id VARCHAR(255) NOT NULL,     -- Google Calendar event ID for updates/cancellations
  google_calendar_id VARCHAR(255) NOT NULL,  -- Which calendar (usually 'primary')
  
  -- Meeting details
  meeting_title VARCHAR(500) NOT NULL,       -- "{lead_name} + {company_name} + Demo"
  meeting_description TEXT,                  -- Full lead details, tags, reasoning, links
  attendee_email VARCHAR(255) NOT NULL,      -- Who to invite
  attendee_name VARCHAR(255),                -- Attendee display name
  
  -- Scheduling
  meeting_start_time TIMESTAMPTZ NOT NULL,   -- Parsed from demo_book_datetime
  meeting_end_time TIMESTAMPTZ NOT NULL,     -- Start + 30 minutes (default)
  meeting_duration_minutes INTEGER DEFAULT 30,
  timezone VARCHAR(100),                     -- Original timezone from demo_book_datetime
  
  -- Status tracking
  status VARCHAR(50) DEFAULT 'scheduled',    -- scheduled, cancelled, rescheduled, completed
  cancellation_reason TEXT,                  -- Why meeting was cancelled
  rescheduled_from_meeting_id UUID REFERENCES calendar_meetings(id), -- Link to original if rescheduled
  
  -- Email tracking
  invite_email_sent BOOLEAN DEFAULT FALSE,
  invite_email_sent_at TIMESTAMPTZ,
  reminder_email_sent BOOLEAN DEFAULT FALSE,
  reminder_email_sent_at TIMESTAMPTZ,
  
  -- Metadata
  google_api_response JSONB,                 -- Store full Google API response
  meeting_metadata JSONB,                    -- Additional data (lead tags, scores, etc.)
  
  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),     -- Always user_id (not admin)
  
  -- Constraints
  UNIQUE(user_id, google_event_id),         -- Prevent duplicates
  CHECK(meeting_end_time > meeting_start_time),
  CHECK(status IN ('scheduled', 'cancelled', 'rescheduled', 'completed'))
);

-- Indexes
CREATE INDEX idx_calendar_meetings_user ON calendar_meetings(user_id);
CREATE INDEX idx_calendar_meetings_lead_analytics ON calendar_meetings(lead_analytics_id);
CREATE INDEX idx_calendar_meetings_call ON calendar_meetings(call_id);
CREATE INDEX idx_calendar_meetings_contact ON calendar_meetings(contact_id);
CREATE INDEX idx_calendar_meetings_status ON calendar_meetings(status) WHERE status = 'scheduled';
CREATE INDEX idx_calendar_meetings_start_time ON calendar_meetings(meeting_start_time);
CREATE INDEX idx_calendar_meetings_google_event ON calendar_meetings(google_event_id);

-- Trigger for updated_at
CREATE TRIGGER update_calendar_meetings_updated_at
  BEFORE UPDATE ON calendar_meetings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE calendar_meetings IS 'Tracks Google Calendar meetings scheduled from AI call analysis';
COMMENT ON COLUMN calendar_meetings.google_event_id IS 'Google Calendar event ID for API operations (update, cancel)';
COMMENT ON COLUMN calendar_meetings.status IS 'scheduled: active meeting, cancelled: user cancelled, rescheduled: moved to new time, completed: meeting happened';
COMMENT ON COLUMN calendar_meetings.rescheduled_from_meeting_id IS 'If this is a rescheduled meeting, links to original meeting record';
```

**Why This Structure**:
1. **Foreign Keys**: Link to all relevant entities (user, lead, call, contact)
2. **Google Integration**: Store event ID for updates, calendar ID for multi-calendar support
3. **Status Tracking**: Full lifecycle management (scheduled → completed/cancelled/rescheduled)
4. **Email Tracking**: Know when invites and reminders were sent
5. **Reschedule Support**: Track original meeting if rescheduled
6. **Audit Trail**: Full history of changes and operations

---

## 🔄 Integration Flow

### Flow 1: OAuth Connection
```
User clicks "Connect Google Calendar" 
  → Frontend redirects to /api/integrations/google/auth
  → Backend generates OAuth URL with scopes
  → User authorizes on Google
  → Google redirects to /api/integrations/google/callback?code=...
  → Backend exchanges code for tokens
  → Store tokens in users table
  → Set google_calendar_connected = TRUE
  → Redirect to frontend with success
```

**Google OAuth Scopes Needed**:
```javascript
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',  // Create, read, update events
  'https://www.googleapis.com/auth/userinfo.email'    // Get user's Google email
];
```

---

### Flow 2: Auto-Schedule Meeting (After AI Extraction)

**Location**: `backend/src/services/webhookService.ts` (after line 869)

```typescript
// EXISTING CODE: Contact update completes around line 869
logger.info('✅ Contact updated with AI extracted data', { ... });

// NEW CODE: Wait 10 seconds, then check for meeting scheduling
await new Promise(resolve => setTimeout(resolve, 10000));

// Check if we should schedule a meeting
if (individualData?.demo_book_datetime && 
    (individualData?.extraction?.email_address || contactResult.contactEmail)) {
  
  try {
    logger.info('📅 Scheduling Google Calendar meeting', {
      execution_id: executionId,
      demo_datetime: individualData.demo_book_datetime,
      attendee_email: contactResult.contactEmail || individualData.extraction.email_address,
      user_id: updatedCall.user_id
    });

    // Import meeting scheduler service
    const { MeetingSchedulerService } = await import('./meetingSchedulerService');
    
    // Schedule the meeting
    await MeetingSchedulerService.scheduleCalendarMeeting({
      userId: updatedCall.user_id,
      leadAnalyticsId: individualData.id,
      callId: updatedCall.id,
      contactId: contactResult.contactId,
      meetingDateTime: individualData.demo_book_datetime,
      attendeeEmail: contactResult.contactEmail || individualData.extraction.email_address,
      leadName: individualData.extraction?.name,
      companyName: individualData.extraction?.company_name,
      callDetails: {
        transcript: transcript.content,
        recording_url: updatedCall.recording_url,
        tags: individualData.lead_status_tag,
        reasoning: individualData.reasoning,
        smart_notification: individualData.extraction?.smartnotification
      }
    });

    logger.info('✅ Google Calendar meeting scheduled successfully', {
      execution_id: executionId
    });
  } catch (error) {
    logger.error('❌ Failed to schedule Google Calendar meeting', {
      execution_id: executionId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    // Don't fail webhook - meeting scheduling is not critical
  }
}
```

**Key Points**:
- **10-second wait**: Ensures AI analysis is fully complete
- **Email priority**: Use contact email if available, fallback to extracted
- **Non-blocking**: Errors don't fail the webhook
- **Full context**: Pass all lead details for meeting description

---

### Flow 3: Token Refresh (Automatic)

**Trigger**: Before any Google Calendar API call

```typescript
async function ensureValidToken(userId: string): Promise<string> {
  const user = await UserModel.findById(userId);
  
  if (!user.google_calendar_connected) {
    throw new Error('Google Calendar not connected');
  }
  
  // Check if token is expired or will expire in next 5 minutes
  const expiryBuffer = 5 * 60 * 1000; // 5 minutes
  const now = new Date();
  const expiryTime = new Date(user.google_token_expiry);
  
  if (expiryTime.getTime() - now.getTime() < expiryBuffer) {
    // Token expired or expiring soon, refresh it
    const newTokens = await googleAuthService.refreshAccessToken(
      user.google_refresh_token
    );
    
    // Update database
    await UserModel.update(userId, {
      google_access_token: newTokens.access_token,
      google_token_expiry: new Date(Date.now() + newTokens.expires_in * 1000)
    });
    
    return newTokens.access_token;
  }
  
  return user.google_access_token;
}
```

---

### Flow 4: Reschedule from Lead Intelligence UI

```
User opens Lead Details Modal
  → Sees "Demo Scheduled: [datetime]" with "Reschedule" button
  → Clicks Reschedule
  → Date/Time Picker opens
  → User selects new time
  → Frontend calls PUT /api/calendar/meetings/:meetingId/reschedule
  → Backend:
    1. Update Google Calendar event
    2. Mark old meeting as 'rescheduled'
    3. Create new meeting record linked to old one
    4. Send updated email invite
  → Frontend refreshes and shows new time
```

---

## 🏗️ Backend Architecture

### New Services

#### 1. **googleAuthService.ts**
```typescript
// OAuth flow management
- initiateOAuthFlow(userId: string): Promise<{ authUrl: string }>
- handleOAuthCallback(code: string, userId: string): Promise<void>
- refreshAccessToken(refreshToken: string): Promise<Tokens>
- disconnectCalendar(userId: string): Promise<void>
- getConnectionStatus(userId: string): Promise<ConnectionStatus>
```

#### 2. **googleCalendarService.ts**
```typescript
// Core Google Calendar API operations
- createEvent(userId: string, eventDetails: EventDetails): Promise<CalendarEvent>
- updateEvent(userId: string, eventId: string, updates: EventUpdates): Promise<CalendarEvent>
- cancelEvent(userId: string, eventId: string): Promise<void>
- getEvent(userId: string, eventId: string): Promise<CalendarEvent>
- listCalendars(userId: string): Promise<Calendar[]>
```

#### 3. **meetingSchedulerService.ts**
```typescript
// High-level meeting scheduling logic
- scheduleCalendarMeeting(params: ScheduleMeetingParams): Promise<Meeting>
- rescheduleMeeting(meetingId: string, newDateTime: string, userId: string): Promise<Meeting>
- cancelMeeting(meetingId: string, reason: string, userId: string): Promise<void>
- getMeetingsByLead(leadAnalyticsId: string, userId: string): Promise<Meeting[]>
- getUpcomingMeetings(userId: string, limit?: number): Promise<Meeting[]>
```

#### 4. **meetingEmailService.ts**
```typescript
// Email notifications for meetings
- sendMeetingInviteEmail(meeting: Meeting, leadDetails: LeadDetails): Promise<void>
- sendMeetingRescheduleEmail(oldMeeting: Meeting, newMeeting: Meeting): Promise<void>
- sendMeetingCancellationEmail(meeting: Meeting, reason: string): Promise<void>
- sendMeetingReminderEmail(meeting: Meeting): Promise<void>
```

### Models

#### 5. **CalendarMeeting.ts**
```typescript
interface CalendarMeetingInterface {
  id: string;
  user_id: string;
  lead_analytics_id?: string;
  call_id?: string;
  contact_id?: string;
  google_event_id: string;
  google_calendar_id: string;
  meeting_title: string;
  meeting_description: string;
  attendee_email: string;
  attendee_name?: string;
  meeting_start_time: Date;
  meeting_end_time: Date;
  meeting_duration_minutes: number;
  timezone?: string;
  status: 'scheduled' | 'cancelled' | 'rescheduled' | 'completed';
  cancellation_reason?: string;
  rescheduled_from_meeting_id?: string;
  invite_email_sent: boolean;
  invite_email_sent_at?: Date;
  reminder_email_sent: boolean;
  reminder_email_sent_at?: Date;
  google_api_response?: any;
  meeting_metadata?: any;
  created_at: Date;
  updated_at: Date;
}

class CalendarMeeting extends BaseModel<CalendarMeetingInterface> {
  constructor() { super('calendar_meetings'); }
  
  async findByLeadAnalytics(leadAnalyticsId: string): Promise<CalendarMeetingInterface[]>
  async findByContact(contactId: string, userId: string): Promise<CalendarMeetingInterface[]>
  async findUpcoming(userId: string, limit: number): Promise<CalendarMeetingInterface[]>
  async markAsCompleted(meetingId: string): Promise<void>
  async markAsCancelled(meetingId: string, reason: string): Promise<void>
}
```

---

## 🎨 Frontend Components

### 1. Integration Tab (NEW)
**Path**: `Frontend/src/pages/Integrations.tsx`

```typescript
function Integrations() {
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState('');
  const [upcomingMeetings, setUpcomingMeetings] = useState([]);
  
  return (
    <div className="integrations-page">
      {/* Google Calendar Section */}
      <section className="calendar-integration">
        <h2>Google Calendar Integration</h2>
        
        {!calendarConnected ? (
          <ConnectCalendarButton onClick={handleConnect} />
        ) : (
          <>
            <ConnectionStatus email={googleEmail} />
            <DisconnectButton onClick={handleDisconnect} />
            <UpcomingMeetingsList meetings={upcomingMeetings} />
          </>
        )}
      </section>
    </div>
  );
}
```

### 2. Lead Intelligence Enhancements
**Path**: `Frontend/src/components/leads/LeadDetailModal.tsx`

```typescript
// Add to existing modal
{lead.demoScheduled && (
  <div className="demo-scheduled-section">
    <label>Demo Scheduled</label>
    <div className="scheduled-meeting">
      <span>{formatDateTime(lead.demoScheduled)}</span>
      <button onClick={() => setShowRescheduleModal(true)}>
        Reschedule
      </button>
      <button onClick={() => handleCancelMeeting(lead.meetingId)}>
        Cancel
      </button>
    </div>
  </div>
)}

{/* Reschedule Modal */}
<RescheduleMeetingModal
  isOpen={showRescheduleModal}
  currentDateTime={lead.demoScheduled}
  onReschedule={handleReschedule}
  onClose={() => setShowRescheduleModal(false)}
/>
```

---

## 🔌 API Endpoints

### Authentication Endpoints

```typescript
// OAuth flow
GET  /api/integrations/google/auth
  → Initiates OAuth flow, redirects to Google

GET  /api/integrations/google/callback?code=...
  → Handles OAuth callback, exchanges code for tokens

POST /api/integrations/google/disconnect
  → Disconnects Google Calendar integration

GET  /api/integrations/google/status
  → Returns connection status
  Response: { connected: boolean, email: string }
```

### Meeting Management Endpoints

```typescript
GET  /api/calendar/meetings
  → Get user's upcoming meetings
  Query: ?limit=10&status=scheduled

GET  /api/calendar/meetings/:meetingId
  → Get specific meeting details

POST /api/calendar/meetings
  → Manually schedule a meeting (for admin/testing)
  Body: { leadAnalyticsId, attendeeEmail, dateTime, ... }

PUT  /api/calendar/meetings/:meetingId/reschedule
  → Reschedule existing meeting
  Body: { newDateTime: string }

DELETE /api/calendar/meetings/:meetingId
  → Cancel meeting
  Body: { reason: string }

GET  /api/calendar/meetings/lead/:leadAnalyticsId
  → Get all meetings for a specific lead
```

---

## 🔒 Security Considerations

### 1. Token Storage
- **Never log tokens**: Mask in logs
- **Encrypt at rest**: Consider encrypting tokens in database
- **Secure transmission**: Always HTTPS
- **Token rotation**: Refresh tokens automatically

### 2. Data Access Control
- **User isolation**: Users can only access their own calendar data
- **Meeting privacy**: Only show meetings to owner
- **Admin restrictions**: Admins cannot see user calendar tokens

### 3. OAuth Security
- **CSRF protection**: Use state parameter in OAuth flow
- **Redirect URI validation**: Whitelist allowed redirect URIs
- **Scope minimization**: Only request necessary scopes

### 4. API Rate Limiting
- **Google API limits**: 
  - Calendar API: 1,000,000 queries/day
  - 10 queries per second per user
- **Implement backoff**: Exponential backoff on rate limit errors

---

## ✅ Implementation Checklist

### Phase 1: Database Setup
- [ ] Create migration file `032_add_google_calendar_integration.sql`
- [ ] Add columns to `users` table
- [ ] Create `calendar_meetings` table
- [ ] Create indexes
- [ ] Run migration on development database
- [ ] Verify schema with `\d users` and `\d calendar_meetings`

### Phase 2: Backend - OAuth & Auth
- [ ] Install dependencies: `npm install googleapis`
- [ ] Create `googleAuthService.ts`
- [ ] Create `googleCalendarService.ts`
- [ ] Create OAuth routes in `routes/integrations.ts`
- [ ] Add OAuth credentials to `.env`
- [ ] Test OAuth flow with console.log

### Phase 3: Backend - Meeting Logic
- [ ] Create `CalendarMeeting.ts` model
- [ ] Create `meetingSchedulerService.ts`
- [ ] Create `meetingEmailService.ts`
- [ ] Integrate into `webhookService.ts` (after line 869)
- [ ] Add meeting API routes
- [ ] Test scheduling with mock data

### Phase 4: Frontend - Integration Tab
- [ ] Create `Integrations.tsx` page
- [ ] Add to navigation menu
- [ ] Create connect/disconnect buttons
- [ ] Add upcoming meetings list
- [ ] Style components

### Phase 5: Frontend - Lead Intelligence
- [ ] Update `LeadDetailModal.tsx`
- [ ] Add reschedule button
- [ ] Create reschedule modal
- [ ] Add cancel meeting functionality
- [ ] Update lead list to show scheduled meetings

### Phase 6: Email Templates
- [ ] Design meeting invite email template
- [ ] Design reschedule email template
- [ ] Design cancellation email template
- [ ] Test email delivery

### Phase 7: Testing
- [ ] Test OAuth flow end-to-end
- [ ] Test auto-schedule after AI extraction
- [ ] Test manual reschedule
- [ ] Test meeting cancellation
- [ ] Test token refresh
- [ ] Test with multiple users
- [ ] Test error scenarios

### Phase 8: Monitoring & Error Handling
- [ ] Add logging for all operations
- [ ] Add error tracking
- [ ] Monitor Google API usage
- [ ] Set up alerts for failures

---

## 📊 Data Flow Summary

### When AI Extraction Completes:

```
Webhook arrives
  ↓
AI extracts data (includes demo_book_datetime and email)
  ↓
Save to lead_analytics table
  ↓
Update/create contact
  ↓
⏰ Wait 10 seconds
  ↓
Check: Has demo_book_datetime? Has email? Calendar connected?
  ↓ YES
Query user's google tokens
  ↓
Refresh token if needed
  ↓
Parse ISO 8601 datetime
  ↓
Build meeting title: "{name} + {company} + Demo"
  ↓
Build description: Full lead details, tags, recording link
  ↓
Call Google Calendar API
  ↓
Save meeting to calendar_meetings table
  ↓
Send email invite with full context
  ↓
✅ Done
```

---

## 🔍 Critical Implementation Notes

### 1. DateTime Handling
```typescript
// demo_book_datetime format: "2025-09-18T17:00:00+05:30"
const startTime = new Date(leadAnalytics.demo_book_datetime);
const endTime = new Date(startTime.getTime() + 30 * 60000); // +30 minutes

// Google Calendar expects RFC3339 format
const googleEvent = {
  start: {
    dateTime: startTime.toISOString(),
    timeZone: 'Asia/Kolkata' // Extract from offset or default
  },
  end: {
    dateTime: endTime.toISOString(),
    timeZone: 'Asia/Kolkata'
  }
};
```

### 2. Email Priority Logic
```typescript
// Always prioritize contact email over AI-extracted
const attendeeEmail = contact?.email || leadAnalytics.extracted_email;

if (!attendeeEmail) {
  throw new Error('No email available for meeting invite');
}
```

### 3. Meeting Title Format
```typescript
const title = [
  leadAnalytics.extracted_name || 'Lead',
  leadAnalytics.company_name || '',
  'Demo'
].filter(Boolean).join(' + ');

// Examples:
// "John Smith + TechCorp + Demo"
// "Lead + Demo" (if no name/company)
```

### 4. Meeting Description Template
```typescript
const description = `
🎯 Demo Meeting with ${leadName}

📞 Call Details:
- Lead Status: ${tags}
- Phone: ${phoneNumber}
- Company: ${companyName}

🤖 AI Analysis:
${reasoning}

📝 Call Summary:
${smartNotification}

🔗 Resources:
- Recording: ${recordingUrl}
- Transcript: [View Full Transcript]

---
Scheduled via AI Calling Agent Platform
`.trim();
```

---

## 🎯 Success Criteria

1. ✅ User can connect Google Calendar in < 30 seconds
2. ✅ Meetings auto-schedule within 10 seconds of AI extraction
3. ✅ Email invites include all lead context
4. ✅ Reschedule works from Lead Intelligence UI
5. ✅ Cancellation updates both Google and our database
6. ✅ Token refresh happens automatically without user intervention
7. ✅ No duplicate meetings for same lead
8. ✅ Errors don't break webhook processing

---

## 📝 Environment Variables Needed

```env
# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/integrations/google/callback
GOOGLE_REDIRECT_URI_PROD=https://yourdomain.com/api/integrations/google/callback

# Email Service (reuse existing)
# SendGrid/SES/SMTP already configured for user notifications
```

---

## 🚀 Next Steps

1. **User provides**:
   - Google OAuth Client ID
   - Google OAuth Client Secret
   - Production domain for redirect URI

2. **I implement**:
   - Database migration
   - Backend services
   - Frontend components
   - Email templates
   - Testing suite

3. **We test together**:
   - OAuth flow
   - Auto-scheduling
   - Rescheduling
   - Cancellation
   - Error handling

---

**End of Documentation**  
**Ready for Implementation**: Awaiting Google OAuth credentials and approval to proceed.
