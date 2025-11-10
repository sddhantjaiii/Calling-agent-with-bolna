# User Guide: Managing Meeting Notification Preferences

## Where Users Can Enable/Disable Meeting Notifications

### Dashboard Access
Users can control meeting booked notifications through the **Settings page** in the dashboard.

### Step-by-Step Instructions

#### 1. Navigate to Settings
- Log into the dashboard
- Click on **Settings** in the main navigation menu
- Or navigate directly to `/settings`

#### 2. Open Notification Preferences
- On the Settings page, click the **Notifications** tab (first tab, with Bell icon)
- This tab is selected by default

#### 3. Find Meeting Booked Notifications Toggle
The notification preferences page displays several email notification options:

1. **Low Credit Alerts** - Credit balance warnings (15, 5, 0 credits)
2. **Credits Added Emails** - Confirmation when credits are added
3. **Campaign Summary Emails** - Campaign completion summaries with hot leads
4. **Meeting Booked Notifications** ⭐ **NEW** - Full context when meetings are scheduled
5. **Email Verification Reminders** - Account security reminders
6. **Marketing Emails** - Product updates and offers (coming soon)

#### 4. Toggle Meeting Notifications
- Locate **"Meeting Booked Notifications"** (with Calendar icon)
- Description: *"Get notified with full call details when AI agents schedule meetings with leads"*
- Click the toggle switch to enable (blue) or disable (gray)

#### 5. Save Changes
- After toggling any preferences, a **"Save Changes"** button appears at the bottom
- Click **"Save Changes"** to apply your preferences
- Or click **"Reset"** to revert to previous settings

### What the Notification Includes

When enabled, users receive a comprehensive email notification containing:

**Meeting Details:**
- Meeting date and time (with timezone)
- Duration
- Meeting title
- Google Calendar link (one-click add to calendar)

**Lead Information:**
- Lead name
- Email address
- Company name
- Phone number
- Lead status tag (visual color-coded badge)

**AI Analysis:**
- AI reasoning for why the meeting was booked
- Smart notification (AI's contextual message about the call)

**Call Context:**
- Full call transcript (scrollable, up to 2000 characters in email)
- Recording URL with "Listen to Recording" button
- Complete call details

### Default Setting
- **Default**: Meeting booked notifications are **ENABLED** by default
- Users can disable them at any time through Settings
- Changes take effect immediately after saving

### API Endpoints

For developers integrating with the notification system:

#### Get Current Preferences
```http
GET /api/user-notifications/preferences
Authorization: Bearer {token}
```

**Response:**
```json
{
  "preferences": {
    "id": "uuid",
    "user_id": "uuid",
    "low_credit_alerts": true,
    "credits_added_emails": true,
    "campaign_summary_emails": true,
    "meeting_booked_notifications": true,
    "email_verification_reminders": true,
    "marketing_emails": true,
    "created_at": "2025-11-10T12:00:00Z",
    "updated_at": "2025-11-10T12:00:00Z"
  }
}
```

#### Update Preferences
```http
PUT /api/user-notifications/preferences
Authorization: Bearer {token}
Content-Type: application/json

{
  "meeting_booked_notifications": false
}
```

**Response:**
```json
{
  "message": "Preferences updated successfully",
  "preferences": {
    "id": "uuid",
    "user_id": "uuid",
    "low_credit_alerts": true,
    "credits_added_emails": true,
    "campaign_summary_emails": true,
    "meeting_booked_notifications": false,
    "email_verification_reminders": true,
    "marketing_emails": true,
    "created_at": "2025-11-10T12:00:00Z",
    "updated_at": "2025-11-10T15:30:00Z"
  }
}
```

### System-Wide Control

**Environment Variable:**
```bash
EMAIL_MEETING_BOOKED_NOTIFICATIONS_ENABLED=true
```

**Admin Override:**
- If set to `false`, no meeting notifications will be sent regardless of user preferences
- If set to `true` (default), user preferences are respected
- Located in backend `.env` file

### Notification Behavior

#### When Notifications Are Sent
Meeting booked notifications are triggered when:
1. **AI Agent Books Meeting** - Via Bolna AI webhook after call analysis
2. **Manual Booking** - Through admin/dashboard meeting creation API

#### When Notifications Are NOT Sent
Notifications are blocked if:
1. User has disabled `meeting_booked_notifications` in preferences
2. System-wide flag `EMAIL_MEETING_BOOKED_NOTIFICATIONS_ENABLED=false`
3. Meeting was already notified (idempotency key prevents duplicates)

#### Idempotency
- Each meeting notification uses a unique idempotency key: `meeting-booked-{meeting_id}`
- Prevents duplicate notifications if webhook is retried or meeting is updated
- Ensures users receive exactly one notification per meeting

### Database Schema

**Table:** `notification_preferences`

```sql
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  low_credit_alerts BOOLEAN DEFAULT true NOT NULL,
  credits_added_emails BOOLEAN DEFAULT true NOT NULL,
  campaign_summary_emails BOOLEAN DEFAULT true NOT NULL,
  meeting_booked_notifications BOOLEAN DEFAULT true NOT NULL, -- NEW
  email_verification_reminders BOOLEAN DEFAULT true NOT NULL,
  marketing_emails BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);
```

### Migration Required

To enable this feature, run the database migration:

```bash
psql -d your_database -f backend/migrations/20251110151507_add_meeting_booked_notifications.sql
```

Or if using automated migrations:
```bash
cd backend
npm run migrate
```

### Testing User Flow

1. **Enable Notifications:**
   - Go to Settings → Notifications tab
   - Ensure "Meeting Booked Notifications" toggle is ON (blue)
   - Click "Save Changes"

2. **Trigger Meeting Booking:**
   - Have AI agent book a meeting via phone call
   - Or manually create a meeting via API/dashboard

3. **Check Email:**
   - User should receive comprehensive email within seconds
   - Email includes meeting details, lead info, transcript, recording, AI analysis

4. **Disable Notifications:**
   - Go to Settings → Notifications tab
   - Turn OFF "Meeting Booked Notifications" toggle
   - Click "Save Changes"

5. **Verify Blocking:**
   - Trigger another meeting booking
   - User should NOT receive email
   - Notification should be logged as 'skipped' in database

### Troubleshooting

**Issue: Not receiving meeting notifications**

Check:
1. User preference is enabled in Settings → Notifications
2. Environment variable `EMAIL_MEETING_BOOKED_NOTIFICATIONS_ENABLED=true`
3. Email verification is complete (check user's verified status)
4. Check notification logs in database:
   ```sql
   SELECT * FROM notifications 
   WHERE user_id = 'your-user-id' 
   AND notification_type = 'meeting_booked'
   ORDER BY created_at DESC;
   ```

**Issue: Receiving duplicate notifications**

Check:
1. Idempotency keys are being generated correctly
2. Database constraint on idempotency keys is working
3. Webhook isn't being retried with different execution IDs

**Issue: Notification sent but preference was disabled**

Check:
1. Timing - was preference changed after meeting was created?
2. Cache invalidation - preference changes should be immediate
3. Database transaction - ensure preference update committed before meeting creation

### Support

For issues or questions:
- Check backend logs for notification service errors
- Verify database migration completed successfully
- Test API endpoints directly using curl/Postman
- Contact support with notification ID from database

### Future Enhancements

Planned features:
- **Digest Mode**: Batch multiple meeting notifications into daily digest
- **Slack Integration**: Send meeting notifications to Slack channels
- **SMS Notifications**: Critical meeting alerts via SMS
- **Custom Templates**: Allow users to customize email template
- **Meeting Reminders**: Automatic reminders before scheduled meetings
- **Notification History**: View all past notifications in dashboard
