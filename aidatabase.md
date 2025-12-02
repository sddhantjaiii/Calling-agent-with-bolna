# AI-Optimized Database Schema Reference

**Generated**: 2025-12-03  
**Database**: Neon PostgreSQL (30.94 MB)  
**Version**: PostgreSQL 17.6  
**Total Tables**: 25 | **Views**: 7 | **Materialized Views**: 1 | **Functions**: 57 | **Triggers**: 17

---

## 🎯 Quick Navigation

### Core Tables
- [users](#users) - User accounts & auth
- [agents](#agents) - AI agents (Bolna.ai)
- [calls](#calls) - Call records
- [contacts](#contacts) - Contact directory
- [customers](#customers) - Converted customers

### Campaign & Queue
- [call_campaigns](#call_campaigns) - Batch campaigns
- [call_queue](#call_queue) - Call processing queue
- [active_calls](#active_calls) - Concurrency tracking

### Analytics
- [agent_analytics](#agent_analytics) - Agent performance
- [lead_analytics](#lead_analytics) - Lead scoring
- [user_analytics](#user_analytics) - User metrics

### Communication
- [calendar_meetings](#calendar_meetings) - Meeting schedules
- [follow_ups](#follow_ups) - Follow-up tasks
- [notifications](#notifications) - User notifications
- [transcripts](#transcripts) - Call transcripts

### System
- [phone_numbers](#phone_numbers) - Twilio numbers
- [credit_transactions](#credit_transactions) - Billing
- [system_config](#system_config) - Config key-value
- [admin_audit_log](#admin_audit_log) - Admin actions

---

## 📊 TABLE SCHEMAS

### users
**Purpose**: Multi-tenant root - all data isolates by user_id

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v4() | PK |
| email | varchar(255) | NO | - | UNIQUE |
| name | varchar(255) | NO | - | |
| role | varchar(20) | NO | 'user' | CHECK: user/admin/super_admin |
| credits | integer | NO | 15 | CHECK: >= 0 |
| is_active | boolean | NO | true | |
| auth_provider | varchar(50) | NO | 'email' | CHECK: email/google/linkedin/github |
| stack_auth_user_id | varchar(255) | YES | - | UNIQUE |
| email_verified | boolean | NO | false | |
| password_hash | varchar(255) | YES | - | |
| company | varchar(255) | YES | - | |
| website | varchar(255) | YES | - | |
| location | varchar(255) | YES | - | |
| bio | text | YES | - | |
| phone | varchar(50) | YES | - | |
| created_at | timestamptz | NO | CURRENT_TIMESTAMP | |
| updated_at | timestamptz | NO | CURRENT_TIMESTAMP | |

**Indexes**: PK on id, UNIQUE on email, UNIQUE on stack_auth_user_id  
**Child Tables**: agents, calls, contacts, campaigns (all CASCADE delete)  
**Current Rows**: Varies

---

### agents
**Purpose**: Bolna.ai agent configurations per user

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v4() | PK |
| user_id | uuid | NO | - | FK→users(id) CASCADE |
| bolna_agent_id | varchar(255) | NO | - | UNIQUE |
| name | varchar(255) | NO | - | |
| description | text | YES | - | |
| agent_type | varchar(50) | NO | 'call' | CHECK: call/chat |
| is_active | boolean | NO | true | |
| bolna_webhook_url | text | YES | - | |
| bolna_voice_config | jsonb | YES | {} | |
| bolna_llm_config | jsonb | YES | {} | |
| bolna_task_config | jsonb | YES | {} | |
| created_at | timestamptz | NO | CURRENT_TIMESTAMP | |
| updated_at | timestamptz | NO | CURRENT_TIMESTAMP | |

**Unique Constraints**:
- bolna_agent_id (global)
- (user_id, bolna_agent_id)
- (id, user_id) for data isolation

**Indexes**:
- idx_agents_bolna_agent_id
- idx_agents_user_bolna

**Triggers**:
- update_agents_updated_at (BEFORE UPDATE)

**Child Tables**: calls, agent_analytics

---

### calls
**Purpose**: All call records (inbound/outbound via Bolna.ai)

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v4() | PK |
| user_id | uuid | NO | - | FK→users(id) CASCADE |
| agent_id | uuid | NO | - | FK→agents(id) CASCADE |
| contact_id | uuid | YES | - | FK→contacts(id) SET NULL |
| campaign_id | uuid | YES | - | FK→call_campaigns(id) SET NULL |
| bolna_conversation_id | varchar(255) | NO | - | |
| bolna_execution_id | varchar(255) | NO | - | UNIQUE |
| phone_number | varchar(50) | NO | - | |
| call_source | varchar(20) | YES | - | CHECK: phone/internet/unknown |
| caller_name | varchar(255) | YES | - | |
| caller_email | varchar(255) | YES | - | |
| lead_type | varchar(20) | YES | - | CHECK: inbound/outbound |
| status | varchar(20) | NO | 'initiated' | CHECK: initiated/in-progress/completed/failed/busy/no-answer |
| duration_seconds | integer | YES | - | |
| recording_url | text | YES | - | |
| transcript | text | YES | - | |
| summary | text | YES | - | |
| sentiment | varchar(20) | YES | - | CHECK: positive/neutral/negative/mixed |
| next_action | text | YES | - | |
| started_at | timestamptz | YES | - | |
| ended_at | timestamptz | YES | - | |
| created_at | timestamptz | NO | CURRENT_TIMESTAMP | |
| updated_at | timestamptz | NO | CURRENT_TIMESTAMP | |
| metadata | jsonb | YES | {} | |
| from_number | varchar(50) | YES | - | |
| to_number | varchar(50) | YES | - | |

**Unique Constraints**:
- bolna_execution_id
- (id, user_id) for isolation

**Key Indexes**:
- idx_calls_bolna_execution_id
- idx_calls_user_agent_status
- idx_calls_user_status_created
- idx_calls_campaign_status

**Triggers**:
- cleanup_active_calls_on_status_change (AFTER UPDATE)
- trg_calls_daily_analytics (AFTER INSERT/UPDATE)
- update_calls_updated_at (BEFORE UPDATE)

**Child Tables**: lead_analytics, transcripts, follow_ups

---

### contacts
**Purpose**: User contact directory with auto-creation from calls

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v4() | PK |
| user_id | uuid | NO | - | FK→users(id) CASCADE |
| name | varchar(255) | NO | - | |
| phone_number | varchar(50) | NO | - | |
| email | varchar(255) | YES | - | |
| company | varchar(255) | YES | - | |
| notes | text | YES | - | |
| is_auto_created | boolean | NO | false | |
| auto_creation_source | varchar(50) | YES | - | CHECK: webhook/manual/bulk_upload |
| auto_created_from_call_id | uuid | YES | - | FK→calls(id) SET NULL |
| is_customer | boolean | NO | false | |
| not_connected | integer | NO | 0 | Count of missed calls |
| call_attempted_busy | integer | NO | 0 | CHECK: >= 0 |
| call_attempted_no_answer | integer | NO | 0 | CHECK: >= 0 |
| tags | text[] | NO | {} | User-defined tags |
| last_contact_at | timestamptz | YES | - | Auto-updated |
| city | varchar(255) | YES | - | |
| country | varchar(255) | YES | - | |
| business_context | text | YES | - | |
| created_at | timestamptz | NO | CURRENT_TIMESTAMP | |
| updated_at | timestamptz | NO | CURRENT_TIMESTAMP | |

**Unique Constraints**:
- (id, user_id)
- (user_id, phone_number) - prevents duplicates per user

**Indexes**:
- idx_contacts_user_phone
- idx_contacts_tags (GIN)
- idx_contacts_last_contact

**Triggers**:
- update_contacts_updated_at (BEFORE UPDATE)

---

### call_campaigns
**Purpose**: Batch calling campaigns with scheduling

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v4() | PK |
| user_id | uuid | NO | - | FK→users(id) CASCADE |
| agent_id | uuid | NO | - | FK→agents(id) RESTRICT |
| name | varchar(255) | NO | - | |
| description | text | YES | - | |
| next_action | text | NO | - | User goal |
| status | varchar(20) | NO | 'draft' | CHECK: draft/scheduled/active/paused/completed/cancelled |
| first_call_time | time | NO | - | Daily start |
| last_call_time | time | NO | - | Daily end |
| start_date | date | NO | - | |
| end_date | date | YES | - | |
| campaign_timezone | varchar(50) | YES | - | Optional override |
| use_custom_timezone | boolean | YES | false | |
| max_retries | integer | NO | 0 | CHECK: 0-5 |
| retry_interval_minutes | integer | NO | 60 | CHECK: 1-1440 |
| total_contacts | integer | NO | 0 | |
| completed_calls | integer | NO | 0 | |
| successful_calls | integer | NO | 0 | |
| failed_calls | integer | NO | 0 | |
| started_at | timestamptz | YES | - | |
| completed_at | timestamptz | YES | - | |
| created_at | timestamptz | NO | CURRENT_TIMESTAMP | |
| updated_at | timestamptz | NO | CURRENT_TIMESTAMP | |

**Indexes**:
- idx_campaigns_user_status
- idx_campaigns_status_date

**Triggers**:
- update_call_campaigns_updated_at (BEFORE UPDATE)
- update_campaign_statistics (AFTER INSERT/UPDATE on calls)
- update_campaign_statistics_on_delete (AFTER DELETE on calls)

---

### call_queue
**Purpose**: Queue system for campaign & direct calls with retry logic

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v4() | PK |
| user_id | uuid | NO | - | FK→users(id) CASCADE |
| campaign_id | uuid | YES | - | FK→call_campaigns(id) CASCADE |
| contact_id | uuid | NO | - | FK→contacts(id) CASCADE |
| agent_id | uuid | NO | - | FK→agents(id) CASCADE |
| phone_number | varchar(50) | NO | - | |
| contact_name | varchar(255) | YES | - | |
| status | varchar(20) | NO | 'pending' | CHECK: pending/processing/completed/failed/cancelled/busy/no_answer |
| priority | integer | NO | 0 | Higher = more priority |
| scheduled_for | timestamptz | YES | - | Future scheduling |
| attempts | integer | NO | 0 | Retry counter |
| max_retries | integer | NO | 0 | From campaign or 0 |
| last_attempt_at | timestamptz | YES | - | |
| processing_started_at | timestamptz | YES | - | |
| completed_at | timestamptz | YES | - | |
| error_message | text | YES | - | |
| metadata | jsonb | YES | {} | |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |
| call_id | uuid | YES | - | FK→calls(id) SET NULL |
| call_type | varchar(20) | NO | 'campaign' | CHECK: campaign/direct |

**Unique Constraints**:
- (id, user_id) for isolation

**Key Indexes**:
- idx_call_queue_priority (status, priority DESC, scheduled_for)
- idx_call_queue_user_pending
- idx_call_queue_campaign_status

**Triggers**:
- update_call_queue_updated_at (BEFORE UPDATE)

**Retry Logic**: Uses attempts, max_retries, status for auto-callbacks

---

### active_calls
**Purpose**: Real-time concurrency tracking (prevents overload)

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | - | PK (references call_queue or calls) |
| user_id | uuid | NO | - | FK→users(id) CASCADE |
| call_type | varchar(20) | NO | - | CHECK: direct/campaign |
| started_at | timestamptz | NO | now() | |
| bolna_execution_id | varchar(255) | YES | - | For API correlation |
| metadata | jsonb | YES | {} | |

**Purpose**: Direct calls have priority over campaign calls  
**Constraints**: CHECK on call_type, valid reference check  
**Indexes**: idx_active_calls_user_id, idx_active_calls_call_type, idx_active_calls_bolna_execution_id

**Auto-cleanup**: Trigger removes entries when call status changes

---

### agent_analytics
**Purpose**: Daily & hourly agent performance metrics

| Column | Type | Nullable | Default | Key Metrics |
|--------|------|----------|---------|-------------|
| id | uuid | NO | PK | |
| agent_id | uuid | NO | FK | |
| user_id | uuid | NO | FK | |
| date | date | NO | - | |
| hour | integer | YES | - | NULL = daily rollup |
| total_calls | integer | NO | 0 | |
| successful_calls | integer | NO | 0 | |
| failed_calls | integer | NO | 0 | |
| total_duration_minutes | integer | NO | 0 | |
| avg_duration_minutes | numeric(10,2) | NO | 0 | |
| leads_generated | integer | NO | 0 | |
| qualified_leads | integer | NO | 0 | |
| conversion_rate | numeric(5,2) | NO | 0 | % |
| avg_engagement_score | numeric(5,2) | NO | 0 | |
| avg_intent_score | numeric(5,2) | NO | 0 | |
| avg_urgency_score | numeric(5,2) | NO | 0 | |
| avg_budget_score | numeric(5,2) | NO | 0 | |
| avg_fit_score | numeric(5,2) | NO | 0 | |
| avg_total_score | numeric(5,2) | NO | 0 | |
| credits_used | integer | NO | 0 | |
| cost_per_lead | numeric(10,2) | NO | 0 | |
| success_rate | numeric(5,2) | NO | 0 | % |
| answer_rate | numeric(5,2) | NO | 0 | % |
| cta_pricing_clicks | integer | NO | 0 | CTA metrics |
| cta_demo_clicks | integer | NO | 0 | |
| cta_followup_clicks | integer | NO | 0 | |
| cta_sample_clicks | integer | NO | 0 | |
| cta_human_escalations | integer | NO | 0 | |
| total_cta_interactions | integer | NO | 0 | |
| cta_conversion_rate | numeric(5,2) | NO | 0 | % |

**Unique Index**: (agent_id, date, hour) - prevents duplicates  
**Hourly Records**: hour 0-23 for intraday, NULL for daily  
**Auto-updated**: Via trg_calls_daily_analytics trigger

---

### lead_analytics
**Purpose**: AI scoring & qualification per call/lead

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | PK | |
| call_id | uuid | NO | FK→calls(id) CASCADE | UNIQUE |
| user_id | uuid | NO | FK→users(id) CASCADE | |
| agent_id | uuid | NO | FK→agents(id) CASCADE | |
| contact_id | uuid | YES | FK→contacts(id) SET NULL | |
| engagement_score | numeric(5,2) | YES | - | 0-100 |
| intent_score | numeric(5,2) | YES | - | 0-100 |
| urgency_score | numeric(5,2) | YES | - | 0-100 |
| budget_score | numeric(5,2) | YES | - | 0-100 |
| fit_score | numeric(5,2) | YES | - | 0-100 |
| total_score | numeric(5,2) | YES | - | 0-100 computed |
| qualification_status | varchar(20) | YES | - | CHECK: qualified/unqualified/needs_review |
| lifecycle_status | varchar(50) | YES | 'new' | new/contacted/qualified/proposal/negotiation/closed_won/closed_lost/nurture |
| key_topics | text[] | YES | {} | AI-extracted |
| pain_points | text[] | YES | {} | |
| objections | text[] | YES | {} | |
| next_steps | text[] | YES | {} | |
| competitor_mentions | text[] | YES | {} | |
| decision_timeline | varchar(100) | YES | - | |
| budget_range | varchar(100) | YES | - | |
| decision_maker | boolean | YES | - | |
| call_outcome | varchar(50) | YES | - | CHECK: meeting_booked/callback_scheduled/not_interested/wrong_number/voicemail/follow_up_needed/qualified/unqualified/needs_review |
| meeting_scheduled_at | timestamptz | YES | - | |
| follow_up_date | date | YES | - | |
| notes | text | YES | - | |
| ai_analysis | jsonb | YES | {} | |
| created_at | timestamptz | NO | CURRENT_TIMESTAMP | |
| updated_at | timestamptz | NO | CURRENT_TIMESTAMP | |

**Unique**: call_id (1:1 with calls)  
**Indexes**: user_id, qualification_status, lifecycle_status, call_outcome  
**Triggers**: trg_leads_daily_analytics updates agent_analytics

---

### calendar_meetings
**Purpose**: Meeting scheduling integration (Google Calendar)

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | PK | |
| user_id | uuid | NO | FK→users(id) CASCADE | |
| call_id | uuid | YES | FK→calls(id) SET NULL | |
| contact_id | uuid | YES | FK→contacts(id) SET NULL | |
| meeting_time | timestamptz | NO | - | |
| duration_minutes | integer | NO | 30 | |
| title | varchar(500) | NO | - | |
| description | text | YES | - | |
| location | varchar(500) | YES | - | |
| attendee_email | varchar(255) | YES | - | |
| google_event_id | varchar(255) | YES | - | UNIQUE |
| google_calendar_id | varchar(255) | YES | - | |
| google_meet_link | text | YES | - | |
| status | varchar(20) | NO | 'scheduled' | CHECK: scheduled/completed/cancelled/rescheduled |
| timezone | varchar(50) | NO | 'UTC' | |
| created_at | timestamptz | NO | CURRENT_TIMESTAMP | |
| updated_at | timestamptz | NO | CURRENT_TIMESTAMP | |

**Integration**: Google Calendar API sync  
**Triggers**: update_calendar_meetings_updated_at

---

### customers
**Purpose**: Converted contacts (won deals)

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | PK | |
| user_id | uuid | NO | FK→users(id) CASCADE | |
| contact_id | uuid | NO | FK→contacts(id) CASCADE | UNIQUE |
| customer_reference | varchar(50) | NO | - | UNIQUE, auto-generated |
| company_name | varchar(255) | YES | - | |
| industry | varchar(100) | YES | - | |
| deal_value | numeric(12,2) | YES | - | |
| deal_closed_date | date | YES | - | |
| contract_start_date | date | YES | - | |
| contract_end_date | date | YES | - | |
| payment_terms | varchar(100) | YES | - | |
| account_manager | varchar(255) | YES | - | |
| notes | text | YES | - | |
| created_at | timestamptz | NO | CURRENT_TIMESTAMP | |
| updated_at | timestamptz | NO | CURRENT_TIMESTAMP | |

**Triggers**:
- trigger_generate_customer_reference (BEFORE INSERT)
- update_customers_updated_at (BEFORE UPDATE)

---

### follow_ups
**Purpose**: User-scheduled follow-up tasks

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | PK | |
| user_id | uuid | NO | FK→users(id) CASCADE | |
| lead_phone | varchar(20) | NO | - | |
| lead_email | varchar(255) | YES | - | |
| lead_name | varchar(255) | YES | - | |
| follow_up_date | date | NO | - | |
| remark | text | YES | - | |
| is_completed | boolean | YES | false | |
| completed_at | timestamptz | YES | - | |
| created_by | uuid | YES | FK→users(id) SET NULL | |

**Triggers**: update_follow_ups_updated_at

---

### notifications
**Purpose**: In-app notification system

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | PK | |
| user_id | uuid | NO | FK→users(id) CASCADE | |
| type | varchar(50) | NO | - | meeting_booked/call_completed/etc |
| title | varchar(255) | NO | - | |
| message | text | NO | - | |
| link | varchar(500) | YES | - | |
| is_read | boolean | NO | false | |
| metadata | jsonb | YES | {} | |
| created_at | timestamptz | NO | CURRENT_TIMESTAMP | |

**Indexes**: idx_notifications_user_read, idx_notifications_user_created

---

### notification_preferences
**Purpose**: User notification settings

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | PK | |
| user_id | uuid | NO | FK→users(id) CASCADE | UNIQUE |
| email_enabled | boolean | NO | true | |
| in_app_enabled | boolean | NO | true | |
| meeting_booked_email | boolean | NO | true | |
| call_completed_email | boolean | NO | false | |
| daily_summary_email | boolean | NO | true | |

---

### transcripts
**Purpose**: Call transcripts (separate for large text)

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | PK | |
| call_id | uuid | NO | FK→calls(id) CASCADE | UNIQUE |
| user_id | uuid | NO | FK→users(id) CASCADE | |
| agent_id | uuid | NO | FK→agents(id) CASCADE | |
| transcript_text | text | NO | - | Full transcript |
| word_count | integer | YES | - | |
| language | varchar(10) | YES | 'en' | |
| confidence_score | numeric(5,2) | YES | - | |

---

### phone_numbers
**Purpose**: Twilio phone number management

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | PK | |
| user_id | uuid | NO | FK→users(id) CASCADE | |
| phone_number | varchar(50) | NO | - | UNIQUE |
| friendly_name | varchar(255) | YES | - | |
| country_code | varchar(5) | YES | - | |
| is_active | boolean | NO | true | |
| capabilities | jsonb | YES | {} | voice/sms/mms |
| twilio_sid | varchar(255) | YES | - | |

---

### credit_transactions
**Purpose**: Credit billing history

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | PK | |
| user_id | uuid | NO | FK→users(id) CASCADE | |
| amount | integer | NO | - | Can be negative |
| type | varchar(20) | NO | - | CHECK: purchase/usage/refund/adjustment |
| description | text | YES | - | |
| call_id | uuid | YES | FK→calls(id) SET NULL | |
| balance_after | integer | NO | - | |

---

### user_analytics
**Purpose**: Daily user-level rollups

| Column | Type | Nullable | Default | Key Fields |
|--------|------|----------|---------|------------|
| id | uuid | NO | PK | |
| user_id | uuid | NO | FK | UNIQUE (user_id, date) |
| date | date | NO | - | |
| total_calls | integer | NO | 0 | |
| successful_calls | integer | NO | 0 | |
| total_agents | integer | NO | 0 | |
| total_leads | integer | NO | 0 | |
| qualified_leads | integer | NO | 0 | |
| credits_used | integer | NO | 0 | |

**Triggers**: trg_user_daily_rollup aggregates from agent_analytics

---

### user_sessions
**Purpose**: Active login session tracking

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | PK | |
| user_id | uuid | NO | FK→users(id) CASCADE | |
| token | varchar(500) | NO | - | UNIQUE |
| refresh_token | varchar(500) | YES | - | UNIQUE |
| expires_at | timestamptz | NO | - | |
| refresh_expires_at | timestamptz | YES | - | |
| last_used_at | timestamptz | NO | CURRENT_TIMESTAMP | |
| ip_address | inet | YES | - | |
| user_agent | text | YES | - | |

**Triggers**: update_session_last_used (on SELECT)

---

### system_config
**Purpose**: Global key-value configuration

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| key | varchar(255) | NO | - | PK |
| value | text | NO | - | |
| description | text | YES | - | |
| updated_at | timestamptz | NO | CURRENT_TIMESTAMP | |

---

### admin_audit_log
**Purpose**: Admin action tracking

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | PK | |
| admin_user_id | uuid | NO | FK→users(id) CASCADE | |
| target_user_id | uuid | YES | FK→users(id) SET NULL | |
| action | varchar(100) | NO | - | |
| resource_type | varchar(50) | NO | - | |
| resource_id | varchar(255) | YES | - | |
| details | jsonb | NO | {} | |
| ip_address | inet | YES | - | |
| user_agent | text | YES | - | |

---

### login_attempts
**Purpose**: Rate limiting & security

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | PK | |
| email | varchar(255) | NO | - | |
| ip_address | inet | NO | - | |
| success | boolean | NO | false | |
| attempted_at | timestamptz | NO | CURRENT_TIMESTAMP | |

---

### failure_logs
**Purpose**: API error tracking (4xx/5xx)

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | PK | |
| endpoint | varchar(500) | NO | - | |
| method | varchar(10) | NO | - | |
| status_code | integer | NO | - | 400-599 |
| error_message | text | YES | - | |
| error_stack | text | YES | - | |
| request_body | jsonb | YES | - | |
| response_body | jsonb | YES | - | |
| duration_ms | integer | NO | - | |
| user_id | uuid | YES | FK→users(id) SET NULL | |
| request_id | varchar(100) | YES | - | |

---

### user_email_settings
**Purpose**: SMTP configuration per user

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | PK | |
| user_id | uuid | NO | FK→users(id) CASCADE | UNIQUE |
| smtp_host | varchar(255) | NO | - | |
| smtp_port | integer | NO | 587 | |
| smtp_secure | boolean | NO | false | |
| smtp_user | varchar(255) | NO | - | |
| smtp_password | text | NO | - | Encrypted |
| from_email | varchar(255) | NO | - | |
| from_name | varchar(255) | YES | - | |

---

### migrations
**Purpose**: Schema version tracking

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | serial | NO | PK | |
| name | varchar(255) | NO | - | UNIQUE |
| executed_at | timestamptz | NO | CURRENT_TIMESTAMP | |

---

## 📊 VIEWS

### user_stats
**Purpose**: Quick user overview  
**Definition**: Aggregates total_calls, leads, agents per user

### user_performance_summary
**Purpose**: User performance metrics  
**Definition**: Success rates, conversion rates, avg scores per user

### user_login_stats
**Purpose**: Login frequency analysis  
**Definition**: Login counts, last_login per user

### call_source_analytics
**Purpose**: Call source breakdown  
**Definition**: Groups calls by call_source (phone/internet/unknown)

### user_concurrency_status
**Purpose**: Per-user active call counts  
**Definition**: Count of active_calls grouped by user_id, call_type

### system_concurrency_overview
**Purpose**: Global concurrency snapshot  
**Definition**: Total direct vs campaign active calls

### queue_status_by_type
**Purpose**: Queue health monitoring  
**Definition**: Counts by status, call_type in call_queue

---

## 📊 MATERIALIZED VIEWS

### user_kpi_summary
**Purpose**: Cached daily KPI dashboard  
**Refreshed**: Via triggers + scheduled job  
**Columns**: user_id, date, total_calls, success_rate, conversion_rate, avg_scores, qualified_leads, credits_used

**Indexes**:
- UNIQUE (user_id, date)
- idx_user_kpi_summary_date
- idx_user_kpi_summary_performance

**Refresh Triggers**:
- trigger_refresh_user_kpi_summary (on calls, agent_analytics, user_analytics changes)

---

## ⚙️ KEY FUNCTIONS

### Concurrency Management
- `count_active_calls(user_id)` → integer
- `count_user_direct_calls_queued(user_id)` → integer
- `get_system_active_calls_count()` → integer
- `get_user_active_calls_count(user_id)` → integer
- `cleanup_orphaned_active_calls()` → integer (removes stale entries)

### Queue Management
- `get_next_queued_call(user_id)` → call_queue row
- `get_next_direct_call_queued(user_id)` → call_queue row
- `get_call_queue_position(queue_id)` → integer

### Analytics Computation
- `calculate_daily_call_analytics(user_id, target_date)` → void
- `batch_calculate_call_analytics(user_id, start_date, end_date)` → void
- `recompute_agent_daily_from_calls(agent_id, target_date)` → void
- `recompute_user_daily_from_agent(user_id, target_date)` → void
- `update_agent_scores_from_lead_analytics()` → trigger (updates agent_analytics scores)

### Cache Management
- `refresh_user_kpi_summary()` → void (full refresh)
- `refresh_user_kpi_summary_for_user(user_id)` → void (single user)
- `scheduled_refresh_user_kpi_summary()` → void (cron job)
- `cleanup_expired_dashboard_cache()` → integer
- `test_cache_invalidation(user_id)` → text (debugging)

### Session & Auth
- `cleanup_expired_sessions()` → integer
- `cleanup_old_login_attempts()` → integer
- `update_session_last_used()` → trigger

### Data Integrity
- `determine_call_source(from_number, to_number)` → varchar (phone/internet/unknown)
- `generate_customer_reference()` → varchar (auto customer IDs)
- `validate_user_data_consistency()` → table (audit report)
- `audit_data_isolation()` → table (checks FK consistency)
- `show_db_tree()` → text (relationship diagram)

### Campaign Management
- `update_campaign_statistics()` → trigger (on call insert/update)
- `update_campaign_statistics_on_delete()` → trigger

### Timezone Helpers
- `get_user_timezone(user_id)` → varchar

---

## 🔥 ALL TRIGGERS

### Timestamp Updates (BEFORE UPDATE)
1. `update_agents_updated_at` → agents
2. `update_calendar_meetings_updated_at` → calendar_meetings
3. `update_call_campaigns_updated_at` → call_campaigns
4. `update_call_queue_updated_at` → call_queue
5. `update_calls_updated_at` → calls
6. `update_contacts_updated_at` → contacts
7. `update_customers_updated_at` → customers
8. `update_follow_ups_updated_at` → follow_ups
9. `update_phone_numbers_updated_at` → phone_numbers
10. `update_user_email_settings_updated_at` → user_email_settings

### Analytics Triggers (AFTER INSERT/UPDATE)
11. `trg_calls_daily_analytics` → calls (aggregates to agent_analytics)
12. `trg_leads_daily_analytics` → lead_analytics (aggregates to agent_analytics)
13. `trg_user_daily_rollup` → agent_analytics (aggregates to user_analytics)

### Cache Invalidation (AFTER INSERT/UPDATE/DELETE)
14. `trigger_refresh_user_kpi_summary` → calls, agent_analytics, user_analytics (refreshes materialized view)
15. `update_dashboard_cache_from_agents` → agents (invalidates cache)

### Business Logic (AFTER UPDATE/INSERT)
16. `cleanup_active_calls_on_status_change` → calls (removes from active_calls)
17. `update_campaign_statistics` → calls (updates campaign counters)
18. `update_campaign_statistics_on_delete` → calls (AFTER DELETE)

### Auto-Generation (BEFORE INSERT)
19. `trigger_generate_customer_reference` → customers (generates customer_reference)

---

## 🔑 KEY PATTERNS

### Multi-Tenancy
- **ALL tables** have `user_id` for isolation
- Composite unique constraints: `(id, user_id)` on agents, calls, contacts
- Cascading deletes: User deletion removes all child data

### Foreign Key Actions
- **CASCADE**: users → agents, calls, contacts, campaigns (delete user = delete all)
- **RESTRICT**: campaigns → agents (can't delete agent with active campaigns)
- **SET NULL**: calls → contacts (preserve call if contact deleted)

### Status Workflows
- **Calls**: initiated → in-progress → completed/failed/busy/no-answer
- **Campaigns**: draft → scheduled → active → paused/completed/cancelled
- **Queue**: pending → processing → completed/failed/cancelled/busy/no_answer
- **Meetings**: scheduled → completed/cancelled/rescheduled

### Retry Logic
- `call_queue.attempts` increments on each try
- `call_queue.max_retries` from campaign or default 0
- Status changes to `busy` or `no_answer` trigger retry scheduling
- `retry_interval_minutes` controls delay between attempts

### Analytics Pipeline
1. Call completes → `trg_calls_daily_analytics` fires
2. Updates `agent_analytics` (hourly + daily)
3. Lead created → `trg_leads_daily_analytics` fires
4. Updates scores in `agent_analytics`
5. `trg_user_daily_rollup` aggregates to `user_analytics`
6. `trigger_refresh_user_kpi_summary` updates materialized view

### Concurrency Control
1. Call starts → Insert into `active_calls`
2. System checks: `count_active_calls(user_id)` < limit
3. Priority: Direct calls > Campaign calls
4. Call ends → `cleanup_active_calls_on_status_change` removes entry
5. Orphan cleanup: `cleanup_orphaned_active_calls()` runs periodically

---

## 🎯 COMMON QUERIES

### Get User's Active Calls
```sql
SELECT * FROM active_calls WHERE user_id = $1;
```

### Get Next Campaign Call to Process
```sql
SELECT * FROM call_queue 
WHERE user_id = $1 AND call_type = 'campaign' AND status = 'pending'
ORDER BY priority DESC, scheduled_for ASC NULLS FIRST
LIMIT 1;
```

### Get Agent Performance Today
```sql
SELECT * FROM agent_analytics 
WHERE agent_id = $1 AND date = CURRENT_DATE AND hour IS NULL;
```

### Get User's Recent Calls with Contact Info
```sql
SELECT c.*, co.name as contact_name, co.company, a.name as agent_name
FROM calls c
LEFT JOIN contacts co ON c.contact_id = co.id
JOIN agents a ON c.agent_id = a.id
WHERE c.user_id = $1
ORDER BY c.created_at DESC
LIMIT 50;
```

### Get Campaign Progress
```sql
SELECT 
  cc.name,
  cc.status,
  cc.total_contacts,
  cc.completed_calls,
  cc.successful_calls,
  ROUND(cc.successful_calls::numeric / NULLIF(cc.completed_calls, 0) * 100, 2) as success_rate
FROM call_campaigns cc
WHERE cc.user_id = $1;
```

### Check Concurrency Limits
```sql
SELECT 
  user_id,
  SUM(CASE WHEN call_type = 'direct' THEN 1 ELSE 0 END) as direct_calls,
  SUM(CASE WHEN call_type = 'campaign' THEN 1 ELSE 0 END) as campaign_calls,
  COUNT(*) as total_active
FROM active_calls
WHERE user_id = $1
GROUP BY user_id;
```

---

## 🚨 IMPORTANT NOTES

### Data Isolation
- **ALWAYS filter by user_id** in application queries
- Use composite indexes: `(user_id, other_columns)`
- Composite unique constraints enforce per-user uniqueness

### Timezone Handling
- Most timestamps stored as `timestamptz` (UTC internally)
- User timezone in `users.location` or system_config
- Campaign can override with `campaign_timezone`
- Use `get_user_timezone(user_id)` for conversions

### Credit System
- Each call deducts credits from `users.credits`
- Transaction logged in `credit_transactions`
- `balance_after` field for audit trail

### Bolna.ai Integration
- `bolna_agent_id` must be unique globally
- `bolna_execution_id` links calls to Bolna API
- `bolna_conversation_id` groups related interactions

### Performance Optimization
- Materialized view `user_kpi_summary` for dashboards
- Partial indexes on status fields (WHERE status = 'pending')
- GIN indexes on JSONB columns (metadata, ai_analysis)
- Composite indexes for common query patterns

### Scheduled Jobs Required
- `cleanup_expired_sessions()` - every 1 hour
- `cleanup_old_login_attempts()` - daily
- `cleanup_orphaned_active_calls()` - every 5 minutes
- `scheduled_refresh_user_kpi_summary()` - every 1 hour
- `cleanup_expired_dashboard_cache()` - daily

---

**End of AI-Optimized Database Reference**
