# Current Database Schema Analysis (Based on Migration Files)
*Generated on: September 26, 2025*
*Analysis based on migration files 001-042 plus Bolna.ai migration*

## 🚀 Migration Status Summary

**✅ COMPLETED MIGRATIONS:**
- Phase 1: Initial Schema (001_initial_schema.sql)
- Phase 2: Admin roles and authentication system
- Phase 3: Analytics and caching layers
- Phase 4: **Bolna.ai Migration** (004_bolna_migration_phase1.sql, 005_bolna_migration_phase2_complete.sql, 006_complete_elevenlabs_removal.sql)
- Phase 5: Enhanced features and optimizations (up to 042_add_not_connected_to_contacts.sql)

**🎯 CURRENT STATE: 100% BOLNA.AI MIGRATED**
- All ElevenLabs references removed from production schema
- All tables use Bolna.ai field names and constraints
- Legacy compatibility removed as planned

---

## 📋 Core Tables Structure

### 1. `users` - User Account Management
**Purpose**: Central user account management and multi-tenant isolation

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | uuid_generate_v4() | PRIMARY KEY |
| `email` | VARCHAR(255) | NO | - | UNIQUE |
| `name` | VARCHAR(255) | NO | - | - |
| `credits` | INTEGER | NO | 15 | CHECK (credits >= 0) |
| `is_active` | BOOLEAN | NO | true | - |
| `auth_provider` | VARCHAR(50) | NO | 'email' | CHECK (auth_provider IN ('email', 'google', 'linkedin', 'github')) |
| `stack_auth_user_id` | VARCHAR(255) | YES | - | UNIQUE |
| `email_verified` | BOOLEAN | NO | false | - |
| `email_verification_sent_at` | TIMESTAMPTZ | YES | - | - |
| `role` | VARCHAR(20) | NO | 'user' | CHECK (role IN ('user', 'admin', 'super_admin')) |
| `password_hash` | VARCHAR(255) | YES | - | - |
| `company` | VARCHAR(255) | YES | - | - |
| `website` | VARCHAR(255) | YES | - | - |
| `location` | VARCHAR(255) | YES | - | - |
| `bio` | TEXT | YES | - | - |
| `phone` | VARCHAR(50) | YES | - | - |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |

**Key Features**:
- Multi-tenant isolation root table
- Role-based access control (user, admin, super_admin)
- Multiple authentication providers support
- Credit-based billing system

---

### 2. `agents` - AI Agent Management (BOLNA.AI)
**Purpose**: Manages AI calling agents integrated with Bolna.ai API

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | uuid_generate_v4() | PRIMARY KEY |
| `user_id` | UUID | NO | - | FK → users(id) ON DELETE CASCADE |
| `bolna_agent_id` | VARCHAR(255) | NO | - | UNIQUE |
| `name` | VARCHAR(255) | NO | - | - |
| `description` | TEXT | YES | - | - |
| `agent_type` | VARCHAR(50) | NO | 'call' | CHECK (agent_type IN ('call', 'chat')) |
| `is_active` | BOOLEAN | NO | true | - |
| `bolna_webhook_url` | TEXT | YES | - | - |
| `bolna_voice_config` | JSONB | YES | '{}' | - |
| `bolna_llm_config` | JSONB | YES | '{}' | - |
| `bolna_task_config` | JSONB | YES | '{}' | - |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |

**Unique Constraints**:
- `agents_bolna_agent_id_unique`: UNIQUE(bolna_agent_id)
- `agents_user_bolna_agent_id_unique`: UNIQUE(user_id, bolna_agent_id)
- `(id, user_id)`: Composite key for data isolation

**Indexes**:
- `idx_agents_bolna_agent_id` ON bolna_agent_id
- `idx_agents_user_bolna` ON (user_id, bolna_agent_id)

---

### 3. `calls` - Call Records (BOLNA.AI)
**Purpose**: Records all call interactions via Bolna.ai integration

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | uuid_generate_v4() | PRIMARY KEY |
| `agent_id` | UUID | NO | - | FK → agents(id) ON DELETE CASCADE |
| `user_id` | UUID | NO | - | FK → users(id) ON DELETE CASCADE |
| `contact_id` | UUID | YES | - | FK → contacts(id) ON DELETE SET NULL |
| `bolna_conversation_id` | VARCHAR(255) | NO | - | - |
| `bolna_execution_id` | VARCHAR(255) | NO | - | UNIQUE |
| `phone_number` | VARCHAR(50) | NO | - | - |
| `call_source` | VARCHAR(20) | YES | - | CHECK (call_source IN ('phone', 'internet', 'unknown')) |
| `caller_name` | VARCHAR(255) | YES | - | - |
| `caller_email` | VARCHAR(255) | YES | - | - |
| `lead_type` | VARCHAR(20) | YES | - | CHECK (lead_type IN ('inbound', 'outbound')) |
| `duration_minutes` | INTEGER | NO | 0 | CHECK (duration_minutes >= 0) |
| `duration_seconds` | INTEGER | NO | 0 | CHECK (duration_seconds >= 0) |
| `credits_used` | INTEGER | NO | 0 | CHECK (credits_used >= 0) |
| `status` | VARCHAR(20) | NO | 'in_progress' | CHECK (status IN ('completed', 'failed', 'in_progress', 'cancelled')) |
| `recording_url` | TEXT | YES | - | - |
| `metadata` | JSONB | YES | '{}' | - |
| `bolna_call_config` | JSONB | YES | '{}' | - |
| `bolna_voice_settings` | JSONB | YES | '{}' | - |
| `bolna_metadata` | JSONB | YES | '{}' | - |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |
| `completed_at` | TIMESTAMPTZ | YES | - | - |

**Key Constraints**:
- `calls_bolna_execution_id_unique`: UNIQUE(bolna_execution_id)
- `(agent_id, user_id)`: FK for data isolation
- `(id, user_id)`: Composite key for dependent FKs

**Indexes**:
- `idx_calls_bolna_execution_id` ON bolna_execution_id
- `idx_calls_user_id` ON user_id
- `idx_calls_agent_id` ON agent_id
- `idx_calls_status` ON status
- `idx_calls_created_at` ON created_at

---

### 4. `contacts` - Contact Management
**Purpose**: User contact lists for calling campaigns

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | uuid_generate_v4() | PRIMARY KEY |
| `user_id` | UUID | NO | - | FK → users(id) ON DELETE CASCADE |
| `name` | VARCHAR(255) | NO | - | - |
| `phone_number` | VARCHAR(50) | NO | - | - |
| `email` | VARCHAR(255) | YES | - | - |
| `company` | VARCHAR(255) | YES | - | - |
| `notes` | TEXT | YES | - | - |
| `is_customer` | BOOLEAN | NO | false | - |
| `auto_created_from_call_id` | UUID | YES | - | FK → calls(id) |
| `is_auto_created` | BOOLEAN | NO | false | - |
| `auto_creation_source` | VARCHAR(20) | YES | - | CHECK (auto_creation_source IN ('webhook', 'manual')) |
| `not_connected` | INTEGER | NO | 0 | - |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |

**Unique Constraints**:
- `(user_id, phone_number)`: Prevents duplicate phone numbers per user

**Indexes**:
- `idx_contacts_user_id` ON user_id
- `idx_contacts_phone_number` ON phone_number
- `idx_contacts_not_connected` ON not_connected WHERE not_connected > 0

---

### 5. `phone_numbers` - Phone Number Management (BOLNA.AI)
**Purpose**: Manages phone numbers for batch calling with Bolna.ai integration

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | gen_random_uuid() | PRIMARY KEY |
| `name` | VARCHAR(255) | NO | - | - |
| `phone_number` | VARCHAR(50) | NO | - | - |
| `bolna_phone_number_id` | VARCHAR(255) | NO | - | UNIQUE |
| `assigned_to_user_id` | UUID | YES | - | FK → users(id) ON DELETE SET NULL |
| `created_by_admin_id` | UUID | NO | - | FK → users(id) ON DELETE RESTRICT |
| `is_active` | BOOLEAN | NO | true | - |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |

**Unique Constraints**:
- `bolna_phone_number_id`: UNIQUE
- `idx_phone_numbers_unique_active`: UNIQUE(phone_number) WHERE is_active = true

**Indexes**:
- `idx_phone_numbers_bolna_phone_number_id` ON bolna_phone_number_id
- `idx_phone_numbers_assigned_to_user_id` ON assigned_to_user_id
- `idx_phone_numbers_created_by_admin_id` ON created_by_admin_id
- `idx_phone_numbers_active` ON is_active

---

### 6. `transcripts` - Call Transcriptions
**Purpose**: Stores call transcriptions and conversation analysis

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | uuid_generate_v4() | PRIMARY KEY |
| `call_id` | UUID | NO | - | FK → calls(id) ON DELETE CASCADE |
| `user_id` | UUID | NO | - | FK → users(id) ON DELETE CASCADE |
| `content` | TEXT | YES | - | - |
| `speaker_segments` | JSONB | YES | '[]' | - |
| `analysis_status` | VARCHAR(20) | NO | 'pending' | CHECK (analysis_status IN ('pending', 'processing', 'completed', 'failed')) |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |

**Data Isolation**:
- FK constraint on `(call_id, user_id)` ensures transcripts belong to correct user

---

### 7. `lead_analytics` - Lead Analytics and Intelligence
**Purpose**: Stores lead qualification and conversation analysis

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | uuid_generate_v4() | PRIMARY KEY |
| `call_id` | UUID | NO | - | FK → calls(id) ON DELETE CASCADE |
| `user_id` | UUID | NO | - | FK → users(id) ON DELETE CASCADE |
| `intent_score` | DECIMAL(3,2) | YES | - | CHECK (intent_score >= 0 AND intent_score <= 1) |
| `sentiment_score` | DECIMAL(3,2) | YES | - | CHECK (sentiment_score >= -1 AND sentiment_score <= 1) |
| `lead_qualification` | VARCHAR(20) | YES | - | CHECK (lead_qualification IN ('hot', 'warm', 'cold', 'not_qualified')) |
| `key_topics` | JSONB | YES | '[]' | - |
| `next_steps` | TEXT | YES | - | - |
| `summary` | TEXT | YES | - | - |
| `total_score` | DECIMAL(5,2) | YES | - | - |
| `is_read` | BOOLEAN | NO | false | - |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |

---

## 📊 Analytics and Cache Tables

### 8. `agent_analytics` - Agent Performance Analytics
**Purpose**: Pre-calculated agent performance metrics for dashboard

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | uuid_generate_v4() | PRIMARY KEY |
| `agent_id` | UUID | NO | - | FK → agents(id) ON DELETE CASCADE |
| `user_id` | UUID | NO | - | FK → users(id) ON DELETE CASCADE |
| `date` | DATE | NO | - | - |
| `total_calls` | INTEGER | NO | 0 | - |
| `completed_calls` | INTEGER | NO | 0 | - |
| `failed_calls` | INTEGER | NO | 0 | - |
| `total_duration_minutes` | INTEGER | NO | 0 | - |
| `total_credits_used` | INTEGER | NO | 0 | - |
| `success_rate` | DECIMAL(5,2) | NO | 0 | - |
| `avg_call_duration` | DECIMAL(8,2) | NO | 0 | - |
| `hot_leads` | INTEGER | NO | 0 | - |
| `warm_leads` | INTEGER | NO | 0 | - |
| `cold_leads` | INTEGER | NO | 0 | - |
| `avg_total_score` | DECIMAL(5,2) | YES | - | - |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |

**Unique Constraint**: `(agent_id, user_id, date)`

---

### 9. `user_analytics` - User Performance Analytics
**Purpose**: Pre-calculated user-level performance metrics

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | uuid_generate_v4() | PRIMARY KEY |
| `user_id` | UUID | NO | - | FK → users(id) ON DELETE CASCADE |
| `date` | DATE | NO | - | - |
| `total_calls` | INTEGER | NO | 0 | - |
| `completed_calls` | INTEGER | NO | 0 | - |
| `failed_calls` | INTEGER | NO | 0 | - |
| `total_agents` | INTEGER | NO | 0 | - |
| `active_agents` | INTEGER | NO | 0 | - |
| `total_contacts` | INTEGER | NO | 0 | - |
| `total_credits_used` | INTEGER | NO | 0 | - |
| `success_rate` | DECIMAL(5,2) | NO | 0 | - |
| `avg_call_duration` | DECIMAL(8,2) | NO | 0 | - |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |

**Unique Constraint**: `(user_id, date)`

---

## 🔐 Security and System Tables

### 10. `user_sessions` - Session Management
**Purpose**: Manages user authentication sessions

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | uuid_generate_v4() | PRIMARY KEY |
| `user_id` | UUID | NO | - | FK → users(id) ON DELETE CASCADE |
| `session_token` | VARCHAR(255) | NO | - | UNIQUE |
| `refresh_token` | VARCHAR(255) | YES | - | UNIQUE |
| `expires_at` | TIMESTAMPTZ | NO | - | - |
| `refresh_expires_at` | TIMESTAMPTZ | YES | - | - |
| `user_agent` | TEXT | YES | - | - |
| `ip_address` | INET | YES | - | - |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |

---

### 11. `audit_logs` - System Audit Trail
**Purpose**: Tracks system changes and user actions

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | uuid_generate_v4() | PRIMARY KEY |
| `user_id` | UUID | YES | - | FK → users(id) ON DELETE SET NULL |
| `action` | VARCHAR(100) | NO | - | - |
| `resource_type` | VARCHAR(50) | NO | - | - |
| `resource_id` | UUID | YES | - | - |
| `old_values` | JSONB | YES | - | - |
| `new_values` | JSONB | YES | - | - |
| `ip_address` | INET | YES | - | - |
| `user_agent` | TEXT | YES | - | - |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |

---

### 12. `twilio_processed_calls` - Twilio Integration Tracking
**Purpose**: Tracks processed Twilio calls to prevent duplicates

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | gen_random_uuid() | PRIMARY KEY |
| `twilio_call_sid` | VARCHAR(255) | NO | - | UNIQUE |
| `phone_number` | VARCHAR(50) | NO | - | - |
| `call_status` | VARCHAR(50) | NO | - | - |
| `processed_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | - |
| `user_id` | UUID | YES | - | FK → users(id) ON DELETE CASCADE |
| `contact_id` | UUID | YES | - | FK → contacts(id) ON DELETE CASCADE |

**Indexes**:
- `idx_twilio_processed_calls_sid` ON twilio_call_sid
- `idx_twilio_processed_calls_phone` ON phone_number
- `idx_twilio_processed_calls_processed_at` ON processed_at

---

## 🎯 Views and Functions

### Views:
1. **`bolna_agents`** - Active Bolna.ai agents with call statistics
2. **`user_stats`** - User-level statistics and metrics
3. Various analytics views for dashboard performance

### Key Functions:
1. **Trigger Functions**: Update timestamps, cache invalidation, analytics updates
2. **Analytics Functions**: Calculate performance metrics, lead scores
3. **Cache Management Functions**: Invalidate and refresh cached data

---

## 🔧 Key Features

### Data Isolation
- All user data isolated by `user_id` foreign key constraints
- Composite foreign keys ensure cross-table data integrity
- Row-level security through application-level user context

### Performance Optimization
- Materialized views for complex analytics queries
- Strategic indexing on frequently queried columns
- Trigger-based cache invalidation system
- Pre-calculated analytics tables

### Bolna.ai Integration
- Complete migration from ElevenLabs to Bolna.ai
- Native support for Bolna.ai agent IDs, execution IDs, and configuration
- JSONB columns for flexible configuration storage
- Webhook-ready architecture

### Security Features
- Role-based access control (user, admin, super_admin)
- Session management with refresh tokens
- Comprehensive audit logging
- IP address and user agent tracking

---

## 📈 Schema Statistics

- **Tables**: 12+ core tables
- **Columns**: 150+ total columns across all tables
- **Indexes**: 50+ strategic indexes for performance
- **Triggers**: 20+ triggers for automation and caching
- **Views**: 5+ views for complex queries
- **Functions**: 15+ stored procedures and functions
- **Constraints**: 30+ foreign keys, unique constraints, and check constraints

---

*This analysis is based on migration files and represents the expected final state after all migrations are applied.*