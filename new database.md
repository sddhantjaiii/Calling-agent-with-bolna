# Current Database Schema - Accurate Reference
**Last Updated:** October 9, 2025  
**Migration Status:** Up to 047 (excluding removed 046)

---

## 📋 Core Tables

### 1. `users` - User Management
**Purpose:** Multi-tenant user accounts with role-based access control

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | uuid_generate_v4() | PRIMARY KEY |
| `email` | VARCHAR(255) | NO | - | UNIQUE |
| `name` | VARCHAR(255) | NO | - | - |
| `password_hash` | VARCHAR(255) | YES | - | For custom auth |
| `credits` | INTEGER | NO | 15 | CHECK (>= 0) |
| `is_active` | BOOLEAN | NO | true | - |
| `role` | VARCHAR(20) | NO | 'user' | 'user', 'admin', 'super_admin' |
| `auth_provider` | VARCHAR(50) | NO | 'email' | 'email', 'google', 'linkedin', 'github' |
| `stack_auth_user_id` | VARCHAR(255) | YES | - | UNIQUE |
| `email_verified` | BOOLEAN | NO | false | - |
| `email_verification_sent_at` | TIMESTAMPTZ | YES | - | - |
| `company` | VARCHAR(255) | YES | - | - |
| `website` | VARCHAR(255) | YES | - | - |
| `location` | VARCHAR(255) | YES | - | - |
| `bio` | TEXT | YES | - | - |
| `phone` | VARCHAR(50) | YES | - | - |
| `concurrent_calls_limit` | INTEGER | NO | 2 | User-level limit (1-100) |
| `system_concurrent_calls_limit` | INTEGER | NO | 10 | System-wide limit (1-1000) |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |

**Indexes:**
- `users_pkey` PRIMARY KEY (id)
- `users_email_key` UNIQUE (email)
- `users_stack_auth_user_id_key` UNIQUE (stack_auth_user_id)

---

### 2. `agents` - AI Agent Management (Bolna.ai)
**Purpose:** AI calling agents integrated with Bolna.ai

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | uuid_generate_v4() | PRIMARY KEY |
| `user_id` | UUID | NO | - | FK → users(id) CASCADE |
| `bolna_agent_id` | VARCHAR(255) | NO | - | External Bolna.ai ID |
| `name` | VARCHAR(255) | NO | - | - |
| `description` | TEXT | YES | - | - |
| `agent_type` | VARCHAR(50) | NO | 'call' | 'call', 'chat' |
| `is_active` | BOOLEAN | NO | true | - |
| `bolna_webhook_url` | TEXT | YES | - | - |
| `bolna_voice_config` | JSONB | YES | '{}' | - |
| `bolna_llm_config` | JSONB | YES | '{}' | - |
| `bolna_task_config` | JSONB | YES | '{}' | - |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |

**Constraints:**
- UNIQUE (id, user_id) - for data isolation FKs
- UNIQUE (user_id, bolna_agent_id)

**Indexes:**
- `idx_agents_bolna_agent_id` (bolna_agent_id)
- `idx_agents_user_bolna` (user_id, bolna_agent_id)

**Legacy Columns (may still exist):**
- `elevenlabs_agent_id` VARCHAR(255) - NOT USED

---

### 3. `calls` - Call Records (Bolna.ai)
**Purpose:** All call interactions via Bolna.ai

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | uuid_generate_v4() | PRIMARY KEY |
| `agent_id` | UUID | NO | - | FK → agents(id) CASCADE |
| `user_id` | UUID | NO | - | FK → users(id) CASCADE |
| `contact_id` | UUID | YES | - | FK → contacts(id) SET NULL |
| `bolna_execution_id` | VARCHAR(255) | NO | - | UNIQUE - Bolna.ai identifier |
| `phone_number` | VARCHAR(50) | NO | - | - |
| `call_source` | VARCHAR(20) | YES | 'phone' | 'phone', 'internet', 'unknown' |
| `caller_name` | VARCHAR(255) | YES | - | From webhook data |
| `caller_email` | VARCHAR(255) | YES | - | From webhook data |
| `lead_type` | VARCHAR(20) | YES | 'outbound' | 'inbound', 'outbound' |
| `duration_seconds` | INTEGER | NO | 0 | Exact duration (for display) |
| `duration_minutes` | INTEGER | NO | 0 | Rounded up (for billing) |
| `credits_used` | INTEGER | NO | 0 | CHECK (>= 0) |
| `status` | VARCHAR(20) | NO | 'in_progress' | 'completed', 'failed', 'in_progress', 'cancelled' |
| `recording_url` | TEXT | YES | - | - |
| `transcript_id` | UUID | YES | - | FK → transcripts(id) |
| `metadata` | JSONB | YES | '{}' | - |
| `bolna_call_config` | JSONB | YES | '{}' | - |
| `bolna_voice_settings` | JSONB | YES | '{}' | - |
| `bolna_metadata` | JSONB | YES | '{}' | - |
| `call_lifecycle_status` | VARCHAR(50) | YES | - | Detailed status |
| `hangup_by` | VARCHAR(50) | YES | - | Who ended call |
| `hangup_reason` | VARCHAR(255) | YES | - | Why call ended |
| `hangup_provider_code` | INTEGER | YES | - | Provider error code |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | Call created |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | Last modified |
| `completed_at` | TIMESTAMPTZ | YES | - | Call ended |
| `ringing_started_at` | TIMESTAMPTZ | YES | - | Ring started |
| `call_answered_at` | TIMESTAMPTZ | YES | - | Call picked up |
| `call_disconnected_at` | TIMESTAMPTZ | YES | - | Call disconnected |

**Constraints:**
- UNIQUE (bolna_execution_id)
- UNIQUE (id, user_id) - for data isolation FKs
- FK (agent_id, user_id) → agents(id, user_id)

**Indexes:**
- `idx_calls_bolna_execution_id` (bolna_execution_id)
- `idx_calls_user_id` (user_id)
- `idx_calls_agent_id` (agent_id)
- `idx_calls_status` (status)
- `idx_calls_created_at` (created_at)
- `idx_calls_source_user` (call_source, user_id)
- `idx_calls_lead_type` (lead_type)
- `idx_calls_duration_seconds` (duration_seconds)

**Legacy Columns (may still exist):**
- `elevenlabs_conversation_id` VARCHAR(255) - NOT USED

**❌ NON-EXISTENT COLUMNS** (do NOT query these):
- `started_at` - USE `call_answered_at` or `ringing_started_at` instead
- `ended_at` - USE `call_disconnected_at` or `completed_at` instead

---

### 4. `contacts` - Contact Management
**Purpose:** User contact lists for calling campaigns

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | uuid_generate_v4() | PRIMARY KEY |
| `user_id` | UUID | NO | - | FK → users(id) CASCADE |
| `name` | VARCHAR(255) | NO | - | - |
| `phone_number` | VARCHAR(50) | NO | - | - |
| `email` | VARCHAR(255) | YES | - | - |
| `company` | VARCHAR(255) | YES | - | - |
| `notes` | TEXT | YES | - | - |
| `is_customer` | BOOLEAN | NO | false | Converted lead |
| `is_auto_created` | BOOLEAN | NO | false | From webhook |
| `auto_created_from_call_id` | UUID | YES | - | FK → calls(id) |
| `auto_creation_source` | VARCHAR(20) | YES | - | 'webhook', 'manual' |
| `not_connected` | INTEGER | NO | 0 | Failed connection count |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |

**Constraints:**
- UNIQUE (user_id, phone_number) - prevents duplicates per user
- UNIQUE (id, user_id) - for data isolation FKs

**Indexes:**
- `idx_contacts_user_id` (user_id)
- `idx_contacts_phone_number` (phone_number)
- `idx_contacts_is_customer` (is_customer)

---

### 5. `call_campaigns` - Campaign Management
**Purpose:** Batch calling campaigns with scheduling

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | uuid_generate_v4() | PRIMARY KEY |
| `user_id` | UUID | NO | - | FK → users(id) CASCADE |
| `name` | VARCHAR(255) | NO | - | - |
| `description` | TEXT | YES | - | - |
| `agent_id` | UUID | NO | - | FK → agents(id) RESTRICT |
| `next_action` | TEXT | NO | - | Campaign goal |
| `first_call_time` | TIME | NO | - | Daily start time |
| `last_call_time` | TIME | NO | - | Daily end time |
| `start_date` | DATE | NO | - | Campaign start |
| `end_date` | DATE | YES | - | Campaign end (optional) |
| `status` | VARCHAR(20) | NO | 'draft' | 'draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled' |
| `total_contacts` | INTEGER | NO | 0 | Total in campaign |
| `completed_calls` | INTEGER | NO | 0 | ✅ Calls finished |
| `successful_calls` | INTEGER | NO | 0 | Successful calls |
| `failed_calls` | INTEGER | NO | 0 | Failed calls |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |
| `started_at` | TIMESTAMPTZ | YES | - | When activated |
| `completed_at` | TIMESTAMPTZ | YES | - | When finished |

**Constraints:**
- UNIQUE (id, user_id) - for data isolation FKs
- FK (agent_id, user_id) → agents(id, user_id) RESTRICT

**Indexes:**
- `idx_call_campaigns_user_id` (user_id)
- `idx_call_campaigns_status` (status)
- `idx_call_campaigns_agent_id` (agent_id)
- `idx_call_campaigns_start_date` (start_date) WHERE status IN ('scheduled', 'active')

---

### 6. `call_queue` - Campaign Call Queue
**Purpose:** Queue management for batch calling

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | uuid_generate_v4() | PRIMARY KEY |
| `user_id` | UUID | NO | - | FK → users(id) CASCADE |
| `campaign_id` | UUID | NO | - | FK → call_campaigns(id) CASCADE |
| `agent_id` | UUID | NO | - | FK → agents(id) RESTRICT |
| `contact_id` | UUID | NO | - | FK → contacts(id) CASCADE |
| `phone_number` | VARCHAR(50) | NO | - | Denormalized |
| `contact_name` | VARCHAR(255) | YES | - | Denormalized |
| `user_data` | JSONB | NO | '{}' | For Bolna API |
| `status` | VARCHAR(20) | NO | 'queued' | 'queued', 'processing', 'completed', 'failed', 'cancelled', 'skipped' |
| `priority` | INTEGER | NO | 0 | Higher = called first |
| `position` | INTEGER | NO | - | FIFO position |
| `scheduled_for` | TIMESTAMPTZ | NO | - | When to call |
| `started_at` | TIMESTAMPTZ | YES | - | Processing started |
| `completed_at` | TIMESTAMPTZ | YES | - | Processing completed |
| `call_id` | UUID | YES | - | FK → calls(id) SET NULL |
| `failure_reason` | TEXT | YES | - | If failed, why? |
| `last_system_allocation_at` | TIMESTAMPTZ | YES | - | Round-robin tracking |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |

**Constraints:**
- UNIQUE (campaign_id, contact_id) - prevents duplicates (migration 047)
- UNIQUE (id, user_id) - for data isolation FKs
- FK (campaign_id, user_id) → call_campaigns(id, user_id) CASCADE
- FK (agent_id, user_id) → agents(id, user_id) RESTRICT
- FK (contact_id, user_id) → contacts(id, user_id) CASCADE

**Indexes:**
- `idx_call_queue_user_status` (user_id, status)
- `idx_call_queue_campaign_status` (campaign_id, status)
- `idx_call_queue_scheduled_for` (scheduled_for) WHERE status = 'queued'
- `idx_call_queue_priority_position` (user_id, priority DESC, position ASC) WHERE status = 'queued'
- `idx_call_queue_round_robin` (user_id, last_system_allocation_at) WHERE status = 'queued'

---

## 🔧 Supporting Tables

### 7. `transcripts` - Call Transcripts
**Status:** ⚠️ May be unused - verify with `SELECT COUNT(*) FROM transcripts;`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | UUID | NO | uuid_generate_v4() |
| `call_id` | UUID | NO | FK → calls(id) CASCADE |
| `content` | TEXT | NO | - |
| `speaker_segments` | JSONB | NO | '[]' |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP |

---

### 8. `lead_analytics` - Lead Scoring
**Purpose:** AI-generated lead qualification data

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | uuid_generate_v4() | PRIMARY KEY |
| `call_id` | UUID | NO | - | FK → calls(id) CASCADE |
| `intent_level` | VARCHAR(50) | YES | - | - |
| `intent_score` | INTEGER | YES | - | 0-100 |
| `urgency_level` | VARCHAR(50) | YES | - | - |
| `urgency_score` | INTEGER | YES | - | 0-100 |
| `budget_constraint` | VARCHAR(50) | YES | - | - |
| `budget_score` | INTEGER | YES | - | 0-100 |
| `fit_alignment` | VARCHAR(50) | YES | - | - |
| `fit_score` | INTEGER | YES | - | 0-100 |
| `engagement_health` | VARCHAR(50) | YES | - | - |
| `engagement_score` | INTEGER | YES | - | 0-100 |
| `total_score` | INTEGER | YES | - | 0-100 |
| `lead_status_tag` | VARCHAR(100) | YES | - | - |
| `reasoning` | JSONB | YES | '{}' | - |
| `cta_interactions` | JSONB | YES | '{}' | Call-to-action data |
| `is_read` | BOOLEAN | NO | false | User viewed? |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |

**Indexes:**
- `idx_lead_analytics_call_id` (call_id)
- `idx_lead_analytics_is_read` (is_read)

---

### 9. `credit_transactions` - Billing Audit Trail
**Purpose:** Track all credit movements

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | uuid_generate_v4() | PRIMARY KEY |
| `user_id` | UUID | NO | - | FK → users(id) CASCADE |
| `type` | VARCHAR(50) | NO | - | 'purchase', 'usage', 'bonus', 'admin_adjustment', 'refund' |
| `amount` | INTEGER | NO | - | Can be negative |
| `balance_after` | INTEGER | NO | - | CHECK (>= 0) |
| `description` | TEXT | NO | - | - |
| `stripe_payment_id` | VARCHAR(255) | YES | - | - |
| `call_id` | UUID | YES | - | FK → calls(id) SET NULL |
| `created_by` | UUID | YES | - | FK → users(id) SET NULL (admin) |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |

---

### 10. `agent_analytics` - Agent Performance Cache
**Purpose:** Cached agent performance metrics

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | UUID | NO | uuid_generate_v4() |
| `agent_id` | UUID | NO | FK → agents(id) CASCADE |
| `user_id` | UUID | NO | FK → users(id) CASCADE |
| `metric_date` | DATE | NO | CURRENT_DATE |
| `total_calls` | INTEGER | NO | 0 |
| `successful_calls` | INTEGER | NO | 0 |
| `failed_calls` | INTEGER | NO | 0 |
| `avg_duration_seconds` | DECIMAL(10,2) | NO | 0 |
| `total_credits_used` | INTEGER | NO | 0 |
| `avg_total_score` | DECIMAL(5,2) | YES | - |
| `cta_interactions_total` | INTEGER | NO | 0 |
| `cta_interactions_positive` | INTEGER | NO | 0 |
| `cta_interactions_negative` | INTEGER | NO | 0 |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP |

**Constraints:**
- UNIQUE (agent_id, user_id, metric_date)

---

### 11. `user_kpi` - User KPI Materialized View
**Purpose:** Cached user dashboard metrics

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | UUID | PRIMARY KEY |
| `total_calls` | BIGINT | All calls |
| `completed_calls` | BIGINT | Finished calls |
| `failed_calls` | BIGINT | Failed calls |
| `total_credits_used` | BIGINT | Credits spent |
| `total_agents` | BIGINT | Agent count |
| `total_contacts` | BIGINT | Contact count |
| `avg_call_duration_seconds` | DECIMAL(10,2) | Average duration |
| `success_rate` | DECIMAL(5,2) | Success % |
| `last_call_at` | TIMESTAMPTZ | Most recent call |
| `last_updated` | TIMESTAMPTZ | Cache timestamp |

**Refresh:** Triggered by calls table changes

---

## 🗑️ Legacy/Potentially Unused Tables

### Tables to Audit
1. **`system_config`** - Admin settings (check usage)
2. **`twilio_processed_calls`** - Duplicate prevention (may be unused)
3. **`phone_numbers`** - Check if referenced in code
4. **`followup`** - Check if referenced in code

### Legacy Views
1. **`elevenlabs_backup_data`** - Migration backup (safe to drop after 30 days)
2. **`call_source_analytics`** - Can regenerate from calls table if needed

### Check Commands
```sql
-- Check if tables are empty
SELECT 
  schemaname, 
  tablename,
  (SELECT COUNT(*) FROM pg_class WHERE relname = tablename) as row_count
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('system_config', 'twilio_processed_calls', 'phone_numbers', 'followup');

-- Check table sizes
SELECT 
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## 📍 Common Query Patterns

### Get Campaign Progress
```sql
SELECT 
  total_contacts,
  completed_calls,
  successful_calls,
  failed_calls,
  CASE 
    WHEN total_contacts > 0 
    THEN ROUND((completed_calls::float / total_contacts::float * 100), 2)
    ELSE 0
  END as progress_percentage
FROM call_campaigns
WHERE id = $1 AND user_id = $2;
```

### Get Average Call Duration (Campaign)
```sql
SELECT 
  COALESCE(AVG(c.duration_seconds), 0) as avg_duration_seconds
FROM calls c
WHERE c.id IN (
  SELECT call_id 
  FROM call_queue 
  WHERE campaign_id = $1 AND call_id IS NOT NULL
);
```

### Get User's Active Calls
```sql
SELECT *
FROM calls
WHERE user_id = $1
AND status = 'in_progress'
ORDER BY created_at DESC;
```

---

## ⚠️ Important Notes

1. **Column Name Changes:**
   - Frontend: Use `completed_calls` (not `contacts_called`)
   - Calls: Use `duration_seconds` (not calculated from start/end times)
   - Calls: Use `bolna_execution_id` (not `bolna_conversation_id`)

2. **Timestamp Columns in `calls`:**
   - ✅ Use: `created_at`, `updated_at`, `completed_at`
   - ✅ Use: `call_answered_at`, `call_disconnected_at`, `ringing_started_at`
   - ❌ Don't use: `started_at`, `ended_at` (don't exist!)

3. **Data Isolation:**
   - All user data has composite keys: `(id, user_id)`
   - Foreign keys must match both columns for security

4. **Migration Files:**
   - ✅ Applied: 001-045, 047
   - ❌ Removed: 046 (unused bolna_conversation_id)

---

**Last Verified:** October 9, 2025  
**Migration Version:** 047
