# AI Calling Agent - Copilot Instructions

## Architecture Overview
This is a **multi-tenant SaaS platform** for AI-powered outbound/inbound calling with **Bolna.ai** as the voice AI provider.

### This Repository = Main Dashboard
This codebase is the **Main Dashboard** application that provides:
- User authentication & multi-tenant management
- AI calling agent creation and management (Bolna.ai integration)
- Call campaigns, contact management, analytics
- WhatsApp template management UI (proxied to Chat Agent Server)

### Stack Components
- **Backend**: Node.js/Express + TypeScript (port 3000) → `backend/src/`
- **Frontend**: React + Vite + shadcn/ui (port 5173) → `Frontend/src/`
- **Mobile**: React Native + Expo → `mobile/`
- **Database**: PostgreSQL (Neon serverless)
- **Voice AI**: Bolna.ai (replaced ElevenLabs)

### Chat Agent Server (External Microservice)
The **Chat Agent Server** is a **separate microservice** (port 4000) that handles ALL WhatsApp-related functionality:
- **WhatsApp Template Creation** - Creates templates via Meta WhatsApp Business API
- **Template Send Campaigns** - Bulk WhatsApp message campaigns
- **Template Management** - CRUD operations for WhatsApp templates
- **Google Calendar Integration** - Receives calendar tokens for meeting booking
- **Meta API Communication** - Direct integration with Meta/Facebook WhatsApp Business API

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ARCHITECTURE FLOW                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   [Frontend]  ──────►  [Main Dashboard Backend]                     │
│       │                        │                                    │
│       │                        │ (proxy WhatsApp requests)          │
│       │                        ▼                                    │
│       │              [Chat Agent Server] ◄────► [Meta WhatsApp API] │
│       │                   (port 4000)                               │
│       │                        │                                    │
│       └────────────────────────┘                                    │
│                                                                     │
│   [Main Dashboard Backend] ──────► [Bolna.ai] (Voice AI calls)      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Communication Pattern:**
- Frontend → Main Dashboard Backend → Chat Agent Server → Meta API
- Main Dashboard Backend proxies WhatsApp-related API calls to Chat Agent Server
- Chat Agent Server is the ONLY service that communicates directly with Meta

## Critical Data Flow Patterns

### Webhook Processing (5-Stage Lifecycle)
Bolna.ai sends webhooks in sequence: `initiated` → `ringing` → `in-progress` → `call-disconnected` → `completed`
- **Stage 4** (`call-disconnected`): Contains transcript - triggers OpenAI analysis
- **Stage 5** (`completed`): Contains recording URL
- Tracking key: `bolna_execution_id` (unique per call across all webhooks)
- Service: `backend/src/services/webhookService.ts`

### Call Queue Processing
Campaigns process calls via `QueueProcessorService.ts` with concurrency management:
- System-wide limit: `SYSTEM_CONCURRENT_CALLS_LIMIT` (default 10)
- Per-user limit: `DEFAULT_USER_CONCURRENT_CALLS_LIMIT` (default 2)
- Uses global lock + per-user slots via `ConcurrencyManager.ts`

### Lead Analytics (Dual Analysis)
Each call generates two analysis rows in `lead_analytics`:
1. **Individual**: Per-call analysis (keyed by `call_id`)
2. **Complete**: Aggregated per contact (keyed by `user_id + phone_number`)
- Service: `backend/src/services/openaiExtractionService.ts`

## Key Conventions

### Phone Number Format
All phone numbers normalized to: `+[ISD] [10-digit number]` (e.g., `+91 9876543210`)
- Function: `normalizePhoneNumber()` in webhookService.ts

### Authentication Pattern
JWT-based auth with middleware chain:
```typescript
// Protected route pattern
router.get('/endpoint', authenticateToken, controller.method);
// Admin routes add: requireAdmin or requireSuperAdmin
```
- User attached to `req.user` and `req.userId`

### Database Query Pattern
Use the connection pool from `backend/src/config/database.ts`:
```typescript
import { pool } from '../config/database';
const result = await pool.query('SELECT * FROM table WHERE id = $1', [id]);
```

### ⚠️ CRITICAL: Database Column Names - DO NOT HALLUCINATE
**ALWAYS verify exact column names before writing or modifying SQL queries.**

Reference the **[database.md](../database.md)** file for the complete schema with exact column names.

**Common mistakes to avoid:**
| ❌ Wrong | ✅ Correct | Table |
|----------|-----------|-------|
| `phone` | `phone_number` | contacts |
| `user` | `user_id` | all tables |
| `agent` | `agent_id` | calls, call_queue |
| `campaign` | `campaign_id` | call_queue |
| `created` | `created_at` | all tables |
| `updated` | `updated_at` | all tables |

**Before writing any SQL query:**
1. Check `database.md` for exact column names
2. Use table aliases consistently (e.g., `c.` for calls, `co.` for contacts, `la.` for lead_analytics)
3. When joining tables, verify the join column exists in BOTH tables
4. Never assume a column exists - verify first

**Key table column quick reference:**
```
contacts: id, user_id, name, phone_number, email, company, notes, tags[], 
          is_customer, is_auto_created, auto_creation_source, 
          last_contact_at, call_attempted_busy, call_attempted_no_answer,
          call_attempted_failed, city, country, business_context

calls: id, user_id, agent_id, contact_id, phone_number, status, 
       duration_seconds, duration_minutes, transcript, recording_url,
       bolna_execution_id, lead_type, hangup_by, hangup_reason

lead_analytics: id, user_id, call_id, phone_number, analysis_type,
                extracted_name, extracted_email, company_name,
                lead_status_tag, total_score, intent_score, etc.
```

### Frontend Service Pattern
All API calls go through `Frontend/src/services/apiService.ts` which handles:
- Retry logic, timeout, error normalization
- Endpoints defined in `Frontend/src/config/api.ts`

### React Query Hooks
Data fetching uses TanStack Query with centralized keys:
```typescript
import { queryKeys } from '../lib/queryClient';
const { data } = useQuery({ queryKey: queryKeys.agents.list(), ... });
```

## Development Commands

### Backend
```bash
cd backend
npm run dev          # Start with hot reload
npm run build        # TypeScript compile
npm run migrate      # Run database migrations
npm run test         # Jest tests
```

### Frontend
```bash
cd Frontend
npm run dev          # Vite dev server (port 5173)
npm run build        # Production build
npm run test         # Vitest tests
```

## Environment Variables (Critical)
- `BOLNA_API_KEY` - Bolna.ai API key
- `DATABASE_URL` - Neon PostgreSQL connection string
- `OPENAI_API_KEY` - For transcript analysis
- `VITE_API_BASE_URL` - Frontend → Backend URL (required in production)
- `FRONTEND_URL` - CORS allowed origins (comma-separated)
- `CHAT_AGENT_SERVER_URL` - Chat Agent Server URL for WhatsApp operations and Google Calendar token sync (**required for WhatsApp features**)

## Migration Patterns
SQL migrations in `backend/src/migrations/` run automatically on server start.
- Naming: `NNN_description.sql`
- Runner: `backend/src/utils/migrationRunner.ts`

## Multi-Tenant Data Isolation
Every model query MUST include `user_id` filter for tenant isolation:
```typescript
// ✅ Correct
await pool.query('SELECT * FROM agents WHERE id = $1 AND user_id = $2', [id, userId]);
// ❌ Wrong - exposes other users' data
await pool.query('SELECT * FROM agents WHERE id = $1', [id]);
```

## Key Files Reference
| Concern | Location |
|---------|----------|
| API Routes | `backend/src/routes/index.ts` |
| Webhook Handler | `backend/src/services/webhookService.ts` |
| Queue Processor | `backend/src/services/QueueProcessorService.ts` |
| Bolna.ai Client | `backend/src/services/bolnaService.ts` |
| OpenAI Analysis | `backend/src/services/openaiExtractionService.ts` |
| Frontend API | `Frontend/src/services/apiService.ts` |
| React Hooks | `Frontend/src/hooks/` |
| UI Components | `Frontend/src/components/` (shadcn/ui based) |
