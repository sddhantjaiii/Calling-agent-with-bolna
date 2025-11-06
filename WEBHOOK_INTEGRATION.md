# Bolna.ai Webhook Integration - Comprehensive Implementation Plan

**Date**: October 8, 2025  
**Status**: Planning Phase  
**Migration Context**: Post-Bolna.ai Integration  

---

## 📋 Table of Contents
1. [Executive Summary](#executive-summary)
2. [Webhook Flow Analysis](#webhook-flow-analysis)
3. [Database Schema Changes](#database-schema-changes)
4. [OpenAI Integration Architecture](#openai-integration-architecture)
5. [Webhook Processing Logic](#webhook-processing-logic)
6. [Implementation Phases](#implementation-phases)
7. [File Changes Required](#file-changes-required)
8. [Testing Strategy](#testing-strategy)

---

## 🎯 Executive Summary

### Current State
- **Webhook System**: Deferred pending live payload analysis ✅ **NOW AVAILABLE**
- **Extraction Method**: Basic JSON parsing from Bolna.ai payload
- **Call Tracking**: Single webhook processing per call
- **Lead Analytics**: Single row per call without aggregation

### Target State
- **Webhook System**: Complete 5-stage webhook lifecycle tracking
- **Extraction Method**: Dual OpenAI Response API calls (individual + aggregated analysis) - **Bolna.ai extraction removed**
- **Call Tracking**: Track all 5 webhook stages with status transitions
- **Lead Analytics**: Individual + Complete analysis rows with historical context per user
- **Call Status**: Comprehensive tracking (initiated → ringing → busy/no-answer/in-progress → call-disconnected → completed)
- **Multi-tenant**: One caller can be customer of multiple users - complete analysis tracks per user_id + phone_number

---

## 📊 Webhook Flow Analysis

### Webhook Lifecycle (Based on Debug Folder Analysis)

#### Scenario 1: Successful Call (User Answers) - **5 Webhooks**

| # | Status | Timestamp | Key Fields | Action Required |
|---|--------|-----------|------------|-----------------|
| 1 | `initiated` | T+0s | `conversation_duration: 0`, `transcript: null` | Create call record, set status |
| 2 | `ringing` | T+2s | `conversation_duration: 0`, `transcript: null` | Update call status |
| 3 | `in-progress` | T+5s | `conversation_duration: 0`, `transcript: null` | Update call status (user picked up) |
| 4 | `call-disconnected` | T+33s | `conversation_duration: 27.2`, `transcript: "..."` | **Process transcript, extract data, update duration** |
| 5 | `completed` | T+13m | `recording_url`, `hangup_by: "Callee"`, `telephony_data.duration: "28"` | **Update recording URL, hangup info, finalize call** |

#### Scenario 2: No Answer - **3 Webhooks**

| # | Status | Timestamp | Key Fields | Action Required |
|---|--------|-----------|------------|-----------------|
| 1 | `initiated` | T+0s | `conversation_duration: 0` | Create call record |
| 2 | `ringing` | T+2s | `conversation_duration: 0` | Update status |
| 3 | `no-answer` | T+46s | `hangup_by: "Carrier"`, `hangup_reason: "Call recipient rejected"` | **Mark as failed/no-answer** |

#### Scenario 3: Busy - **3 Webhooks**

| # | Status | Timestamp | Key Fields | Action Required |
|---|--------|-----------|------------|-----------------|
| 1 | `initiated` | T+0s | `conversation_duration: 0` | Create call record |
| 2 | `ringing` | T+2s | `conversation_duration: 0` | Update status |
| 3 | `busy` | T+24s | `hangup_by: "Carrier"`, `hangup_reason: "Call recipient was busy"` | **Mark as failed/busy** |

### Key Observations from Webhook Analysis

1. **Execution ID**: `id` field remains constant across all webhooks (e.g., `6028966f-669e-4954-8933-a582ef93dfd7`)
2. **Conversation Duration**: 
   - Webhooks 1-3: Always `0`
   - Webhook 4 (`call-disconnected`): Contains actual duration (e.g., `27.2` seconds)
   - Webhook 5 (`completed`): Same duration in `telephony_data.duration: "28"` (rounded)
3. **Transcript Availability**: Only in webhook 4 (`call-disconnected`) when call was answered
4. **Recording URL**: Only in webhook 5 (`completed`) - direct MP3 URL
5. **Hangup Information**: Available from webhook 3 onwards
   - `hangup_by`: "Callee" | "Carrier"
   - `hangup_reason`: Descriptive text
   - `hangup_provider_code`: Numeric code

---

## 🗄️ Database Schema Changes

### 1. Update `calls` Table

#### New Columns to Add:
```sql
-- Call lifecycle tracking
ALTER TABLE calls
ADD COLUMN IF NOT EXISTS call_lifecycle_status VARCHAR(20) DEFAULT 'initiated',
ADD COLUMN IF NOT EXISTS hangup_by VARCHAR(20), -- 'Callee' | 'Carrier' | null
ADD COLUMN IF NOT EXISTS hangup_reason TEXT,
ADD COLUMN IF NOT EXISTS hangup_provider_code INTEGER,
ADD COLUMN IF NOT EXISTS ringing_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS call_answered_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS call_disconnected_at TIMESTAMPTZ;

-- Add CHECK constraint for call_lifecycle_status
ALTER TABLE calls
ADD CONSTRAINT calls_lifecycle_status_check 
CHECK (call_lifecycle_status IN ('initiated', 'ringing', 'in-progress', 'call-disconnected', 'completed', 'no-answer', 'busy', 'failed'));

-- Modify lead_type values
ALTER TABLE calls
DROP CONSTRAINT IF EXISTS calls_lead_type_check;

ALTER TABLE calls
ADD CONSTRAINT calls_lead_type_check 
CHECK (lead_type IN ('inbound', 'outbound'));
```

#### Columns to Keep:
- `bolna_conversation_id` - For conversation reference
- `bolna_execution_id` - Primary tracking ID (unique across all webhooks)
- `status` - Keep for backward compatibility ('completed', 'failed', 'in_progress', 'cancelled')
- `recording_url` - Updated from webhook 5
- `duration_seconds` - **Updated**: Ceiling value from `conversation_duration` (27.2 → 28)
- `duration_minutes` - **Updated**: Ceiling of duration_seconds/60 for billing

### 2. Update `lead_analytics` Table

#### New Columns to Add:
```sql
-- Multi-tenant and analytics type tracking
ALTER TABLE lead_analytics
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS analysis_type VARCHAR(20) DEFAULT 'individual',
ADD COLUMN IF NOT EXISTS previous_calls_analyzed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS latest_call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS analysis_timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Add CHECK constraint for analysis_type
ALTER TABLE lead_analytics
ADD CONSTRAINT lead_analytics_type_check 
CHECK (analysis_type IN ('individual', 'complete'));

-- Add indexes for querying complete analyses
CREATE INDEX IF NOT EXISTS idx_lead_analytics_type ON lead_analytics(call_id, analysis_type);
CREATE INDEX IF NOT EXISTS idx_lead_analytics_user_phone ON lead_analytics(user_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_lead_analytics_complete ON lead_analytics(user_id, phone_number, analysis_type) 
WHERE analysis_type = 'complete';

-- Add foreign key constraint for user_id
-- Note: user_id can be NULL for individual analysis (derived from call_id)
-- But MUST be NOT NULL for complete analysis
```

#### Analysis Type Definitions:
- **`individual`**: Analysis for single call only (created on webhook 4)
  - `call_id`: Links to specific call
  - `user_id`: Inherited from call's user_id
  - `phone_number`: NULL (not needed for individual)
  - `previous_calls_analyzed`: Always 0
  
- **`complete`**: Aggregated analysis across all calls for this contact **per user** (updated on webhook 4 after processing individual)
  - `call_id`: NULL (not linked to specific call)
  - `user_id`: **REQUIRED** - Identifies which user's agents this contact interacted with
  - `phone_number`: **REQUIRED** - Identifies the contact
  - `latest_call_id`: Points to most recent call
  - `previous_calls_analyzed`: Total calls analyzed for this user_id + phone_number combination
  
**Multi-tenant Design**: One phone number can have multiple complete analysis rows (one per user_id), enabling scenarios where:
- Same contact calls multiple companies using your platform
- Each company sees aggregated history of their interactions only

### 3. Remove `twilio_processed_calls` Table
```sql
-- No longer needed - we now track Bolna.ai call lifecycle
DROP TABLE IF EXISTS twilio_processed_calls;
```

---

## 🤖 OpenAI Integration Architecture

### Environment Variables Required

```env
# OpenAI Response API Configuration
OPENAI_API_KEY=sk-xxx...

# Prompt IDs (created in OpenAI Platform -> Prompts section)
# Format: pmpt_<alphanumeric_string>
OPENAI_INDIVIDUAL_PROMPT_ID=pmpt_68de2bd80fa08196ab95184e7787c6e30c231f4a29f082a0
OPENAI_COMPLETE_PROMPT_ID=pmpt_abc123def456ghi789jkl012mno345pqr678stu901vwx234

# Optional: Override default model/settings (usually configured in prompt itself)
OPENAI_MODEL=gpt-4o-2024-08-06
OPENAI_MAX_TOKENS=2000
OPENAI_TIMEOUT=30000
```

### Creating Prompts in OpenAI Platform

**Step 1**: Go to [OpenAI Platform Prompts](https://platform.openai.com/prompts)

**Step 2**: Create Individual Analysis Prompt
- **Name**: "Call Lead Extraction - Individual"
- **Model**: `gpt-4o-2024-08-06`
- **Temperature**: `0.7`
- **Instructions**: (Copy from your current Bolna.ai agent system prompt for lead scoring)
- Save and copy the **Prompt ID** (format: `pmpt_xxx...`)

**Step 3**: Create Complete Analysis Prompt
- **Name**: "Call Lead Extraction - Complete History"
- **Model**: `gpt-4o-2024-08-06`
- **Temperature**: `0.7`
- **Instructions**: (Same as individual but modified for multiple transcripts)
- Save and copy the **Prompt ID**

**Step 4**: Add Prompt IDs to `.env` file

### Dual OpenAI Response API Call Strategy

#### Call 1: Individual Call Analysis (Webhook 4)
**Purpose**: Extract data from current call transcript only

**API Endpoint**: `POST https://api.openai.com/v1/responses`

**Request Structure**:
```typescript
{
  prompt: {
    id: process.env.OPENAI_INDIVIDUAL_PROMPT_ID  // e.g., "pmpt_abc123..."
  },
  input: [
    {
      role: "user",
      content: `Analyze this call transcript and extract lead data:\n\nTranscript:\n${transcript}\n\nCall Duration: ${durationSeconds} seconds\nPhone Number: ${phoneNumber}\nCall Date: ${callDate}`
    }
  ],
  conversation: conversationId,  // Optional: for context tracking
  user: userId  // Optional: for abuse monitoring
}
```

**Note**: The actual prompt instructions (scoring rules, extraction format, etc.) are stored in OpenAI Platform under the Prompt ID. The `input` only provides the transcript data.

**Response Structure** (from OpenAI Response API):
```typescript
{
  id: "resp_abc123xyz",
  object: "response",
  created_at: 1759765227,
  model: "gpt-4o-2024-08-06",
  output: [
    {
      id: "out_def456",
      type: "message",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: "{\"total_score\":75,\"intent_level\":\"high\",\"intent_score\":3,\"urgency_level\":\"medium\",\"urgency_score\":2,\"budget_constraint\":\"mentioned\",\"budget_score\":2,\"fit_alignment\":\"good\",\"fit_score\":2,\"engagement_health\":\"active\",\"engagement_score\":3,\"lead_status_tag\":\"Warm\",\"reasoning\":{\"intent\":\"Customer clearly stated need for CRM solution\",\"urgency\":\"Mentioned timeline within 2 weeks\",\"budget\":\"Budget range of $10k mentioned\",\"fit\":\"Company size matches target market\",\"engagement\":\"Asked multiple relevant questions\",\"cta_behavior\":\"Requested demo and pricing info\"},\"extraction\":{\"company_name\":\"Acme Corp\",\"name\":\"John Smith\",\"email_address\":\"john@acme.com\",\"smartnotification\":\"CRM demo request\"},\"cta_pricing_clicked\":true,\"cta_demo_clicked\":true,\"cta_followup_clicked\":false,\"cta_sample_clicked\":false,\"cta_escalated_to_human\":false,\"demo_scheduled_at\":\"2025-10-15T14:00:00Z\"}"
        }
      ],
      status: "completed"
    }
  ],
  conversation: {
    id: "conv_xyz789"
  },
  usage: {
    input_tokens: 1245,
    output_tokens: 318,
    total_tokens: 1563
  },
  status: "completed"
}
```

**Parsed Output Interface**:
```typescript
interface IndividualAnalysis {
  total_score: number;
  intent_level: string;
  intent_score: number;
  urgency_level: string;
  urgency_score: number;
  budget_constraint: string;
  budget_score: number;
  fit_alignment: string;
  fit_score: number;
  engagement_health: string;
  engagement_score: number;
  lead_status_tag: string;
  reasoning: {
    intent: string;
    urgency: string;
    budget: string;
    fit: string;
    engagement: string;
    cta_behavior: string;
  };
  extraction: {
    company_name?: string;
    name?: string;
    email_address?: string;
    smartnotification?: string;
  };
  cta_pricing_clicked: boolean;
  cta_demo_clicked: boolean;
  cta_followup_clicked: boolean;
  cta_sample_clicked: boolean;
  cta_escalated_to_human: boolean;
  demo_scheduled_at?: string;
}
```

**Extraction Logic**:
```typescript
// Get the response text from OpenAI Response API
const messageOutput = response.output.find(out => out.type === 'message');
const responseText = messageOutput.content[0].text;

// Parse JSON response
const analysis: IndividualAnalysis = JSON.parse(responseText);
```

#### Call 2: Complete Historical Analysis (Webhook 4)
**Purpose**: Analyze all previous calls for this contact + current call **for specific user**

**API Endpoint**: `POST https://api.openai.com/v1/responses`

**Request Structure**:
```typescript
{
  prompt: {
    id: process.env.OPENAI_COMPLETE_PROMPT_ID  // Different prompt ID for historical analysis
  },
  input: [
    {
      role: "user",
      content: `Analyze all call transcripts for this contact and provide aggregated lead insights.

Contact: ${phoneNumber}
Total Calls: ${totalCalls}
User: ${userId}

Previous Extractions:
${previousIndividualAnalyses.map((a, i) => `
Call ${i + 1} (${a.date}):
- Score: ${a.total_score}
- Intent: ${a.intent_level}
- Status: ${a.lead_status_tag}
- Extracted: ${JSON.stringify(a.extraction)}
`).join('\n')}

All Transcripts:
${transcripts.map((t, i) => `
=== CALL ${i + 1} (${t.date}, ${t.duration}s) ===
${t.transcript}
`).join('\n\n')}

Provide aggregated analysis considering the full conversation history.`
    }
  ],
  conversation: conversationId,
  user: userId
}
```

**Response Structure**: Same as individual analysis

**Parsed Output Interface**: Same as `IndividualAnalysis` but represents aggregated insights

### OpenAI Response API Service Implementation

```typescript
// backend/src/services/openaiExtractionService.ts

interface OpenAIResponseRequest {
  prompt: {
    id: string;  // Prompt ID from OpenAI Platform
  };
  input: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  conversation?: string;  // Optional conversation ID for tracking
  user?: string;  // Optional user ID for abuse monitoring
}

interface OpenAIResponseOutput {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  status: string;
}

interface OpenAIResponseData {
  id: string;
  object: string;
  created_at: number;
  model: string;
  output: OpenAIResponseOutput[];
  conversation?: {
    id: string;
  };
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  status: string;
  error?: {
    message: string;
    type: string;
    code: string;
  };
}

interface OpenAIExtractionResult {
  success: boolean;
  data?: IndividualAnalysis;
  error?: string;
  tokensUsed?: number;
  model?: string;
  responseId?: string;
  conversationId?: string;
}

class OpenAIExtractionService {
  private apiKey: string;
  private baseUrl: string = 'https://api.openai.com/v1';
  private timeout: number;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY!;
    this.timeout = parseInt(process.env.OPENAI_TIMEOUT || '30000');
  }

  /**
   * Call OpenAI Response API with retry logic
   */
  private async callResponseAPI(
    request: OpenAIResponseRequest,
    maxRetries: number = 3
  ): Promise<OpenAIResponseData> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/responses`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(this.timeout)
        });

        if (!response.ok) {
          const errorData = await response.json();
          
          // Don't retry client errors (except rate limits)
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
          }
          
          // Retry server errors and rate limits with exponential backoff
          if (attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1000;
            await this.sleep(delay);
            continue;
          }
          
          throw new Error(`OpenAI API error after ${maxRetries} retries: ${errorData.error?.message}`);
        }

        return await response.json();
        
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        
        const delay = Math.pow(2, attempt) * 1000;
        await this.sleep(delay);
      }
    }
    
    throw new Error('Failed to call OpenAI Response API');
  }

  /**
   * Extract individual call analysis
   */
  async extractIndividualCallData(
    transcript: string,
    callMetadata: {
      phoneNumber: string;
      duration: number;
      callDate: string;
      userId: string;
    }
  ): Promise<OpenAIExtractionResult> {
    try {
      const request: OpenAIResponseRequest = {
        prompt: {
          id: process.env.OPENAI_INDIVIDUAL_PROMPT_ID!
        },
        input: [
          {
            role: 'user',
            content: `Analyze this call transcript and extract lead data:

Transcript:
${transcript}

Call Metadata:
- Phone Number: ${callMetadata.phoneNumber}
- Duration: ${callMetadata.duration} seconds
- Call Date: ${callMetadata.callDate}

Provide analysis in JSON format.`
          }
        ],
        user: callMetadata.userId
      };

      const response = await this.callResponseAPI(request);

      // Extract the JSON response from output
      const messageOutput = response.output.find(out => out.type === 'message');
      if (!messageOutput) {
        throw new Error('No message output in OpenAI response');
      }

      const responseText = messageOutput.content[0]?.text;
      if (!responseText) {
        throw new Error('No text content in OpenAI response');
      }

      // Parse JSON response
      const analysis: IndividualAnalysis = JSON.parse(responseText);

      return {
        success: true,
        data: analysis,
        tokensUsed: response.usage.total_tokens,
        model: response.model,
        responseId: response.id,
        conversationId: response.conversation?.id
      };

    } catch (error) {
      console.error('OpenAI individual extraction error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Extract complete historical analysis
   */
  async extractCompleteAnalysis(
    transcripts: Array<{
      callId: string;
      transcript: string;
      date: string;
      duration: number;
      callNumber: number;
    }>,
    previousAnalyses: IndividualAnalysis[],
    contactMetadata: {
      phoneNumber: string;
      userId: string;
      totalCalls: number;
      contactInfo?: {
        name?: string;
        email?: string;
        company?: string;
      };
    }
  ): Promise<OpenAIExtractionResult> {
    try {
      // Build context from previous individual analyses
      const previousContext = previousAnalyses.map((analysis, index) => {
        return `Call ${index + 1} (${transcripts[index]?.date}):
- Score: ${analysis.total_score}/15
- Intent: ${analysis.intent_level} (${analysis.intent_score})
- Urgency: ${analysis.urgency_level} (${analysis.urgency_score})
- Status: ${analysis.lead_status_tag}
- Extracted: ${JSON.stringify(analysis.extraction)}`;
      }).join('\n\n');

      // Build full transcript history
      const transcriptHistory = transcripts.map((t, i) => {
        return `=== CALL ${i + 1} (${t.date}, ${t.duration}s) ===
${t.transcript}`;
      }).join('\n\n');

      const request: OpenAIResponseRequest = {
        prompt: {
          id: process.env.OPENAI_COMPLETE_PROMPT_ID!
        },
        input: [
          {
            role: 'user',
            content: `Analyze all call transcripts for this contact and provide aggregated lead insights.

Contact Information:
- Phone Number: ${contactMetadata.phoneNumber}
- Total Calls: ${contactMetadata.totalCalls}
- User ID: ${contactMetadata.userId}
${contactMetadata.contactInfo ? `- Name: ${contactMetadata.contactInfo.name}
- Email: ${contactMetadata.contactInfo.email}
- Company: ${contactMetadata.contactInfo.company}` : ''}

Previous Individual Analyses:
${previousContext}

All Call Transcripts:
${transcriptHistory}

Provide aggregated analysis considering the full conversation history. Show progression over time and overall lead quality.`
          }
        ],
        user: contactMetadata.userId
      };

      const response = await this.callResponseAPI(request);

      // Extract and parse response
      const messageOutput = response.output.find(out => out.type === 'message');
      if (!messageOutput) {
        throw new Error('No message output in OpenAI response');
      }

      const responseText = messageOutput.content[0]?.text;
      if (!responseText) {
        throw new Error('No text content in OpenAI response');
      }

      const analysis: IndividualAnalysis = JSON.parse(responseText);

      return {
        success: true,
        data: analysis,
        tokensUsed: response.usage.total_tokens,
        model: response.model,
        responseId: response.id,
        conversationId: response.conversation?.id
      };

    } catch (error) {
      console.error('OpenAI complete extraction error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new OpenAIExtractionService();
```

---

## 🗂️ Data Model: Rows vs Updates

### Calls Table: **1 Row Per Call, Updated 5 Times**

Each call creates **ONE row** that gets updated as webhooks arrive:

```sql
-- Webhook 1: CREATE
INSERT INTO calls (bolna_execution_id, call_lifecycle_status, status)
VALUES ('6028966f-...', 'initiated', 'in_progress');

-- Webhook 2: UPDATE same row
UPDATE calls SET call_lifecycle_status = 'ringing' WHERE bolna_execution_id = '6028966f-...';

-- Webhook 3: UPDATE same row
UPDATE calls SET call_lifecycle_status = 'in-progress' WHERE bolna_execution_id = '6028966f-...';

-- Webhook 4: UPDATE same row
UPDATE calls SET call_lifecycle_status = 'call-disconnected', duration_seconds = 28 
WHERE bolna_execution_id = '6028966f-...';

-- Webhook 5: UPDATE same row
UPDATE calls SET call_lifecycle_status = 'completed', recording_url = 'https://...' 
WHERE bolna_execution_id = '6028966f-...';
```

**Result**: **1 row** tracking the complete lifecycle

---

### Lead Analytics Table: **2 Rows Per Call**

Each call creates **2 separate rows** with different purposes:

#### Row 1: Individual Analysis (Always INSERT)
```sql
-- Call 1
INSERT INTO lead_analytics (call_id, analysis_type, previous_calls_analyzed, total_score)
VALUES (101, 'individual', 0, 70);

-- Call 2 from same contact
INSERT INTO lead_analytics (call_id, analysis_type, previous_calls_analyzed, total_score)
VALUES (102, 'individual', 0, 65);

-- Call 3 from same contact
INSERT INTO lead_analytics (call_id, analysis_type, previous_calls_analyzed, total_score)
VALUES (103, 'individual', 0, 80);
```

**Purpose**: Track individual call performance  
**Pattern**: Always creates NEW row per call  
**Identifies**: Specific call via `call_id`

#### Row 2: Complete Analysis (UPSERT Pattern)
```sql
-- Call 1: First interaction - CREATE
INSERT INTO lead_analytics (
  user_id, phone_number, analysis_type, previous_calls_analyzed, latest_call_id, total_score
) VALUES (
  456, '+1234567890', 'complete', 1, 101, 70
);

-- Call 2: Same contact - UPDATE existing row
UPDATE lead_analytics
SET previous_calls_analyzed = 2,
    latest_call_id = 102,
    total_score = 68,  -- Aggregated: (70 + 65) / 2
    updated_at = NOW()
WHERE user_id = 456 AND phone_number = '+1234567890' AND analysis_type = 'complete';

-- Call 3: Same contact - UPDATE same row again
UPDATE lead_analytics
SET previous_calls_analyzed = 3,
    latest_call_id = 103,
    total_score = 72,  -- Aggregated: (70 + 65 + 80) / 3
    updated_at = NOW()
WHERE user_id = 456 AND phone_number = '+1234567890' AND analysis_type = 'complete';
```

**Purpose**: Track aggregated engagement trend across all calls  
**Pattern**: UPSERT - Insert first time, update subsequently  
**Identifies**: Contact via `phone_number` + `user_id` (no specific call_id)

---

### Visual Example: 3 Calls from Same Contact

```
CALLS TABLE (1 row per call = 3 rows total)
┌────────────────────────────────────┬────────────────────────┬────────────┐
│ bolna_execution_id                 │ call_lifecycle_status  │ duration_s │
├────────────────────────────────────┼────────────────────────┼────────────┤
│ 6028966f-669e-4954-8933-...        │ completed              │ 28         │
│ 4dfcbb06-0848-460e-9f70-...        │ no-answer              │ 0          │
│ 12f815cf-7fac-4030-8a52-...        │ completed              │ 45         │
└────────────────────────────────────┴────────────────────────┴────────────┘

LEAD_ANALYTICS TABLE (2 rows per call = 6 rows total)
┌──────┬─────────┬───────────────┬─────────────────────────┬─────────────┬──────────┐
│ id   │ call_id │ analysis_type │ previous_calls_analyzed │ latest_call │ score    │
├──────┼─────────┼───────────────┼─────────────────────────┼─────────────┼──────────┤
│ 1    │ 101     │ individual    │ 0                       │ NULL        │ 70       │ ← Call 1 individual
│ 2    │ NULL    │ complete      │ 1                       │ 101         │ 70       │ ← After call 1
│ 3    │ 102     │ individual    │ 0                       │ NULL        │ 40       │ ← Call 2 individual (no-answer)
│ 4    │ NULL    │ complete      │ 2                       │ 102         │ 55       │ ← UPDATED after call 2
│ 5    │ 103     │ individual    │ 0                       │ NULL        │ 85       │ ← Call 3 individual
│ 6    │ NULL    │ complete      │ 3                       │ 103         │ 65       │ ← UPDATED after call 3
└──────┴─────────┴───────────────┴─────────────────────────┴─────────────┴──────────┘
        ↑                                                     ↑
   Individual rows                                     Complete row
   (new per call)                                      (updated per call)
```

---

### Query Patterns

```sql
-- Get individual analysis for specific call
SELECT * FROM lead_analytics
WHERE call_id = 102 AND analysis_type = 'individual';

-- Get current complete analysis for a contact
SELECT * FROM lead_analytics
WHERE user_id = 456 
  AND phone_number = '+1234567890'
  AND analysis_type = 'complete';

-- Get all individual analyses for a contact (call history)
SELECT la.*, c.created_at
FROM lead_analytics la
JOIN calls c ON la.call_id = c.id
WHERE c.phone_number = '+1234567890'
  AND c.user_id = 456
  AND la.analysis_type = 'individual'
ORDER BY c.created_at DESC;

-- Compare individual vs complete trend
SELECT 
  c.created_at as call_date,
  la_ind.total_score as individual_score,
  (SELECT total_score FROM lead_analytics 
   WHERE user_id = c.user_id 
     AND phone_number = c.phone_number 
     AND analysis_type = 'complete' 
   LIMIT 1) as complete_aggregate_score
FROM calls c
LEFT JOIN lead_analytics la_ind 
  ON c.id = la_ind.call_id AND la_ind.analysis_type = 'individual'
WHERE c.phone_number = '+1234567890'
ORDER BY c.created_at;
```

---

## ⚙️ Webhook Processing Logic

### Webhook 1: `initiated`
**Action**: Create initial call record (ONE ROW)

```typescript
async processInitiatedWebhook(payload: BolnaWebhookPayload) {
  // 1. Find agent by bolna_agent_id
  const agent = await Agent.findByBolnaId(payload.agent_id);
  
  // 2. Normalize phone number
  const normalizedPhone = normalizePhoneNumber(payload.telephony_data.to_number);
  
  // 3. Create call record (SINGLE ROW - will be updated by subsequent webhooks)
  const call = await Call.create({
    agent_id: agent.id,
    user_id: agent.user_id,
    bolna_conversation_id: payload.id, // Same as execution_id for now
    bolna_execution_id: payload.id,
    phone_number: normalizedPhone,
    call_lifecycle_status: 'initiated',  // ← Will be updated: ringing → in-progress → call-disconnected → completed
    status: 'in_progress',
    lead_type: payload.telephony_data.call_type === 'outbound' ? 'outbound' : 'inbound',
    duration_seconds: 0,
    duration_minutes: 0,
    credits_used: 0,
    metadata: {
      provider: payload.provider,
      provider_call_id: payload.telephony_data.provider_call_id
    }
  });
  
  // 4. Find or create contact
  const contact = await contactAutoCreationService.findOrCreateContact({
    user_id: agent.user_id,
    phone_number: normalizedPhone,
    call_id: call.id
  });
  
  // 5. Update call with contact_id
  await Call.update(call.id, { contact_id: contact.id });
}
```

### Webhook 2: `ringing`
**Action**: Update status and timestamp

```typescript
async processRingingWebhook(payload: BolnaWebhookPayload) {
  await Call.updateByExecutionId(payload.id, {
    call_lifecycle_status: 'ringing',
    ringing_started_at: new Date(),
    updated_at: new Date()
  });
}
```

### Webhook 3: `in-progress` | `no-answer` | `busy`
**Action**: Update status based on outcome

```typescript
async processStatusWebhook(payload: BolnaWebhookPayload) {
  const updates: any = {
    call_lifecycle_status: payload.status,
    updated_at: new Date()
  };
  
  if (payload.status === 'in-progress') {
    updates.call_answered_at = new Date();
  } else if (payload.status === 'no-answer' || payload.status === 'busy') {
    updates.status = 'failed';
    updates.hangup_by = payload.telephony_data.hangup_by;
    updates.hangup_reason = payload.telephony_data.hangup_reason;
    updates.hangup_provider_code = payload.telephony_data.hangup_provider_code;
    updates.completed_at = new Date();
  }
  
  await Call.updateByExecutionId(payload.id, updates);
}
```

### Webhook 4: `call-disconnected` ⚠️ **CRITICAL**
**Action**: Extract transcript, process with OpenAI (creates 2 lead_analytics rows), calculate duration, deduct credits

```typescript
async processCallDisconnectedWebhook(payload: BolnaWebhookPayload) {
  // 1. Find call (same row created in webhook 1)
  const call = await Call.findByExecutionId(payload.id);
  
  // 2. Calculate duration (ceiling round up)
  const conversationDuration = payload.conversation_duration; // e.g., 27.2
  const durationSeconds = Math.ceil(conversationDuration); // 28 seconds
  const durationMinutes = Math.ceil(durationSeconds / 60); // 1 minute
  
  // 3. Calculate credits (same logic as before)
  const creditsUsed = durationMinutes; // 1 credit per minute
  
  // 4. Update call with duration and status (SAME ROW - UPDATE)
  await Call.update(call.id, {
    call_lifecycle_status: 'call-disconnected',
    call_disconnected_at: new Date(),
    duration_seconds: durationSeconds,
    duration_minutes: durationMinutes,
    credits_used: creditsUsed,
    metadata: {
      ...call.metadata,
      raw_conversation_duration: conversationDuration
    }
  });
  
  // 5. Deduct credits from user
  await billingService.deductCredits(call.user_id, creditsUsed, call.id);
  
  // 6. Store transcript
  if (payload.transcript) {
    await transcriptService.create({
      call_id: call.id,
      user_id: call.user_id,
      content: payload.transcript,
      analysis_status: 'pending'
    });
    
    // ============================================
    // 7. INDIVIDUAL ANALYSIS - OpenAI Call 1
    //    Creates NEW ROW for this specific call
    // ============================================
    const individualAnalysis = await openaiExtractionService.extractIndividualCallData(
      payload.transcript,
      {
        phoneNumber: call.phone_number,
        duration: durationSeconds,
        callDate: call.created_at.toISOString()
      }
    );
    
    // 8. Save individual analysis (NEW ROW - always INSERT)
    await leadAnalyticsService.create({
      call_id: call.id,                          // Links to specific call
      user_id: call.user_id,
      analysis_type: 'individual',               // ← Type: individual
      previous_calls_analyzed: 0,                // Only this call analyzed
      analysis_timestamp: new Date(),
      ...individualAnalysis
    });
    
    // ============================================
    // 9. COMPLETE ANALYSIS - OpenAI Call 2
    //    UPSERTS single row per contact
    // ============================================
    
    // Get all previous calls for this contact (including current)
    const previousCalls = await Call.findByPhoneNumber(call.phone_number, call.user_id);
    const transcripts = await Promise.all(
      previousCalls.map(async (prevCall, index) => {
        const transcript = await transcriptService.findByCallId(prevCall.id);
        return {
          callId: prevCall.id,
          transcript: transcript?.content || '',
          date: prevCall.created_at.toISOString(),
          duration: prevCall.duration_seconds,
          callNumber: index + 1
        };
      })
    );
    
    const completeAnalysis = await openaiExtractionService.extractCompleteAnalysis(
      transcripts,
      {
        phoneNumber: call.phone_number,
        totalCalls: previousCalls.length,
        contactInfo: {
          name: call.caller_name,
          email: call.caller_email,
          company: individualAnalysis.extraction?.company_name
        }
      }
    );
    
    // 10. Upsert complete analysis (UPSERT - UPDATE if exists, INSERT if first call)
    //     Only ONE row per contact with analysis_type='complete'
    await leadAnalyticsService.upsertCompleteAnalysis({
      user_id: call.user_id,
      phone_number: call.phone_number,
      analysis_type: 'complete',                 // ← Type: complete
      previous_calls_analyzed: previousCalls.length,  // Total calls analyzed
      latest_call_id: call.id,                   // Most recent call
      analysis_timestamp: new Date(),
      ...completeAnalysis
    });
    
    // ============================================
    // RESULT:
    // - 2 rows in lead_analytics table
    //   1. individual row (call_id=123, analysis_type='individual')
    //   2. complete row (call_id=NULL, analysis_type='complete', latest_call_id=123)
    // ============================================
  }
  
  // 11. Update transcript status
  await transcriptService.updateStatus(call.id, 'completed');
}
```

### Webhook 5: `completed`
**Action**: Update recording URL and hangup information

```typescript
async processCompletedWebhook(payload: BolnaWebhookPayload) {
  const updates: any = {
    call_lifecycle_status: 'completed',
    status: 'completed',
    recording_url: payload.telephony_data.recording_url,
    hangup_by: payload.telephony_data.hangup_by,
    hangup_reason: payload.telephony_data.hangup_reason,
    hangup_provider_code: payload.telephony_data.hangup_provider_code,
    completed_at: new Date(),
    metadata: {
      ...call.metadata,
      smart_status: payload.smart_status,
      total_cost: payload.total_cost,
      agent_extraction: payload.agent_extraction
    }
  };
  
  // Verify duration matches (optional validation)
  const telephonyDuration = parseInt(payload.telephony_data.duration);
  if (call.duration_seconds !== telephonyDuration) {
    logger.warn(`Duration mismatch for call ${payload.id}: ${call.duration_seconds} vs ${telephonyDuration}`);
  }
  
  await Call.updateByExecutionId(payload.id, updates);
}
```

---

## 📝 Implementation Phases

### Phase 1: Database Migration (Week 1)
**Tasks**:
1. Create migration file `007_webhook_lifecycle_tracking.sql`
2. Add new columns to `calls` table
3. Add new columns to `lead_analytics` table
4. Drop `twilio_processed_calls` table
5. Update indexes and constraints
6. Test migration on development database

**Files**:
- `backend/src/migrations/007_webhook_lifecycle_tracking.sql`
- Update `database.md` with new schema

### Phase 2: OpenAI Service Implementation (Week 1)
**Tasks**:
1. Create `openaiExtractionService.ts`
2. Implement prompt-based extraction
3. Add environment variable configuration
4. Create TypeScript interfaces for extraction results
5. Add error handling and retry logic
6. Write unit tests

**Files**:
- `backend/src/services/openaiExtractionService.ts`
- `backend/src/types/openai.ts`
- `backend/.env` (add OpenAI config)
- `backend/src/services/__tests__/openaiExtractionService.test.ts`

### Phase 3: Webhook Service Refactor (Week 2)
**Tasks**:
1. Update `BolnaWebhookPayload` interface in `types/webhook.ts`
2. Create separate webhook handlers for each status
3. Implement webhook routing logic
4. Update duration calculation logic (ceiling)
5. Integrate OpenAI extraction calls
6. Add comprehensive error handling
7. Update analytics service integration

**Files**:
- `backend/src/types/webhook.ts`
- `backend/src/services/webhookService.ts`
- `backend/src/services/webhookDataProcessor.ts`

### Phase 4: Model Updates (Week 2)
**Tasks**:
1. Update `Call` model with new methods
2. Add `findByExecutionId()` method
3. Add `updateByExecutionId()` method
4. Update `LeadAnalytics` model
5. Add `upsertCompleteAnalysis()` method
6. Add query methods for historical analysis

**Files**:
- `backend/src/models/Call.ts`
- `backend/src/models/LeadAnalytics.ts`

### Phase 5: Analytics Service Enhancement (Week 3)
**Tasks**:
1. Update `AnalyticsService` for dual analysis types
2. Add methods for complete analysis queries
3. Update dashboard queries to differentiate analysis types
4. Add KPI calculations for call lifecycle tracking
5. Update analytics caching strategy

**Files**:
- `backend/src/services/analyticsService.ts`
- `backend/src/services/leadAnalyticsService.ts`

### Phase 6: Testing & Validation (Week 3)
**Tasks**:
1. Create webhook simulation tests for all 5 webhooks
2. Test no-answer and busy scenarios
3. Test OpenAI extraction with real transcripts
4. Validate duration calculations
5. Test credit deduction logic
6. Test complete analysis aggregation
7. Load testing with multiple concurrent webhooks

**Files**:
- `backend/src/services/__tests__/webhookService.enhanced.test.ts`
- `test-webhook-lifecycle.js`
- `test-openai-extraction.js`

### Phase 7: Frontend Updates (Week 4)
**Tasks**:
1. Update call status display to show lifecycle stages
2. Add hangup information display
3. Update lead analytics to show individual vs complete
4. Add call timeline visualization
5. Update KPI cards to show missed calls, connected calls, etc.

**Files**:
- `Frontend/src/components/calls/CallList.tsx`
- `Frontend/src/components/analytics/CallLifecycleChart.tsx`
- `Frontend/src/components/leads/LeadAnalytics.tsx`

### Phase 8: Production Deployment (Week 4)
**Tasks**:
1. Deploy database migration to production
2. Update environment variables in production
3. Deploy backend code
4. Monitor webhook processing
5. Validate OpenAI API usage and costs
6. Update documentation

---

## 📂 File Changes Required

### New Files to Create

#### 1. Migration File
**Path**: `backend/src/migrations/007_webhook_lifecycle_tracking.sql`
**Purpose**: Add new columns and constraints

#### 2. OpenAI Service
**Path**: `backend/src/services/openaiExtractionService.ts`
**Purpose**: Handle OpenAI API calls for extraction

#### 3. OpenAI Types
**Path**: `backend/src/types/openai.ts`
**Purpose**: TypeScript interfaces for OpenAI integration

#### 4. Webhook Lifecycle Tests
**Path**: `backend/src/services/__tests__/webhookLifecycle.test.ts`
**Purpose**: Comprehensive webhook flow testing

#### 5. Lead Analytics Service
**Path**: `backend/src/services/leadAnalyticsService.ts`
**Purpose**: Separate service for lead analytics operations

**Key Methods**:
```typescript
class LeadAnalyticsService {
  // Always creates NEW row for individual analysis
  async create(data: IndividualAnalysisData): Promise<LeadAnalytics> {
    return await LeadAnalytics.create({
      call_id: data.call_id,
      user_id: data.user_id,
      analysis_type: 'individual',
      previous_calls_analyzed: 0,
      ...data
    });
  }
  
  // UPSERT logic for complete analysis
  async upsertCompleteAnalysis(data: CompleteAnalysisData): Promise<LeadAnalytics> {
    // Check if complete analysis exists for this contact
    const existing = await LeadAnalytics.findOne({
      user_id: data.user_id,
      phone_number: data.phone_number,
      analysis_type: 'complete'
    });
    
    if (existing) {
      // UPDATE existing row
      return await LeadAnalytics.update(existing.id, {
        previous_calls_analyzed: data.previous_calls_analyzed,
        latest_call_id: data.latest_call_id,
        total_score: data.total_score,
        intent_score: data.intent_score,
        urgency_score: data.urgency_score,
        budget_score: data.budget_score,
        fit_score: data.fit_score,
        engagement_score: data.engagement_score,
        lead_status_tag: data.lead_status_tag,
        reasoning: data.reasoning,
        extraction: data.extraction,
        analysis_timestamp: new Date(),
        updated_at: new Date()
      });
    } else {
      // INSERT new row (first call for this contact)
      return await LeadAnalytics.create({
        call_id: null,  // Complete analysis doesn't link to specific call
        user_id: data.user_id,
        phone_number: data.phone_number,
        analysis_type: 'complete',
        previous_calls_analyzed: data.previous_calls_analyzed,
        latest_call_id: data.latest_call_id,
        ...data
      });
    }
  }
  
  // Get historical individual analyses for a contact
  async getIndividualAnalysesByContact(
    userId: string, 
    phoneNumber: string
  ): Promise<LeadAnalytics[]> {
    const calls = await Call.findByPhoneNumber(phoneNumber, userId);
    const callIds = calls.map(c => c.id);
    
    return await LeadAnalytics.findAll({
      call_id: { $in: callIds },
      analysis_type: 'individual'
    });
  }
  
  // Get current complete analysis for a contact
  async getCompleteAnalysisByContact(
    userId: string, 
    phoneNumber: string
  ): Promise<LeadAnalytics | null> {
    return await LeadAnalytics.findOne({
      user_id: userId,
      phone_number: phoneNumber,
      analysis_type: 'complete'
    });
  }
}
```

### Files to Update

#### 1. Webhook Types
**Path**: `backend/src/types/webhook.ts`
**Changes**:
- Update `BolnaWebhookPayload` interface with new fields
- Add `TelephonyData` interface with all fields
- Add lifecycle status types

#### 2. Webhook Service
**Path**: `backend/src/services/webhookService.ts`
**Changes**:
- Refactor to handle 5 different webhook types
- Add OpenAI extraction integration
- Update duration calculation logic
- Add hangup information processing

#### 3. Call Model
**Path**: `backend/src/models/Call.ts`
**Changes**:
- Add new columns to `CallInterface`
- Add `findByExecutionId()` method
- Add `updateByExecutionId()` method
- Update `create()` method with new fields

#### 4. Analytics Service
**Path**: `backend/src/services/analyticsService.ts`
**Changes**:
- Add support for individual vs complete analysis
- Update KPI calculations for lifecycle tracking
- Add missed call tracking
- Remove Twilio-specific logic

#### 5. Contact Auto Creation
**Path**: `backend/src/services/contactAutoCreationService.ts`
**Changes**:
- Update to work with webhook 1 (initiated)
- Ensure contact creation before any other processing

#### 6. Database Documentation
**Path**: `database.md`
**Changes**:
- Document new `calls` table columns
- Document new `lead_analytics` columns
- Remove `twilio_processed_calls` documentation
- Add webhook lifecycle documentation

#### 7. Environment Example
**Path**: `backend/.env.example`
**Changes**:
- Add OpenAI configuration variables

---

## 🧪 Testing Strategy

### Unit Tests

#### 1. OpenAI Extraction Service
```typescript
describe('OpenAIExtractionService', () => {
  test('should extract individual call data from transcript');
  test('should handle OpenAI API errors gracefully');
  test('should extract complete analysis from multiple transcripts');
  test('should validate extraction result schema');
});
```

#### 2. Webhook Processing
```typescript
describe('WebhookService - Lifecycle', () => {
  test('should process initiated webhook correctly');
  test('should process ringing webhook');
  test('should process in-progress webhook');
  test('should process call-disconnected with transcript');
  test('should process completed webhook with recording');
  test('should handle no-answer scenario (3 webhooks)');
  test('should handle busy scenario (3 webhooks)');
});
```

#### 3. Duration Calculations
```typescript
describe('Duration Calculations', () => {
  test('should ceiling round conversation duration (27.2 → 28)');
  test('should calculate duration minutes correctly (28s → 1m)');
  test('should handle zero duration calls');
  test('should validate duration consistency between webhooks');
});
```

### Integration Tests

#### 1. Full Webhook Flow
**Scenario**: Simulate complete call lifecycle
```javascript
// test-webhook-lifecycle.js
async function testCompleteCallFlow() {
  // 1. Send initiated webhook
  // 2. Send ringing webhook
  // 3. Send in-progress webhook
  // 4. Send call-disconnected webhook with transcript
  // 5. Send completed webhook with recording
  // 6. Verify database state at each step
  // 7. Verify OpenAI was called twice
  // 8. Verify lead analytics has both individual and complete rows
}
```

#### 2. Historical Analysis
**Scenario**: Test complete analysis with multiple previous calls
```javascript
async function testHistoricalAnalysis() {
  // 1. Create 3 calls with transcripts
  // 2. Trigger 4th call webhook
  // 3. Verify OpenAI receives all 4 transcripts for complete analysis
  // 4. Verify complete analysis is updated, not duplicated
}
```

### Manual Testing Checklist

- [ ] Test with real Bolna.ai webhooks
- [ ] Verify OpenAI prompt IDs work correctly
- [ ] Check OpenAI API usage and costs
- [ ] Validate transcript extraction accuracy
- [ ] Test webhook retry scenarios
- [ ] Verify webhook ordering (out-of-order handling)
- [ ] Test with various phone number formats
- [ ] Validate credit deduction accuracy
- [ ] Check recording URL accessibility
- [ ] Test call lifecycle status transitions in UI

---

## 🚨 Critical Considerations

### 1. Webhook Ordering
**Issue**: Webhooks may arrive out of order  
**Solution**: Use `updated_at` timestamp and status validation before processing

### 2. Duplicate Webhooks
**Issue**: Bolna.ai may send duplicate webhooks  
**Solution**: Use `bolna_execution_id` + `status` as unique identifier for idempotency

### 3. OpenAI Cost Management
**Issue**: Two OpenAI calls per completed call could be expensive  
**Mitigation**:
- Use `gpt-4o-mini` model (cheaper)
- Implement token limits
- Cache extraction results
- Only process complete analysis if >1 previous call exists

### 4. Transcript Processing Delay
**Issue**: Webhook 4 and 5 have 13-minute gap  
**Solution**: Process transcript immediately on webhook 4, don't wait for webhook 5

### 5. Historical Call Limit
**Issue**: Too many previous calls could exceed OpenAI token limits  
**Solution**: Limit complete analysis to last 10 calls or 50,000 tokens

### 6. Concurrent Webhook Processing
**Issue**: Multiple webhooks for different calls arriving simultaneously  
**Solution**: Use database transactions and row-level locking

---

## 📊 Success Metrics

### Technical Metrics
- ✅ All 5 webhook types successfully processed
- ✅ 0% webhook processing errors
- ✅ <2s average webhook processing time
- ✅ 100% transcript extraction success rate
- ✅ OpenAI API success rate >99%

### Business Metrics
- 📈 Track missed call rate (no-answer + busy)
- 📈 Track call connected rate (in-progress reached)
- 📈 Track average conversation duration
- 📈 Track complete analysis insights vs individual
- 📈 Track lead qualification improvement with historical context

---

## 🔄 Migration Path

### From Current State to Target State

#### Step 1: Enable New Webhooks (Non-Breaking)
1. Deploy database migration
2. Deploy OpenAI service
3. Deploy updated webhook service
4. **Both old and new logic work in parallel**

#### Step 2: Validate New System (1 week)
1. Monitor webhook processing logs
2. Validate OpenAI extractions
3. Compare old vs new analytics
4. Fix any issues

#### Step 3: Cleanup (After validation)
1. Remove old webhook processing code
2. Remove Twilio references
3. Update frontend to use new fields
4. Archive old test files

---

## 📖 References

### Webhook Examples Analyzed
- `debug/webhook_6028966f-669e-4954-8933-a582ef93dfd7_*.json` (5 webhooks - successful call)
- `debug/webhook_4dfcbb06-0848-460e-9f70-fe2acab7b7af_*.json` (3 webhooks - no answer)
- `debug/webhook_12f815cf-7fac-4030-8a52-79d1a5e74cc9_*.json` (3 webhooks - busy)

### Key Files
- `backend/src/services/webhookService.ts` - Current webhook implementation
- `backend/src/types/webhook.ts` - Webhook type definitions
- `backend/src/models/Call.ts` - Call data model
- `database.md` - Database schema documentation

---

## ✅ Next Steps

1. **Review this plan** with the team
2. **Create GitHub issues** for each phase
3. **Setup OpenAI API account** and get prompt IDs
4. **Start with Phase 1** (Database Migration)
5. **Test each phase** before moving to next
6. **Document learnings** as we progress

---

**Document Status**: ✅ Planning Complete - Ready for Implementation  
**Last Updated**: October 8, 2025  
**Next Review**: Before Phase 1 implementation  

