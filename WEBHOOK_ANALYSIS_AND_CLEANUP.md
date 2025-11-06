# 🔍 Webhook Analysis & Code Cleanup Plan
**Date**: October 8, 2025

---

## 📊 **Analysis of Real Bolna.ai Webhooks**

### **Webhook Pattern Discovered**

From the debug folder, I analyzed 11 real webhook payloads from 3 different calls:
- **Call 1 (ID: 6028966f)**: 5 webhooks (complete lifecycle)
- **Call 2 (ID: 12f815cf)**: 3 webhooks (busy status)
- **Call 3 (ID: 4dfcbb06)**: 3 webhooks

### **Key Findings**

#### **1. Single Endpoint for All Webhooks** ✅
- All webhooks come to the **SAME endpoint**
- Differentiated by `status` field in payload
- No separate lifecycle webhook endpoint needed

#### **2. Webhook Stages (Based on `status` field)**

| Stage | Status Value | Timestamp | Data Present | Recording URL |
|-------|-------------|-----------|--------------|---------------|
| 1 | `initiated` | 09:15:10 | Basic info only | ❌ null |
| 2 | `ringing` | 09:15:12 | Basic info | ❌ null |
| 3 | `in-progress` | 09:15:14 | Basic info | ❌ null |
| 4 | `call-disconnected` | 09:15:48 | **Transcript present** | ❌ "" (empty string) |
| 5 | `completed` | 09:28:41 | Full data | ✅ **Recording URL present** |

#### **3. Critical Data Extraction Points**

**Webhook 4 (call-disconnected)**:
```json
{
  "status": "call-disconnected",
  "transcript": "assistant: Hi there! I'm Shrey...\nuser:  hi my name is sudan\n...",
  "conversation_duration": 27.2,
  "recording_url": ""  // ⚠️ Empty string, NOT null
}
```

**Webhook 5 (completed)**:
```json
{
  "status": "completed",
  "transcript": "assistant: Hi there! I'm Shrey...\nuser:  hi my name is sudan\n...",
  "conversation_duration": 27.2,
  "recording_url": "https://aps1.media.plivo.com/v1/Account/.../Recording/.../xxx.mp3",
  "agent_extraction": "{...}",  // ✅ Analytics data present
  "telephony_data": {
    "duration": "28",
    "hangup_by": "Callee",
    "hangup_reason": "Call recipient hungup",
    "hangup_provider_code": 4000
  }
}
```

#### **4. Transcript and Recording URL Behavior**

| Webhook | Transcript | Recording URL | Notes |
|---------|-----------|---------------|-------|
| 1-3 | `null` | `null` | Call in progress |
| 4 (disconnected) | ✅ **Present** | `""` (empty) | **First time transcript appears** |
| 5 (completed) | ✅ Present | ✅ **Present** | **Recording URL finally available** |

#### **5. Failed Call Behavior**

**Busy Call (ID: 12f815cf)**:
```json
{
  "status": "busy",
  "conversation_duration": 0,
  "transcript": null,
  "recording_url": null,
  "telephony_data": {
    "hangup_by": "Carrier",
    "hangup_reason": "Call recipient was busy",
    "hangup_provider_code": 3010
  }
}
```

---

## 🧹 **Code Cleanup Requirements**

### **1. Remove All ElevenLabs Code**
- ❌ `/elevenlabs/post-call` endpoint
- ❌ `elevenlabs-signature` header validation
- ❌ ElevenLabs references in middleware
- ❌ ElevenLabs references in comments
- ❌ Old ElevenLabs migration references

### **2. Consolidate to Single Webhook Endpoint**
- ✅ `/api/webhooks/bolna` (single endpoint for ALL webhooks)
- ❌ Remove `/bolna/post-call` (redundant)
- ❌ Remove `/bolna/lifecycle` (not needed - same endpoint)
- ✅ Keep `/health` endpoint

### **3. Remove Webhook Secret Validation**
- User requirement: "make sure we dont need secreat for webhook"
- Remove signature verification from middleware
- Remove `validateWebhookHeaders` middleware
- Simplify to basic validation only

### **4. Ensure Proper Data Saving**

**Calls Table Columns to Save**:
```sql
-- Lifecycle tracking
call_lifecycle_status       -- From payload.status
ringing_started_at          -- When status = "ringing"
call_answered_at            -- When status = "in-progress"
call_disconnected_at        -- When status = "call-disconnected" OR "completed"

-- Transcript (from Webhook 4+)
metadata.transcript         -- Save raw transcript text

-- Recording URL (from Webhook 5)
recording_url               -- From payload.telephony_data.recording_url

-- Hangup info (from Webhook 4+)
hangup_by                   -- From payload.telephony_data.hangup_by
hangup_reason               -- From payload.telephony_data.hangup_reason
hangup_provider_code        -- From payload.telephony_data.hangup_provider_code

-- Duration
duration_seconds            -- From payload.conversation_duration
```

### **5. Performance Optimization**

**Handle Many Webhooks Per Second**:
1. ✅ Remove rate limiting for webhooks
2. ✅ Use async processing (already done)
3. ✅ Remove signature verification (expensive crypto operations)
4. ✅ Optimize database queries (use upsert)
5. ✅ Add proper error handling to prevent blocking

---

## 📝 **Implementation Plan**

### **Phase 1: Database Check**
- [x] Verify `transcript` column exists in calls table
- [x] Verify `recording_url` column exists in calls table
- [x] Verify lifecycle columns exist
- [ ] Add missing columns if needed

### **Phase 2: Clean Routes**
- [ ] Remove `/elevenlabs/post-call` endpoint
- [ ] Remove `/bolna/post-call` endpoint (keep just `/bolna`)
- [ ] Remove `/bolna/lifecycle` endpoint
- [ ] Keep only `/bolna` and `/health`
- [ ] Remove all middleware except `logWebhookRequest`

### **Phase 3: Clean Middleware**
- [ ] Remove `validateWebhookHeaders` middleware
- [ ] Remove `captureRawBody` middleware (not needed)
- [ ] Remove ElevenLabs signature validation
- [ ] Simplify to basic logging only

### **Phase 4: Update Webhook Service**
- [ ] Merge lifecycle and completion logic into single handler
- [ ] Add transcript extraction from Webhook 4 (call-disconnected)
- [ ] Add recording URL extraction from Webhook 5 (completed)
- [ ] Ensure all fields are saved to database
- [ ] Remove ElevenLabs references
- [ ] Optimize for high throughput

### **Phase 5: Update Controller**
- [ ] Merge `handlePostCallWebhook` and `handleLifecycleWebhook` into single handler
- [ ] Remove ElevenLabs code
- [ ] Add proper error handling
- [ ] Return fast response (don't block)

### **Phase 6: Testing**
- [ ] Create test script using real payloads from debug folder
- [ ] Test all 5 webhook stages
- [ ] Verify transcript saved from Webhook 4
- [ ] Verify recording URL saved from Webhook 5
- [ ] Test concurrent webhooks (many per second)
- [ ] Verify no secret needed

---

## 🎯 **Expected Final Architecture**

```
┌─────────────────────────────────────────────────┐
│  Bolna.ai sends ALL webhooks to single endpoint │
└───────────────────┬─────────────────────────────┘
                    │
                    ▼
        POST /api/webhooks/bolna
                    │
                    ▼
        ┌───────────────────────┐
        │  logWebhookRequest    │ (simple logging)
        └───────────┬───────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │  webhookController    │
        │  .handleWebhook()     │
        └───────────┬───────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │  webhookService       │
        │  .processWebhook()    │
        └───────────┬───────────┘
                    │
        ┌───────────┴────────────┐
        │  Switch on status      │
        └───────────┬────────────┘
                    │
        ┌───────────┼───────────┬───────────────┐
        ▼           ▼           ▼               ▼
    initiated   ringing   in-progress   call-disconnected
        │           │           │               │
        │           │           │               │ ✅ Save transcript
        │           │           │               │ ✅ Update lifecycle
        ▼           ▼           ▼               ▼
    Update DB   Update DB   Update DB       Update DB
                                                │
                                                ▼
                                            completed
                                                │
                                                │ ✅ Save recording_url
                                                │ ✅ Run OpenAI analysis
                                                │ ✅ Final update
                                                ▼
                                            Update DB
```

---

## 📦 **Database Schema Verification**

From migration 007, the following columns exist:

**calls table**:
- ✅ `call_lifecycle_status`
- ✅ `hangup_by`
- ✅ `hangup_reason`
- ✅ `hangup_provider_code`
- ✅ `ringing_started_at`
- ✅ `call_answered_at`
- ✅ `call_disconnected_at`
- ✅ `recording_url` (already existed)
- ⚠️ **NEED TO CHECK**: `transcript` column

**Action**: Need to verify if transcript is stored in `metadata` JSON or separate column.

---

## ✅ **Success Criteria**

1. **Single Endpoint**: All webhooks received on `/api/webhooks/bolna`
2. **No Secret**: Webhooks work without signature verification
3. **Transcript Saved**: From Webhook 4 (call-disconnected status)
4. **Recording URL Saved**: From Webhook 5 (completed status)
5. **All Lifecycle Stages**: Properly tracked in database
6. **High Performance**: Can handle many webhooks per second
7. **Clean Code**: No ElevenLabs references, no redundant endpoints
8. **Tested**: All 5 webhook stages tested with real payloads

---

## 🚀 **Next Steps**

1. Verify database schema (check if transcript column exists)
2. Create backup of current code
3. Implement Phase 2-6
4. Test with real payloads from debug folder
5. Monitor performance with concurrent webhooks

