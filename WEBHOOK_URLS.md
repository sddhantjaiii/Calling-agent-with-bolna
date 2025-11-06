# 🎯 WEBHOOK URLS - QUICK REFERENCE
**Last Updated**: October 8, 2025

---

## 🌐 **YOUR WEBHOOK URLs**

### **Development (Local)**
```
Base URL: http://localhost:3000
```

### **Main Endpoints**

#### **1. Post-Call Webhook** (Most Important)
```
http://localhost:3000/api/webhooks/bolna/post-call
```
**OR** (shorter alias):
```
http://localhost:3000/api/webhooks/bolna
```
**Purpose**: Receives completed calls with transcripts, triggers OpenAI dual analysis

---

#### **2. Lifecycle Events Webhook**
```
http://localhost:3000/api/webhooks/bolna/lifecycle
```
**Purpose**: Tracks call progress through 5 stages (initiated → ringing → in-progress → disconnected → completed)

---

#### **3. Health Check**
```
http://localhost:3000/api/webhooks/health
```
**Purpose**: Verify webhook service is running

---

## 🔧 **Configure in Bolna.ai Dashboard**

1. **Login to Bolna.ai** → Go to your agent settings
2. **Set Post-Call Webhook URL**:
   ```
   http://localhost:3000/api/webhooks/bolna/post-call
   ```
3. **Set Lifecycle Webhook URL** (if supported):
   ```
   http://localhost:3000/api/webhooks/bolna/lifecycle
   ```
4. **Webhook Secret**: Add to `.env` if Bolna requires signature verification

---

## 🧪 **Quick Test (PowerShell)**

### **Test 1: Health Check**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/webhooks/health" -Method Get
```

### **Test 2: Lifecycle Event**
```powershell
$body = @{
    event = "initiated"
    execution_id = "test_001"
    agent_id = "your_agent_id"
    phone_number = "+1 234-567-8900"
    timestamp = (Get-Date).ToString("o")
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/webhooks/bolna/lifecycle" `
    -Method Post `
    -ContentType "application/json" `
    -Body $body
```

### **Test 3: Completed Call**
```powershell
$body = @{
    execution_id = "test_001"
    agent_id = "your_agent_id"
    phone_number = "+1 234-567-8900"
    duration_seconds = 120
    status = "done"
    timestamp = (Get-Date).ToString("o")
    transcript = @(
        @{role = "agent"; message = "Hello!"; timestamp = (Get-Date).ToString("o")},
        @{role = "user"; message = "Hi"; timestamp = (Get-Date).ToString("o")}
    )
    metadata = @{
        call_duration_secs = 120
        phone_call = @{external_number = "+1 234-567-8900"}
    }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "http://localhost:3000/api/webhooks/bolna" `
    -Method Post `
    -ContentType "application/json" `
    -Body $body
```

---

## 📋 **Use the Test Script**

Run the complete test suite:
```powershell
cd "c:\Users\sddha\Coding\Sniperthinkv2\calling agent migration to bolna ai\Calling agent-kiro before going for bolna ai\Calling agent-kiro"
.\test-webhooks.ps1
```

---

## 🚀 **Production URLs** (Update when deployed)

When you deploy to production, update these:

```
Base URL: https://your-domain.com
Post-Call: https://your-domain.com/api/webhooks/bolna/post-call
Lifecycle: https://your-domain.com/api/webhooks/bolna/lifecycle
Health: https://your-domain.com/api/webhooks/health
```

---

## ⚠️ **Before Testing**

Make sure:
1. ✅ Backend server is running: `npm run dev`
2. ✅ Database is connected (check logs)
3. ⚠️ OpenAI API key is set in `.env` (for full analysis)
4. ⚠️ OpenAI prompt IDs are set in `.env`

**Note**: Webhooks will work without OpenAI configured, but analysis will be skipped.

---

## 📊 **Expected Response**

### **Success Response**
```json
{
  "success": true,
  "message": "Webhook processed successfully",
  "processing_time_ms": 2345
}
```

### **Error Response**
```json
{
  "success": false,
  "error": "Error message here",
  "processing_time_ms": 123
}
```

---

## 🔍 **Check Results**

After sending webhooks, verify in database:

```sql
-- Check call lifecycle
SELECT 
  bolna_execution_id,
  call_lifecycle_status,
  ringing_started_at,
  call_answered_at,
  call_disconnected_at,
  hangup_by,
  hangup_reason
FROM calls
WHERE bolna_execution_id = 'test_001';

-- Check individual analysis
SELECT 
  call_id,
  analysis_type,
  total_score,
  lead_status_tag,
  extracted_name,
  extracted_email
FROM lead_analytics
WHERE phone_number = '+1 234-567-8900'
  AND analysis_type = 'individual'
ORDER BY created_at DESC;

-- Check complete analysis
SELECT 
  analysis_type,
  previous_calls_analyzed,
  total_score,
  lead_status_tag,
  updated_at
FROM lead_analytics
WHERE phone_number = '+1 234-567-8900'
  AND analysis_type = 'complete';
```

---

## 📝 **Webhook Event Types**

| Event | URL | Purpose |
|-------|-----|---------|
| **initiated** | `/lifecycle` | Call started |
| **ringing** | `/lifecycle` | Phone is ringing |
| **in-progress** | `/lifecycle` | Call answered |
| **no-answer** | `/lifecycle` | Not answered |
| **busy** | `/lifecycle` | Line busy |
| **call-disconnected** | `/lifecycle` | Call ended |
| **completed** | `/post-call` or `/bolna` | Processing finished (with transcript) |

---

## 🎯 **Integration Steps**

1. **Start Backend**:
   ```bash
   cd backend
   npm run dev
   ```

2. **Verify Running**:
   ```bash
   curl http://localhost:3000/api/webhooks/health
   ```

3. **Configure Bolna.ai**:
   - Add webhook URL: `http://localhost:3000/api/webhooks/bolna/post-call`

4. **Test with Real Call**:
   - Make a test call through Bolna.ai
   - Check backend logs
   - Verify database records

---

## 📞 **Support**

- **Detailed Guide**: `WEBHOOK_INTEGRATION_QUICK_START.md`
- **Implementation Summary**: `WEBHOOK_INTEGRATION_IMPLEMENTATION_SUMMARY.md`
- **Diagnostic Report**: `DIAGNOSTIC_REPORT.md`

---

*Last verified: October 8, 2025*
