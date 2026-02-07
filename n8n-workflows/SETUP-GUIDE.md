# 🚀 n8n Lead Automation - Final Workflow Setup Guide

## 📋 Overview

This n8n workflow automatically captures leads from Gmail (TradeIndia, IndiaMART, etc.) and sends them to your SniperThink calling agent system. The workflow:

1. **Monitors Gmail** for new lead emails
2. **Extracts lead data** (name, phone, email, company, requirements)
3. **Creates/updates contacts** in your CRM
4. **Initiates AI calls** immediately via Bolna.ai
5. **Triggers Auto Engagement Flows** based on your configured rules

---

## ⚙️ Prerequisites

### 1. **n8n Account**
   - Sign up at [n8n.io](https://n8n.io) or self-host
   - Access to workflow editor

### 2. **Gmail Account with OAuth**
   - Gmail account that receives lead emails
   - OAuth2 credentials configured in n8n

### 3. **SniperThink Agent**
   - Active agent created in your dashboard
   - Agent ID (UUID) from agent settings

### 4. **Optional: Google Sheets** (for tracking)
   - Google Sheets account
   - OAuth2 credentials configured in n8n

---

## 📥 Import Workflow into n8n

### Step 1: Copy the Workflow JSON
1. Open the file: `FINAL-n8n-lead-automation-workflow.json`
2. Copy the entire JSON content (Ctrl+A, Ctrl+C)

### Step 2: Import into n8n
1. Go to your n8n dashboard
2. Click **"Workflows"** in the sidebar
3. Click **"Add Workflow"** (+ button)
4. Click the **"⋮" menu** (top right)
5. Select **"Import from File"** or **"Import from URL"**
6. Paste the JSON or upload the file
7. Click **"Import"**

---

## 🔧 Configuration Steps

### 📧 **Node 1: Gmail Trigger**

**Purpose:** Monitors Gmail inbox for new lead emails

**Configuration:**
```
1. Click the "📧 Gmail Trigger" node
2. Click "Connect OAuth account"
3. Follow Gmail OAuth flow
4. Configure filters (optional):
   - Sender email: noreply@tradeindia.com, noreply@indiamart.com
   - Subject contains: "Enquiry", "Lead", "Buyer"
   - Labels: "Leads", "Business"
5. Set poll interval: Every minute (or as needed)
6. Save node
```

**Tips:**
- Use Gmail labels for better organization
- Create filters in Gmail to auto-label lead emails
- Test with "Test workflow" button

---

### 🎯 **Node 6: Prepare API Payload**

**Purpose:** Formats lead data for API

**⚠️ CRITICAL CONFIGURATION:**
```javascript
// EDIT THIS LINE - Replace with your actual Agent ID
const AGENT_ID = "YOUR-AGENT-UUID-FROM-DASHBOARD";
```

**How to get your Agent ID:**
1. Go to SniperThink Dashboard
2. Navigate to **Agents** section
3. Click on your agent
4. Copy the **Agent ID** (UUID format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)
5. Paste it in the code above

**Example:**
```javascript
const AGENT_ID = "a1b2c3d4-e5f6-7890-1234-567890abcdef";
```

---

### 🚀 **Node 7: Create Contact & Initiate Call**

**Purpose:** Sends data to webhook API

**Configuration:**
```
URL: https://calling-agent-with-bolna-production.up.railway.app/api/webhooks/n8n/lead-call
Method: POST
Headers: Content-Type: application/json
Retry: 3 attempts, 5 second interval
```

**⚠️ IMPORTANT: Update URL if using custom domain**

If you're using a custom domain, replace with:
```
https://your-custom-domain.com/api/webhooks/n8n/lead-call
```

---

### 📊 **Node 11: Log to Google Sheets (OPTIONAL)**

**Purpose:** Track all contact creations in a spreadsheet

**Configuration (if needed):**
```
1. Click the "📊 Log to Google Sheets" node
2. Click "Connect OAuth account"
3. Follow Google Sheets OAuth flow
4. Select your tracking spreadsheet
5. Select the sheet/tab
6. Map columns as needed
7. Save node
8. Enable the node (currently disabled)
```

**To enable:**
- Click the node
- Click the **"Disabled"** toggle to enable
- Save workflow

**To remove:**
- Click the node
- Press **Delete** key
- Save workflow

---

## 🧪 Testing the Workflow

### Test with Sample Data

1. **Activate the workflow:**
   - Click **"Active"** toggle (top right)
   - Confirm activation

2. **Send a test email:**
   ```
   To: your-configured-gmail@gmail.com
   Subject: Test Lead - Enquiry for Product
   Body:
   Name: John Doe
   Mobile: +91 9876543210
   Email: john@example.com
   Company Name: Test Company
   City: Mumbai
   I am looking for bulk order of your products.
   ```

3. **Monitor execution:**
   - Click **"Executions"** tab (right sidebar)
   - Watch the workflow run in real-time
   - Check each node's output
   - Verify success/failure

4. **Check results:**
   - Go to SniperThink Dashboard → Contacts
   - Verify new contact created
   - Check if call was initiated
   - Review Auto Engagement Flow execution (if configured)

---

## 🔍 Troubleshooting

### ❌ **Error: "Invalid agent_id - agent not found"**

**Solution:**
```
1. Verify Agent ID in "Prepare API Payload" node
2. Ensure agent exists in dashboard
3. Check agent is ACTIVE (not disabled)
4. Copy Agent ID from agent settings, not Bolna Agent ID
```

---

### ❌ **Error: "Missing required field: recipient_phone_number"**

**Solution:**
```
1. Check "Parse Lead Data" node output
2. Verify phone_1 field has a value
3. Adjust phone extraction regex if needed
4. Ensure email source has phone numbers
```

---

### ❌ **Error: "Insufficient credits to make call"**

**Solution:**
```
1. Go to Dashboard → Credits
2. Purchase more credits
3. Check user's credit balance
```

---

### ❌ **Error: "Call limit reached"**

**Solution:**
```
1. Wait for existing calls to complete
2. Check concurrency limits:
   - System limit: 10 concurrent calls
   - Per-user limit: 2 concurrent calls
3. Adjust limits in backend env variables if needed
```

---

### ⚠️ **Workflow runs but no contact created**

**Solution:**
```
1. Check "Filter Valid Leads" node
2. Verify phone_1 is not empty
3. Review "Check Success" node output
4. Check API response for errors
5. Review backend logs
```

---

### ⚠️ **Duplicate calls being made**

**Explanation:**
```
This happens because:
1. n8n webhook initiates immediate call
2. Auto Engagement Flow also initiates a call

Solution Options:
A. Don't use AI Call as first action in Auto Engagement Flows
   for webhook-created contacts
B. Configure flow to skip if call was made in last hour
C. Remove immediate call from n8n webhook (requires backend change)
```

---

## 📊 Workflow Overview

```
┌─────────────────┐
│  📧 Gmail       │ ← Monitors inbox every minute
│     Trigger     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  📩 Get Email   │ ← Fetches full email with attachments
│     Details     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  🔍 Extract     │ ← Extracts EML attachments
│     Email       │
│     Content     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  🧮 Parse       │ ← Extracts: name, phone, email,
│     Lead Data   │   company, city, notes, etc.
└────────┬────────┘   Supports: TradeIndia, IndiaMART,
         │            JustDial, ExportersIndia
         ▼
┌─────────────────┐
│  ✅ Filter      │ ← Only process leads with
│     Valid Leads │   valid phone numbers
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  📦 Prepare     │ ← Format data for API
│     API Payload │   ⚠️ SET AGENT_ID HERE!
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  🚀 Create      │ ← POST to webhook
│     Contact &   │   Creates/updates contact
│     Initiate    │   Initiates AI call
│     Call        │   Triggers Auto Engagement
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  ❓ Check       │ ← Verify success
│     Success     │
└────┬────────┬───┘
     │        │
     │        └──────────┐
     ▼                   ▼
┌─────────┐      ┌──────────┐
│ ✅ Log  │      │ ❌ Log   │
│ Success │      │ Failure  │
└────┬────┘      └──────────┘
     │
     ▼
┌─────────────────┐
│  📊 Log to      │ ← OPTIONAL: Track in
│     Google      │   Google Sheets
│     Sheets      │   (currently disabled)
└─────────────────┘
```

---

## 🔄 How It Works with Auto Engagement Flows

### **Execution Flow:**

```
1. n8n WORKFLOW TRIGGERS
   ↓
2. Lead email arrives in Gmail
   ↓
3. n8n extracts & formats data
   ↓
4. POST to /api/webhooks/n8n/lead-call
   ↓
┌─────────────────────────────────────┐
│  BACKEND PROCESSING (2 STAGES)     │
├─────────────────────────────────────┤
│                                     │
│  STAGE 1: n8n Webhook Handler      │
│  ─────────────────────────────────  │
│  • Validates agent_id               │
│  • Creates/updates contact with:    │
│    - auto_creation_source = Source  │
│    - is_auto_created = true         │
│  • Initiates IMMEDIATE call         │
│  • Returns success response         │
│                                     │
│  STAGE 2: Auto Engagement Trigger   │
│  ─────────────────────────────────  │
│  • Detects new contact creation     │
│  • Matches flow by Source field     │
│  • Checks priority                  │
│  • Executes flow actions:           │
│    - AI Call (if configured)        │
│    - WhatsApp message               │
│    - Email                          │
│    - Wait actions                   │
│  • Applies conditional logic        │
│                                     │
└─────────────────────────────────────┘
```

### **Example Scenario:**

**Setup:**
- Auto Engagement Flow: "TradeIndia Lead Follow-up"
- Trigger: `auto_creation_source = "TradeIndia"`
- Actions:
  1. Wait 5 minutes
  2. WhatsApp message
  3. Wait 1 hour
  4. If no response → Email

**What Happens:**
1. TradeIndia email arrives
2. n8n extracts lead data
3. Webhook creates contact with `Source = "TradeIndia"`
4. **Immediate call** initiated by webhook
5. **Auto Engagement Flow** detects match
6. Waits 5 minutes → sends WhatsApp
7. Waits 1 hour → sends email if no response

---

## 🎯 Best Practices

### 1. **Avoid Duplicate Calls**
```
Option A: Configure Auto Engagement Flow to:
- Skip AI Call action for webhook-created contacts
- Start with WhatsApp or Email only

Option B: Use deduplication:
- Flow checks if call made in last 1 hour
- Skips execution if recent call exists
```

### 2. **Use Source Field Effectively**
```
Set different Sources for different lead origins:
- TradeIndia → Triggers "TradeIndia Flow"
- IndiaMART → Triggers "IndiaMART Flow"
- Gmail → Triggers "Generic Flow"

This allows targeted follow-up strategies per source.
```

### 3. **Monitor Execution Logs**
```
Regularly check:
- n8n executions (for workflow errors)
- SniperThink Dashboard → Automation Flows → Execution Logs
- Call history
- Contact creation timestamps
```

### 4. **Set Up Alerts**
```
Configure n8n to:
- Send Slack/Email on workflow failure
- Track success rate
- Monitor API response times
```

### 5. **Test Before Production**
```
1. Create test agent
2. Use test phone numbers
3. Run workflow in test mode
4. Verify all stages work correctly
5. Then switch to production agent
```

---

## 📈 Optimization Tips

### **For High Volume (100+ leads/day):**

1. **Increase Gmail poll frequency:**
   ```
   Change from "Every minute" to "Every 30 seconds"
   (requires n8n paid plan)
   ```

2. **Enable batch processing:**
   ```
   Process multiple leads in single workflow execution
   Use "Split in Batches" node
   ```

3. **Add rate limiting:**
   ```
   Use "Wait" node between API calls
   Prevent API overload
   ```

4. **Use webhook trigger instead of polling:**
   ```
   Set up Gmail webhook → n8n webhook node
   Instant processing (no delay)
   ```

---

## 🔒 Security Considerations

### **Protect Sensitive Data:**
```
1. Never commit workflow JSON with real credentials
2. Use n8n's built-in OAuth (don't hardcode tokens)
3. Keep Agent IDs secure
4. Use environment variables for production URLs
5. Enable n8n authentication
6. Restrict API access to n8n IP addresses
```

---

## 📞 Support & Resources

### **Documentation:**
- n8n Docs: https://docs.n8n.io
- SniperThink API: See `N8N_LEAD_WEBHOOK_GUIDE.md`
- Auto Engagement: See `AUTOMATION_WORKFLOW.md`

### **Need Help?**
- Check workflow execution logs in n8n
- Review backend logs in Railway/deployment
- Test individual nodes with "Execute Node" button
- Contact support with workflow execution ID

---

## ✅ Checklist

Before activating the workflow:

- [ ] Imported workflow JSON into n8n
- [ ] Configured Gmail OAuth credentials
- [ ] Set filters in Gmail Trigger node
- [ ] Updated **AGENT_ID** in "Prepare API Payload" node
- [ ] Verified API URL is correct
- [ ] Tested workflow with sample email
- [ ] Confirmed contact created in dashboard
- [ ] Verified call was initiated
- [ ] Checked Auto Engagement Flow triggered (if configured)
- [ ] Enabled/disabled Google Sheets logging as needed
- [ ] Activated workflow
- [ ] Set up error alerts (optional)

---

## 🎉 You're All Set!

Your n8n workflow is now ready to automatically process incoming leads and initiate AI calls. The workflow will:

✅ Monitor Gmail 24/7
✅ Extract lead data automatically
✅ Create/update contacts in CRM
✅ Initiate AI calls immediately
✅ Trigger Auto Engagement Flows based on rules
✅ Handle errors gracefully with retries
✅ Log all activities for tracking

**Next Steps:**
1. Monitor the first few executions
2. Fine-tune filters and parsing logic
3. Configure Auto Engagement Flows for sophisticated follow-ups
4. Scale up as needed

Happy automating! 🚀
