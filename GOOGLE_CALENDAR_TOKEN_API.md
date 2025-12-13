# Google Calendar Token Management API (Chat Agent Server)

This document describes the endpoints for managing Google Calendar OAuth tokens integration between the main backend (port 3000) and the **chat agent server** (port 4000).

---

## Overview

The main backend (port 3000) handles the Google OAuth flow and stores tokens in its database. After successful OAuth, it **automatically syncs** the tokens to the chat agent server. These tokens are used by the chat agent to book meetings via Google Calendar.

**Chat Agent Server Base URL:** `http://localhost:4000` (configurable via `CHAT_AGENT_SERVER_URL` environment variable)

---

## Endpoints

### 1. Store Google Calendar Tokens

Stores Google Calendar OAuth tokens after successful authentication in the dashboard.

**Endpoint:** `POST /api/users/:user_id/google-calendar/connect`

**URL Parameters:**
- `user_id` (required) - User ID to associate the tokens with

**Request Body:**
```json
{
  "access_token": "ya29.a0AfH6SMB...",
  "refresh_token": "1//0g...",
  "token_expiry": "2025-12-13T10:30:00Z",
  "scope": "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events"
}
```

**Request Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `access_token` | string | Yes | Google OAuth access token |
| `refresh_token` | string | Yes | Google OAuth refresh token |
| `token_expiry` | string | Yes | ISO 8601 timestamp when the access token expires |
| `scope` | string | Yes | Space-separated OAuth scopes granted |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Google Calendar connected successfully",
  "user_id": "789895c8-4bd6-43e9-bfea-a4171ec47197",
  "token_expiry": "2025-12-13T10:30:00Z"
}
```

**Error Responses:**

**400 - Missing user_id:**
```json
{
  "success": false,
  "error": "Missing user_id in URL"
}
```

**400 - Missing required fields:**
```json
{
  "success": false,
  "error": "Missing required fields: access_token, refresh_token, token_expiry, scope"
}
```

**400 - Invalid token_expiry format:**
```json
{
  "success": false,
  "error": "Invalid token_expiry format. Expected ISO 8601 timestamp"
}
```

**500 - Server error:**
```json
{
  "success": false,
  "error": "Failed to connect Google Calendar"
}
```

---

### 2. Get Google Calendar Token Details

Retrieves stored Google Calendar token information for a specific user, including expiration status.

**Endpoint:** `GET /api/google-tokens/:user_id`

**URL Parameters:**
- `user_id` (required) - User ID to retrieve tokens for

**Request Body:** None

**Success Response (200):**
```json
{
  "success": true,
  "user_id": "789895c8-4bd6-43e9-bfea-a4171ec47197",
  "token_info": {
    "access_token": "ya29.a0AfH6SMBvxG5cKqP...",
    "refresh_token": "1//0gZ8hR6mTp4L...",
    "token_expiry": "2025-12-13T10:30:00.000Z",
    "is_expired": false,
    "expires_in_minutes": 45,
    "scope": "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events",
    "created_at": "2025-12-13T09:00:00.000Z",
    "updated_at": "2025-12-13T09:00:00.000Z"
  }
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `access_token` | string | Full Google OAuth access token |
| `refresh_token` | string | Full Google OAuth refresh token |
| `token_expiry` | string | Timestamp when the access token expires |
| `is_expired` | boolean | Whether the access token is currently expired |
| `expires_in_minutes` | number | Minutes until expiration (negative if expired) |
| `scope` | string | OAuth scopes granted |
| `created_at` | string | When the token was first stored |
| `updated_at` | string | When the token was last updated |

**Error Responses:**

**404 - No tokens found:**
```json
{
  "success": false,
  "error": "No Google Calendar connected for this user"
}
```

**500 - Server error:**
```json
{
  "success": false,
  "error": "Failed to retrieve token"
}
```

---

### 3. Delete Google Calendar Token

Disconnects Google Calendar integration by deleting stored tokens for a user.

**Endpoint:** `DELETE /api/google-tokens/:user_id`

**URL Parameters:**
- `user_id` (required) - User ID to delete tokens for

**Request Body:** None

**Success Response (200):**
```json
{
  "success": true,
  "message": "Google Calendar disconnected successfully",
  "user_id": "789895c8-4bd6-43e9-bfea-a4171ec47197"
}
```

**Error Responses:**

**404 - No tokens found:**
```json
{
  "success": false,
  "error": "No Google Calendar connected for this user"
}
```

**500 - Server error:**
```json
{
  "success": false,
  "error": "Failed to disconnect Google Calendar"
}
```

---

## Integration Flow

### Main Backend → Chat Agent Server Integration

1. **User clicks "Connect Google Calendar" in frontend dashboard**
2. **Frontend initiates OAuth via main backend (port 3000):**
   ```
   GET http://localhost:3000/api/integrations/google/auth
   ```
3. **User authorizes and Google redirects back to main backend**
4. **Main backend (port 3000) processes OAuth callback:**
   - Exchanges code for tokens
   - Saves tokens to main database (`users` table)
   - **Automatically syncs tokens to chat agent server:**
   ```bash
   POST http://localhost:4000/api/users/{user_id}/google-calendar/connect
   ```
5. **Chat agent server stores tokens in `google_calendar_tokens` table**
6. **Chat agent can now book meetings using stored tokens**

**Note:** Token sync happens automatically. The frontend does not need to call the chat agent server directly.

### Checking Connection Status

To check if a user has connected their Google Calendar:

```bash
GET /api/google-tokens/{user_id}
```

- Returns 200 with token details if connected
- Returns 404 if not connected

### Disconnecting

To remove Google Calendar integration:

```bash
DELETE /api/google-tokens/{user_id}
```

---

## Example Usage

### Using cURL

**Connect Google Calendar:**
```bash
curl -X POST http://localhost:4000/api/users/789895c8-4bd6-43e9-bfea-a4171ec47197/google-calendar/connect \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "ya29.a0AfH6SMB...",
    "refresh_token": "1//0g...",
    "token_expiry": "2025-12-13T10:30:00Z",
    "scope": "https://www.googleapis.com/auth/calendar"
  }'
```

**Get Token Details:**
```bash
curl http://localhost:4000/api/google-tokens/789895c8-4bd6-43e9-bfea-a4171ec47197
```

**Delete Tokens:**
```bash
curl -X DELETE http://localhost:4000/api/google-tokens/789895c8-4bd6-43e9-bfea-a4171ec47197
```

### Using JavaScript (Main Backend)

```javascript
// This happens automatically in googleAuthService.ts
// After successful Google OAuth in main backend
async function syncTokensToChatAgentServer(userId, googleTokens) {
  try {
    const chatAgentServerUrl = process.env.CHAT_AGENT_SERVER_URL || 'http://localhost:4000';
    const response = await fetch(
      `${chatAgentServerUrl}/api/users/${userId}/google-calendar/connect`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_token: googleTokens.access_token,
          refresh_token: googleTokens.refresh_token,
          token_expiry: new Date(googleTokens.expiry_date).toISOString(),
          scope: googleTokens.scope,
        }),
      }
    );

    const data = await response.json();
    
    if (data.success) {
      console.log('Google Calendar connected successfully!');
    } else {
      console.error('Failed to connect:', data.error);
    }
  } catch (error) {
    console.error('Network error:', error);
  }
}

// Check connection status on chat agent server
async function checkGoogleConnectionOnChatAgent(userId) {
  try {
    const chatAgentServerUrl = process.env.CHAT_AGENT_SERVER_URL || 'http://localhost:4000';
    const response = await fetch(
      `${chatAgentServerUrl}/api/google-tokens/${userId}`
    );

    if (response.ok) {
      const data = await response.json();
      console.log('Connected:', data.token_info.is_expired ? 'Token expired' : 'Active');
      return data.token_info;
    } else if (response.status === 404) {
      console.log('Google Calendar not connected');
      return null;
    }
  } catch (error) {
    console.error('Error checking connection:', error);
  }
}

// Disconnect from chat agent server
async function disconnectGoogleCalendarFromChatAgent(userId) {
  try {
    const chatAgentServerUrl = process.env.CHAT_AGENT_SERVER_URL || 'http://localhost:4000';
    const response = await fetch(
      `${chatAgentServerUrl}/api/google-tokens/${userId}`,
      { method: 'DELETE' }
    );

    const data = await response.json();
    
    if (data.success) {
      console.log('Disconnected successfully');
    }
  } catch (error) {
    console.error('Error disconnecting:', error);
  }
}
```

---

## Database Schema

Tokens are stored in the `google_calendar_tokens` table:

```sql
CREATE TABLE google_calendar_tokens (
  user_id VARCHAR(50) PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMP NOT NULL,
  scope TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
```

---

## Notes

- **Dual Storage:** Tokens are stored in both:
  1. **Main Backend Database** (`users` table) - Primary storage
  2. **Chat Agent Server Database** (`google_calendar_tokens` table) - Synced copy for AI meeting booking
- **Automatic Sync:** Token synchronization happens automatically in `googleAuthService.ts` after OAuth success
- **Non-Blocking:** If chat agent server sync fails, main OAuth flow still succeeds (logged as warning)
- **Token Security:** Access tokens are stored in full for server-side meeting booking functionality
- **Token Refresh:** Both servers can independently refresh expired access tokens using the refresh token
- **Scopes Required:** Minimum required scopes are:
  - `https://www.googleapis.com/auth/calendar`
  - `https://www.googleapis.com/auth/calendar.events`
- **Token Expiry:** Access tokens typically expire after 1 hour; servers handle refresh automatically
- **Single Connection:** Each user can have only one Google Calendar connection per server

---

## Related Documentation

- [Meeting Booking Implementation](../MEETING_BOOKING_IMPLEMENTATION.md)
- [Google OAuth Implementation](../GOOGLE_OAUTH_IMPLEMENTATION.md)
- [Google Calendar Integration API](../GOOGLE_CALENDAR_INTEGRATION_API.md)

---

## Support

For issues or questions, refer to the troubleshooting guide or check the server logs for detailed error messages.
