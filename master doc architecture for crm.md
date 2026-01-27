# MASTER ARCHITECTURE DOCUMENT: AI CRM & AUTOMATION PLATFORM (Calling Agent)

**Version:** 2.0  
**Date:** January 23, 2026  
**Core Integration:** Bolna.ai (Voice), Meta (WhatsApp), OpenAI (Analytics)

---

## 1. HIGH-LEVEL SYSTEM ARCHITECTURE

The platform is a multi-tenant SaaS solution designed to automate lead engagement through Voice AI and WhatsApp channels. It operates on a split-service architecture to separate core business logic from channel-specific integrations.

### 1.1 Core Components

1.  **Frontend (Client Dashboard)**
    *   **Stack:** React, Vite, TailwindCSS (shadcn/ui), TanStack Query.
    *   **Role:** User interface for campaign management, contacts, analytics, and billing.
    *   **Port:** 5173 (Dev) / Served via Nginx (Prod).

2.  **Backend (Main Business Logic)**
    *   **Stack:** Node.js, Express, TypeScript.
    *   **Role:** Auth, Database Management, Call Queue Processing, Webhook Handling, Third-party Orchestration.
    *   **Port:** 3000.

3.  **Chat Agent Server (Microservice)**
    *   **Stack:** Node.js (Dedicated Service).
    *   **Role:** Exclusive handler for Meta/WhatsApp Business API interactions and Google Calendar Token sync.
    *   **Port:** 4000.

4.  **Database (Data Layer)**
    *   **Provider:** Neon (Serverless PostgreSQL 17.6).
    *   **Role:** Persistent storage for Users, Calls, Contacts, Analytics, and Configs.

5.  **Voice AI Provider**
    *   **Provider:** Bolna.ai.
    *   **Role:** Telephony, Speech-to-Text, LLM Orchestration, Text-to-Speech.

---

## 2. PRODUCT USE CASES & COMPONENT BREAKDOWN

### Use Case 1: Automated Lead Engagement via AI Voice Agent
*Single-call execution and lifecycle management.*

#### Component Name
**AI Voice Agent Service**
*(Files: `backend/src/services/bolnaService.ts`, `backend/src/services/webhookService.ts`)*

#### User-Facing Purpose
Automated, human-like voice calls are triggered to leads for qualification or appointment setting. Real-time status and call artifacts (recordings/transcripts) are visible in the CRM.

#### Product Flow
1.  **Trigger:** User clicks "Call" or System processes Queue.
2.  **Initiation:** Backend calls Bolna.ai `createCall` API with:
    *   `agent_id` (Bolna Agent ID)
    *   `recipient_phone_number`
    *   `variables` (Context: Name, Company, etc.)
3.  **Execution:** Bolna.ai creates telephony session.
4.  **Lifecycle Tracking (Webhooks):**
    *   `initiated` → create unique `bolna_execution_id`.
    *   `ringing` → Update status.
    *   `in-progress` → Update status (Call answered).
    *   `call-disconnected` → Capture **Transcript** & Duration.
    *   `completed` → Capture **Recording URL**.
5.  **Completion:** Database row in `calls` table updated.

#### Tech Stack Involved
*   **Backend Service:** `webhookService.ts` (Unified 5-stage handler)
*   **External API:** Bolna.ai API
*   **Database Table:** `calls`, `contacts`

#### Key Dependencies
*   **Public Webhook URL:** Must be reachable by Bolna servers.
*   **Agent Configuration:** Valid Prompt, Voice ID, and LLM settings in `agents` table.
*   **Credits:** User must have active balance in `users.credits`.

#### Pre-ingestion / Upstream Checks
1.  **Normalization:** Phone number formatted to `+[ISD] [Number]` via `normalizePhoneNumber()`.
2.  **Concurrency:** Checked against `user_concurrent_limit` in `ConcurrencyManager`.

#### If This Breaks, Likely Issues
*   **Calls Stuck in "Ringing":** Webhooks blocked blocking status updates.
*   **Auth Failure:** `BOLNA_API_KEY` invalid or expired.
*   **Silent Call:** Incorrect Twilio/Telephony setup on Bolna side.

#### What to Check First
1.  `calls.status` column in DB.
2.  Server logs for `[Webhook] Received` entries.
3.  Bolna Dashboard logs.

---

### Use Case 2: Bulk Call Campaign Management
*High-volume outbound dialing engine with throttling.*

#### Component Name
**Queue Processor & Campaign Manager**
*(Files: `backend/src/services/QueueProcessorService.ts`, `backend/src/services/bulkUploadService.ts`)*

#### User-Facing Purpose
Users leverage CSV uploads to launch mass campaigns. The system automatically regulates call volume to prevent spam flagging and server overload.

#### Product Flow
1.  **Ingestion:** User uploads CSV → Parsed → Saved to `call_queue` table (`status: pending`).
2.  **Scheduling:** `QueueProcessorService` runs interval job (default: 10s).
3.  **Throttling Logic:**
    *   **Global Lock:** Ensures only one processor runs at a time.
    *   **System Check:** `Active System Calls < SYSTEM_CONCURRENT_CALLS_LIMIT`.
    *   **User Check:** `Active User Calls < user.concurrent_limit`.
4.  **Dispatch:** Pulls `pending` items → Triggers Use Case 1 → Updates `call_queue` to `completed`.

#### Tech Stack Involved
*   **Backend Service:** `QueueProcessorService` (Cron-like behavior)
*   **Database Table:** `call_queue`, `call_campaigns`
*   **Utilities:** `ConcurrencyManager`

#### Key Dependencies
*   **Concurrency Slots:** Available capacity in system/user limits.
*   **Database Performance:** Efficient locking/reading of queue items.

#### Pre-ingestion / Upstream Checks
*   **CSV Mapping:** Headers must match `contacts` schema (Name, Phone mandatory).
*   **Agent Assignment:** Campaign must be linked to a valid AI Agent.

#### If This Breaks, Likely Issues
*   **Queue Stalled:** Global lock (`globalProcessingLock`) stuck true after crash.
*   **Over-dialing:** Race condition in concurrency counter (rare, handled by atomic increments).
*   **Zombie Jobs:** Calls failed but didn't release concurrency slot.

#### What to Check First
1.  `call_queue` table for items stuck in `in_progress`.
2.  Environment variables: `SYSTEM_CONCURRENT_CALLS_LIMIT`.
3.  Restart backend to clear in-memory locks.

---

### Use Case 3: WhatsApp Engagement (Multi-Channel)
*Dedicated microservice for Meta integration.*

#### Component Name
**Chat Agent Server & Proxy**
*(Files: `backend/src/services/chatService.ts`, `frontend/src/services/apiService.ts`)*

#### User-Facing Purpose
"Text-first" or post-call engagement. Users create approved WhatsApp templates and send them to contacts.

#### Product Flow
1.  **Template Creation:** Dashboard UI → Main Backend → Proxy → Chat Agent Server → Meta API.
2.  **Campaign:** User selects Contacts → "Blast" request sent to Chat Server.
3.  **Messaging:** Chat Server handles actual delivery via Meta Graph API.
4.  **Inbound:** User replies → Chat Server Webhook → Main Backend sync.

#### Tech Stack Involved
*   **Microservice:** Chat Agent Server (Port 4000)
*   **Integration:** Meta WhatsApp Business API
*   **Auth:** Shared JWT or API Key between services.

#### Key Dependencies
*   **Service Uptime:** Chat Agent Server must be running.
*   **Meta Business Verification:** Required for high-volume templating.

#### Pre-ingestion / Upstream Checks
*   **Template Status:** Must be `APPROVED` by Meta.
*   **Opt-in:** Usage of templates is restricted to 24h window unless user opted in.

#### If This Breaks, Likely Issues
*   **Connectivity:** Main Backend cannot reach `http://localhost:4000`.
*   **Auth:** Meta Token expired in Chat Agent Server.

#### What to Check First
1.  `CHAT_AGENT_SERVER_URL` Env Variable.
2.  Port 4000 accessibility.

---

### Use Case 4: Lead Analytics & Call Analysis
*Post-call intelligence extraction.*

#### Component Name
**OpenAI Extraction Service**
*(Files: `backend/src/services/openaiExtractionService.ts`, `backend/src/services/leadAnalyticsService.ts`)*

#### User-Facing Purpose
Automatic grading of leads (Interested/Not Interested) and data extraction (Meeting Times, Summaries) immediately after call completion.

#### Product Flow
1.  **Trigger:** `call-disconnected` webhook received (contains `transcript`).
2.  **Analysis:** `openaiExtractionService` sends transcript to GPT-4o with extraction prompt.
3.  **Structured Data:**
    *   **Sentiment:** Positive/Neutral/Negative.
    *   **Outcome:** Appointment/Refusal/VM.
    *   **Summary:** Short text summary.
4.  **Storage:**
    *   `lead_analytics` (Call-level data).
    *   `contacts` (Updates lead status/tags).

#### Tech Stack Involved
*   **AI:** OpenAI API
*   **Database Table:** `lead_analytics`

#### Key Dependencies
*   **Transcript Quality:** Depends on Bolna's STT accuracy.
*   **OpenAI Quota:** API key must have usage limits available.

#### Pre-ingestion / Upstream Checks
*   **Transcript Length:** Skips analysis for null or extremely short transcripts ( < 5 words).

#### If This Breaks, Likely Issues
*   **JSON Parse Error:** LLM returns malformed JSON.
*   **Missing Data:** Webhook stage 4 (`call-disconnected`) was missed.

#### What to Check First
1.  `lead_analytics` table.
2.  Backend logs for "OpenAI Analysis Failed".

---

## 3. DATABASE SCHEMA REFERENCE

### Key Tables

| Table Name | Purpose | Critical Columns |
| :--- | :--- | :--- |
| **users** | Tenant Root | `id`, `email`, `credits`, `stack_auth_user_id` |
| **agents** | AI Configuration | `id`, `user_id`, `bolna_agent_id`, `bolna_voice_config` |
| **calls** | Call Ledger | `id`, `agent_id`, `contact_id`, `status`, `bolna_execution_id` |
| **contacts** | Lead Directory | `id`, `phone_number`, `user_id`, `tags` |
| **call_queue** | Execution List | `id`, `campaign_id`, `status` (pending/completed/failed) |
| **lead_analytics** | AI Insights | `call_id`, `sentiment_score`, `call_outcome`, `extracted_data` |

### Critical Relationships
*   `users.id` -> `agents.user_id` (1:N)
*   `agents.id` -> `calls.agent_id` (1:N)
*   `call_campaigns.id` -> `call_queue.campaign_id` (1:N)

*(Refer to `aidatabase.md` for full schema definitions)*

---

## 4. TROUBLESHOOTING & FAILURE MODES

### Scenario A: Calls are not triggering
**Check:**
1.  Is `QueueProcessorService` running? (Logs should show "Processing queue..." every 10s).
2.  Is the Global Lock stuck? (Restart backend).
3.  Does the user have Credits? (`users.credits > 0`).

### Scenario B: Webhooks not updating status
**Check:**
1.  Is the server public? (Localhost cannot receive external webhooks without ngrok).
2.  Is the webhook URL in Bolna dashboard correct? (`/api/webhooks/bolna`).
3.  Does the `bolna_execution_id` match?

### Scenario C: Analytics missing
**Check:**
1.  Did the call connect? (Duration > 0).
2.  Is OpenAI API Key valid?
3.  Did the transcript arrive in the webhook payload?

## 5. TECHNICAL CONSTRAINTS
*   **Phone Format:** Strict `+[ISD] [Number]` format required.
*   **Concurrency:** Hard system limit of **10 concurrent calls** (configurable in ENV).
*   **Rate Limits:** various API endpoints have `rateLimit` middleware applied.
