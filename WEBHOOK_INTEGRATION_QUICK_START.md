# 🚀 Webhook Integration - Quick Start Guide

## 📋 **Prerequisites**

1. **OpenAI API Key**
   - Visit: https://platform.openai.com/api-keys
   - Create new API key
   - Copy to `.env` file

2. **Create OpenAI Prompts**
   - Visit: https://platform.openai.com/prompts
   - Create two prompts (see templates below)

---

## 🎯 **OpenAI Prompt Templates**

### **Prompt 1: Individual Call Analysis**

**Name**: `Individual Call Analysis - Lead Scoring`

**Instructions**:
```
Analyze this single call transcript and extract lead intelligence data.

Return a JSON object with the following structure:
{
  "name": "extracted name or null",
  "email": "extracted email or null", 
  "phone": "extracted phone or null",
  "leadScore": 0-100 numeric score,
  "nextSteps": "recommended next actions",
  "keyTopics": ["topic1", "topic2", ...],
  "sentiment": "positive|neutral|negative",
  "callDuration": seconds,
  "callOutcome": "outcome description",
  "objections": ["objection1", ...],
  "painPoints": ["pain1", ...],
  "interests": ["interest1", ...]
}

Scoring Guidelines:
- 80-100: Hot lead (strong intent, ready to buy)
- 60-79: Warm lead (interested, needs nurturing)
- 40-59: Cool lead (mild interest)
- 0-39: Cold lead (low interest)

Focus on:
1. Lead quality and intent
2. Pain points mentioned
3. Objections raised
4. Interest level
5. Next steps needed
```

**Model**: `gpt-4o-2024-08-06`  
**Temperature**: `0.3`  
**Max Tokens**: `1000`

**After creating**, copy the Prompt ID (format: `pmpt_xxx...`)

---

### **Prompt 2: Complete Historical Analysis**

**Name**: `Complete Historical Analysis - Lead Progression`

**Instructions**:
```
You will receive:
1. Previous call analyses (array of past interactions)
2. Current call transcript

Analyze the complete relationship progression and return JSON:
{
  "totalInteractions": number of total calls,
  "averageLeadScore": 0-100 average score across all calls,
  "overallSentiment": "positive|neutral|negative",
  "commonThemes": ["theme1", "theme2", ...],
  "progressionSummary": "how relationship has evolved",
  "recommendedActions": ["action1", "action2", ...],
  "engagementTrend": "increasing|stable|decreasing",
  "conversionReadiness": 0-100 score,
  "keyDecisionFactors": ["factor1", ...]
}

Analyze:
1. How lead quality has changed over time
2. Recurring themes and interests
3. Progression toward conversion
4. Changes in sentiment/engagement
5. Key decision factors emerging

Conversion Readiness:
- 80-100: Ready to convert (schedule demo/close)
- 60-79: High potential (nurture heavily)
- 40-59: Moderate potential (continue engagement)
- 0-39: Low potential (minimal effort)
```

**Model**: `gpt-4o-2024-08-06`  
**Temperature**: `0.3`  
**Max Tokens**: `1500`

**After creating**, copy the Prompt ID (format: `pmpt_xxx...`)

---

## ⚙️ **Environment Setup**

Create or update `backend/.env`:

```env
# OpenAI Response API Configuration
OPENAI_API_KEY=sk-proj-YOUR_API_KEY_HERE

# Prompt IDs from OpenAI Platform
OPENAI_INDIVIDUAL_PROMPT_ID=pmpt_YOUR_INDIVIDUAL_PROMPT_ID
OPENAI_COMPLETE_PROMPT_ID=pmpt_YOUR_COMPLETE_PROMPT_ID

# Optional overrides (defaults shown)
OPENAI_MODEL=gpt-4o-2024-08-06
OPENAI_TIMEOUT=30000
```

---

## 🧪 **Testing the Integration**

### **Test 1: Lifecycle Events**

```bash
# 1. Initiated Event
curl -X POST http://localhost:3000/api/webhooks/lifecycle \
  -H "Content-Type: application/json" \
  -d '{
    "event": "initiated",
    "execution_id": "test_exec_001",
    "agent_id": "your_bolna_agent_id",
    "phone_number": "+1 234-567-8900",
    "timestamp": "2025-10-08T12:00:00Z"
  }'

# 2. Ringing Event
curl -X POST http://localhost:3000/api/webhooks/lifecycle \
  -H "Content-Type: application/json" \
  -d '{
    "event": "ringing",
    "execution_id": "test_exec_001",
    "agent_id": "your_bolna_agent_id",
    "phone_number": "+1 234-567-8900",
    "timestamp": "2025-10-08T12:00:05Z"
  }'

# 3. In-Progress Event
curl -X POST http://localhost:3000/api/webhooks/lifecycle \
  -H "Content-Type: application/json" \
  -d '{
    "event": "in-progress",
    "execution_id": "test_exec_001",
    "agent_id": "your_bolna_agent_id",
    "phone_number": "+1 234-567-8900",
    "timestamp": "2025-10-08T12:00:10Z"
  }'

# 4. Call Disconnected Event
curl -X POST http://localhost:3000/api/webhooks/lifecycle \
  -H "Content-Type: application/json" \
  -d '{
    "event": "call-disconnected",
    "execution_id": "test_exec_001",
    "agent_id": "your_bolna_agent_id",
    "phone_number": "+1 234-567-8900",
    "hangup_by": "user",
    "hangup_reason": "call_completed",
    "timestamp": "2025-10-08T12:05:00Z"
  }'
```

### **Test 2: Completed Call with Transcript**

```bash
curl -X POST http://localhost:3000/api/webhooks/bolna \
  -H "Content-Type: application/json" \
  -d '{
    "execution_id": "test_exec_001",
    "agent_id": "your_bolna_agent_id",
    "phone_number": "+1 234-567-8900",
    "duration_seconds": 300,
    "status": "done",
    "timestamp": "2025-10-08T12:05:00Z",
    "transcript": [
      {
        "role": "agent",
        "message": "Hello! Thanks for calling. How can I help you today?",
        "timestamp": "2025-10-08T12:00:15Z"
      },
      {
        "role": "user",
        "message": "Hi, I am interested in your product. Can you tell me more about pricing?",
        "timestamp": "2025-10-08T12:00:20Z"
      },
      {
        "role": "agent",
        "message": "Absolutely! Our pricing starts at $99/month. What is your email so I can send you details?",
        "timestamp": "2025-10-08T12:00:30Z"
      },
      {
        "role": "user",
        "message": "Sure, it is john.doe@example.com",
        "timestamp": "2025-10-08T12:00:35Z"
      }
    ],
    "metadata": {
      "call_duration_secs": 300,
      "phone_call": {
        "external_number": "+1 234-567-8900"
      }
    }
  }'
```

---

## 📊 **Verify Results**

### **Check Database**

```sql
-- 1. Check call lifecycle status
SELECT 
  execution_id,
  call_lifecycle_status,
  ringing_started_at,
  call_answered_at,
  call_disconnected_at,
  hangup_by,
  hangup_reason
FROM calls
WHERE bolna_execution_id = 'test_exec_001';

-- 2. Check individual analysis
SELECT 
  call_id,
  user_id,
  phone_number,
  analysis_type,
  total_score,
  lead_status_tag,
  extracted_name,
  extracted_email,
  smart_notification
FROM lead_analytics
WHERE phone_number = '+1 234-567-8900'
  AND analysis_type = 'individual'
ORDER BY created_at DESC;

-- 3. Check complete analysis
SELECT 
  user_id,
  phone_number,
  analysis_type,
  previous_calls_analyzed,
  total_score,
  lead_status_tag,
  smart_notification,
  updated_at
FROM lead_analytics
WHERE phone_number = '+1 234-567-8900'
  AND analysis_type = 'complete';
```

### **Check Logs**

```bash
# Backend logs should show:
✅ Lifecycle event processed
🤖 Starting OpenAI dual analysis
✅ Individual analysis extracted
📊 Retrieved previous analyses
✅ Complete analysis extracted
✅ Dual analysis saved successfully
✅ Contact auto-creation completed
💰 Credits deducted successfully
🎉 Webhook processing completed successfully
```

---

## 🔍 **Monitoring**

### **Key Metrics to Track**

1. **OpenAI API Usage**:
   ```bash
   # Check logs for token usage
   grep "OpenAI Response API call successful" logs/backend.log | tail -n 10
   ```

2. **Processing Times**:
   ```bash
   # Check webhook processing duration
   grep "Webhook processing completed" logs/backend.log | tail -n 10
   ```

3. **Error Rates**:
   ```bash
   # Check for extraction failures
   grep "OpenAI analytics processing failed" logs/backend.log
   ```

4. **Database Growth**:
   ```sql
   -- Count analyses by type
   SELECT 
     analysis_type,
     COUNT(*) as count,
     AVG(total_score) as avg_score
   FROM lead_analytics
   GROUP BY analysis_type;
   ```

---

## 🐛 **Troubleshooting**

### **Issue 1: OpenAI API Key Not Working**

**Symptoms**: `OPENAI_API_KEY environment variable is required`

**Solution**:
```bash
# Check if key is set
echo $OPENAI_API_KEY

# Verify in .env file
cat backend/.env | grep OPENAI_API_KEY

# Restart backend server
npm run dev
```

### **Issue 2: Prompt ID Invalid**

**Symptoms**: `OpenAI API call failed: Invalid prompt ID`

**Solution**:
1. Go to https://platform.openai.com/prompts
2. Verify prompt IDs are correct
3. Ensure prompt IDs start with `pmpt_`
4. Check `.env` file has correct IDs

### **Issue 3: No Analysis Created**

**Symptoms**: Webhook succeeds but no `lead_analytics` rows

**Solution**:
```bash
# Check if transcript exists
SELECT transcript FROM transcripts WHERE call_id = 'xxx';

# Check webhook logs
grep "OpenAI dual analysis" logs/backend.log

# Verify status is 'done'
SELECT status FROM calls WHERE id = 'xxx';
```

### **Issue 4: Duplicate Complete Analysis**

**Symptoms**: Multiple complete analysis rows for same user+phone

**Solution**:
```sql
-- Check for duplicates
SELECT user_id, phone_number, analysis_type, COUNT(*)
FROM lead_analytics
WHERE analysis_type = 'complete'
GROUP BY user_id, phone_number, analysis_type
HAVING COUNT(*) > 1;

-- Fix: Delete duplicates, keep latest
DELETE FROM lead_analytics
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY user_id, phone_number, analysis_type 
      ORDER BY updated_at DESC
    ) as rn
    FROM lead_analytics
    WHERE analysis_type = 'complete'
  ) t WHERE rn > 1
);
```

---

## 📈 **Performance Tips**

1. **Batch Processing**: Process multiple calls in parallel
2. **Caching**: Cache previous analyses for frequent callers
3. **Rate Limiting**: Implement queue for high-volume scenarios
4. **Monitoring**: Set up alerts for slow OpenAI responses

---

## 🎯 **Next Steps**

1. ✅ Set up environment variables
2. ✅ Create OpenAI prompts
3. ✅ Test lifecycle events
4. ✅ Test completed call webhook
5. ✅ Verify database records
6. ✅ Monitor first production calls
7. ✅ Review OpenAI costs
8. ✅ Set up error alerts

---

## 📚 **Additional Resources**

- **Implementation Summary**: `WEBHOOK_INTEGRATION_IMPLEMENTATION_SUMMARY.md`
- **Original Plan**: `WEBHOOK_INTEGRATION.md`
- **OpenAI Docs**: https://platform.openai.com/docs/api-reference/responses
- **Prompt Management**: https://platform.openai.com/prompts

---

*Last Updated: October 8, 2025*
