# OpenAI Lead Analytics - Complete Data Flow

## 📊 Quick Reference

### OpenAI Response Structure
```json
{
  "intent_level": "high",
  "intent_score": 85,
  "urgency_level": "high",
  "urgency_score": 90,
  "budget_constraint": "flexible",
  "budget_score": 75,
  "fit_alignment": "excellent",
  "fit_score": 88,
  "engagement_health": "very_engaged",
  "engagement_score": 92,
  "total_score": 86,
  "lead_status_tag": "Hot Lead",
  
  "reasoning": {
    "intent": "Strong purchase intent demonstrated",
    "urgency": "Needs solution within 2 weeks",
    "budget": "Has allocated budget",
    "fit": "Perfect match for our solution",
    "engagement": "Highly engaged throughout",
    "cta_behavior": "Clicked pricing and demo"
  },
  
  "extraction": {
    "name": "John Doe",
    "email_address": "john@example.com",
    "company_name": "Acme Corp",
    "smartnotification": "🔥 Hot lead - Schedule demo ASAP"
  },
  
  "cta_pricing_clicked": "Yes",
  "cta_demo_clicked": "Yes",
  "cta_followup_clicked": "No",
  "cta_sample_clicked": "No",
  "cta_escalated_to_human": "No",
  
  "demo_book_datetime": "2024-01-15T10:00:00Z"
}
```

---

## 🔄 Individual Call Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Bolna AI → Webhook (completed event)                    │
│    - execution_id: "exec_123"                              │
│    - phone_number: "+1234567890"                           │
│    - transcript: "Hello, I'm interested..."                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Save Transcript to Database                             │
│    - Insert into transcripts table                         │
│    - Get transcript_id                                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. OpenAI Extraction Service                               │
│    extractIndividualCallData(transcript, executionId, phone)│
│                                                            │
│    Prompt:                                                 │
│    "Analyze this conversation transcript and return        │
│     results in JSON format:                                │
│     [transcript]                                           │
│                                                            │
│     Return: intent_score, urgency_score, total_score, etc."│
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Parse OpenAI Response                                   │
│    - Find "message" type in output array                   │
│    - Extract text from output_text type                    │
│    - Parse JSON to IndividualAnalysis                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Lead Analytics Service - mapIndividualAnalysis()        │
│                                                            │
│    Conversions:                                            │
│    - Direct: intent_score, total_score, reasoning          │
│    - Nested: extraction.name → extracted_name             │
│    - Boolean: cta_pricing_clicked "Yes" → true            │
│    - JSONB: reasoning (already object)                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Insert to Database                                      │
│    INSERT INTO lead_analytics (                            │
│      call_id, user_id, phone_number,                       │
│      analysis_type = 'individual',                         │
│      intent_score, total_score, lead_status_tag,           │
│      reasoning, extraction,                                │
│      cta_pricing_clicked (boolean),                        │
│      smart_notification, ...                               │
│    )                                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 Complete Analysis Flow (Multiple Calls)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Fetch Previous Call Summaries                          │
│    SELECT * FROM lead_analytics                            │
│    WHERE phone_number = '+1234567890'                      │
│    AND analysis_type = 'individual'                        │
│    ORDER BY created_at DESC LIMIT 5                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Format Previous Context with Labels                     │
│                                                            │
│    === CALL 1 ===                                          │
│    Execution ID: exec_123                                  │
│    Lead Status: Hot Lead                                   │
│    Total Score: 85                                         │
│    Intent: Strong purchase intent                          │
│    Urgency: Needs solution within 2 weeks                  │
│    Engagement: Highly engaged                              │
│    Transcript:                                             │
│    Hello, I'm interested in your product...                │
│                                                            │
│    === CALL 2 ===                                          │
│    Execution ID: exec_456                                  │
│    Lead Status: Warm Lead                                  │
│    Total Score: 65                                         │
│    Intent: Moderate interest                               │
│    Urgency: No specific timeline                           │
│    Engagement: Moderately engaged                          │
│    Transcript:                                             │
│    Following up on our previous call...                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. OpenAI Complete Analysis                                │
│    extractCompleteAnalysis(currentTranscript, executionId, │
│                            phone, previousSummaries)       │
│                                                            │
│    Prompt:                                                 │
│    "Previous call history (newest first):                  │
│     [formatted previous calls with labels]                 │
│                                                            │
│     Current call:                                          │
│     [current transcript]                                   │
│                                                            │
│     Analyze the complete interaction history and provide   │
│     an aggregated assessment in JSON format..."            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Parse OpenAI Response                                   │
│    - Same parsing as individual                            │
│    - CompleteAnalysis extends IndividualAnalysis           │
│    - Contains aggregated scores across all calls           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Lead Analytics Service - mapCompleteAnalysis()          │
│                                                            │
│    Same conversions as individual +                        │
│    - previous_calls_analyzed: 2                            │
│    - latest_call_id: "call_789"                            │
│    - analysis_timestamp: new Date()                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Upsert to Database                                      │
│    - Check if complete analysis exists for phone_number    │
│    - If exists: UPDATE                                     │
│    - If not: INSERT                                        │
│    - Includes aggregated scores and historical context     │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 Field Mapping Reference

### Direct Mappings (No Conversion)
```typescript
// OpenAI → Database (same name, same type)
intent_level      → intent_level      (VARCHAR)
intent_score      → intent_score      (INTEGER)
urgency_level     → urgency_level     (VARCHAR)
urgency_score     → urgency_score     (INTEGER)
budget_constraint → budget_constraint (VARCHAR)
budget_score      → budget_score      (INTEGER)
fit_alignment     → fit_alignment     (VARCHAR)
fit_score         → fit_score         (INTEGER)
engagement_health → engagement_health (VARCHAR)
engagement_score  → engagement_score  (INTEGER)
total_score       → total_score       (INTEGER)
lead_status_tag   → lead_status_tag   (VARCHAR)
reasoning         → reasoning         (JSONB)
demo_book_datetime→ demo_book_datetime(VARCHAR)
```

### Nested Extraction (Flatten)
```typescript
// OpenAI → Database (extract from nested object)
extraction.name            → extracted_name     (VARCHAR)
extraction.email_address   → extracted_email    (VARCHAR)
extraction.company_name    → company_name       (VARCHAR)
extraction.smartnotification→smart_notification (TEXT)
```

### CTA Conversions (String → Boolean)
```typescript
// OpenAI → Database (convert "Yes"/"No" to boolean)
cta_pricing_clicked      "Yes" → true,  else false
cta_demo_clicked         "Yes" → true,  else false
cta_followup_clicked     "Yes" → true,  else false
cta_sample_clicked       "Yes" → true,  else false
cta_escalated_to_human   "Yes" → true,  else false
```

### CTA Interactions Object
```typescript
// Build cta_interactions JSONB from boolean values
cta_interactions: {
  pricing_clicked: boolean,
  demo_clicked: boolean,
  followup_clicked: boolean,
  sample_clicked: boolean,
  escalated_to_human: boolean
}
```

---

## 🎯 Key Differences: Individual vs Complete

| Aspect | Individual Analysis | Complete Analysis |
|--------|-------------------|-------------------|
| **Trigger** | After each call completes | After individual analysis saved |
| **Context** | Current call only | All previous calls + current |
| **Transcript Format** | Single transcript | Labeled: CALL 1, CALL 2, etc. |
| **Scores** | Current call scores | Aggregated historical scores |
| **Analysis Type** | `'individual'` | `'complete'` |
| **Database Operation** | INSERT (new record) | UPSERT (update existing) |
| **Additional Fields** | None | `previous_calls_analyzed`, `latest_call_id` |

---

## 🔍 Database Queries

### Get Latest Individual Analysis
```sql
SELECT 
  call_id,
  phone_number,
  total_score,
  lead_status_tag,
  reasoning->>'intent' as intent_reasoning,
  extraction->>'name' as customer_name,
  extraction->>'email_address' as customer_email,
  cta_pricing_clicked,
  cta_demo_clicked,
  smart_notification,
  created_at
FROM lead_analytics
WHERE analysis_type = 'individual'
  AND phone_number = '+1234567890'
ORDER BY created_at DESC
LIMIT 1;
```

### Get Complete Analysis with History
```sql
SELECT 
  call_id,
  phone_number,
  analysis_type,
  previous_calls_analyzed,
  total_score,
  lead_status_tag,
  reasoning,
  cta_interactions,
  smart_notification,
  updated_at
FROM lead_analytics
WHERE analysis_type = 'complete'
  AND phone_number = '+1234567890';
```

### Get Lead Journey
```sql
-- Get all interactions for a phone number
SELECT 
  analysis_type,
  total_score,
  lead_status_tag,
  smart_notification,
  created_at
FROM lead_analytics
WHERE phone_number = '+1234567890'
ORDER BY created_at ASC;
```

---

## ⚠️ Important Notes

1. **Complete Analysis is Optional**: If `OPENAI_COMPLETE_PROMPT_ID` is not configured, only individual analysis will run.

2. **Complete Analysis Upserts**: There's only ONE complete analysis record per phone number, updated after each call.

3. **CTA Tracking**: Both individual and complete analysis track CTA interactions. Complete analysis aggregates them.

4. **Smart Notification**: OpenAI generates contextual notifications like:
   - 🔥 Hot lead - Schedule demo ASAP
   - ⚠️ Losing interest - Follow up within 24h
   - ✅ Ready to close - Send pricing proposal

5. **Reasoning JSONB**: Contains detailed explanations for each score dimension (intent, urgency, budget, fit, engagement, cta_behavior).

6. **Extraction Optional**: If OpenAI can't extract name/email/company, those fields will be `null` in database.

---

## 🚀 Testing Commands

### Test Individual Analysis
```bash
# 1. Make a test call
# 2. Check webhook received
# 3. Verify database insert
psql -U user -d database -c "SELECT * FROM lead_analytics WHERE analysis_type = 'individual' ORDER BY created_at DESC LIMIT 1;"
```

### Test Complete Analysis
```bash
# 1. Make 2-3 calls to same number
# 2. Check complete analysis created/updated
psql -U user -d database -c "SELECT phone_number, previous_calls_analyzed, total_score, updated_at FROM lead_analytics WHERE analysis_type = 'complete' ORDER BY updated_at DESC LIMIT 5;"
```

### Test CTA Conversions
```bash
# Verify CTA booleans stored correctly
psql -U user -d database -c "SELECT phone_number, cta_pricing_clicked, cta_demo_clicked, cta_followup_clicked FROM lead_analytics WHERE cta_pricing_clicked = true LIMIT 5;"
```

---

## ✅ Verification Checklist

Before deploying to production:

- [ ] Test individual analysis creates correct database record
- [ ] Test complete analysis upserts existing record
- [ ] Verify CTA strings convert to booleans correctly
- [ ] Confirm extraction fields map properly
- [ ] Check reasoning JSONB structure is correct
- [ ] Verify smart_notification is saved
- [ ] Test with missing extraction data (should be null)
- [ ] Test complete analysis with 1 call (previous_calls_analyzed = 0)
- [ ] Test complete analysis with 5+ calls (should include all previous)
- [ ] Check logs for any errors during OpenAI extraction

---

## 📞 Support

If you encounter issues:

1. Check OpenAI API logs for extraction errors
2. Verify webhook is receiving complete data
3. Check database logs for insert/update errors
4. Verify environment variables are set:
   - `OPENAI_API_KEY`
   - `OPENAI_INDIVIDUAL_PROMPT_ID`
   - `OPENAI_COMPLETE_PROMPT_ID` (optional)

---

**Last Updated**: 2024-01-15  
**Status**: ✅ All compilation errors resolved, ready for testing
