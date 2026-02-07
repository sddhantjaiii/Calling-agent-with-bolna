# n8n Lead Capture Webhook (Contact Creation Only)

## Overview

This webhook endpoint allows external automation tools (n8n, Zapier, Make, etc.) to:
1. Create or update a contact in the CRM
2. **Auto Engagement Flows** automatically handle calling/follow-up based on configured rules

**Important Change:** This webhook NO LONGER initiates calls directly. All calling is handled by Auto Engagement Flows for consistency and to avoid duplicate calls.

## How It Works

```
n8n Sends Lead Data
    ↓
Webhook Creates/Updates Contact
    ↓
Auto Engagement Flow Triggers Automatically
    ↓
Flow Matches by Source Field
    ↓
Flow Executes Actions (Call, WhatsApp, Email, etc.)
```

## Endpoint

```
POST /api/webhooks/n8n/lead-call
```

No authentication headers required - authentication is done via `agent_id` in the payload.

## Health Check

```
GET /api/webhooks/n8n/health
```

Returns health status of the endpoint and database connectivity.

## Request Payload

```json
{
  "agent_id": "uuid",                         // REQUIRED: Bolna Agent ID (from Bolna dashboard or agent settings)
  "lead_name": "John Doe",                    // REQUIRED: Lead's name
  "recipient_phone_number": "+919876543210",  // REQUIRED: Phone number with ISD code
  "email": "john@example.com",                // Optional: Email address
  "Source": "TradeIndia",                     // Optional: Lead source (e.g., TradeIndia, IndiaMART)
  "Notes": "Interested in bulk order",        // Optional: Notes about the lead
  "company": "ABC Corporation",               // Optional: Company name
  "city": "Mumbai",                           // Optional: City
  "country": "India"                          // Optional: Country
}
```

### Field Details

| Field | Type | Required | Description |
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agent_id` | UUID | ✅ Yes | **Bolna Agent ID** (NOT regular agent ID - get from agent settings) |
| `lead_name` | String | ✅ Yes | Full name of the lead |
| `recipient_phone_number` | String | ✅ Yes | Phone number with ISD code (e.g., +91 for India) |
| `email` | String | No | Email address for follow-up |
| `Source` | String | No | **Lead source identifier** (IMPORTANT - used by Auto Engagement Flow for matching) |
| `Notes` | String | No | Any notes about the lead - appended if contact exists |
| `company` | String | No | Company/business name |
| `city` | String | No | City location |
| `country` | String | No | Country |

**⚠️ Important:** The `Source` field is critical! It determines which Auto Engagement Flow will handle this lead.

Example:
- `Source: "TradeIndia"` → Triggers "TradeIndia Follow-up Flow"
- `Source: "IndiaMART"` → Triggers "IndiaMART Follow-up Flow"
- No `Source` → Triggers catch-all flow (if configured)

## Authentication

Authentication is handled via the `agent_id` field (which is the **Bolna Agent ID**):
- The `agent_id` must match a `bolna_agent_id` in the agents table (NOT the regular agent ID!)
- The agent must be active (`is_active = true`)
- The user associated with the agent is used for contact creation

**How to get Bolna Agent ID:**
1. Go to Dashboard → Agents
2. Click on your agent
3. Look for "Bolna Agent ID" field
4. Copy the UUID

## Response

### Success (201 Created)

```json
{
  "success": true,
  "message": "Lead captured successfully - Auto Engagement Flow will handle follow-up",
  "data": {
    "contact_id": "uuid",
    "contact_created": true,  // false if existing contact was updated
    "source": "TradeIndia",
    "auto_engagement_enabled": true,
    "note": "Contact will be processed by Auto Engagement Flow based on configured rules"
  },
  "request_id": "n8n-xxx-xxx",
  "processing_time_ms": 234
}
```

**What happens next?**
1. Auto Engagement Flow matches by `Source` field
2. Checks flow priority (if multiple matches)
3. Executes flow actions sequentially:
   - AI Call (optional)
   - WhatsApp message (optional)
   - Email (optional)
   - Wait actions
4. Applies conditional logic (e.g., "If call not answered → send WhatsApp")

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| 400 | Missing required field: agent_id | agent_id not provided |
| 400 | Missing required field: lead_name | lead_name not provided |
| 400 | Missing required field: recipient_phone_number | Phone number not provided |
| 401 | Invalid agent_id - agent not found | agent_id doesn't exist in database (wrong Bolna Agent ID) |
| 401 | Agent is not active | Agent exists but is deactivated |
| 429 | Call limit reached | Concurrency limit reached, try again |
| 500 | Failed to process lead | Server error |

## Contact Behavior

### New Contact (phone doesn't exist)
- Creates a new contact with all provided fields
- Sets `is_auto_created = true`
- Sets `auto_creation_source` to the `Source` value (or "n8n_webhook" if not provided)

### Existing Contact (phone already exists for this user)
- Updates contact with new non-empty field values
- Notes are appended with timestamp separator
- `auto_creation_source` is updated to track latest lead source

## n8n Workflow Example

Here's how to set up the workflow in n8n:

### 1. Trigger Node (e.g., Webhook, Form, Database Change)

Configure your trigger to capture lead data.

### 2. HTTP Request Node

- **Method**: POST
- **URL**: `https://your-domain.com/api/webhooks/n8n/lead-call`
- **Headers**: None required
- **Body Content Type**: JSON
- **Body**:

```json
{
  "agent_id": "your-bolna-agent-id",
  "lead_name": "{{ $json.name }}",
  "recipient_phone_number": "{{ $json.phone }}",
  "email": "{{ $json.email }}",
  "Source": "{{ $json.source || 'n8n' }}",
  "Notes": "{{ $json.notes }}",
  "company": "{{ $json.company }}",
  "city": "{{ $json.city }}",
  "country": "{{ $json.country }}"
}
```

### 3. Response Handling (Optional)

Add an IF node to check `{{ $json.success }}` and handle success/failure accordingly.

## Rate Limiting

The endpoint does not have explicit rate limiting, but:
- Call initiation is limited by user's concurrent call limit (default: 2)
- When limit is reached, you get a 429 response
- Implement retry logic with exponential backoff

## Sample cURL Request

```bash
curl -X POST https://your-domain.com/api/webhooks/n8n/lead-call \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "8b63ccd2-a002-4f6d-9950-93056ceb8c9c",  # Your Bolna Agent ID
    "lead_name": "Rahul Sharma",
    "recipient_phone_number": "+919876543210",
    "email": "rahul@example.com",
    "Source": "TradeIndia",
    "Notes": "Interested in wholesale pricing",
    "company": "Sharma Enterprises",
    "city": "Delhi",
    "country": "India"
  }'
```

## Troubleshooting

### "Invalid agent_id - agent not found"
- Verify you're using the correct Bolna Agent ID
- Check your agent's `bolna_agent_id` in the dashboard or database
- NOT the internal database `id` - use the `bolna_agent_id` field

### "Agent is not active"
- The agent exists but `is_active` is set to false
- Activate the agent in the dashboard

### "Concurrency limit reached"
- The user has too many active calls
- Implement retry logic with delays
- Consider increasing user's concurrent call limit

### "Insufficient credits"
- The user has no credits remaining
- Add credits to the user's account

## Integration with Other Platforms

### Zapier
Use a Webhook action with the same payload structure.

### Make (Integromat)
Use an HTTP module with POST method and JSON body.

### Custom Integration
Any HTTP client can call this endpoint with the specified JSON payload.
