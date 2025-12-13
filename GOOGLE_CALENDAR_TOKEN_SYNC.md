# Google Calendar Token Synchronization

## Overview

The Google Calendar integration now automatically synchronizes OAuth tokens with an external microservice (e.g., chat agent server) after successful authentication. This enables the microservice to independently access Google Calendar on behalf of users.

---

## Architecture

```
┌─────────────┐
│   Frontend  │
│  (Port 5173)│
└──────┬──────┘
       │
       │ 1. Initiate OAuth
       ▼
┌─────────────┐
│   Backend   │
│  (Port 3000)│
│             │
│ • OAuth Flow│
│ • Save to DB│◄──2. Google OAuth Callback
│ • Sync Tokens
└──────┬──────┘
       │
       │ 3. POST tokens
       ▼
┌─────────────┐
│ Microservice│
│  (Port 4000)│
│             │
│ • Store tokens
│ • Access Calendar
└─────────────┘
```

### Flow:

1. **User initiates OAuth** in frontend (Dashboard → Integrations)
2. **Backend handles OAuth callback**:
   - Exchanges authorization code for tokens
   - Saves tokens to main database (`users` table)
   - ✅ **NEW**: Syncs tokens to external microservice
3. **Microservice receives tokens** via `POST /api/users/:user_id/google-calendar/connect`
4. Both services can now access Google Calendar independently

---

## Implementation Details

### Backend Changes

**File**: `backend/src/services/googleAuthService.ts`

#### New Methods:

1. **`syncTokensToMicroservice()`** - POST tokens to microservice after OAuth
2. **`deleteTokensFromMicroservice()`** - DELETE tokens when user disconnects

#### Key Features:

- **Non-blocking**: Microservice sync failures don't break main OAuth flow
- **Graceful degradation**: If `GOOGLE_CALENDAR_MICROSERVICE_URL` not set, sync is skipped
- **Comprehensive logging**: All sync attempts logged for debugging
- **Error handling**: Axios errors captured with full response details

---

## Configuration

### Environment Variables

Add to `backend/.env`:

```bash
# Google Calendar Microservice Configuration
# External microservice URL for syncing tokens (without trailing slash)
GOOGLE_CALENDAR_MICROSERVICE_URL=http://localhost:4000

# Or for production:
# GOOGLE_CALENDAR_MICROSERVICE_URL=https://chat-agent.example.com
```

### Required for OAuth (already configured):

```bash
GOOGLE_CALENDAR_CLIENT_ID=your_google_calendar_oauth_client_id
GOOGLE_CALENDAR_CLIENT_SECRET=your_google_calendar_oauth_client_secret
GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:3000/api/integrations/google/callback
```

---

## Microservice API Contract

The microservice **MUST** implement these endpoints:

### 1. Connect Google Calendar

**Endpoint**: `POST /api/users/:user_id/google-calendar/connect`

**Request Body**:
```json
{
  "access_token": "ya29.a0AfH6SMB...",
  "refresh_token": "1//0g...",
  "token_expiry": "2025-12-13T10:30:00Z",
  "scope": "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events"
}
```

**Success Response** (200):
```json
{
  "success": true,
  "message": "Google Calendar connected successfully",
  "user_id": "789895c8-4bd6-43e9-bfea-a4171ec47197",
  "token_expiry": "2025-12-13T10:30:00Z"
}
```

**Error Responses**:
- `400` - Missing required fields or invalid data
- `500` - Server error

### 2. Disconnect Google Calendar

**Endpoint**: `DELETE /api/google-tokens/:user_id`

**Success Response** (200):
```json
{
  "success": true,
  "message": "Google Calendar disconnected successfully",
  "user_id": "789895c8-4bd6-43e9-bfea-a4171ec47197"
}
```

**Error Responses**:
- `404` - No tokens found for user
- `500` - Server error

---

## Token Sync Behavior

### When tokens are synced:

| Event | Main DB | Microservice | Behavior |
|-------|---------|--------------|----------|
| **OAuth Connect** | ✅ Saved | ✅ Synced | Both have tokens |
| **OAuth Disconnect** | ❌ Cleared | ❌ Deleted | Both cleared |
| **Token Refresh** | ✅ Updated | ❌ Not synced | Main DB only* |

\* **Note**: Automatic token refreshes (when access token expires) only update the main database. Microservice must implement its own refresh logic using the `refresh_token`.

### Error Handling:

- **Microservice unreachable**: Main OAuth flow succeeds, warning logged
- **Microservice returns error**: Main OAuth flow succeeds, error logged
- **Timeout (10s)**: Main OAuth flow succeeds, timeout logged

---

## Logging

### Successful Sync:
```
🔄 Syncing Google Calendar tokens to microservice
   userId: abc123, microserviceUrl: http://localhost:4000
✅ Tokens synced to microservice successfully
   userId: abc123, tokenExpiry: 2025-12-13T10:30:00Z
```

### Skipped (no URL configured):
```
⚠️ GOOGLE_CALENDAR_MICROSERVICE_URL not configured, skipping token sync
   userId: abc123
```

### Failed Sync:
```
❌ Failed to sync tokens to microservice
   userId: abc123
   microserviceUrl: http://localhost:4000
   error: connect ECONNREFUSED 127.0.0.1:4000
   details: { status: undefined, statusText: undefined }
```

---

## Testing

### 1. Test OAuth Flow with Sync

```bash
# Set microservice URL in .env
GOOGLE_CALENDAR_MICROSERVICE_URL=http://localhost:4000

# Start backend
cd backend
npm run dev

# Start microservice (must be running on port 4000)
# Then initiate OAuth from frontend

# Check logs for:
# ✅ "Tokens synced to microservice successfully"
```

### 2. Test Without Microservice

```bash
# Comment out or remove microservice URL from .env
# GOOGLE_CALENDAR_MICROSERVICE_URL=

# Initiate OAuth

# Check logs for:
# ⚠️ "GOOGLE_CALENDAR_MICROSERVICE_URL not configured, skipping token sync"
```

### 3. Test Disconnect

```bash
# Disconnect Google Calendar from frontend

# Check logs for:
# 🔄 "Deleting Google Calendar tokens from microservice"
# ✅ "Tokens deleted from microservice successfully"
```

---

## Database Schema

Tokens stored in `users` table (main database):

```sql
-- Google Calendar OAuth columns
google_access_token TEXT
google_refresh_token TEXT
google_token_expiry TIMESTAMPTZ
google_calendar_connected BOOLEAN DEFAULT FALSE
google_calendar_id VARCHAR(255) DEFAULT 'primary'
google_email VARCHAR(255)
```

Microservice should use its own schema (see `GOOGLE_CALENDAR_TOKEN_API.md`):

```sql
CREATE TABLE google_calendar_tokens (
  user_id VARCHAR(50) PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMP NOT NULL,
  scope TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Security Considerations

1. **HTTPS in Production**: Always use HTTPS for microservice URLs in production
2. **Timeout**: 10-second timeout prevents hanging requests
3. **Non-blocking**: Failed sync doesn't break user experience
4. **Token Storage**: Both services must secure tokens (encrypted storage recommended)
5. **Access Control**: Microservice should validate user_id matches authenticated user

---

## Troubleshooting

### Problem: Tokens not syncing

**Check**:
1. Is `GOOGLE_CALENDAR_MICROSERVICE_URL` set in `.env`?
2. Is microservice running and accessible?
3. Check backend logs for error details
4. Verify microservice endpoint matches contract above

### Problem: OAuth works but microservice has no tokens

**Solution**:
- Disconnect and reconnect Google Calendar
- Check microservice logs for errors
- Verify POST endpoint accepts correct request body format

### Problem: Microservice returns 400

**Check**:
- Request body includes all required fields: `access_token`, `refresh_token`, `token_expiry`, `scope`
- `token_expiry` is valid ISO 8601 timestamp
- `scope` is non-empty string

---

## Migration Notes

### Upgrading from Previous Version

1. Add `GOOGLE_CALENDAR_MICROSERVICE_URL` to backend `.env`
2. Restart backend server
3. **Existing connections**: Users must disconnect and reconnect Google Calendar to sync tokens

### Rollback

If you need to disable microservice sync:
1. Remove `GOOGLE_CALENDAR_MICROSERVICE_URL` from `.env`
2. Restart backend
3. OAuth flow continues normally without sync

---

## Related Documentation

- [Google Calendar Token Management API](./GOOGLE_CALENDAR_TOKEN_API.md) - Microservice API specification
- [Meeting Booking Implementation](./MEETING_BOOKING_IMPLEMENTATION.md) - How meetings are scheduled
- [Google OAuth Implementation](./GOOGLE_OAUTH_IMPLEMENTATION.md) - OAuth flow details

---

## Support

For issues or questions:
1. Check backend logs for detailed error messages
2. Verify microservice is running and accessible
3. Test with `curl` to verify microservice endpoints
4. Review token expiry times (access tokens expire after ~1 hour)

---

**Last Updated**: December 13, 2025  
**Version**: 1.0.0
