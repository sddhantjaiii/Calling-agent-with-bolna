# Complete Database Schema Documentation

*Generated on: 2026-01-23T00:00:00.000Z*
*Database: Neon PostgreSQL*
*Last Updated: January 23, 2026 - Added new tables (emails, email_campaigns, team_members, etc.) and columns (interaction_platform, email_id, requirements, lead_stage, retry_strategy, etc.)*

## Table of Contents

- [public.active_calls](#publicactive_calls)
- [public.admin_audit_log](#publicadmin_audit_log)
- [public.agent_analytics](#publicagent_analytics)
- [public.agents](#publicagents)
- [public.calendar_meetings](#publiccalendar_meetings)
- [public.call_campaigns](#publiccall_campaigns)
- [public.call_queue](#publiccall_queue)
- [public.calls](#publiccalls)
- [public.contacts](#publiccontacts)
- [public.credit_transactions](#publiccredit_transactions)
- [public.customers](#publiccustomers)
- [public.email_campaigns](#publicemailcampaigns)
- [public.emails](#publicemails)
- [public.failure_logs](#publicfailure_logs)
- [public.follow_ups](#publicfollow_ups)
- [public.lead_analytics](#publiclead_analytics)
- [public.lead_intelligence_events](#publicleadintelligenceevents)
- [public.login_attempts](#publiclogin_attempts)
- [public.migrations](#publicmigrations)
- [public.notification_preferences](#publicnotification_preferences)
- [public.notifications](#publicnotifications)
- [public.pending_user_syncs](#publicpendingusersyncs)
- [public.phone_numbers](#publicphone_numbers)
- [public.system_config](#publicsystem_config)
- [public.team_member_sessions](#publicteammembersessions)
- [public.team_members](#publicteammembers)
- [public.transcripts](#publictranscripts)
- [public.user_analytics](#publicuser_analytics)
- [public.user_email_settings](#publicuser_email_settings)
- [public.user_sessions](#publicuser_sessions)
- [public.users](#publicusers)

---

## public.active_calls

**Description**: Real-time tracking of active calls for concurrency management. Direct calls get priority over campaign calls.

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | - | ✓ | ✓ |  |
| `user_id` | uuid | NO | - |  |  |  |
| `call_type` | character varying(20) | NO | - |  |  | Type of call: direct (user-initiated) or campaign (automated). Direct calls have priority. |
| `started_at` | timestamp with time zone | NO | now() |  |  | When this call slot was reserved/started |
| `bolna_execution_id` | character varying(255) | YES | - |  |  | Bolna.ai execution ID for API correlation and quick lookups |
| `metadata` | jsonb | YES | '{}'::jsonb |  |  |  |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `active_calls_call_type_check` | CHECK | CHECK (((call_type)::text = ANY ((ARRAY['direct'::character varying, 'campaign'::character varying])::text[]))) |
| `active_calls_valid_reference` | CHECK | CHECK ((id IS NOT NULL)) |
| `active_calls_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| `active_calls_unique_id` | PRIMARY KEY | PRIMARY KEY (id) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `active_calls_unique_id` | CREATE UNIQUE INDEX active_calls_unique_id ON public.active_calls USING btree (id) |
| `idx_active_calls_bolna_execution_id` | CREATE INDEX idx_active_calls_bolna_execution_id ON public.active_calls USING btree (bolna_execution_id) WHERE (bolna_execution_id IS NOT NULL) |
| `idx_active_calls_call_type` | CREATE INDEX idx_active_calls_call_type ON public.active_calls USING btree (user_id, call_type) |
| `idx_active_calls_started_at` | CREATE INDEX idx_active_calls_started_at ON public.active_calls USING btree (started_at) |
| `idx_active_calls_user_id` | CREATE INDEX idx_active_calls_user_id ON public.active_calls USING btree (user_id) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `user_id` | `public.users(id)` | NO ACTION | CASCADE |

**Current Row Count**: 0

---

## public.admin_audit_log

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | uuid_generate_v4() | ✓ | ✓ |  |
| `admin_user_id` | uuid | NO | - |  |  |  |
| `action` | character varying(100) | NO | - |  |  |  |
| `resource_type` | character varying(50) | NO | - |  |  |  |
| `resource_id` | character varying(255) | YES | - |  |  |  |
| `target_user_id` | uuid | YES | - |  |  |  |
| `details` | jsonb | NO | '{}'::jsonb |  |  |  |
| `ip_address` | inet | YES | - |  |  |  |
| `user_agent` | text | YES | - |  |  |  |
| `created_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `admin_audit_log_admin_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE CASCADE |
| `admin_audit_log_target_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL |
| `admin_audit_log_pkey` | PRIMARY KEY | PRIMARY KEY (id) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `admin_audit_log_pkey` | CREATE UNIQUE INDEX admin_audit_log_pkey ON public.admin_audit_log USING btree (id) |
| `idx_admin_audit_log_action` | CREATE INDEX idx_admin_audit_log_action ON public.admin_audit_log USING btree (action) |
| `idx_admin_audit_log_admin_user_id` | CREATE INDEX idx_admin_audit_log_admin_user_id ON public.admin_audit_log USING btree (admin_user_id) |
| `idx_admin_audit_log_created_at` | CREATE INDEX idx_admin_audit_log_created_at ON public.admin_audit_log USING btree (created_at) |
| `idx_admin_audit_log_resource_type` | CREATE INDEX idx_admin_audit_log_resource_type ON public.admin_audit_log USING btree (resource_type) |
| `idx_admin_audit_log_target_user_id` | CREATE INDEX idx_admin_audit_log_target_user_id ON public.admin_audit_log USING btree (target_user_id) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `admin_user_id` | `public.users(id)` | NO ACTION | CASCADE |
| `target_user_id` | `public.users(id)` | NO ACTION | SET NULL |

**Current Row Count**: 1938

---

## public.agent_analytics

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | uuid_generate_v4() | ✓ | ✓ |  |
| `agent_id` | uuid | NO | - |  | ✓ |  |
| `user_id` | uuid | NO | - |  |  |  |
| `date` | date | NO | - |  | ✓ |  |
| `hour` | integer | YES | - |  | ✓ |  |
| `total_calls` | integer | NO | 0 |  |  |  |
| `successful_calls` | integer | NO | 0 |  |  |  |
| `failed_calls` | integer | NO | 0 |  |  |  |
| `total_duration_minutes` | integer | NO | 0 |  |  |  |
| `avg_duration_minutes` | numeric(10,2) | NO | 0 |  |  |  |
| `leads_generated` | integer | NO | 0 |  |  |  |
| `qualified_leads` | integer | NO | 0 |  |  |  |
| `conversion_rate` | numeric(5,2) | NO | 0 |  |  |  |
| `avg_engagement_score` | numeric(5,2) | NO | 0 |  |  |  |
| `avg_intent_score` | numeric(5,2) | NO | 0 |  |  |  |
| `avg_urgency_score` | numeric(5,2) | NO | 0 |  |  |  |
| `avg_budget_score` | numeric(5,2) | NO | 0 |  |  |  |
| `avg_fit_score` | numeric(5,2) | NO | 0 |  |  |  |
| `credits_used` | integer | NO | 0 |  |  |  |
| `cost_per_lead` | numeric(10,2) | NO | 0 |  |  |  |
| `success_rate` | numeric(5,2) | NO | 0 |  |  |  |
| `answer_rate` | numeric(5,2) | NO | 0 |  |  |  |
| `created_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `updated_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `cta_pricing_clicks` | integer | NO | 0 |  |  | Number of pricing CTA interactions for this agent in the time period |
| `cta_demo_clicks` | integer | NO | 0 |  |  | Number of demo request CTA interactions for this agent in the time period |
| `cta_followup_clicks` | integer | NO | 0 |  |  | Number of follow-up CTA interactions for this agent in the time period |
| `cta_sample_clicks` | integer | NO | 0 |  |  | Number of sample request CTA interactions for this agent in the time period |
| `cta_human_escalations` | integer | NO | 0 |  |  | Number of human escalation CTA interactions for this agent in the time period |
| `total_cta_interactions` | integer | NO | 0 |  |  | Total number of CTA interactions (automatically calculated) |
| `cta_conversion_rate` | numeric(5,2) | NO | 0 |  |  | Percentage of calls that resulted in any CTA interaction (automatically calculated) |
| `avg_total_score` | numeric(5,2) | NO | 0 |  |  |  |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `agent_analytics_hour_check` | CHECK | CHECK (((hour >= 0) AND (hour <= 23))) |
| `agent_analytics_agent_id_fkey` | FOREIGN KEY | FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE |
| `agent_analytics_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| `agent_analytics_pkey` | PRIMARY KEY | PRIMARY KEY (id) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `agent_analytics_pkey` | CREATE UNIQUE INDEX agent_analytics_pkey ON public.agent_analytics USING btree (id) |
| `idx_agent_analytics_agent_date` | CREATE INDEX idx_agent_analytics_agent_date ON public.agent_analytics USING btree (agent_id, date) |
| `idx_agent_analytics_agent_date_cta` | CREATE INDEX idx_agent_analytics_agent_date_cta ON public.agent_analytics USING btree (agent_id, date, total_cta_interactions) |
| `idx_agent_analytics_agent_date_performance` | CREATE INDEX idx_agent_analytics_agent_date_performance ON public.agent_analytics USING btree (agent_id, date DESC, total_calls, successful_calls, leads_generated) WHERE (hour IS NULL) |
| `idx_agent_analytics_agent_id` | CREATE INDEX idx_agent_analytics_agent_id ON public.agent_analytics USING btree (agent_id) |
| `idx_agent_analytics_cache_trigger` | CREATE INDEX idx_agent_analytics_cache_trigger ON public.agent_analytics USING btree (user_id, date DESC) |
| `idx_agent_analytics_cta_demo` | CREATE INDEX idx_agent_analytics_cta_demo ON public.agent_analytics USING btree (cta_demo_clicks) WHERE (cta_demo_clicks > 0) |
| `idx_agent_analytics_cta_followup` | CREATE INDEX idx_agent_analytics_cta_followup ON public.agent_analytics USING btree (cta_followup_clicks) WHERE (cta_followup_clicks > 0) |
| `idx_agent_analytics_cta_human` | CREATE INDEX idx_agent_analytics_cta_human ON public.agent_analytics USING btree (cta_human_escalations) WHERE (cta_human_escalations > 0) |
| `idx_agent_analytics_cta_pricing` | CREATE INDEX idx_agent_analytics_cta_pricing ON public.agent_analytics USING btree (cta_pricing_clicks) WHERE (cta_pricing_clicks > 0) |
| `idx_agent_analytics_cta_sample` | CREATE INDEX idx_agent_analytics_cta_sample ON public.agent_analytics USING btree (cta_sample_clicks) WHERE (cta_sample_clicks > 0) |
| `idx_agent_analytics_date` | CREATE INDEX idx_agent_analytics_date ON public.agent_analytics USING btree (date) |
| `idx_agent_analytics_recent_activity` | CREATE INDEX idx_agent_analytics_recent_activity ON public.agent_analytics USING btree (user_id, date DESC, agent_id, total_calls, successful_calls) WHERE (hour IS NULL) |
| `idx_agent_analytics_recent_performance` | CREATE INDEX idx_agent_analytics_recent_performance ON public.agent_analytics USING btree (user_id, agent_id, date DESC, success_rate, conversion_rate) WHERE (hour IS NULL) |
| `idx_agent_analytics_total_cta` | CREATE INDEX idx_agent_analytics_total_cta ON public.agent_analytics USING btree (total_cta_interactions) WHERE (total_cta_interactions > 0) |
| `idx_agent_analytics_unique_agent_date_hour` | CREATE UNIQUE INDEX idx_agent_analytics_unique_agent_date_hour ON public.agent_analytics USING btree (agent_id, date, hour) |
| `idx_agent_analytics_user_date_cta` | CREATE INDEX idx_agent_analytics_user_date_cta ON public.agent_analytics USING btree (user_id, date, total_cta_interactions) |
| `idx_agent_analytics_user_date_daily` | CREATE INDEX idx_agent_analytics_user_date_daily ON public.agent_analytics USING btree (user_id, date DESC, agent_id) WHERE (hour IS NULL) |
| `idx_agent_analytics_user_date_hour` | CREATE INDEX idx_agent_analytics_user_date_hour ON public.agent_analytics USING btree (user_id, date DESC, hour) |
| `idx_agent_analytics_user_id` | CREATE INDEX idx_agent_analytics_user_id ON public.agent_analytics USING btree (user_id) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `agent_id` | `public.agents(id)` | NO ACTION | CASCADE |
| `user_id` | `public.users(id)` | NO ACTION | CASCADE |

### Triggers

#### trg_user_daily_rollup

- **Timing**: AFTER
- **Event**: INSERT OR UPDATE
- **Definition**:
```sql
CREATE TRIGGER trg_user_daily_rollup AFTER INSERT OR UPDATE ON public.agent_analytics FOR EACH ROW EXECUTE FUNCTION trg_user_daily_rollup()
```

#### update_agent_analytics_updated_at

- **Timing**: BEFORE
- **Event**: UPDATE
- **Definition**:
```sql
CREATE TRIGGER update_agent_analytics_updated_at BEFORE UPDATE ON public.agent_analytics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
```

**Current Row Count**: 53

---

## public.agents

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | uuid_generate_v4() | ✓ | ✓ |  |
| `user_id` | uuid | NO | - |  | ✓ |  |
| `name` | character varying(255) | NO | - |  |  |  |
| `agent_type` | character varying(50) | NO | 'call'::character varying |  |  |  |
| `is_active` | boolean | NO | true |  |  |  |
| `created_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `updated_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `description` | text | YES | - |  |  |  |
| `bolna_agent_id` | character varying(255) | NO | - |  | ✓ | Bolna.ai agent identifier for API integration |
| `system_prompt` | text | YES | - |  |  | Base system prompt fetched from Bolna API (editable by admin only) |
| `dynamic_information` | text | YES | - |  |  | User-configurable dynamic information appended to system prompt |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `agents_agent_type_check` | CHECK | CHECK (((agent_type)::text = ANY ((ARRAY['call'::character varying, 'chat'::character varying])::text[]))) |
| `agents_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| `agents_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `agents_bolna_agent_id_unique` | UNIQUE | UNIQUE (bolna_agent_id) |
| `agents_user_id_bolna_agent_id_key` | UNIQUE | UNIQUE (user_id, bolna_agent_id) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `agents_bolna_agent_id_unique` | CREATE UNIQUE INDEX agents_bolna_agent_id_unique ON public.agents USING btree (bolna_agent_id) |
| `agents_pkey` | CREATE UNIQUE INDEX agents_pkey ON public.agents USING btree (id) |
| `agents_user_id_bolna_agent_id_key` | CREATE UNIQUE INDEX agents_user_id_bolna_agent_id_key ON public.agents USING btree (user_id, bolna_agent_id) |
| `idx_agents_cache_trigger` | CREATE INDEX idx_agents_cache_trigger ON public.agents USING btree (user_id, updated_at DESC) |
| `idx_agents_description` | CREATE INDEX idx_agents_description ON public.agents USING gin (to_tsvector('english'::regconfig, description)) WHERE (description IS NOT NULL) |
| `idx_agents_name_lower` | CREATE INDEX idx_agents_name_lower ON public.agents USING btree (lower((name)::text)) |
| `idx_agents_user_id` | CREATE INDEX idx_agents_user_id ON public.agents USING btree (user_id) |
| `idx_agents_user_id_active` | CREATE INDEX idx_agents_user_id_active ON public.agents USING btree (user_id, is_active) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `user_id` | `public.users(id)` | NO ACTION | CASCADE |

### Triggers

#### update_agents_updated_at

- **Timing**: BEFORE
- **Event**: UPDATE
- **Definition**:
```sql
CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
```

**Current Row Count**: 6

---

## public.calendar_meetings

**Description**: Tracks Google Calendar meetings scheduled from AI call analysis. Supports auto-scheduling, rescheduling, and cancellation.

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | uuid_generate_v4() | ✓ | ✓ |  |
| `user_id` | uuid | NO | - |  | ✓ |  |
| `lead_analytics_id` | uuid | YES | - |  |  |  |
| `call_id` | uuid | YES | - |  |  |  |
| `contact_id` | uuid | YES | - |  |  |  |
| `google_event_id` | character varying(255) | NO | - |  | ✓ | Google Calendar event ID for API operations (update, cancel). Required for all Google Calendar operations. |
| `google_calendar_id` | character varying(255) | NO | 'primary'::character varying |  |  | Which Google Calendar to use (usually 'primary'). Allows multi-calendar support. |
| `meeting_title` | character varying(500) | NO | - |  |  | Meeting title format: "{lead_name} + {company_name} + Demo" |
| `meeting_description` | text | YES | - |  |  | Full lead context including: tags, reasoning, recording link, transcript, and AI analysis summary |
| `attendee_email` | character varying(255) | NO | - |  |  | Email to invite (prioritizes contact.email over lead_analytics.extracted_email) |
| `attendee_name` | character varying(255) | YES | - |  |  |  |
| `meeting_start_time` | timestamp with time zone | NO | - |  |  |  |
| `meeting_end_time` | timestamp with time zone | NO | - |  |  |  |
| `meeting_duration_minutes` | integer | YES | 30 |  |  |  |
| `timezone` | character varying(100) | YES | - |  |  |  |
| `status` | character varying(50) | YES | 'scheduled'::character varying |  |  | Lifecycle: scheduled (active), cancelled (user cancelled), rescheduled (moved to new time), completed (meeting happened) |
| `cancellation_reason` | text | YES | - |  |  |  |
| `rescheduled_from_meeting_id` | uuid | YES | - |  |  | If this is a rescheduled meeting, links back to the original meeting record for history tracking |
| `invite_email_sent` | boolean | YES | false |  |  | Whether initial meeting invite email was sent to user (with full lead context) |
| `invite_email_sent_at` | timestamp with time zone | YES | - |  |  |  |
| `reminder_email_sent` | boolean | YES | false |  |  |  |
| `reminder_email_sent_at` | timestamp with time zone | YES | - |  |  |  |
| `google_api_response` | jsonb | YES | - |  |  | Stores full Google Calendar API response for debugging and reference |
| `meeting_metadata` | jsonb | YES | - |  |  | Additional context: lead scores, tags, CTA interactions, smart notifications |
| `created_at` | timestamp with time zone | YES | now() |  |  |  |
| `updated_at` | timestamp with time zone | YES | now() |  |  |  |
| `created_by` | uuid | YES | - |  |  |  |
| `meeting_link` | text | YES | - |  |  | Google Meet/Hangout link for the meeting (e.g., https://meet.google.com/xxx-yyyy-zzz) |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `calendar_meetings_duration_positive` | CHECK | CHECK ((meeting_duration_minutes > 0)) |
| `calendar_meetings_status_check` | CHECK | CHECK (((status)::text = ANY ((ARRAY['scheduled'::character varying, 'cancelled'::character varying, 'rescheduled'::character varying, 'completed'::character varying])::text[]))) |
| `calendar_meetings_time_check` | CHECK | CHECK ((meeting_end_time > meeting_start_time)) |
| `calendar_meetings_call_id_fkey` | FOREIGN KEY | FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE SET NULL |
| `calendar_meetings_contact_id_fkey` | FOREIGN KEY | FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL |
| `calendar_meetings_created_by_fkey` | FOREIGN KEY | FOREIGN KEY (created_by) REFERENCES users(id) |
| `calendar_meetings_lead_analytics_id_fkey` | FOREIGN KEY | FOREIGN KEY (lead_analytics_id) REFERENCES lead_analytics(id) ON DELETE SET NULL |
| `calendar_meetings_rescheduled_from_meeting_id_fkey` | FOREIGN KEY | FOREIGN KEY (rescheduled_from_meeting_id) REFERENCES calendar_meetings(id) ON DELETE SET NULL |
| `calendar_meetings_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| `calendar_meetings_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `calendar_meetings_user_event_unique` | UNIQUE | UNIQUE (user_id, google_event_id) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `calendar_meetings_pkey` | CREATE UNIQUE INDEX calendar_meetings_pkey ON public.calendar_meetings USING btree (id) |
| `calendar_meetings_user_event_unique` | CREATE UNIQUE INDEX calendar_meetings_user_event_unique ON public.calendar_meetings USING btree (user_id, google_event_id) |
| `idx_calendar_meetings_call` | CREATE INDEX idx_calendar_meetings_call ON public.calendar_meetings USING btree (call_id) WHERE (call_id IS NOT NULL) |
| `idx_calendar_meetings_contact` | CREATE INDEX idx_calendar_meetings_contact ON public.calendar_meetings USING btree (contact_id) WHERE (contact_id IS NOT NULL) |
| `idx_calendar_meetings_google_event` | CREATE INDEX idx_calendar_meetings_google_event ON public.calendar_meetings USING btree (google_event_id) |
| `idx_calendar_meetings_lead_analytics` | CREATE INDEX idx_calendar_meetings_lead_analytics ON public.calendar_meetings USING btree (lead_analytics_id) WHERE (lead_analytics_id IS NOT NULL) |
| `idx_calendar_meetings_meeting_link` | CREATE INDEX idx_calendar_meetings_meeting_link ON public.calendar_meetings USING btree (meeting_link) WHERE (meeting_link IS NOT NULL) |
| `idx_calendar_meetings_start_time` | CREATE INDEX idx_calendar_meetings_start_time ON public.calendar_meetings USING btree (meeting_start_time) |
| `idx_calendar_meetings_status` | CREATE INDEX idx_calendar_meetings_status ON public.calendar_meetings USING btree (status) WHERE ((status)::text = 'scheduled'::text) |
| `idx_calendar_meetings_user` | CREATE INDEX idx_calendar_meetings_user ON public.calendar_meetings USING btree (user_id) |
| `idx_calendar_meetings_user_status_time` | CREATE INDEX idx_calendar_meetings_user_status_time ON public.calendar_meetings USING btree (user_id, status, meeting_start_time DESC) |
| `idx_calendar_meetings_user_upcoming` | CREATE INDEX idx_calendar_meetings_user_upcoming ON public.calendar_meetings USING btree (user_id, meeting_start_time, status) WHERE ((status)::text = 'scheduled'::text) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `call_id` | `public.calls(id)` | NO ACTION | SET NULL |
| `contact_id` | `public.contacts(id)` | NO ACTION | SET NULL |
| `created_by` | `public.users(id)` | NO ACTION | NO ACTION |
| `lead_analytics_id` | `public.lead_analytics(id)` | NO ACTION | SET NULL |
| `rescheduled_from_meeting_id` | `public.calendar_meetings(id)` | NO ACTION | SET NULL |
| `user_id` | `public.users(id)` | NO ACTION | CASCADE |

### Triggers

#### update_calendar_meetings_updated_at

- **Timing**: BEFORE
- **Event**: UPDATE
- **Definition**:
```sql
CREATE TRIGGER update_calendar_meetings_updated_at BEFORE UPDATE ON public.calendar_meetings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
```

**Current Row Count**: 0

---

## public.call_campaigns

**Description**: Campaign management for batch calling - User can only access their own campaigns

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | uuid_generate_v4() | ✓ | ✓ |  |
| `user_id` | uuid | NO | - |  |  |  |
| `name` | character varying(255) | NO | - |  |  |  |
| `description` | text | YES | - |  |  |  |
| `agent_id` | uuid | NO | - |  |  |  |
| `next_action` | text | NO | - |  |  | User-defined goal for this campaign (e.g., "Schedule demos", "Follow up on pricing") |
| `first_call_time` | time without time zone | NO | - |  |  | Daily start time for calls (recurring) |
| `last_call_time` | time without time zone | NO | - |  |  | Daily end time for calls (recurring) |
| `status` | character varying(20) | NO | 'draft'::character varying |  |  |  |
| `total_contacts` | integer | NO | 0 |  |  |  |
| `completed_calls` | integer | NO | 0 |  |  |  |
| `successful_calls` | integer | NO | 0 |  |  |  |
| `failed_calls` | integer | NO | 0 |  |  |  |
| `start_date` | date | NO | - |  |  |  |
| `end_date` | date | YES | - |  |  |  |
| `created_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `updated_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `started_at` | timestamp with time zone | YES | - |  |  |  |
| `completed_at` | timestamp with time zone | YES | - |  |  |  |
| `campaign_timezone` | character varying(50) | YES | - |  |  | Optional: Override timezone for this campaign. If NULL, uses user timezone |
| `use_custom_timezone` | boolean | YES | false |  |  | True if campaign uses custom timezone instead of user timezone |
| `max_retries` | integer | NO | 0 |  |  | Maximum number of auto-callback retries for busy/no-answer calls (0 = no retries, max 5) |
| `retry_interval_minutes` | integer | NO | 60 |  |  | Time gap between retry attempts in minutes |
| `retry_strategy` | character varying(20) | YES | 'simple'::character varying |  |  | Retry configuration mode: "simple" (fixed interval) or "custom" (per-retry schedule) |
| `custom_retry_schedule` | jsonb | YES | NULL |  |  | Custom retry schedule in JSON format: {"retries": [{"attempt": 1, "delay_minutes": 15}, ...]}. Only used when retry_strategy = "custom" |
| `phone_number_id` | uuid | YES | - |  |  | Optional foreign key to phone_numbers table for outbound caller ID |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `call_campaigns_max_retries_check` | CHECK | CHECK (((max_retries >= 0) AND (max_retries <= 5))) |
| `call_campaigns_retry_interval_minutes_check` | CHECK | CHECK (((retry_interval_minutes >= 1) AND (retry_interval_minutes <= 1440))) |
| `call_campaigns_status_check` | CHECK | CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'scheduled'::character varying, 'active'::character varying, 'paused'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[]))) |
| `call_campaigns_agent_id_fkey` | FOREIGN KEY | FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT |
| `call_campaigns_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| `call_campaigns_pkey` | PRIMARY KEY | PRIMARY KEY (id) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `call_campaigns_pkey` | CREATE UNIQUE INDEX call_campaigns_pkey ON public.call_campaigns USING btree (id) |
| `idx_call_campaigns_agent_id` | CREATE INDEX idx_call_campaigns_agent_id ON public.call_campaigns USING btree (agent_id) |
| `idx_call_campaigns_start_date` | CREATE INDEX idx_call_campaigns_start_date ON public.call_campaigns USING btree (start_date) WHERE ((status)::text = ANY ((ARRAY['scheduled'::character varying, 'active'::character varying])::text[])) |
| `idx_call_campaigns_status` | CREATE INDEX idx_call_campaigns_status ON public.call_campaigns USING btree (status) |
| `idx_call_campaigns_user_id` | CREATE INDEX idx_call_campaigns_user_id ON public.call_campaigns USING btree (user_id) |
| `idx_campaigns_timezone` | CREATE INDEX idx_campaigns_timezone ON public.call_campaigns USING btree (campaign_timezone) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `agent_id` | `public.agents(id)` | NO ACTION | RESTRICT |
| `user_id` | `public.users(id)` | NO ACTION | CASCADE |

### Triggers

#### trigger_update_call_campaigns_updated_at

- **Timing**: BEFORE
- **Event**: UPDATE
- **Definition**:
```sql
CREATE TRIGGER trigger_update_call_campaigns_updated_at BEFORE UPDATE ON public.call_campaigns FOR EACH ROW EXECUTE FUNCTION update_call_campaigns_updated_at()
```

**Current Row Count**: 14

---

## public.call_queue

**Description**: Call queue with time-based scheduling - User can only access their own queue items

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | uuid_generate_v4() | ✓ | ✓ |  |
| `user_id` | uuid | NO | - |  | ✓ |  |
| `campaign_id` | uuid | YES | - |  | ✓ |  |
| `agent_id` | uuid | NO | - |  |  |  |
| `contact_id` | uuid | NO | - |  | ✓ |  |
| `phone_number` | character varying(50) | NO | - |  |  |  |
| `contact_name` | character varying(255) | YES | - |  |  |  |
| `user_data` | jsonb | NO | '{}'::jsonb |  |  | JSON payload for Bolna API containing summary and next_action |
| `status` | character varying(20) | NO | 'queued'::character varying |  |  |  |
| `priority` | integer | NO | 0 |  |  | Priority score (contacts with names get higher priority) |
| `position` | integer | NO | - |  |  | FIFO position within user queue |
| `scheduled_for` | timestamp with time zone | NO | - |  |  | Exact timestamp when this call should be initiated |
| `started_at` | timestamp with time zone | YES | - |  |  |  |
| `completed_at` | timestamp with time zone | YES | - |  |  |  |
| `call_id` | uuid | YES | - |  |  |  |
| `failure_reason` | text | YES | - |  |  |  |
| `last_system_allocation_at` | timestamp with time zone | YES | - |  |  | Used for round-robin system-level concurrency allocation |
| `created_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `updated_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `call_type` | character varying(20) | NO | 'campaign'::character varying |  |  | Type of call: direct (user-initiated, high priority) or campaign (automated, standard priority) |
| `retry_count` | integer | NO | 0 |  |  | Number of retry attempts made for this contact |
| `original_queue_id` | uuid | YES | - |  |  | Reference to original queue item if this is a retry |
| `last_call_outcome` | character varying(20) | YES | - |  |  | Outcome of last call attempt (busy, no-answer, failed) |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `call_queue_call_type_check` | CHECK | CHECK (((call_type)::text = ANY ((ARRAY['direct'::character varying, 'campaign'::character varying])::text[]))) |
| `call_queue_campaign_id_check` | CHECK | CHECK (((((call_type)::text = 'campaign'::text) AND (campaign_id IS NOT NULL)) OR (((call_type)::text = 'direct'::text) AND (campaign_id IS NULL)))) |
| `call_queue_retry_count_check` | CHECK | CHECK ((retry_count >= 0)) |
| `call_queue_status_check` | CHECK | CHECK (((status)::text = ANY ((ARRAY['queued'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying, 'skipped'::character varying])::text[]))) |
| `call_queue_agent_id_fkey` | FOREIGN KEY | FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT |
| `call_queue_call_id_fkey` | FOREIGN KEY | FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE SET NULL |
| `call_queue_campaign_id_fkey` | FOREIGN KEY | FOREIGN KEY (campaign_id) REFERENCES call_campaigns(id) ON DELETE CASCADE |
| `call_queue_contact_id_fkey` | FOREIGN KEY | FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE |
| `call_queue_contact_id_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (contact_id, user_id) REFERENCES contacts(id, user_id) ON DELETE CASCADE |
| `call_queue_original_queue_id_fkey` | FOREIGN KEY | FOREIGN KEY (original_queue_id) REFERENCES call_queue(id) ON DELETE SET NULL |
| `call_queue_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| `call_queue_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `call_queue_id_user_id_key` | UNIQUE | UNIQUE (id, user_id) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `call_queue_id_user_id_key` | CREATE UNIQUE INDEX call_queue_id_user_id_key ON public.call_queue USING btree (id, user_id) |
| `call_queue_pkey` | CREATE UNIQUE INDEX call_queue_pkey ON public.call_queue USING btree (id) |
| `idx_call_queue_call_type` | CREATE INDEX idx_call_queue_call_type ON public.call_queue USING btree (user_id, call_type, status) |
| `idx_call_queue_campaign_contact_unique` | CREATE UNIQUE INDEX idx_call_queue_campaign_contact_unique ON public.call_queue USING btree (campaign_id, contact_id) WHERE (((call_type)::text = 'campaign'::text) AND ((status)::text = ANY ((ARRAY['queued'::character varying, 'processing'::character varying])::text[]))) |
| `idx_call_queue_campaign_status` | CREATE INDEX idx_call_queue_campaign_status ON public.call_queue USING btree (campaign_id, status) |
| `idx_call_queue_priority_position` | CREATE INDEX idx_call_queue_priority_position ON public.call_queue USING btree (user_id, priority DESC, "position") WHERE ((status)::text = 'queued'::text) |
| `idx_call_queue_retry_count` | CREATE INDEX idx_call_queue_retry_count ON public.call_queue USING btree (campaign_id, retry_count) WHERE (((status)::text = 'queued'::text) AND (retry_count > 0)) |
| `idx_call_queue_round_robin` | CREATE INDEX idx_call_queue_round_robin ON public.call_queue USING btree (user_id, last_system_allocation_at) WHERE ((status)::text = 'queued'::text) |
| `idx_call_queue_scheduled_for` | CREATE INDEX idx_call_queue_scheduled_for ON public.call_queue USING btree (scheduled_for) WHERE ((status)::text = 'queued'::text) |
| `idx_call_queue_type_priority` | CREATE INDEX idx_call_queue_type_priority ON public.call_queue USING btree (user_id, call_type, priority DESC, "position") WHERE ((status)::text = 'queued'::text) |
| `idx_call_queue_user_status` | CREATE INDEX idx_call_queue_user_status ON public.call_queue USING btree (user_id, status) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `agent_id` | `public.agents(id)` | NO ACTION | RESTRICT |
| `call_id` | `public.calls(id)` | NO ACTION | SET NULL |
| `campaign_id` | `public.call_campaigns(id)` | NO ACTION | CASCADE |
| `contact_id` | `public.contacts(id)` | NO ACTION | CASCADE |
| `contact_id` | `public.contacts(id)` | NO ACTION | CASCADE |
| `contact_id` | `public.contacts(user_id)` | NO ACTION | CASCADE |
| `user_id` | `public.contacts(id)` | NO ACTION | CASCADE |
| `user_id` | `public.contacts(user_id)` | NO ACTION | CASCADE |
| `original_queue_id` | `public.call_queue(id)` | NO ACTION | SET NULL |
| `user_id` | `public.users(id)` | NO ACTION | CASCADE |

### Triggers

#### trigger_update_call_queue_updated_at

- **Timing**: BEFORE
- **Event**: UPDATE
- **Definition**:
```sql
CREATE TRIGGER trigger_update_call_queue_updated_at BEFORE UPDATE ON public.call_queue FOR EACH ROW EXECUTE FUNCTION update_call_queue_updated_at()
```

#### trigger_update_campaign_statistics

- **Timing**: AFTER
- **Event**: UPDATE
- **Definition**:
```sql
CREATE TRIGGER trigger_update_campaign_statistics AFTER UPDATE OF status ON public.call_queue FOR EACH ROW EXECUTE FUNCTION update_campaign_statistics()
```

#### trigger_update_campaign_statistics_on_delete

- **Timing**: BEFORE
- **Event**: DELETE
- **Definition**:
```sql
CREATE TRIGGER trigger_update_campaign_statistics_on_delete BEFORE DELETE ON public.call_queue FOR EACH ROW EXECUTE FUNCTION update_campaign_statistics_on_delete()
```

**Current Row Count**: 0

---

## public.calls

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | uuid_generate_v4() | ✓ | ✓ |  |
| `agent_id` | uuid | NO | - |  |  |  |
| `user_id` | uuid | NO | - |  | ✓ |  |
| `contact_id` | uuid | YES | - |  |  |  |
| `phone_number` | character varying(50) | NO | - |  |  |  |
| `duration_minutes` | integer | NO | 0 |  |  | Call duration rounded up to next minute for billing purposes |
| `credits_used` | integer | NO | 0 |  |  |  |
| `status` | character varying(50) | NO | 'in_progress'::character varying |  |  |  |
| `recording_url` | text | YES | - |  |  |  |
| `metadata` | jsonb | NO | '{}'::jsonb |  |  |  |
| `created_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `completed_at` | timestamp with time zone | YES | - |  |  |  |
| `call_source` | character varying(20) | NO | 'phone'::character varying |  |  | Source of the call: direct (user-initiated via contact list) or campaign (automated via campaign system) |
| `caller_name` | character varying(255) | YES | - |  |  | Name of the caller if available from webhook data |
| `caller_email` | character varying(255) | YES | - |  |  | Email of the caller if available from webhook data |
| `lead_type` | character varying(20) | YES | 'outbound'::character varying |  |  | Type of lead: inbound (phone calls) or outbound (internet/proactive calls) |
| `duration_seconds` | integer | YES | 0 |  |  | Exact call duration in seconds for precise display |
| `updated_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `bolna_execution_id` | character varying(255) | NO | - |  | ✓ | Bolna.ai execution/call identifier for tracking |
| `call_lifecycle_status` | character varying(20) | YES | 'initiated'::character varying |  |  | Tracks call through 5-stage webhook lifecycle: initiated → ringing → in-progress → call-disconnected → completed. Failed calls: initiated → ringing → no-answer/busy |
| `hangup_by` | character varying(20) | YES | - |  |  |  |
| `hangup_reason` | text | YES | - |  |  |  |
| `hangup_provider_code` | integer | YES | - |  |  |  |
| `ringing_started_at` | timestamp with time zone | YES | - |  |  |  |
| `call_answered_at` | timestamp with time zone | YES | - |  |  |  |
| `call_disconnected_at` | timestamp with time zone | YES | - |  |  |  |
| `transcript_id` | uuid | YES | - |  |  | Foreign key to transcripts table. Transcript saved when webhook status = "call-disconnected" (stage 4) |
| `bolna_conversation_id` | character varying(255) | YES | - |  | ✓ | Bolna AI conversation ID for tracking conversation state |
| `campaign_id` | uuid | YES | - |  |  |  |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `calls_credits_used_check` | CHECK | CHECK ((credits_used >= 0)) |
| `calls_duration_minutes_check` | CHECK | CHECK ((duration_minutes >= 0)) |
| `calls_lead_type_check` | CHECK | CHECK (((lead_type)::text = ANY ((ARRAY['inbound'::character varying, 'outbound'::character varying])::text[]))) |
| `calls_lifecycle_status_check` | CHECK | CHECK (((call_lifecycle_status)::text = ANY ((ARRAY['initiated'::character varying, 'ringing'::character varying, 'in-progress'::character varying, 'call-disconnected'::character varying, 'completed'::character varying, 'no-answer'::character varying, 'busy'::character varying, 'failed'::character varying])::text[]))) |
| `calls_status_check` | CHECK | CHECK (((status)::text = ANY ((ARRAY['completed'::character varying, 'failed'::character varying, 'in_progress'::character varying, 'cancelled'::character varying])::text[]))) |
| `chk_call_source` | CHECK | CHECK (((call_source)::text = ANY ((ARRAY['phone'::character varying, 'internet'::character varying, 'unknown'::character varying])::text[]))) |
| `calls_agent_id_fkey` | FOREIGN KEY | FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE |
| `calls_campaign_id_fkey` | FOREIGN KEY | FOREIGN KEY (campaign_id) REFERENCES call_campaigns(id) ON DELETE SET NULL |
| `calls_contact_id_fkey` | FOREIGN KEY | FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL |
| `calls_transcript_id_fkey` | FOREIGN KEY | FOREIGN KEY (transcript_id) REFERENCES transcripts(id) ON DELETE SET NULL |
| `calls_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| `calls_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `calls_bolna_execution_id_unique` | UNIQUE | UNIQUE (bolna_execution_id) |
| `uk_calls_id_user_id` | UNIQUE | UNIQUE (id, user_id) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `calls_bolna_conversation_id_unique` | CREATE UNIQUE INDEX calls_bolna_conversation_id_unique ON public.calls USING btree (bolna_conversation_id) WHERE (bolna_conversation_id IS NOT NULL) |
| `calls_bolna_execution_id_unique` | CREATE UNIQUE INDEX calls_bolna_execution_id_unique ON public.calls USING btree (bolna_execution_id) |
| `calls_pkey` | CREATE UNIQUE INDEX calls_pkey ON public.calls USING btree (id) |
| `idx_calls_agent_performance` | CREATE INDEX idx_calls_agent_performance ON public.calls USING btree (agent_id, user_id, created_at DESC, status, duration_minutes, credits_used) |
| `idx_calls_bolna_execution_id_unique` | CREATE UNIQUE INDEX idx_calls_bolna_execution_id_unique ON public.calls USING btree (bolna_execution_id) WHERE (bolna_execution_id IS NOT NULL) |
| `idx_calls_cache_trigger` | CREATE INDEX idx_calls_cache_trigger ON public.calls USING btree (user_id, created_at DESC) |
| `idx_calls_call_source` | CREATE INDEX idx_calls_call_source ON public.calls USING btree (user_id, call_source) |
| `idx_calls_caller_email` | CREATE INDEX idx_calls_caller_email ON public.calls USING btree (caller_email) WHERE (caller_email IS NOT NULL) |
| `idx_calls_caller_name` | CREATE INDEX idx_calls_caller_name ON public.calls USING btree (caller_name) WHERE (caller_name IS NOT NULL) |
| `idx_calls_campaign_id` | CREATE INDEX idx_calls_campaign_id ON public.calls USING btree (campaign_id) WHERE (campaign_id IS NOT NULL) |
| `idx_calls_contact_id` | CREATE INDEX idx_calls_contact_id ON public.calls USING btree (contact_id) |
| `idx_calls_disconnected_at` | CREATE INDEX idx_calls_disconnected_at ON public.calls USING btree (call_disconnected_at) WHERE (call_disconnected_at IS NOT NULL) |
| `idx_calls_duration_seconds` | CREATE INDEX idx_calls_duration_seconds ON public.calls USING btree (duration_seconds) |
| `idx_calls_kpi_covering` | CREATE INDEX idx_calls_kpi_covering ON public.calls USING btree (user_id, status, created_at) INCLUDE (duration_minutes, credits_used, phone_number) |
| `idx_calls_lead_analytics_join` | CREATE INDEX idx_calls_lead_analytics_join ON public.calls USING btree (id, user_id, created_at DESC, status) |
| `idx_calls_lead_type` | CREATE INDEX idx_calls_lead_type ON public.calls USING btree (lead_type) |
| `idx_calls_lifecycle_status` | CREATE INDEX idx_calls_lifecycle_status ON public.calls USING btree (call_lifecycle_status) |
| `idx_calls_phone_number` | CREATE INDEX idx_calls_phone_number ON public.calls USING btree (phone_number) |
| `idx_calls_recent_activity` | CREATE INDEX idx_calls_recent_activity ON public.calls USING btree (user_id, created_at DESC, status, phone_number) |
| `idx_calls_source_created_at` | CREATE INDEX idx_calls_source_created_at ON public.calls USING btree (call_source, created_at) |
| `idx_calls_source_user` | CREATE INDEX idx_calls_source_user ON public.calls USING btree (call_source, user_id) |
| `idx_calls_transcript_id` | CREATE INDEX idx_calls_transcript_id ON public.calls USING btree (transcript_id) WHERE (transcript_id IS NOT NULL) |
| `idx_calls_user_agent_created_status` | CREATE INDEX idx_calls_user_agent_created_status ON public.calls USING btree (user_id, agent_id, created_at DESC, status) |
| `idx_calls_user_created_status` | CREATE INDEX idx_calls_user_created_status ON public.calls USING btree (user_id, created_at DESC, status) |
| `idx_calls_user_created_tz` | CREATE INDEX idx_calls_user_created_tz ON public.calls USING btree (user_id, created_at) |
| `idx_calls_user_duration` | CREATE INDEX idx_calls_user_duration ON public.calls USING btree (user_id, duration_seconds) |
| `idx_calls_user_failed_recent` | CREATE INDEX idx_calls_user_failed_recent ON public.calls USING btree (user_id, created_at DESC) WHERE ((status)::text = ANY ((ARRAY['failed'::character varying, 'cancelled'::character varying])::text[])) |
| `idx_calls_user_id_created_at` | CREATE INDEX idx_calls_user_id_created_at ON public.calls USING btree (user_id, created_at) |
| `idx_calls_user_phone` | CREATE INDEX idx_calls_user_phone ON public.calls USING btree (user_id, phone_number) |
| `idx_calls_user_source_status` | CREATE INDEX idx_calls_user_source_status ON public.calls USING btree (user_id, call_source, status) |
| `idx_calls_user_source_status_created` | CREATE INDEX idx_calls_user_source_status_created ON public.calls USING btree (user_id, call_source, status, created_at) |
| `idx_calls_user_status_created` | CREATE INDEX idx_calls_user_status_created ON public.calls USING btree (user_id, status, created_at DESC) |
| `idx_calls_user_successful_recent` | CREATE INDEX idx_calls_user_successful_recent ON public.calls USING btree (user_id, created_at DESC, duration_minutes, credits_used) WHERE ((status)::text = 'completed'::text) |
| `uk_calls_id_user_id` | CREATE UNIQUE INDEX uk_calls_id_user_id ON public.calls USING btree (id, user_id) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `agent_id` | `public.agents(id)` | NO ACTION | CASCADE |
| `campaign_id` | `public.call_campaigns(id)` | NO ACTION | SET NULL |
| `contact_id` | `public.contacts(id)` | NO ACTION | SET NULL |
| `transcript_id` | `public.transcripts(id)` | NO ACTION | SET NULL |
| `user_id` | `public.users(id)` | NO ACTION | CASCADE |

### Triggers

#### cleanup_active_calls_on_status_change

- **Timing**: AFTER
- **Event**: UPDATE
- **Definition**:
```sql
CREATE TRIGGER cleanup_active_calls_on_status_change AFTER UPDATE ON public.calls FOR EACH ROW EXECUTE FUNCTION trigger_cleanup_active_calls()
```

#### trg_calls_daily_analytics

- **Timing**: AFTER
- **Event**: INSERT OR UPDATE
- **Definition**:
```sql
CREATE TRIGGER trg_calls_daily_analytics AFTER INSERT OR UPDATE OF status ON public.calls FOR EACH ROW EXECUTE FUNCTION trg_calls_daily_analytics()
```

#### update_calls_updated_at

- **Timing**: BEFORE
- **Event**: UPDATE
- **Definition**:
```sql
CREATE TRIGGER update_calls_updated_at BEFORE UPDATE ON public.calls FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
```

**Current Row Count**: 22

---

## public.contacts

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | uuid_generate_v4() | ✓ | ✓ |  |
| `user_id` | uuid | NO | - |  | ✓ |  |
| `name` | character varying(255) | NO | - |  |  |  |
| `phone_number` | character varying(50) | NO | - |  | ✓ |  |
| `email` | character varying(255) | YES | - |  |  |  |
| `company` | character varying(255) | YES | - |  |  |  |
| `notes` | text | YES | - |  |  |  |
| `created_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `updated_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `auto_created_from_call_id` | uuid | YES | - |  |  | References the call that triggered auto-creation of this contact |
| `is_auto_created` | boolean | NO | false |  |  | Flag indicating if this contact was automatically created from a call |
| `auto_creation_source` | character varying(50) | YES | NULL::character varying |  |  | Source of contact creation: webhook (inbound call), manual (form), bulk_upload (excel) |
| `is_customer` | boolean | NO | false |  |  | Flag indicating if this contact has been converted to a customer |
| `not_connected` | integer | NO | 0 |  |  | Count of missed/unanswered calls for this contact (fetched from Twilio API) |
| `tags` | text[] | NO | '{}'::text[] |  |  | Array of custom user-created tags for contact categorization and filtering |
| `last_contact_at` | timestamp with time zone | YES | - |  |  | Timestamp of last call interaction, auto-updated from calls table |
| `call_attempted_busy` | integer | NO | 0 |  |  | Counter for number of calls that resulted in busy status, auto-incremented |
| `call_attempted_no_answer` | integer | NO | 0 |  |  | Counter for number of calls that resulted in no-answer status, auto-incremented |
| `city` | character varying(255) | YES | - |  |  | City of the contact (optional) |
| `country` | character varying(255) | YES | - |  |  | Country of the contact (optional) |
| `business_context` | text | YES | - |  |  | Industry/sector-level high-level description of the contact business (optional) |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `contacts_auto_creation_source_check` | CHECK | CHECK (((auto_creation_source)::text = ANY ((ARRAY['webhook'::character varying, 'manual'::character varying, 'bulk_upload'::character varying])::text[]))) |
| `contacts_call_attempted_busy_check` | CHECK | CHECK ((call_attempted_busy >= 0)) |
| `contacts_call_attempted_no_answer_check` | CHECK | CHECK ((call_attempted_no_answer >= 0)) |
| `contacts_auto_created_from_call_id_fkey` | FOREIGN KEY | FOREIGN KEY (auto_created_from_call_id) REFERENCES calls(id) ON DELETE SET NULL |
| `contacts_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| `contacts_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `contacts_id_user_id_unique` | UNIQUE | UNIQUE (id, user_id) |
| `contacts_user_id_phone_number_key` | UNIQUE | UNIQUE (user_id, phone_number) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `contacts_id_user_id_unique` | CREATE UNIQUE INDEX contacts_id_user_id_unique ON public.contacts USING btree (id, user_id) |
| `contacts_pkey` | CREATE UNIQUE INDEX contacts_pkey ON public.contacts USING btree (id) |
| `contacts_user_id_phone_number_key` | CREATE UNIQUE INDEX contacts_user_id_phone_number_key ON public.contacts USING btree (user_id, phone_number) |
| `idx_contacts_auto_created` | CREATE INDEX idx_contacts_auto_created ON public.contacts USING btree (user_id, is_auto_created) WHERE (is_auto_created = true) |
| `idx_contacts_auto_created_from_call` | CREATE INDEX idx_contacts_auto_created_from_call ON public.contacts USING btree (auto_created_from_call_id) WHERE (auto_created_from_call_id IS NOT NULL) |
| `idx_contacts_call_attempts` | CREATE INDEX idx_contacts_call_attempts ON public.contacts USING btree (call_attempted_busy, call_attempted_no_answer) |
| `idx_contacts_city` | CREATE INDEX idx_contacts_city ON public.contacts USING btree (city) WHERE (city IS NOT NULL) |
| `idx_contacts_city_country` | CREATE INDEX idx_contacts_city_country ON public.contacts USING btree (city, country) WHERE ((city IS NOT NULL) OR (country IS NOT NULL)) |
| `idx_contacts_country` | CREATE INDEX idx_contacts_country ON public.contacts USING btree (country) WHERE (country IS NOT NULL) |
| `idx_contacts_is_customer` | CREATE INDEX idx_contacts_is_customer ON public.contacts USING btree (user_id, is_customer) |
| `idx_contacts_last_contact_at` | CREATE INDEX idx_contacts_last_contact_at ON public.contacts USING btree (last_contact_at DESC NULLS LAST) |
| `idx_contacts_name_lower` | CREATE INDEX idx_contacts_name_lower ON public.contacts USING btree (lower((name)::text)) |
| `idx_contacts_not_connected` | CREATE INDEX idx_contacts_not_connected ON public.contacts USING btree (not_connected) WHERE (not_connected > 0) |
| `idx_contacts_phone_number` | CREATE INDEX idx_contacts_phone_number ON public.contacts USING btree (phone_number) |
| `idx_contacts_source` | CREATE INDEX idx_contacts_source ON public.contacts USING btree (auto_creation_source) WHERE (auto_creation_source IS NOT NULL) |
| `idx_contacts_tags` | CREATE INDEX idx_contacts_tags ON public.contacts USING gin (tags) |
| `idx_contacts_user_id` | CREATE INDEX idx_contacts_user_id ON public.contacts USING btree (user_id) |
| `idx_contacts_user_id_phone` | CREATE INDEX idx_contacts_user_id_phone ON public.contacts USING btree (user_id, phone_number) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `auto_created_from_call_id` | `public.calls(id)` | NO ACTION | SET NULL |
| `user_id` | `public.users(id)` | NO ACTION | CASCADE |

### Triggers

#### update_contacts_updated_at

- **Timing**: BEFORE
- **Event**: UPDATE
- **Definition**:
```sql
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
```

**Current Row Count**: 8

---

## public.credit_transactions

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | uuid_generate_v4() | ✓ | ✓ |  |
| `user_id` | uuid | NO | - |  |  |  |
| `type` | character varying(50) | NO | - |  |  |  |
| `amount` | integer | NO | - |  |  |  |
| `balance_after` | integer | NO | - |  |  |  |
| `description` | text | NO | - |  |  |  |
| `stripe_payment_id` | character varying(255) | YES | - |  |  |  |
| `call_id` | uuid | YES | - |  |  |  |
| `created_by` | uuid | YES | - |  |  |  |
| `created_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `credit_transactions_balance_after_check` | CHECK | CHECK ((balance_after >= 0)) |
| `credit_transactions_type_check` | CHECK | CHECK (((type)::text = ANY ((ARRAY['purchase'::character varying, 'usage'::character varying, 'bonus'::character varying, 'admin_adjustment'::character varying, 'refund'::character varying])::text[]))) |
| `credit_transactions_call_id_fkey` | FOREIGN KEY | FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE SET NULL |
| `credit_transactions_created_by_fkey` | FOREIGN KEY | FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL |
| `credit_transactions_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| `credit_transactions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `credit_transactions_pkey` | CREATE UNIQUE INDEX credit_transactions_pkey ON public.credit_transactions USING btree (id) |
| `idx_credit_transactions_created_at` | CREATE INDEX idx_credit_transactions_created_at ON public.credit_transactions USING btree (created_at) |
| `idx_credit_transactions_stripe_payment_id` | CREATE INDEX idx_credit_transactions_stripe_payment_id ON public.credit_transactions USING btree (stripe_payment_id) |
| `idx_credit_transactions_type` | CREATE INDEX idx_credit_transactions_type ON public.credit_transactions USING btree (type) |
| `idx_credit_transactions_user_id` | CREATE INDEX idx_credit_transactions_user_id ON public.credit_transactions USING btree (user_id) |
| `idx_credit_transactions_user_id_created_at` | CREATE INDEX idx_credit_transactions_user_id_created_at ON public.credit_transactions USING btree (user_id, created_at) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `call_id` | `public.calls(id)` | NO ACTION | SET NULL |
| `created_by` | `public.users(id)` | NO ACTION | SET NULL |
| `user_id` | `public.users(id)` | NO ACTION | CASCADE |

**Current Row Count**: 13

---

## public.customers

**Description**: Converted customers with their details and status

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | gen_random_uuid() | ✓ | ✓ |  |
| `user_id` | uuid | NO | - |  |  |  |
| `contact_id` | uuid | NO | - |  |  |  |
| `customer_reference_number` | character varying(50) | NO | - |  | ✓ | Unique customer reference number (CUST-YYYY-NNNN) |
| `name` | character varying(255) | NO | - |  |  |  |
| `email` | character varying(255) | YES | - |  |  |  |
| `phone` | character varying(50) | YES | - |  |  |  |
| `company` | character varying(255) | YES | - |  |  |  |
| `status` | character varying(50) | NO | 'Active'::character varying |  |  | Customer status: Active, Inactive, Churned, On Hold |
| `conversion_date` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  | Date when lead was converted to customer |
| `original_lead_source` | character varying(100) | YES | - |  |  | Original source where the lead came from |
| `assigned_sales_rep` | character varying(255) | YES | - |  |  | Sales representative assigned to this customer |
| `last_interaction_date` | timestamp with time zone | YES | - |  |  |  |
| `notes` | text | YES | - |  |  |  |
| `created_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `updated_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `customers_status_check` | CHECK | CHECK (((status)::text = ANY ((ARRAY['Active'::character varying, 'Inactive'::character varying, 'Churned'::character varying, 'On Hold'::character varying])::text[]))) |
| `customers_contact_id_fkey` | FOREIGN KEY | FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE |
| `customers_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| `customers_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `customers_customer_reference_number_key` | UNIQUE | UNIQUE (customer_reference_number) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `customers_customer_reference_number_key` | CREATE UNIQUE INDEX customers_customer_reference_number_key ON public.customers USING btree (customer_reference_number) |
| `customers_pkey` | CREATE UNIQUE INDEX customers_pkey ON public.customers USING btree (id) |
| `idx_customers_assigned_sales_rep` | CREATE INDEX idx_customers_assigned_sales_rep ON public.customers USING btree (assigned_sales_rep) |
| `idx_customers_contact_id` | CREATE INDEX idx_customers_contact_id ON public.customers USING btree (contact_id) |
| `idx_customers_conversion_date` | CREATE INDEX idx_customers_conversion_date ON public.customers USING btree (conversion_date) |
| `idx_customers_reference_number` | CREATE INDEX idx_customers_reference_number ON public.customers USING btree (customer_reference_number) |
| `idx_customers_status` | CREATE INDEX idx_customers_status ON public.customers USING btree (status) |
| `idx_customers_user_id` | CREATE INDEX idx_customers_user_id ON public.customers USING btree (user_id) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `contact_id` | `public.contacts(id)` | NO ACTION | CASCADE |
| `user_id` | `public.users(id)` | NO ACTION | CASCADE |

### Triggers

#### trigger_generate_customer_reference

- **Timing**: BEFORE
- **Event**: INSERT
- **Definition**:
```sql
CREATE TRIGGER trigger_generate_customer_reference BEFORE INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION generate_customer_reference()
```

#### update_customers_updated_at

- **Timing**: BEFORE
- **Event**: UPDATE
- **Definition**:
```sql
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
```

**Current Row Count**: 0

---

## public.email_campaigns

**Description**: Manages batch email campaigns with scheduling

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | gen_random_uuid() | ✓ | ✓ |  |
| `user_id` | uuid | NO | - |  | ✓ | Multi-tenant isolation |
| `name` | character varying(255) | NO | - |  |  | Campaign name |
| `description` | text | YES | - |  |  | Campaign description |
| `subject` | text | NO | - |  |  | Email subject template |
| `body_html` | text | YES | - |  |  | HTML email body template |
| `body_text` | text | YES | - |  |  | Plain text email body template |
| `status` | character varying(20) | NO | 'draft'::character varying |  |  | Campaign status: draft, scheduled, active, paused, completed, cancelled |
| `total_contacts` | integer | NO | 0 |  |  | Total number of contacts in campaign |
| `completed_emails` | integer | NO | 0 |  |  | Number of emails sent |
| `successful_emails` | integer | NO | 0 |  |  | Number of successfully delivered emails |
| `failed_emails` | integer | NO | 0 |  |  | Number of failed emails |
| `opened_emails` | integer | NO | 0 |  |  | Number of opened emails |
| `start_date` | date | NO | - |  |  | Campaign start date |
| `end_date` | date | YES | - |  |  | Campaign end date |
| `scheduled_at` | timestamp with time zone | YES | - |  |  | When to start sending emails |
| `created_at` | timestamp with time zone | NO | now() |  |  |  |
| `updated_at` | timestamp with time zone | NO | now() |  |  |  |
| `started_at` | timestamp with time zone | YES | - |  |  | When campaign actually started |
| `completed_at` | timestamp with time zone | YES | - |  |  | When campaign completed |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `email_campaigns_status_check` | CHECK | CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'scheduled'::character varying, 'active'::character varying, 'paused'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[]))) |
| `email_campaigns_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| `email_campaigns_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `email_campaigns_id_user_id_key` | UNIQUE | UNIQUE (id, user_id) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `email_campaigns_pkey` | CREATE UNIQUE INDEX email_campaigns_pkey ON public.email_campaigns USING btree (id) |
| `email_campaigns_id_user_id_key` | CREATE UNIQUE INDEX email_campaigns_id_user_id_key ON public.email_campaigns USING btree (id, user_id) |
| `idx_email_campaigns_user_id` | CREATE INDEX idx_email_campaigns_user_id ON public.email_campaigns USING btree (user_id) |
| `idx_email_campaigns_status` | CREATE INDEX idx_email_campaigns_status ON public.email_campaigns USING btree (status) |
| `idx_email_campaigns_start_date` | CREATE INDEX idx_email_campaigns_start_date ON public.email_campaigns USING btree (start_date) WHERE ((status)::text = ANY ((ARRAY['scheduled'::character varying, 'active'::character varying])::text[])) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `user_id` | `public.users(id)` | NO ACTION | CASCADE |

**Current Row Count**: 0

---

## public.emails

**Description**: Tracks all emails sent to contacts, including campaign emails

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | gen_random_uuid() | ✓ | ✓ |  |
| `user_id` | uuid | NO | - |  | ✓ | Multi-tenant isolation |
| `contact_id` | uuid | YES | - |  |  | Link to contact (nullable for external recipients) |
| `campaign_id` | uuid | YES | - |  |  | Link to email campaign if part of campaign |
| `from_email` | character varying(255) | NO | - |  |  | Sender email address |
| `from_name` | character varying(255) | YES | - |  |  | Sender name |
| `to_email` | character varying(255) | NO | - |  |  | Recipient email address |
| `to_name` | character varying(255) | YES | - |  |  | Recipient name |
| `cc_emails` | text[] | YES | - |  |  | Array of CC email addresses |
| `bcc_emails` | text[] | YES | - |  |  | Array of BCC email addresses |
| `subject` | text | NO | - |  |  | Email subject |
| `body_html` | text | YES | - |  |  | HTML email body |
| `body_text` | text | YES | - |  |  | Plain text email body |
| `has_attachments` | boolean | YES | false |  |  | Whether email has attachments |
| `attachment_count` | integer | YES | 0 |  |  | Number of attachments |
| `status` | character varying(50) | YES | 'sent'::character varying |  |  | Email delivery status: sent, delivered, opened, bounced, failed |
| `sent_at` | timestamp with time zone | YES | now() |  |  | When email was sent |
| `delivered_at` | timestamp with time zone | YES | - |  |  | When email was delivered |
| `opened_at` | timestamp with time zone | YES | - |  |  | When email was opened |
| `bounced_at` | timestamp with time zone | YES | - |  |  | When email bounced |
| `failed_at` | timestamp with time zone | YES | - |  |  | When email failed |
| `external_message_id` | character varying(500) | YES | - |  |  | ZeptoMail or other provider message ID |
| `error_message` | text | YES | - |  |  | Error message if failed |
| `created_at` | timestamp with time zone | YES | now() |  |  |  |
| `updated_at` | timestamp with time zone | YES | now() |  |  |  |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `emails_status_check` | CHECK | CHECK (((status)::text = ANY ((ARRAY['sent'::character varying, 'delivered'::character varying, 'opened'::character varying, 'bounced'::character varying, 'failed'::character varying])::text[]))) |
| `emails_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| `emails_contact_id_fkey` | FOREIGN KEY | FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL |
| `emails_campaign_id_fkey` | FOREIGN KEY | FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE SET NULL |
| `emails_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `emails_id_user_id_key` | UNIQUE | UNIQUE (id, user_id) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `emails_pkey` | CREATE UNIQUE INDEX emails_pkey ON public.emails USING btree (id) |
| `emails_id_user_id_key` | CREATE UNIQUE INDEX emails_id_user_id_key ON public.emails USING btree (id, user_id) |
| `idx_emails_user_id` | CREATE INDEX idx_emails_user_id ON public.emails USING btree (user_id) |
| `idx_emails_contact_id` | CREATE INDEX idx_emails_contact_id ON public.emails USING btree (contact_id) |
| `idx_emails_campaign_id` | CREATE INDEX idx_emails_campaign_id ON public.emails USING btree (campaign_id) |
| `idx_emails_sent_at` | CREATE INDEX idx_emails_sent_at ON public.emails USING btree (sent_at DESC) |
| `idx_emails_status` | CREATE INDEX idx_emails_status ON public.emails USING btree (status) |
| `idx_emails_to_email` | CREATE INDEX idx_emails_to_email ON public.emails USING btree (to_email) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `user_id` | `public.users(id)` | NO ACTION | CASCADE |
| `contact_id` | `public.contacts(id)` | NO ACTION | SET NULL |
| `campaign_id` | `public.email_campaigns(id)` | NO ACTION | SET NULL |

### Triggers

#### trigger_update_contact_email_stats_insert

- **Timing**: AFTER
- **Event**: INSERT
- **Definition**:
```sql
CREATE TRIGGER trigger_update_contact_email_stats_insert AFTER INSERT ON public.emails FOR EACH ROW WHEN ((new.contact_id IS NOT NULL)) EXECUTE FUNCTION update_contact_email_stats()
```

#### trigger_update_contact_email_stats_update

- **Timing**: AFTER
- **Event**: UPDATE
- **Definition**:
```sql
CREATE TRIGGER trigger_update_contact_email_stats_update AFTER UPDATE ON public.emails FOR EACH ROW WHEN (((new.contact_id IS NOT NULL) AND ((new.status)::text = 'opened'::text) AND ((old.status)::text <> 'opened'::text))) EXECUTE FUNCTION update_contact_email_stats()
```

**Current Row Count**: 0

---

## public.failure_logs

**Description**: Stores detailed logs of API failures (4xx and 5xx errors) with full request/response metadata for debugging and monitoring

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | gen_random_uuid() | ✓ | ✓ |  |
| `endpoint` | character varying(500) | NO | - |  |  | The API endpoint that failed (e.g., /api/v1/users) |
| `method` | character varying(10) | NO | - |  |  | HTTP method (GET, POST, PUT, DELETE, etc.) |
| `status_code` | integer | NO | - |  |  | HTTP status code (400-599) |
| `error_message` | text | YES | - |  |  |  |
| `error_stack` | text | YES | - |  |  |  |
| `request_body` | jsonb | YES | - |  |  |  |
| `request_headers` | jsonb | YES | - |  |  |  |
| `response_body` | jsonb | YES | - |  |  |  |
| `duration_ms` | integer | NO | - |  |  | Request duration in milliseconds |
| `user_id` | uuid | YES | - |  |  |  |
| `ip_address` | character varying(45) | YES | - |  |  |  |
| `user_agent` | text | YES | - |  |  |  |
| `request_id` | character varying(100) | YES | - |  |  | Unique request ID for correlation with other logs |
| `environment` | character varying(50) | YES | 'production'::character varying |  |  | Environment where the error occurred (development, staging, production) |
| `timestamp` | timestamp with time zone | NO | now() |  |  |  |
| `created_at` | timestamp with time zone | YES | now() |  |  |  |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `failure_logs_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL |
| `failure_logs_pkey` | PRIMARY KEY | PRIMARY KEY (id) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `failure_logs_pkey` | CREATE UNIQUE INDEX failure_logs_pkey ON public.failure_logs USING btree (id) |
| `idx_failure_logs_endpoint` | CREATE INDEX idx_failure_logs_endpoint ON public.failure_logs USING btree (endpoint) |
| `idx_failure_logs_endpoint_timestamp` | CREATE INDEX idx_failure_logs_endpoint_timestamp ON public.failure_logs USING btree (endpoint, "timestamp" DESC) |
| `idx_failure_logs_environment` | CREATE INDEX idx_failure_logs_environment ON public.failure_logs USING btree (environment) |
| `idx_failure_logs_method` | CREATE INDEX idx_failure_logs_method ON public.failure_logs USING btree (method) |
| `idx_failure_logs_request_body` | CREATE INDEX idx_failure_logs_request_body ON public.failure_logs USING gin (request_body) |
| `idx_failure_logs_request_headers` | CREATE INDEX idx_failure_logs_request_headers ON public.failure_logs USING gin (request_headers) |
| `idx_failure_logs_status_code` | CREATE INDEX idx_failure_logs_status_code ON public.failure_logs USING btree (status_code) |
| `idx_failure_logs_status_timestamp` | CREATE INDEX idx_failure_logs_status_timestamp ON public.failure_logs USING btree (status_code, "timestamp" DESC) |
| `idx_failure_logs_timestamp` | CREATE INDEX idx_failure_logs_timestamp ON public.failure_logs USING btree ("timestamp" DESC) |
| `idx_failure_logs_user_id` | CREATE INDEX idx_failure_logs_user_id ON public.failure_logs USING btree (user_id) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `user_id` | `public.users(id)` | NO ACTION | SET NULL |

**Current Row Count**: 152

---

## public.follow_ups

**Description**: User-scheduled follow-ups for leads with dates and remarks

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | gen_random_uuid() | ✓ | ✓ |  |
| `user_id` | uuid | NO | - |  |  |  |
| `lead_phone` | character varying(20) | NO | - |  |  | Phone number to identify and group leads |
| `lead_email` | character varying(255) | YES | - |  |  | Email address for additional lead identification |
| `lead_name` | character varying(255) | YES | - |  |  |  |
| `follow_up_date` | date | NO | - |  |  | Date for follow-up (date only, no time) |
| `remark` | text | YES | - |  |  | User notes/remarks for the follow-up |
| `is_completed` | boolean | YES | false |  |  | Whether the follow-up has been completed |
| `created_at` | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |  |
| `updated_at` | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |  |
| `created_by` | uuid | YES | - |  |  |  |
| `completed_at` | timestamp with time zone | YES | - |  |  |  |
| `completed_by` | uuid | YES | - |  |  |  |
| `follow_up_status` | character varying(20) | NO | 'pending'::character varying |  |  | Status of follow-up: pending, completed, cancelled |
| `call_id` | uuid | YES | - |  |  | Reference to the specific call that triggered this follow-up |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `follow_ups_follow_up_status_check` | CHECK | CHECK (((follow_up_status)::text = ANY ((ARRAY['pending'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[]))) |
| `follow_ups_call_id_fkey` | FOREIGN KEY | FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE SET NULL |
| `follow_ups_completed_by_fkey` | FOREIGN KEY | FOREIGN KEY (completed_by) REFERENCES users(id) ON DELETE SET NULL |
| `follow_ups_created_by_fkey` | FOREIGN KEY | FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL |
| `follow_ups_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| `follow_ups_pkey` | PRIMARY KEY | PRIMARY KEY (id) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `follow_ups_pkey` | CREATE UNIQUE INDEX follow_ups_pkey ON public.follow_ups USING btree (id) |
| `idx_follow_ups_call_id` | CREATE INDEX idx_follow_ups_call_id ON public.follow_ups USING btree (call_id) |
| `idx_follow_ups_follow_up_date` | CREATE INDEX idx_follow_ups_follow_up_date ON public.follow_ups USING btree (follow_up_date) |
| `idx_follow_ups_is_completed` | CREATE INDEX idx_follow_ups_is_completed ON public.follow_ups USING btree (is_completed) |
| `idx_follow_ups_lead_email` | CREATE INDEX idx_follow_ups_lead_email ON public.follow_ups USING btree (lead_email) |
| `idx_follow_ups_lead_identification` | CREATE INDEX idx_follow_ups_lead_identification ON public.follow_ups USING btree (user_id, lead_phone, lead_email) |
| `idx_follow_ups_lead_phone` | CREATE INDEX idx_follow_ups_lead_phone ON public.follow_ups USING btree (lead_phone) |
| `idx_follow_ups_status` | CREATE INDEX idx_follow_ups_status ON public.follow_ups USING btree (follow_up_status) |
| `idx_follow_ups_user_id` | CREATE INDEX idx_follow_ups_user_id ON public.follow_ups USING btree (user_id) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `call_id` | `public.calls(id)` | NO ACTION | SET NULL |
| `completed_by` | `public.users(id)` | NO ACTION | SET NULL |
| `created_by` | `public.users(id)` | NO ACTION | SET NULL |
| `user_id` | `public.users(id)` | NO ACTION | CASCADE |

### Triggers

#### trigger_follow_ups_updated_at

- **Timing**: BEFORE
- **Event**: UPDATE
- **Definition**:
```sql
CREATE TRIGGER trigger_follow_ups_updated_at BEFORE UPDATE ON public.follow_ups FOR EACH ROW EXECUTE FUNCTION update_follow_ups_updated_at()
```

**Current Row Count**: 0

---

## public.lead_analytics

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | uuid_generate_v4() | ✓ | ✓ |  |
| `call_id` | uuid | NO | - |  | ✓ |  |
| `intent_level` | character varying(50) | YES | - |  |  |  |
| `intent_score` | integer | YES | - |  |  |  |
| `urgency_level` | character varying(50) | YES | - |  |  |  |
| `urgency_score` | integer | YES | - |  |  |  |
| `budget_constraint` | character varying(50) | YES | - |  |  |  |
| `budget_score` | integer | YES | - |  |  |  |
| `fit_alignment` | character varying(50) | YES | - |  |  |  |
| `fit_score` | integer | YES | - |  |  |  |
| `engagement_health` | character varying(50) | YES | - |  |  |  |
| `engagement_score` | integer | YES | - |  |  |  |
| `total_score` | integer | YES | - |  |  |  |
| `lead_status_tag` | character varying(100) | YES | - |  |  |  |
| `reasoning` | jsonb | NO | '{}'::jsonb |  |  |  |
| `cta_interactions` | jsonb | NO | '{}'::jsonb |  |  |  |
| `created_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `call_successful` | character varying(20) | YES | - |  |  | Success status from ElevenLabs analysis (success/failure/unknown) |
| `transcript_summary` | text | YES | - |  |  | AI-generated summary of the call transcript from ElevenLabs |
| `call_summary_title` | character varying(500) | YES | - |  |  | Brief title/subject of the call from ElevenLabs analysis |
| `analysis_source` | character varying(50) | YES | 'bolna'::character varying |  |  | Source of the analysis data (elevenlabs, manual, legacy, etc.) |
| `raw_analysis_data` | jsonb | YES | '{}'::jsonb |  |  | Complete raw analysis data from webhook for debugging and future enhancements |
| `user_id` | uuid | NO | - |  | ✓ | Required for complete analysis (multi-tenant isolation - one contact can interact with multiple users). Inherited from call for individual analysis |
| `company_name` | character varying(255) | YES | - |  |  | Company name extracted from webhook data (extraction.company_name) |
| `extracted_name` | character varying(255) | YES | - |  |  | Contact name extracted from webhook data (extraction.name) |
| `extracted_email` | character varying(255) | YES | - |  |  | Contact email extracted from webhook data (extraction.email_address) |
| `cta_pricing_clicked` | boolean | YES | false |  |  | Boolean flag indicating if pricing CTA was clicked during the call |
| `cta_demo_clicked` | boolean | YES | false |  |  | Boolean flag indicating if demo CTA was clicked during the call |
| `cta_followup_clicked` | boolean | YES | false |  |  | Boolean flag indicating if follow-up CTA was clicked during the call |
| `cta_sample_clicked` | boolean | YES | false |  |  | Boolean flag indicating if sample CTA was clicked during the call |
| `cta_escalated_to_human` | boolean | YES | false |  |  | Boolean flag indicating if the call was escalated to a human agent |
| `smart_notification` | text | YES | - |  |  | Short 4-5 word summary of user interaction for notifications |
| `demo_book_datetime` | timestamp with time zone | YES | - |  |  | Timezone-aware datetime when demo/meeting was scheduled |
| `is_read` | boolean | YES | false |  |  | Tracks whether the smart notification has been read by the user |
| `phone_number` | character varying(50) | YES | - |  | ✓ | Required for complete analysis (identifies contact across calls). NULL for individual analysis (phone derived from call_id) |
| `analysis_type` | character varying(20) | YES | 'individual'::character varying |  | ✓ | Type of analysis: "individual" = single call analysis (one row per call), "complete" = aggregated analysis across all calls for a contact (one row per user_id + phone_number, updated on each call), "human_edit" = manual human override |
| `previous_calls_analyzed` | integer | YES | 0 |  |  | For individual: always 0. For complete: total number of calls analyzed for this user_id + phone_number combination |
| `latest_call_id` | uuid | YES | - |  |  | For complete analysis only: points to most recent call analyzed. NULL for individual analysis |
| `analysis_timestamp` | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |  |
| `requirements` | text | YES | - |  |  | Product/business requirements extracted from call transcript by OpenAI analysis. NULL if no requirements mentioned |
| `lead_stage` | character varying(50) | YES | 'New Lead'::character varying |  |  | Current stage in the sales funnel (e.g., "New Lead", "Qualified", "Negotiation", "Closed Won", "Closed Lost") |
| `lead_stage_updated_at` | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  | Timestamp when the lead stage was last updated |
| `email_id` | uuid | YES | - |  |  | Links to email campaigns sent to this lead for interaction timeline tracking |
| `interaction_platform` | character varying(50) | YES | - |  |  | Platform for manual interaction (Call, WhatsApp, Email). Used for human_edit analysis type to show the mode of interaction in timeline |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `lead_analytics_budget_score_check` | CHECK | CHECK (((budget_score >= 0) AND (budget_score <= 100))) |
| `lead_analytics_engagement_score_check` | CHECK | CHECK (((engagement_score >= 0) AND (engagement_score <= 100))) |
| `lead_analytics_fit_score_check` | CHECK | CHECK (((fit_score >= 0) AND (fit_score <= 100))) |
| `lead_analytics_intent_score_check` | CHECK | CHECK (((intent_score >= 0) AND (intent_score <= 100))) |
| `lead_analytics_total_score_check` | CHECK | CHECK (((total_score >= 0) AND (total_score <= 100))) |
| `lead_analytics_type_check` | CHECK | CHECK (((analysis_type)::text = ANY ((ARRAY['individual'::character varying, 'complete'::character varying])::text[]))) |
| `lead_analytics_urgency_score_check` | CHECK | CHECK (((urgency_score >= 0) AND (urgency_score <= 100))) |
| `fk_lead_analytics_call_user_consistency` | FOREIGN KEY | FOREIGN KEY (call_id, user_id) REFERENCES calls(id, user_id) DEFERRABLE INITIALLY DEFERRED |
| `lead_analytics_call_id_fkey` | FOREIGN KEY | FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE |
| `lead_analytics_latest_call_id_fkey` | FOREIGN KEY | FOREIGN KEY (latest_call_id) REFERENCES calls(id) ON DELETE SET NULL |
| `lead_analytics_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| `lead_analytics_pkey` | PRIMARY KEY | PRIMARY KEY (id) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `idx_lead_analytics_analysis_source` | CREATE INDEX idx_lead_analytics_analysis_source ON public.lead_analytics USING btree (analysis_source) |
| `idx_lead_analytics_cache_trigger` | CREATE INDEX idx_lead_analytics_cache_trigger ON public.lead_analytics USING btree (call_id, created_at DESC) |
| `idx_lead_analytics_call_id` | CREATE INDEX idx_lead_analytics_call_id ON public.lead_analytics USING btree (call_id) |
| `idx_lead_analytics_call_score_quality` | CREATE INDEX idx_lead_analytics_call_score_quality ON public.lead_analytics USING btree (call_id, total_score, intent_score, urgency_score, budget_score, fit_score) |
| `idx_lead_analytics_call_successful` | CREATE INDEX idx_lead_analytics_call_successful ON public.lead_analytics USING btree (call_successful) |
| `idx_lead_analytics_call_user` | CREATE INDEX idx_lead_analytics_call_user ON public.lead_analytics USING btree (call_id, user_id) |
| `idx_lead_analytics_company_name` | CREATE INDEX idx_lead_analytics_company_name ON public.lead_analytics USING btree (company_name) WHERE (company_name IS NOT NULL) |
| `idx_lead_analytics_complete_unique` | CREATE UNIQUE INDEX idx_lead_analytics_complete_unique ON public.lead_analytics USING btree (user_id, phone_number, analysis_type) WHERE ((analysis_type)::text = 'complete'::text) |
| `idx_lead_analytics_cta_demo` | CREATE INDEX idx_lead_analytics_cta_demo ON public.lead_analytics USING btree (cta_demo_clicked) WHERE (cta_demo_clicked = true) |
| `idx_lead_analytics_cta_escalated` | CREATE INDEX idx_lead_analytics_cta_escalated ON public.lead_analytics USING btree (cta_escalated_to_human) WHERE (cta_escalated_to_human = true) |
| `idx_lead_analytics_cta_followup` | CREATE INDEX idx_lead_analytics_cta_followup ON public.lead_analytics USING btree (cta_followup_clicked) WHERE (cta_followup_clicked = true) |
| `idx_lead_analytics_cta_pricing` | CREATE INDEX idx_lead_analytics_cta_pricing ON public.lead_analytics USING btree (cta_pricing_clicked) WHERE (cta_pricing_clicked = true) |
| `idx_lead_analytics_cta_sample` | CREATE INDEX idx_lead_analytics_cta_sample ON public.lead_analytics USING btree (cta_sample_clicked) WHERE (cta_sample_clicked = true) |
| `idx_lead_analytics_dashboard_covering` | CREATE INDEX idx_lead_analytics_dashboard_covering ON public.lead_analytics USING btree (call_id, total_score) INCLUDE (intent_score, urgency_score, budget_score, fit_score, engagement_score, created_at) |
| `idx_lead_analytics_demo_booking` | CREATE INDEX idx_lead_analytics_demo_booking ON public.lead_analytics USING btree (demo_book_datetime) WHERE (demo_book_datetime IS NOT NULL) |
| `idx_lead_analytics_is_read` | CREATE INDEX idx_lead_analytics_is_read ON public.lead_analytics USING btree (is_read) WHERE (is_read = false) |
| `idx_lead_analytics_lead_status_tag` | CREATE INDEX idx_lead_analytics_lead_status_tag ON public.lead_analytics USING btree (lead_status_tag) |
| `idx_lead_analytics_phone_type_timestamp` | CREATE INDEX idx_lead_analytics_phone_type_timestamp ON public.lead_analytics USING btree (phone_number, analysis_type, analysis_timestamp DESC) |
| `idx_lead_analytics_qualified_leads` | CREATE INDEX idx_lead_analytics_qualified_leads ON public.lead_analytics USING btree (call_id, created_at DESC, total_score) WHERE (total_score >= 70) |
| `idx_lead_analytics_recent_engagement` | CREATE INDEX idx_lead_analytics_recent_engagement ON public.lead_analytics USING btree (call_id, created_at DESC, engagement_score, lead_status_tag) |
| `idx_lead_analytics_score_created` | CREATE INDEX idx_lead_analytics_score_created ON public.lead_analytics USING btree (total_score DESC, created_at DESC) |
| `idx_lead_analytics_score_filters` | CREATE INDEX idx_lead_analytics_score_filters ON public.lead_analytics USING btree (user_id, total_score DESC, lead_status_tag) WHERE ((analysis_type)::text = 'complete'::text) |
| `idx_lead_analytics_smart_notification` | CREATE INDEX idx_lead_analytics_smart_notification ON public.lead_analytics USING btree (smart_notification) WHERE (smart_notification IS NOT NULL) |
| `idx_lead_analytics_total_score` | CREATE INDEX idx_lead_analytics_total_score ON public.lead_analytics USING btree (total_score) |
| `idx_lead_analytics_transcript_summary` | CREATE INDEX idx_lead_analytics_transcript_summary ON public.lead_analytics USING gin (to_tsvector('english'::regconfig, transcript_summary)) |
| `idx_lead_analytics_type` | CREATE INDEX idx_lead_analytics_type ON public.lead_analytics USING btree (call_id, analysis_type) |
| `idx_lead_analytics_unique_complete_user_phone` | CREATE UNIQUE INDEX idx_lead_analytics_unique_complete_user_phone ON public.lead_analytics USING btree (user_id, phone_number, analysis_type) WHERE ((analysis_type)::text = 'complete'::text) |
| `idx_lead_analytics_user_call` | CREATE INDEX idx_lead_analytics_user_call ON public.lead_analytics USING btree (user_id, call_id) |
| `idx_lead_analytics_user_created` | CREATE INDEX idx_lead_analytics_user_created ON public.lead_analytics USING btree (user_id, created_at) |
| `idx_lead_analytics_user_cta_analytics` | CREATE INDEX idx_lead_analytics_user_cta_analytics ON public.lead_analytics USING btree (user_id, created_at DESC) WHERE ((cta_pricing_clicked = true) OR (cta_demo_clicked = true) OR (cta_followup_clicked = true) OR (cta_sample_clicked = true) OR (cta_escalated_to_human = true)) |
| `idx_lead_analytics_user_id` | CREATE INDEX idx_lead_analytics_user_id ON public.lead_analytics USING btree (user_id) |
| `idx_lead_analytics_user_phone` | CREATE INDEX idx_lead_analytics_user_phone ON public.lead_analytics USING btree (user_id, phone_number) |
| `idx_lead_analytics_user_type_timestamp` | CREATE INDEX idx_lead_analytics_user_type_timestamp ON public.lead_analytics USING btree (user_id, analysis_type, analysis_timestamp DESC) |
| `lead_analytics_pkey` | CREATE UNIQUE INDEX lead_analytics_pkey ON public.lead_analytics USING btree (id) |
| `unique_call_id_individual_analytics` | CREATE UNIQUE INDEX unique_call_id_individual_analytics ON public.lead_analytics USING btree (call_id) WHERE ((analysis_type)::text = 'individual'::text) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `call_id` | `public.calls(id)` | NO ACTION | NO ACTION |
| `call_id` | `public.calls(user_id)` | NO ACTION | NO ACTION |
| `user_id` | `public.calls(id)` | NO ACTION | NO ACTION |
| `user_id` | `public.calls(user_id)` | NO ACTION | NO ACTION |
| `call_id` | `public.calls(id)` | NO ACTION | CASCADE |
| `latest_call_id` | `public.calls(id)` | NO ACTION | SET NULL |
| `user_id` | `public.users(id)` | NO ACTION | CASCADE |

### Triggers

#### trg_leads_daily_analytics

- **Timing**: AFTER
- **Event**: INSERT
- **Definition**:
```sql
CREATE TRIGGER trg_leads_daily_analytics AFTER INSERT ON public.lead_analytics FOR EACH ROW EXECUTE FUNCTION trg_leads_daily_analytics()
```

#### trigger_update_agent_scores_from_lead_analytics

- **Timing**: AFTER
- **Event**: INSERT OR UPDATE
- **Definition**:
```sql
CREATE TRIGGER trigger_update_agent_scores_from_lead_analytics AFTER INSERT OR UPDATE ON public.lead_analytics FOR EACH ROW EXECUTE FUNCTION update_agent_scores_from_lead_analytics()
```

**Current Row Count**: 13

---

## public.lead_intelligence_events

**Description**: Tracks all changes/events on lead intelligence for timeline display. Includes manual edits by humans, assignments, notes, etc.

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | uuid_generate_v4() | ✓ | ✓ |  |
| `tenant_user_id` | uuid | NO | - |  |  | User ID that owns this lead |
| `phone_number` | character varying(50) | YES | - |  |  | Lead's phone number |
| `lead_analytics_id` | uuid | YES | - |  |  | Reference to individual lead_analytics record if applicable |
| `actor_type` | character varying(20) | NO | 'owner'::character varying |  |  | Who performed the action: owner, team_member, ai, system |
| `actor_id` | uuid | YES | - |  |  | user.id for owner, team_member.id for team members |
| `actor_name` | character varying(255) | NO | - |  |  | Name of the actor who performed the action |
| `event_type` | character varying(50) | NO | - |  |  | Type of event: edit, assign, note, status_change, call, email, meeting |
| `field_changes` | jsonb | YES | '{}'::jsonb |  |  | JSON object containing field-level changes |
| `notes` | text | YES | - |  |  | Additional notes or comments |
| `created_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `lead_events_actor_type_check` | CHECK | CHECK (((actor_type)::text = ANY ((ARRAY['owner'::character varying, 'team_member'::character varying, 'ai'::character varying, 'system'::character varying])::text[]))) |
| `lead_events_event_type_check` | CHECK | CHECK (((event_type)::text = ANY ((ARRAY['edit'::character varying, 'assign'::character varying, 'note'::character varying, 'status_change'::character varying, 'call'::character varying, 'email'::character varying, 'meeting'::character varying])::text[]))) |
| `lead_intelligence_events_tenant_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (tenant_user_id) REFERENCES users(id) ON DELETE CASCADE |
| `lead_intelligence_events_lead_analytics_id_fkey` | FOREIGN KEY | FOREIGN KEY (lead_analytics_id) REFERENCES lead_analytics(id) ON DELETE SET NULL |
| `lead_intelligence_events_pkey` | PRIMARY KEY | PRIMARY KEY (id) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `lead_intelligence_events_pkey` | CREATE UNIQUE INDEX lead_intelligence_events_pkey ON public.lead_intelligence_events USING btree (id) |
| `idx_lead_events_tenant` | CREATE INDEX idx_lead_events_tenant ON public.lead_intelligence_events USING btree (tenant_user_id) |
| `idx_lead_events_phone` | CREATE INDEX idx_lead_events_phone ON public.lead_intelligence_events USING btree (phone_number) WHERE (phone_number IS NOT NULL) |
| `idx_lead_events_lead_analytics` | CREATE INDEX idx_lead_events_lead_analytics ON public.lead_intelligence_events USING btree (lead_analytics_id) WHERE (lead_analytics_id IS NOT NULL) |
| `idx_lead_events_created` | CREATE INDEX idx_lead_events_created ON public.lead_intelligence_events USING btree (created_at DESC) |
| `idx_lead_events_type` | CREATE INDEX idx_lead_events_type ON public.lead_intelligence_events USING btree (event_type) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `tenant_user_id` | `public.users(id)` | NO ACTION | CASCADE |
| `lead_analytics_id` | `public.lead_analytics(id)` | NO ACTION | SET NULL |

**Current Row Count**: 0

---

## public.login_attempts

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | uuid_generate_v4() | ✓ | ✓ |  |
| `email` | character varying(255) | NO | - |  |  |  |
| `ip_address` | inet | YES | - |  |  |  |
| `attempted_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `success` | boolean | NO | false |  |  |  |
| `failure_reason` | character varying(100) | YES | - |  |  |  |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `login_attempts_pkey` | PRIMARY KEY | PRIMARY KEY (id) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `idx_login_attempts_email` | CREATE INDEX idx_login_attempts_email ON public.login_attempts USING btree (email, attempted_at) |
| `idx_login_attempts_ip` | CREATE INDEX idx_login_attempts_ip ON public.login_attempts USING btree (ip_address, attempted_at) |
| `idx_login_attempts_success` | CREATE INDEX idx_login_attempts_success ON public.login_attempts USING btree (success, attempted_at) |
| `login_attempts_pkey` | CREATE UNIQUE INDEX login_attempts_pkey ON public.login_attempts USING btree (id) |

**Current Row Count**: 409

---

## public.migrations

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | integer | NO | nextval('migrations_id_seq'::regclass) | ✓ | ✓ |  |
| `filename` | character varying(255) | NO | - |  | ✓ |  |
| `executed_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `migrations_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `migrations_filename_key` | UNIQUE | UNIQUE (filename) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `migrations_filename_key` | CREATE UNIQUE INDEX migrations_filename_key ON public.migrations USING btree (filename) |
| `migrations_pkey` | CREATE UNIQUE INDEX migrations_pkey ON public.migrations USING btree (id) |

**Current Row Count**: 97

---

## public.notification_preferences

**Description**: Per-user notification opt-in/opt-out controls

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | uuid_generate_v4() | ✓ | ✓ |  |
| `user_id` | uuid | NO | - |  | ✓ |  |
| `low_credit_alerts` | boolean | NO | true |  |  | Allow credit threshold notifications (15, 5, 0 credits) |
| `credits_added_emails` | boolean | NO | true |  |  | Allow purchase confirmation emails |
| `campaign_summary_emails` | boolean | NO | true |  |  | Allow campaign completion summary emails |
| `email_verification_reminders` | boolean | NO | true |  |  |  |
| `marketing_emails` | boolean | NO | true |  |  | Allow marketing emails (future use) |
| `created_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `updated_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `meeting_booked_notifications` | boolean | NO | true |  |  | Whether user wants to receive email notifications when AI agents book meetings |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `notification_preferences_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| `notification_preferences_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `notification_preferences_id_user_id_key` | UNIQUE | UNIQUE (id, user_id) |
| `notification_preferences_user_id_key` | UNIQUE | UNIQUE (user_id) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `idx_notification_preferences_user` | CREATE INDEX idx_notification_preferences_user ON public.notification_preferences USING btree (user_id) |
| `notification_preferences_id_user_id_key` | CREATE UNIQUE INDEX notification_preferences_id_user_id_key ON public.notification_preferences USING btree (id, user_id) |
| `notification_preferences_pkey` | CREATE UNIQUE INDEX notification_preferences_pkey ON public.notification_preferences USING btree (id) |
| `notification_preferences_user_id_key` | CREATE UNIQUE INDEX notification_preferences_user_id_key ON public.notification_preferences USING btree (user_id) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `user_id` | `public.users(id)` | NO ACTION | CASCADE |

### Triggers

#### update_notification_preferences_updated_at

- **Timing**: BEFORE
- **Event**: UPDATE
- **Definition**:
```sql
CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
```

**Current Row Count**: 4

---

## public.notifications

**Description**: Unified notification tracking for all email notifications with atomicity guarantees

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | uuid_generate_v4() | ✓ | ✓ |  |
| `user_id` | uuid | NO | - |  | ✓ |  |
| `notification_type` | character varying(50) | NO | - |  |  |  |
| `recipient_email` | character varying(255) | NO | - |  |  |  |
| `status` | character varying(20) | NO | 'sent'::character varying |  |  | Fire-and-forget: sent (success), failed (error), skipped (preference disabled) |
| `related_campaign_id` | uuid | YES | - |  |  |  |
| `related_transaction_id` | uuid | YES | - |  |  |  |
| `notification_data` | jsonb | YES | - |  |  | JSONB payload for template rendering |
| `idempotency_key` | character varying(255) | NO | - |  | ✓ | Unique constraint ensures atomic claims. Format: {user_id}:{type}:{related_id}:{date_or_window} |
| `error_message` | text | YES | - |  |  |  |
| `sent_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `created_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `notifications_notification_type_check` | CHECK | CHECK (((notification_type)::text = ANY ((ARRAY['email_verification'::character varying, 'email_verification_reminder'::character varying, 'credit_low_15'::character varying, 'credit_low_5'::character varying, 'credit_exhausted_0'::character varying, 'credits_added'::character varying, 'campaign_summary'::character varying, 'meeting_booked'::character varying, 'marketing'::character varying])::text[]))) |
| `notifications_status_check` | CHECK | CHECK (((status)::text = ANY ((ARRAY['sent'::character varying, 'failed'::character varying, 'skipped'::character varying])::text[]))) |
| `notifications_related_campaign_id_fkey` | FOREIGN KEY | FOREIGN KEY (related_campaign_id) REFERENCES call_campaigns(id) ON DELETE SET NULL |
| `notifications_related_transaction_id_fkey` | FOREIGN KEY | FOREIGN KEY (related_transaction_id) REFERENCES credit_transactions(id) ON DELETE SET NULL |
| `notifications_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| `notifications_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `notifications_id_user_id_key` | UNIQUE | UNIQUE (id, user_id) |
| `notifications_idempotency_key_key` | UNIQUE | UNIQUE (idempotency_key) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `idx_notifications_campaign` | CREATE INDEX idx_notifications_campaign ON public.notifications USING btree (related_campaign_id) WHERE (related_campaign_id IS NOT NULL) |
| `idx_notifications_created_at` | CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC) |
| `idx_notifications_idempotency` | CREATE INDEX idx_notifications_idempotency ON public.notifications USING btree (idempotency_key) |
| `idx_notifications_type_status` | CREATE INDEX idx_notifications_type_status ON public.notifications USING btree (notification_type, status) |
| `idx_notifications_user_id` | CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id) |
| `idx_notifications_user_type` | CREATE INDEX idx_notifications_user_type ON public.notifications USING btree (user_id, notification_type) |
| `notifications_id_user_id_key` | CREATE UNIQUE INDEX notifications_id_user_id_key ON public.notifications USING btree (id, user_id) |
| `notifications_idempotency_key_key` | CREATE UNIQUE INDEX notifications_idempotency_key_key ON public.notifications USING btree (idempotency_key) |
| `notifications_pkey` | CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `related_campaign_id` | `public.call_campaigns(id)` | NO ACTION | SET NULL |
| `related_transaction_id` | `public.credit_transactions(id)` | NO ACTION | SET NULL |
| `user_id` | `public.users(id)` | NO ACTION | CASCADE |

**Current Row Count**: 10

---

## public.phone_numbers

**Description**: Manages phone numbers for batch calling functionality with Bolna.ai integration. Phone numbers are assigned to agents.

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | gen_random_uuid() | ✓ | ✓ | Primary key UUID |
| `name` | character varying(255) | NO | - |  |  | Friendly name for the phone number to help admins remember its purpose |
| `phone_number` | character varying(50) | NO | - |  | ✓ | The actual phone number in E.164 format (e.g., +19876543007) |
| `created_by_admin_id` | uuid | NO | - |  |  | Admin who created this phone number entry |
| `is_active` | boolean | YES | true |  |  | Whether this phone number is active and available for use |
| `created_at` | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  | Timestamp when the phone number was created |
| `updated_at` | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  | Timestamp when the phone number was last updated |
| `assigned_to_agent_id` | uuid | YES | - |  | ✓ | Optional: The agent this phone number is assigned to (must belong to same user) |
| `user_id` | uuid | NO | - |  |  | The user who owns this phone number |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `fk_phone_numbers_user_id` | FOREIGN KEY | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| `phone_numbers_assigned_to_agent_id_fkey` | FOREIGN KEY | FOREIGN KEY (assigned_to_agent_id) REFERENCES agents(id) ON DELETE SET NULL |
| `phone_numbers_created_by_admin_id_fkey` | FOREIGN KEY | FOREIGN KEY (created_by_admin_id) REFERENCES users(id) ON DELETE RESTRICT |
| `phone_numbers_pkey` | PRIMARY KEY | PRIMARY KEY (id) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `idx_phone_numbers_active` | CREATE INDEX idx_phone_numbers_active ON public.phone_numbers USING btree (is_active) |
| `idx_phone_numbers_assigned_to_agent_id` | CREATE INDEX idx_phone_numbers_assigned_to_agent_id ON public.phone_numbers USING btree (assigned_to_agent_id) |
| `idx_phone_numbers_created_by_admin_id` | CREATE INDEX idx_phone_numbers_created_by_admin_id ON public.phone_numbers USING btree (created_by_admin_id) |
| `idx_phone_numbers_unique_active` | CREATE UNIQUE INDEX idx_phone_numbers_unique_active ON public.phone_numbers USING btree (phone_number) WHERE (is_active = true) |
| `idx_phone_numbers_unique_agent_assignment` | CREATE UNIQUE INDEX idx_phone_numbers_unique_agent_assignment ON public.phone_numbers USING btree (assigned_to_agent_id) WHERE (assigned_to_agent_id IS NOT NULL) |
| `idx_phone_numbers_user_agent` | CREATE INDEX idx_phone_numbers_user_agent ON public.phone_numbers USING btree (user_id, assigned_to_agent_id) |
| `idx_phone_numbers_user_id` | CREATE INDEX idx_phone_numbers_user_id ON public.phone_numbers USING btree (user_id) |
| `phone_numbers_pkey` | CREATE UNIQUE INDEX phone_numbers_pkey ON public.phone_numbers USING btree (id) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `user_id` | `public.users(id)` | NO ACTION | CASCADE |
| `assigned_to_agent_id` | `public.agents(id)` | NO ACTION | SET NULL |
| `created_by_admin_id` | `public.users(id)` | NO ACTION | RESTRICT |

### Triggers

#### trigger_phone_numbers_updated_at

- **Timing**: BEFORE
- **Event**: UPDATE
- **Definition**:
```sql
CREATE TRIGGER trigger_phone_numbers_updated_at BEFORE UPDATE ON public.phone_numbers FOR EACH ROW EXECUTE FUNCTION update_phone_numbers_updated_at()
```

**Current Row Count**: 2

---

## public.pending_user_syncs

**Description**: Tracks pending user sync attempts to Chat Agent Server (WhatsApp microservice) with retry logic

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `user_id` | uuid | NO | - | ✓ | ✓ | User ID to sync to Chat Agent Server |
| `email` | character varying(255) | NO | - |  |  | User email for sync |
| `attempt_number` | integer | NO | 1 |  |  | Current attempt number (1-3), retry intervals: immediate, 60min, 12h |
| `next_retry_at` | timestamp with time zone | NO | now() |  |  | When the next retry should be attempted |
| `last_error` | text | YES | - |  |  | Error message from last failed attempt |
| `status` | character varying(20) | NO | 'pending'::character varying |  |  | pending = waiting for retry, failed = max retries exceeded |
| `created_at` | timestamp with time zone | NO | now() |  |  |  |
| `updated_at` | timestamp with time zone | NO | now() |  |  |  |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `pending_user_syncs_status_check` | CHECK | CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'failed'::character varying])::text[]))) |
| `pending_user_syncs_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| `pending_user_syncs_pkey` | PRIMARY KEY | PRIMARY KEY (user_id) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `pending_user_syncs_pkey` | CREATE UNIQUE INDEX pending_user_syncs_pkey ON public.pending_user_syncs USING btree (user_id) |
| `idx_pending_user_syncs_next_retry` | CREATE INDEX idx_pending_user_syncs_next_retry ON public.pending_user_syncs USING btree (next_retry_at) WHERE ((status)::text = 'pending'::text) |
| `idx_pending_user_syncs_status` | CREATE INDEX idx_pending_user_syncs_status ON public.pending_user_syncs USING btree (status) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `user_id` | `public.users(id)` | NO ACTION | CASCADE |

**Current Row Count**: 0

---

## public.system_config

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | uuid_generate_v4() | ✓ | ✓ |  |
| `config_key` | character varying(255) | NO | - |  | ✓ |  |
| `config_value` | text | NO | - |  |  |  |
| `is_encrypted` | boolean | NO | false |  |  |  |
| `description` | text | YES | - |  |  |  |
| `updated_by` | uuid | YES | - |  |  |  |
| `created_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `updated_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `system_config_updated_by_fkey` | FOREIGN KEY | FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL |
| `system_config_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `system_config_config_key_key` | UNIQUE | UNIQUE (config_key) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `idx_system_config_config_key` | CREATE INDEX idx_system_config_config_key ON public.system_config USING btree (config_key) |
| `system_config_config_key_key` | CREATE UNIQUE INDEX system_config_config_key_key ON public.system_config USING btree (config_key) |
| `system_config_pkey` | CREATE UNIQUE INDEX system_config_pkey ON public.system_config USING btree (id) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `updated_by` | `public.users(id)` | NO ACTION | SET NULL |

### Triggers

#### update_system_config_updated_at

- **Timing**: BEFORE
- **Event**: UPDATE
- **Definition**:
```sql
CREATE TRIGGER update_system_config_updated_at BEFORE UPDATE ON public.system_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
```

**Current Row Count**: 22

---

## public.transcripts

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | uuid_generate_v4() | ✓ | ✓ |  |
| `call_id` | uuid | NO | - |  |  |  |
| `content` | text | NO | - |  |  |  |
| `speaker_segments` | jsonb | NO | '[]'::jsonb |  |  |  |
| `created_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `user_id` | uuid | NO | - |  |  |  |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `fk_transcripts_call_user_consistency` | FOREIGN KEY | FOREIGN KEY (call_id, user_id) REFERENCES calls(id, user_id) DEFERRABLE INITIALLY DEFERRED |
| `transcripts_call_id_fkey` | FOREIGN KEY | FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE |
| `transcripts_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| `transcripts_pkey` | PRIMARY KEY | PRIMARY KEY (id) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `idx_transcripts_call_id` | CREATE INDEX idx_transcripts_call_id ON public.transcripts USING btree (call_id) |
| `idx_transcripts_user_call` | CREATE INDEX idx_transcripts_user_call ON public.transcripts USING btree (user_id, call_id) |
| `idx_transcripts_user_id` | CREATE INDEX idx_transcripts_user_id ON public.transcripts USING btree (user_id) |
| `transcripts_pkey` | CREATE UNIQUE INDEX transcripts_pkey ON public.transcripts USING btree (id) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `call_id` | `public.calls(id)` | NO ACTION | NO ACTION |
| `call_id` | `public.calls(user_id)` | NO ACTION | NO ACTION |
| `user_id` | `public.calls(id)` | NO ACTION | NO ACTION |
| `user_id` | `public.calls(user_id)` | NO ACTION | NO ACTION |
| `call_id` | `public.calls(id)` | NO ACTION | CASCADE |
| `user_id` | `public.users(id)` | NO ACTION | CASCADE |

**Current Row Count**: 11

---

## public.team_members

**Description**: Human representatives who work under a tenant (owner user). They can log in, view/edit leads based on their role

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | uuid_generate_v4() | ✓ | ✓ |  |
| `tenant_user_id` | uuid | NO | - |  | ✓ | The owner user this team member belongs to |
| `name` | character varying(255) | NO | - |  |  | Team member's full name |
| `email` | character varying(255) | NO | - |  | ✓ | Team member's email (globally unique) |
| `password_hash` | character varying(255) | YES | - |  |  | Hashed password for authentication |
| `role` | character varying(50) | NO | 'agent'::character varying |  |  | Role: manager, agent, or viewer |
| `is_active` | boolean | NO | true |  |  | Whether this team member can log in |
| `invite_token` | character varying(255) | YES | - |  |  | Temporary token for invitation acceptance |
| `invite_token_expires` | timestamp with time zone | YES | - |  |  | Expiration time for invite token |
| `password_set_at` | timestamp with time zone | YES | - |  |  | When password was last set |
| `last_login` | timestamp with time zone | YES | - |  |  | Last login timestamp |
| `created_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `updated_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `team_members_role_check` | CHECK | CHECK (((role)::text = ANY ((ARRAY['manager'::character varying, 'agent'::character varying, 'viewer'::character varying])::text[]))) |
| `team_members_email_tenant_unique` | UNIQUE | UNIQUE (tenant_user_id, email) |
| `team_members_tenant_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (tenant_user_id) REFERENCES users(id) ON DELETE CASCADE |
| `team_members_pkey` | PRIMARY KEY | PRIMARY KEY (id) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `team_members_pkey` | CREATE UNIQUE INDEX team_members_pkey ON public.team_members USING btree (id) |
| `team_members_email_tenant_unique` | CREATE UNIQUE INDEX team_members_email_tenant_unique ON public.team_members USING btree (tenant_user_id, email) |
| `idx_team_members_email_global` | CREATE UNIQUE INDEX idx_team_members_email_global ON public.team_members USING btree (email) |
| `idx_team_members_tenant_user_id` | CREATE INDEX idx_team_members_tenant_user_id ON public.team_members USING btree (tenant_user_id) |
| `idx_team_members_email` | CREATE INDEX idx_team_members_email ON public.team_members USING btree (email) |
| `idx_team_members_role` | CREATE INDEX idx_team_members_role ON public.team_members USING btree (tenant_user_id, role) |
| `idx_team_members_invite_token` | CREATE INDEX idx_team_members_invite_token ON public.team_members USING btree (invite_token) WHERE (invite_token IS NOT NULL) |
| `idx_team_members_active` | CREATE INDEX idx_team_members_active ON public.team_members USING btree (tenant_user_id, is_active) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `tenant_user_id` | `public.users(id)` | NO ACTION | CASCADE |

**Current Row Count**: 0

---

## public.team_member_sessions

**Description**: Tracks login sessions for team members (similar to user_sessions)

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | uuid_generate_v4() | ✓ | ✓ |  |
| `team_member_id` | uuid | NO | - |  |  | Team member who owns this session |
| `tenant_user_id` | uuid | NO | - |  |  | The owner user (for quick tenant filtering) |
| `token_hash` | character varying(255) | NO | - |  |  | Hashed JWT token |
| `refresh_token_hash` | character varying(255) | YES | - |  |  | Hashed refresh token |
| `expires_at` | timestamp with time zone | NO | - |  |  | When the JWT token expires |
| `refresh_expires_at` | timestamp with time zone | YES | - |  |  | When the refresh token expires |
| `is_active` | boolean | NO | true |  |  | Whether session is active |
| `last_used` | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  | Last time session was used |
| `ip_address` | character varying(45) | YES | - |  |  | IP address of the session |
| `user_agent` | text | YES | - |  |  | User agent string |
| `created_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `team_member_sessions_team_member_id_fkey` | FOREIGN KEY | FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE CASCADE |
| `team_member_sessions_tenant_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (tenant_user_id) REFERENCES users(id) ON DELETE CASCADE |
| `team_member_sessions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `team_member_sessions_pkey` | CREATE UNIQUE INDEX team_member_sessions_pkey ON public.team_member_sessions USING btree (id) |
| `idx_team_member_sessions_member` | CREATE INDEX idx_team_member_sessions_member ON public.team_member_sessions USING btree (team_member_id) |
| `idx_team_member_sessions_token` | CREATE INDEX idx_team_member_sessions_token ON public.team_member_sessions USING btree (token_hash) WHERE (is_active = true) |
| `idx_team_member_sessions_refresh` | CREATE INDEX idx_team_member_sessions_refresh ON public.team_member_sessions USING btree (refresh_token_hash) WHERE (is_active = true) |
| `idx_team_member_sessions_expires` | CREATE INDEX idx_team_member_sessions_expires ON public.team_member_sessions USING btree (expires_at) WHERE (is_active = true) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `team_member_id` | `public.team_members(id)` | NO ACTION | CASCADE |
| `tenant_user_id` | `public.users(id)` | NO ACTION | CASCADE |

**Current Row Count**: 0

---

## public.user_analytics

**Description**: User-level analytics aggregated from all agents owned by the user

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | uuid_generate_v4() | ✓ | ✓ |  |
| `user_id` | uuid | NO | - |  | ✓ |  |
| `date` | date | NO | - |  | ✓ |  |
| `hour` | integer | YES | - |  | ✓ |  |
| `total_calls` | integer | NO | 0 |  |  |  |
| `successful_calls` | integer | NO | 0 |  |  |  |
| `failed_calls` | integer | NO | 0 |  |  |  |
| `total_duration_minutes` | integer | NO | 0 |  |  |  |
| `avg_duration_minutes` | numeric(10,2) | NO | 0 |  |  |  |
| `leads_generated` | integer | NO | 0 |  |  |  |
| `qualified_leads` | integer | NO | 0 |  |  |  |
| `conversion_rate` | numeric(5,2) | NO | 0 |  |  |  |
| `cta_pricing_clicks` | integer | NO | 0 |  |  | Total number of pricing CTA interactions across all user agents in the time period |
| `cta_demo_clicks` | integer | NO | 0 |  |  | Total number of demo request CTA interactions across all user agents in the time period |
| `cta_followup_clicks` | integer | NO | 0 |  |  | Total number of follow-up CTA interactions across all user agents in the time period |
| `cta_sample_clicks` | integer | NO | 0 |  |  | Total number of sample request CTA interactions across all user agents in the time period |
| `cta_human_escalations` | integer | NO | 0 |  |  | Total number of human escalation CTA interactions across all user agents in the time period |
| `total_cta_interactions` | integer | NO | 0 |  |  | Total number of CTA interactions across all user agents (automatically calculated) |
| `cta_conversion_rate` | numeric(5,2) | NO | 0 |  |  | Percentage of calls that resulted in any CTA interaction across all user agents (automatically calculated) |
| `avg_engagement_score` | numeric(5,2) | NO | 0 |  |  |  |
| `avg_intent_score` | numeric(5,2) | NO | 0 |  |  |  |
| `avg_urgency_score` | numeric(5,2) | NO | 0 |  |  |  |
| `avg_budget_score` | numeric(5,2) | NO | 0 |  |  |  |
| `avg_fit_score` | numeric(5,2) | NO | 0 |  |  |  |
| `credits_used` | integer | NO | 0 |  |  |  |
| `cost_per_lead` | numeric(10,2) | NO | 0 |  |  |  |
| `success_rate` | numeric(5,2) | NO | 0 |  |  |  |
| `answer_rate` | numeric(5,2) | NO | 0 |  |  |  |
| `created_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `updated_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `user_analytics_hour_check` | CHECK | CHECK (((hour >= 0) AND (hour <= 23))) |
| `user_analytics_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| `user_analytics_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `user_analytics_user_id_date_hour_key` | UNIQUE | UNIQUE (user_id, date, hour) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `idx_user_analytics_cta_demo` | CREATE INDEX idx_user_analytics_cta_demo ON public.user_analytics USING btree (cta_demo_clicks) WHERE (cta_demo_clicks > 0) |
| `idx_user_analytics_cta_followup` | CREATE INDEX idx_user_analytics_cta_followup ON public.user_analytics USING btree (cta_followup_clicks) WHERE (cta_followup_clicks > 0) |
| `idx_user_analytics_cta_human` | CREATE INDEX idx_user_analytics_cta_human ON public.user_analytics USING btree (cta_human_escalations) WHERE (cta_human_escalations > 0) |
| `idx_user_analytics_cta_pricing` | CREATE INDEX idx_user_analytics_cta_pricing ON public.user_analytics USING btree (cta_pricing_clicks) WHERE (cta_pricing_clicks > 0) |
| `idx_user_analytics_cta_sample` | CREATE INDEX idx_user_analytics_cta_sample ON public.user_analytics USING btree (cta_sample_clicks) WHERE (cta_sample_clicks > 0) |
| `idx_user_analytics_date` | CREATE INDEX idx_user_analytics_date ON public.user_analytics USING btree (date) |
| `idx_user_analytics_total_cta` | CREATE INDEX idx_user_analytics_total_cta ON public.user_analytics USING btree (total_cta_interactions) WHERE (total_cta_interactions > 0) |
| `idx_user_analytics_unique_daily` | CREATE UNIQUE INDEX idx_user_analytics_unique_daily ON public.user_analytics USING btree (user_id, date, hour) |
| `idx_user_analytics_user_date` | CREATE INDEX idx_user_analytics_user_date ON public.user_analytics USING btree (user_id, date) |
| `idx_user_analytics_user_date_cta` | CREATE INDEX idx_user_analytics_user_date_cta ON public.user_analytics USING btree (user_id, date, total_cta_interactions) |
| `idx_user_analytics_user_id` | CREATE INDEX idx_user_analytics_user_id ON public.user_analytics USING btree (user_id) |
| `user_analytics_pkey` | CREATE UNIQUE INDEX user_analytics_pkey ON public.user_analytics USING btree (id) |
| `user_analytics_user_id_date_hour_key` | CREATE UNIQUE INDEX user_analytics_user_id_date_hour_key ON public.user_analytics USING btree (user_id, date, hour) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `user_id` | `public.users(id)` | NO ACTION | CASCADE |

### Triggers

#### update_user_analytics_updated_at

- **Timing**: BEFORE
- **Event**: UPDATE
- **Definition**:
```sql
CREATE TRIGGER update_user_analytics_updated_at BEFORE UPDATE ON public.user_analytics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
```

**Current Row Count**: 813

---

## public.user_email_settings

**Description**: User-configurable settings for automated follow-up emails after calls

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | gen_random_uuid() | ✓ | ✓ |  |
| `user_id` | uuid | NO | - |  | ✓ |  |
| `auto_send_enabled` | boolean | NO | false |  |  | Toggle to enable/disable automatic follow-up emails after calls |
| `openai_followup_email_prompt_id` | character varying(255) | YES | - |  |  | OpenAI Response API prompt ID for generating personalized email content based on call transcript |
| `subject_template` | character varying(500) | YES | 'Follow-up: Great speaking with you, {{lead_name}}!'::character varying |  |  | Email subject line template with variables like {{lead_name}}, {{company}} |
| `body_template` | text | YES | '<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #4f46e5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { padding: 20px; background: #f9f9f9; border-radius: 0 0 8px 8px; }
        .highlight { background: #e0e7ff; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Thank You for Speaking With Us!</h1>
        </div>
        <div class="content">
            <p>Hi {{lead_name}},</p>
            <p>Thank you for taking the time to speak with us today. It was great learning about your needs{{#if company}} at {{company}}{{/if}}.</p>
            <div class="highlight">
                <p><strong>Summary of Our Conversation:</strong></p>
                <p>{{summary}}</p>
            </div>
            {{#if next_steps}}
            <p><strong>Next Steps:</strong></p>
            <p>{{next_steps}}</p>
            {{/if}}
            <p>If you have any questions, feel free to reach out. We look forward to hearing from you!</p>
            <p>Best regards,<br>{{sender_name}}</p>
        </div>
        <div class="footer">
            <p>This is an automated follow-up email based on your recent conversation.</p>
        </div>
    </div>
</body>
</html>'::text |  |  | HTML email body template with variables for personalization |
| `send_conditions` | jsonb | YES | '["completed"]'::jsonb |  |  | JSON array of conditions when to send: completed, busy, no_answer, after_retries, voicemail |
| `lead_status_filters` | jsonb | YES | '["any"]'::jsonb |  |  | JSON array of lead statuses to filter: hot, warm, cold, not_qualified, any |
| `skip_if_no_email` | boolean | NO | true |  |  | Skip sending if contact has no email address |
| `send_delay_minutes` | integer | NO | 0 |  |  | Delay in minutes before sending the follow-up email (0 = immediate) |
| `max_retries_before_send` | integer | YES | 3 |  |  | Number of retry attempts before sending email (for after_retries condition) |
| `created_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `updated_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `user_email_settings_max_retries_before_send_check` | CHECK | CHECK (((max_retries_before_send >= 1) AND (max_retries_before_send <= 10))) |
| `user_email_settings_send_delay_minutes_check` | CHECK | CHECK ((send_delay_minutes >= 0)) |
| `user_email_settings_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| `user_email_settings_pkey` | PRIMARY KEY | PRIMARY KEY (id) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `idx_user_email_settings_auto_send` | CREATE INDEX idx_user_email_settings_auto_send ON public.user_email_settings USING btree (auto_send_enabled) WHERE (auto_send_enabled = true) |
| `idx_user_email_settings_user_id` | CREATE UNIQUE INDEX idx_user_email_settings_user_id ON public.user_email_settings USING btree (user_id) |
| `user_email_settings_pkey` | CREATE UNIQUE INDEX user_email_settings_pkey ON public.user_email_settings USING btree (id) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `user_id` | `public.users(id)` | NO ACTION | CASCADE |

### Triggers

#### trigger_user_email_settings_updated_at

- **Timing**: BEFORE
- **Event**: UPDATE
- **Definition**:
```sql
CREATE TRIGGER trigger_user_email_settings_updated_at BEFORE UPDATE ON public.user_email_settings FOR EACH ROW EXECUTE FUNCTION update_user_email_settings_updated_at()
```

**Current Row Count**: 0

---

## public.user_sessions

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | uuid_generate_v4() | ✓ | ✓ |  |
| `user_id` | uuid | NO | - |  |  |  |
| `token_hash` | character varying(255) | NO | - |  |  |  |
| `expires_at` | timestamp with time zone | NO | - |  |  |  |
| `created_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `last_used_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `ip_address` | inet | YES | - |  |  |  |
| `user_agent` | text | YES | - |  |  |  |
| `is_active` | boolean | NO | true |  |  |  |
| `refresh_token_hash` | character varying(255) | YES | - |  |  | SHA256 hash of the refresh token for secure storage |
| `refresh_expires_at` | timestamp with time zone | YES | - |  |  | Expiration timestamp for the refresh token (typically 7 days) |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `user_sessions_user_id_fkey` | FOREIGN KEY | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE |
| `user_sessions_pkey` | PRIMARY KEY | PRIMARY KEY (id) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `idx_user_sessions_active_only` | CREATE INDEX idx_user_sessions_active_only ON public.user_sessions USING btree (user_id, created_at) WHERE (is_active = true) |
| `idx_user_sessions_cleanup` | CREATE INDEX idx_user_sessions_cleanup ON public.user_sessions USING btree (expires_at, is_active) WHERE (is_active = true) |
| `idx_user_sessions_expires_at` | CREATE INDEX idx_user_sessions_expires_at ON public.user_sessions USING btree (expires_at) |
| `idx_user_sessions_refresh_active` | CREATE INDEX idx_user_sessions_refresh_active ON public.user_sessions USING btree (is_active, refresh_expires_at) |
| `idx_user_sessions_refresh_expires_at` | CREATE INDEX idx_user_sessions_refresh_expires_at ON public.user_sessions USING btree (refresh_expires_at) |
| `idx_user_sessions_refresh_token_hash` | CREATE INDEX idx_user_sessions_refresh_token_hash ON public.user_sessions USING btree (refresh_token_hash) |
| `idx_user_sessions_refresh_validation` | CREATE INDEX idx_user_sessions_refresh_validation ON public.user_sessions USING btree (refresh_token_hash, is_active, refresh_expires_at) WHERE (is_active = true) |
| `idx_user_sessions_token_validation` | CREATE INDEX idx_user_sessions_token_validation ON public.user_sessions USING btree (token_hash, is_active, expires_at) WHERE (is_active = true) |
| `idx_user_sessions_user_id` | CREATE INDEX idx_user_sessions_user_id ON public.user_sessions USING btree (user_id) |
| `user_sessions_pkey` | CREATE UNIQUE INDEX user_sessions_pkey ON public.user_sessions USING btree (id) |

### Foreign Keys

| Column | References | On Update | On Delete |
|--------|------------|-----------|------------|
| `user_id` | `public.users(id)` | NO ACTION | CASCADE |

### Triggers

#### update_user_sessions_last_used

- **Timing**: BEFORE
- **Event**: UPDATE
- **Definition**:
```sql
CREATE TRIGGER update_user_sessions_last_used BEFORE UPDATE ON public.user_sessions FOR EACH ROW EXECUTE FUNCTION update_session_last_used()
```

**Current Row Count**: 34

---

## public.users

### Columns

| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |
|-------------|-----------|----------|---------|-------------|--------|-------------|
| `id` | uuid | NO | uuid_generate_v4() | ✓ | ✓ |  |
| `email` | character varying(255) | NO | - |  | ✓ |  |
| `name` | character varying(255) | NO | - |  |  |  |
| `credits` | integer | NO | 15 |  |  |  |
| `is_active` | boolean | NO | true |  |  |  |
| `auth_provider` | character varying(50) | NO | 'email'::character varying |  |  |  |
| `email_verified` | boolean | NO | false |  |  |  |
| `email_verification_sent_at` | timestamp with time zone | YES | - |  |  |  |
| `created_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `updated_at` | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |  |
| `role` | character varying(50) | NO | 'user'::character varying |  |  |  |
| `password_hash` | character varying(255) | YES | - |  |  |  |
| `password_reset_token` | character varying(255) | YES | - |  |  |  |
| `password_reset_expires` | timestamp with time zone | YES | - |  |  |  |
| `email_verification_token` | character varying(255) | YES | - |  |  |  |
| `company` | character varying(255) | YES | - |  |  |  |
| `website` | character varying(500) | YES | - |  |  |  |
| `location` | character varying(255) | YES | - |  |  |  |
| `bio` | text | YES | - |  |  |  |
| `phone` | character varying(50) | YES | - |  |  |  |
| `last_login` | timestamp with time zone | YES | - |  |  | Timestamp of the user's last successful login |
| `google_id` | character varying(255) | YES | - |  | ✓ |  |
| `profile_picture` | text | YES | - |  |  |  |
| `concurrent_calls_limit` | integer | NO | 2 |  |  | Maximum concurrent calls for this specific user. System-wide limit (affecting all users combined) is managed via SYSTEM_CONCURRENT_CALLS_LIMIT environment variable. |
| `openai_individual_prompt_id` | character varying(255) | YES | - |  |  | OpenAI Response API prompt ID for individual call analysis. Falls back to system default if NULL. |
| `openai_complete_prompt_id` | character varying(255) | YES | - |  |  | OpenAI Response API prompt ID for complete/aggregated analysis across multiple calls. Falls back to system default if NULL. |
| `google_access_token` | text | YES | - |  |  | Google OAuth access token for Calendar API (short-lived, ~1 hour) |
| `google_refresh_token` | text | YES | - |  |  | Google OAuth refresh token for obtaining new access tokens (long-lived) |
| `google_token_expiry` | timestamp with time zone | YES | - |  |  | Timestamp when the current access token expires |
| `google_calendar_connected` | boolean | YES | false |  |  | Whether user has successfully connected their Google Calendar |
| `google_calendar_id` | character varying(255) | YES | 'primary'::character varying |  |  | Google Calendar ID to use (default: primary calendar) |
| `google_email` | character varying(255) | YES | - |  |  | Google account email address used for Calendar integration |
| `timezone` | character varying(50) | NO | 'UTC'::character varying |  |  | IANA timezone identifier (e.g., America/New_York, Asia/Kolkata, Europe/London) |
| `timezone_auto_detected` | boolean | YES | false |  |  | True if timezone was auto-detected from IP address or browser |
| `timezone_manually_set` | boolean | YES | false |  |  | True if user manually selected timezone in settings |
| `timezone_updated_at` | timestamp with time zone | YES | - |  |  | Timestamp when timezone was last updated |
| `openai_followup_email_prompt_id` | character varying(255) | YES | - |  |  | OpenAI Response API prompt ID for follow-up email personalization. Admin can set per-user. |

### Constraints

| Constraint Name | Type | Definition |
|-----------------|------|------------|
| `check_bio_length` | CHECK | CHECK (((bio IS NULL) OR (length(bio) <= 1000))) |
| `check_company_length` | CHECK | CHECK (((company IS NULL) OR (length((company)::text) <= 255))) |
| `check_location_length` | CHECK | CHECK (((location IS NULL) OR (length((location)::text) <= 255))) |
| `check_phone_format` | CHECK | CHECK (((phone IS NULL) OR ((phone)::text ~ '^[\+]?[0-9\s\-\(\)]{7,20}$'::text))) |
| `check_website_format` | CHECK | CHECK (((website IS NULL) OR ((website)::text ~ '^https?://.*'::text))) |
| `users_auth_provider_check` | CHECK | CHECK (((auth_provider)::text = ANY ((ARRAY['email'::character varying, 'google'::character varying, 'linkedin'::character varying, 'github'::character varying])::text[]))) |
| `users_concurrent_calls_limit_check` | CHECK | CHECK (((concurrent_calls_limit >= 1) AND (concurrent_calls_limit <= 100))) |
| `users_role_check` | CHECK | CHECK (((role)::text = ANY ((ARRAY['user'::character varying, 'admin'::character varying, 'super_admin'::character varying])::text[]))) |
| `users_pkey` | PRIMARY KEY | PRIMARY KEY (id) |
| `users_email_key` | UNIQUE | UNIQUE (email) |
| `users_google_id_key` | UNIQUE | UNIQUE (google_id) |

### Indexes

| Index Name | Definition |
|------------|------------|
| `idx_users_created_at` | CREATE INDEX idx_users_created_at ON public.users USING btree (created_at) |
| `idx_users_last_login` | CREATE INDEX idx_users_last_login ON public.users USING btree (last_login) |
| `idx_users_timezone` | CREATE INDEX idx_users_timezone ON public.users USING btree (timezone) |
| `users_email_key` | CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email) |
| `users_google_id_key` | CREATE UNIQUE INDEX users_google_id_key ON public.users USING btree (google_id) |
| `users_pkey` | CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id) |

### Triggers

#### update_users_updated_at

- **Timing**: BEFORE
- **Event**: UPDATE
- **Definition**:
```sql
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
```

**Current Row Count**: 6

---

## Views

### public.call_source_analytics

```sql
 SELECT user_id,
    call_source,
    count(*) AS total_calls,
    count(
        CASE
            WHEN ((status)::text = 'completed'::text) THEN 1
            ELSE NULL::integer
        END) AS completed_calls,
    count(
        CASE
            WHEN ((status)::text = 'failed'::text) THEN 1
            ELSE NULL::integer
        END) AS failed_calls,
    avg(duration_minutes) AS avg_duration_minutes,
    sum(credits_used) AS total_credits_used,
    min(created_at) AS first_call_date,
    max(created_at) AS last_call_date
   FROM calls c
  GROUP BY user_id, call_source;```

---

### public.queue_status_by_type

```sql
 SELECT q.user_id,
    u.email AS user_email,
    q.call_type,
    q.status,
    count(*) AS call_count,
    min(q.created_at) AS oldest_call,
    max(q.created_at) AS newest_call
   FROM (call_queue q
     JOIN users u ON ((q.user_id = u.id)))
  GROUP BY q.user_id, u.email, q.call_type, q.status
  ORDER BY q.user_id, q.call_type, q.status;```

---

### public.system_concurrency_overview

```sql
 SELECT ( SELECT count(*) AS count
           FROM active_calls) AS total_active_calls,
    ( SELECT count(*) AS count
           FROM active_calls
          WHERE ((active_calls.call_type)::text = 'direct'::text)) AS direct_calls,
    ( SELECT count(*) AS count
           FROM active_calls
          WHERE ((active_calls.call_type)::text = 'campaign'::text)) AS campaign_calls,
    ( SELECT count(DISTINCT active_calls.user_id) AS count
           FROM active_calls) AS users_with_active_calls,
    10 AS system_limit,
    now() AS snapshot_time;```

---

### public.user_concurrency_status

```sql
 SELECT u.id AS user_id,
    u.name AS user_name,
    u.email AS user_email,
    u.concurrent_calls_limit AS user_limit,
    COALESCE(total_calls.count, (0)::bigint) AS active_calls,
    COALESCE(direct_calls.count, (0)::bigint) AS direct_calls,
    COALESCE(campaign_calls.count, (0)::bigint) AS campaign_calls,
    (u.concurrent_calls_limit - COALESCE(total_calls.count, (0)::bigint)) AS available_slots,
        CASE
            WHEN (COALESCE(total_calls.count, (0)::bigint) >= u.concurrent_calls_limit) THEN 'AT_LIMIT'::text
            WHEN (COALESCE(total_calls.count, (0)::bigint) = 0) THEN 'IDLE'::text
            ELSE 'ACTIVE'::text
        END AS status
   FROM (((users u
     LEFT JOIN ( SELECT active_calls.user_id,
            count(*) AS count
           FROM active_calls
          GROUP BY active_calls.user_id) total_calls ON ((total_calls.user_id = u.id)))
     LEFT JOIN ( SELECT active_calls.user_id,
            count(*) AS count
           FROM active_calls
          WHERE ((active_calls.call_type)::text = 'direct'::text)
          GROUP BY active_calls.user_id) direct_calls ON ((direct_calls.user_id = u.id)))
     LEFT JOIN ( SELECT active_calls.user_id,
            count(*) AS count
           FROM active_calls
          WHERE ((active_calls.call_type)::text = 'campaign'::text)
          GROUP BY active_calls.user_id) campaign_calls ON ((campaign_calls.user_id = u.id)))
  ORDER BY COALESCE(total_calls.count, (0)::bigint) DESC, u.name;```

---

### public.user_login_stats

```sql
 SELECT u.id,
    u.email,
    u.name,
    count(la.id) AS total_attempts,
    count(
        CASE
            WHEN (la.success = true) THEN 1
            ELSE NULL::integer
        END) AS successful_logins,
    count(
        CASE
            WHEN (la.success = false) THEN 1
            ELSE NULL::integer
        END) AS failed_attempts,
    max(
        CASE
            WHEN (la.success = true) THEN la.attempted_at
            ELSE NULL::timestamp with time zone
        END) AS last_successful_login,
    max(
        CASE
            WHEN (la.success = false) THEN la.attempted_at
            ELSE NULL::timestamp with time zone
        END) AS last_failed_attempt
   FROM (users u
     LEFT JOIN login_attempts la ON (((u.email)::text = (la.email)::text)))
  GROUP BY u.id, u.email, u.name;```

---

### public.user_performance_summary

```sql
 SELECT u.id AS user_id,
    u.name AS user_name,
    u.email,
    u.credits,
    COALESCE(today.total_calls, (0)::bigint) AS today_calls,
    COALESCE(today.successful_calls, (0)::bigint) AS today_successful_calls,
    COALESCE(today.success_rate, (0)::numeric) AS today_success_rate,
    COALESCE(today.leads_generated, (0)::bigint) AS today_leads,
    COALESCE(today.total_cta_interactions, (0)::bigint) AS today_cta_interactions,
    COALESCE(today.cta_conversion_rate, (0)::numeric) AS today_cta_conversion_rate,
    COALESCE(month.total_calls, (0)::bigint) AS month_calls,
    COALESCE(month.successful_calls, (0)::bigint) AS month_successful_calls,
    COALESCE(month.success_rate, (0)::numeric) AS month_success_rate,
    COALESCE(month.leads_generated, (0)::bigint) AS month_leads,
    COALESCE(month.conversion_rate, (0)::numeric) AS month_conversion_rate,
    COALESCE(month.total_cta_interactions, (0)::bigint) AS month_cta_interactions,
    COALESCE(month.cta_conversion_rate, (0)::numeric) AS month_cta_conversion_rate,
    COALESCE(total.total_calls, (0)::bigint) AS total_calls,
    COALESCE(total.successful_calls, (0)::bigint) AS total_successful_calls,
    COALESCE(total.success_rate, (0)::numeric) AS total_success_rate,
    COALESCE(total.leads_generated, (0)::bigint) AS total_leads,
    COALESCE(total.avg_duration_minutes, (0)::numeric) AS avg_call_duration,
    COALESCE(total.total_cta_interactions, (0)::bigint) AS total_cta_interactions,
    COALESCE(total.cta_conversion_rate, (0)::numeric) AS total_cta_conversion_rate,
    COALESCE(total.cta_pricing_clicks, (0)::bigint) AS total_pricing_clicks,
    COALESCE(total.cta_demo_clicks, (0)::bigint) AS total_demo_clicks,
    COALESCE(total.cta_followup_clicks, (0)::bigint) AS total_followup_clicks,
    COALESCE(total.cta_sample_clicks, (0)::bigint) AS total_sample_clicks,
    COALESCE(total.cta_human_escalations, (0)::bigint) AS total_human_escalations,
    COALESCE(agent_count.active_agents, (0)::bigint) AS active_agents
   FROM ((((users u
     LEFT JOIN ( SELECT user_analytics.user_id,
            sum(user_analytics.total_calls) AS total_calls,
            sum(user_analytics.successful_calls) AS successful_calls,
                CASE
                    WHEN (sum(user_analytics.total_calls) > 0) THEN (((sum(user_analytics.successful_calls))::numeric / (sum(user_analytics.total_calls))::numeric) * (100)::numeric)
                    ELSE (0)::numeric
                END AS success_rate,
            sum(user_analytics.leads_generated) AS leads_generated,
            sum(user_analytics.total_cta_interactions) AS total_cta_interactions,
                CASE
                    WHEN (sum(user_analytics.total_calls) > 0) THEN (((sum(user_analytics.total_cta_interactions))::numeric / (sum(user_analytics.total_calls))::numeric) * (100)::numeric)
                    ELSE (0)::numeric
                END AS cta_conversion_rate
           FROM user_analytics
          WHERE ((user_analytics.date = CURRENT_DATE) AND (user_analytics.hour IS NULL))
          GROUP BY user_analytics.user_id) today ON ((u.id = today.user_id)))
     LEFT JOIN ( SELECT user_analytics.user_id,
            sum(user_analytics.total_calls) AS total_calls,
            sum(user_analytics.successful_calls) AS successful_calls,
                CASE
                    WHEN (sum(user_analytics.total_calls) > 0) THEN (((sum(user_analytics.successful_calls))::numeric / (sum(user_analytics.total_calls))::numeric) * (100)::numeric)
                    ELSE (0)::numeric
                END AS success_rate,
            sum(user_analytics.leads_generated) AS leads_generated,
                CASE
                    WHEN (sum(user_analytics.leads_generated) > 0) THEN (((sum(user_analytics.qualified_leads))::numeric / (sum(user_analytics.leads_generated))::numeric) * (100)::numeric)
                    ELSE (0)::numeric
                END AS conversion_rate,
            sum(user_analytics.total_cta_interactions) AS total_cta_interactions,
                CASE
                    WHEN (sum(user_analytics.total_calls) > 0) THEN (((sum(user_analytics.total_cta_interactions))::numeric / (sum(user_analytics.total_calls))::numeric) * (100)::numeric)
                    ELSE (0)::numeric
                END AS cta_conversion_rate
           FROM user_analytics
          WHERE ((user_analytics.date >= date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone)) AND (user_analytics.hour IS NULL))
          GROUP BY user_analytics.user_id) month ON ((u.id = month.user_id)))
     LEFT JOIN ( SELECT user_analytics.user_id,
            sum(user_analytics.total_calls) AS total_calls,
            sum(user_analytics.successful_calls) AS successful_calls,
                CASE
                    WHEN (sum(user_analytics.total_calls) > 0) THEN (((sum(user_analytics.successful_calls))::numeric / (sum(user_analytics.total_calls))::numeric) * (100)::numeric)
                    ELSE (0)::numeric
                END AS success_rate,
            sum(user_analytics.leads_generated) AS leads_generated,
            avg(user_analytics.avg_duration_minutes) AS avg_duration_minutes,
            sum(user_analytics.total_cta_interactions) AS total_cta_interactions,
                CASE
                    WHEN (sum(user_analytics.total_calls) > 0) THEN (((sum(user_analytics.total_cta_interactions))::numeric / (sum(user_analytics.total_calls))::numeric) * (100)::numeric)
                    ELSE (0)::numeric
                END AS cta_conversion_rate,
            sum(user_analytics.cta_pricing_clicks) AS cta_pricing_clicks,
            sum(user_analytics.cta_demo_clicks) AS cta_demo_clicks,
            sum(user_analytics.cta_followup_clicks) AS cta_followup_clicks,
            sum(user_analytics.cta_sample_clicks) AS cta_sample_clicks,
            sum(user_analytics.cta_human_escalations) AS cta_human_escalations
           FROM user_analytics
          WHERE (user_analytics.hour IS NULL)
          GROUP BY user_analytics.user_id) total ON ((u.id = total.user_id)))
     LEFT JOIN ( SELECT agents.user_id,
            count(*) AS active_agents
           FROM agents
          WHERE (agents.is_active = true)
          GROUP BY agents.user_id) agent_count ON ((u.id = agent_count.user_id)))
  WHERE (u.is_active = true);```

---

### public.user_stats

```sql
 SELECT u.id,
    u.email,
    u.name,
    u.credits,
    u.is_active,
    u.created_at,
    count(DISTINCT a.id) AS agent_count,
    count(DISTINCT c.id) AS call_count,
    count(DISTINCT ct.id) AS contact_count,
    COALESCE(sum(
        CASE
            WHEN ((c.status)::text = 'completed'::text) THEN c.credits_used
            ELSE 0
        END), (0)::bigint) AS total_credits_used,
    count(DISTINCT c.id) AS bolna_calls,
    count(DISTINCT
        CASE
            WHEN (a.bolna_agent_id IS NOT NULL) THEN a.id
            ELSE NULL::uuid
        END) AS bolna_agents
   FROM (((users u
     LEFT JOIN agents a ON (((u.id = a.user_id) AND (a.is_active = true))))
     LEFT JOIN calls c ON ((u.id = c.user_id)))
     LEFT JOIN contacts ct ON ((u.id = ct.user_id)))
  GROUP BY u.id, u.email, u.name, u.credits, u.is_active, u.created_at;```

---

## Materialized Views

### public.user_kpi_summary

```sql
 SELECT u.id AS user_id,
    u.email,
    u.name,
    u.credits,
    u.is_active,
    u.created_at AS user_created_at,
    COALESCE(call_stats.total_calls_30d, (0)::bigint) AS total_calls_30d,
    COALESCE(call_stats.successful_calls_30d, (0)::bigint) AS successful_calls_30d,
    COALESCE(call_stats.failed_calls_30d, (0)::bigint) AS failed_calls_30d,
    COALESCE(call_stats.success_rate_30d, (0)::numeric) AS success_rate_30d,
    COALESCE(call_stats.total_duration_30d, (0)::bigint) AS total_duration_30d,
    COALESCE(call_stats.avg_duration_30d, (0)::numeric) AS avg_duration_30d,
    COALESCE(call_stats.total_credits_used_30d, (0)::bigint) AS total_credits_used_30d,
    COALESCE(lead_stats.total_leads_30d, (0)::bigint) AS total_leads_30d,
    COALESCE(lead_stats.qualified_leads_30d, (0)::bigint) AS qualified_leads_30d,
    COALESCE(lead_stats.conversion_rate_30d, (0)::numeric) AS conversion_rate_30d,
    COALESCE(lead_stats.avg_lead_score_30d, (0)::numeric) AS avg_lead_score_30d,
    COALESCE(lead_stats.avg_intent_score_30d, (0)::numeric) AS avg_intent_score_30d,
    COALESCE(lead_stats.avg_engagement_score_30d, (0)::numeric) AS avg_engagement_score_30d,
    COALESCE(agent_stats.total_agents, (0)::bigint) AS total_agents,
    COALESCE(agent_stats.active_agents, (0)::bigint) AS active_agents,
    COALESCE(agent_stats.draft_agents, (0)::bigint) AS draft_agents,
    COALESCE(agent_perf.avg_conversations_per_hour_30d, (0)::numeric) AS avg_conversations_per_hour_30d,
    COALESCE(agent_perf.best_performing_agent_id, NULL::uuid) AS best_performing_agent_id,
    COALESCE(agent_perf.best_performing_agent_name, NULL::character varying) AS best_performing_agent_name,
    COALESCE(agent_perf.best_agent_success_rate, (0)::numeric) AS best_agent_success_rate,
    COALESCE(recent_stats.calls_last_7d, (0)::bigint) AS calls_last_7d,
    COALESCE(recent_stats.leads_last_7d, (0)::bigint) AS leads_last_7d,
    COALESCE(recent_stats.credits_used_last_7d, (0)::bigint) AS credits_used_last_7d,
    COALESCE(lifetime_stats.total_calls_lifetime, (0)::bigint) AS total_calls_lifetime,
    COALESCE(lifetime_stats.total_leads_lifetime, (0)::bigint) AS total_leads_lifetime,
    COALESCE(lifetime_stats.total_credits_used_lifetime, (0)::bigint) AS total_credits_used_lifetime,
    CURRENT_TIMESTAMP AS calculated_at,
    (CURRENT_TIMESTAMP + '01:00:00'::interval) AS expires_at
   FROM ((((((users u
     LEFT JOIN ( SELECT calls.user_id,
            count(*) AS total_calls_30d,
            count(
                CASE
                    WHEN ((calls.status)::text = 'completed'::text) THEN 1
                    ELSE NULL::integer
                END) AS successful_calls_30d,
            count(
                CASE
                    WHEN ((calls.status)::text = ANY ((ARRAY['failed'::character varying, 'cancelled'::character varying])::text[])) THEN 1
                    ELSE NULL::integer
                END) AS failed_calls_30d,
                CASE
                    WHEN (count(*) > 0) THEN round((((count(
                    CASE
                        WHEN ((calls.status)::text = 'completed'::text) THEN 1
                        ELSE NULL::integer
                    END))::numeric * 100.0) / (count(*))::numeric), 2)
                    ELSE (0)::numeric
                END AS success_rate_30d,
            COALESCE(sum(calls.duration_minutes), (0)::bigint) AS total_duration_30d,
            COALESCE(round(avg(calls.duration_minutes), 2), (0)::numeric) AS avg_duration_30d,
            COALESCE(sum(calls.credits_used), (0)::bigint) AS total_credits_used_30d
           FROM calls
          WHERE (calls.created_at >= (CURRENT_DATE - '30 days'::interval))
          GROUP BY calls.user_id) call_stats ON ((u.id = call_stats.user_id)))
     LEFT JOIN ( SELECT c.user_id,
            count(la.id) AS total_leads_30d,
            count(
                CASE
                    WHEN (la.total_score >= 70) THEN 1
                    ELSE NULL::integer
                END) AS qualified_leads_30d,
                CASE
                    WHEN (count(la.id) > 0) THEN round((((count(
                    CASE
                        WHEN (la.total_score >= 70) THEN 1
                        ELSE NULL::integer
                    END))::numeric * 100.0) / (count(la.id))::numeric), 2)
                    ELSE (0)::numeric
                END AS conversion_rate_30d,
            COALESCE(round(avg(la.total_score), 2), (0)::numeric) AS avg_lead_score_30d,
            COALESCE(round(avg(la.intent_score), 2), (0)::numeric) AS avg_intent_score_30d,
            COALESCE(round(avg(la.engagement_score), 2), (0)::numeric) AS avg_engagement_score_30d
           FROM (calls c
             JOIN lead_analytics la ON ((c.id = la.call_id)))
          WHERE (c.created_at >= (CURRENT_DATE - '30 days'::interval))
          GROUP BY c.user_id) lead_stats ON ((u.id = lead_stats.user_id)))
     LEFT JOIN ( SELECT agents.user_id,
            count(*) AS total_agents,
            count(
                CASE
                    WHEN (agents.is_active = true) THEN 1
                    ELSE NULL::integer
                END) AS active_agents,
            count(
                CASE
                    WHEN (agents.is_active = false) THEN 1
                    ELSE NULL::integer
                END) AS draft_agents
           FROM agents
          GROUP BY agents.user_id) agent_stats ON ((u.id = agent_stats.user_id)))
     LEFT JOIN ( SELECT aa.user_id,
            COALESCE(round(avg(
                CASE
                    WHEN ((aa.hour IS NOT NULL) AND (aa.total_calls > 0)) THEN aa.total_calls
                    ELSE 0
                END), 2), (0)::numeric) AS avg_conversations_per_hour_30d,
            ( SELECT a.id
                   FROM (agents a
                     JOIN agent_analytics aa2 ON ((a.id = aa2.agent_id)))
                  WHERE ((aa2.user_id = aa.user_id) AND (aa2.date >= (CURRENT_DATE - '30 days'::interval)) AND (aa2.hour IS NULL) AND (aa2.total_calls > 0))
                  GROUP BY a.id, a.name
                  ORDER BY ((sum(aa2.successful_calls))::numeric / (sum(aa2.total_calls))::numeric) DESC, (sum(aa2.total_calls)) DESC
                 LIMIT 1) AS best_performing_agent_id,
            ( SELECT a.name
                   FROM (agents a
                     JOIN agent_analytics aa2 ON ((a.id = aa2.agent_id)))
                  WHERE ((aa2.user_id = aa.user_id) AND (aa2.date >= (CURRENT_DATE - '30 days'::interval)) AND (aa2.hour IS NULL) AND (aa2.total_calls > 0))
                  GROUP BY a.id, a.name
                  ORDER BY ((sum(aa2.successful_calls))::numeric / (sum(aa2.total_calls))::numeric) DESC, (sum(aa2.total_calls)) DESC
                 LIMIT 1) AS best_performing_agent_name,
            ( SELECT round((((sum(aa2.successful_calls))::numeric / (sum(aa2.total_calls))::numeric) * (100)::numeric), 2) AS round
                   FROM (agents a
                     JOIN agent_analytics aa2 ON ((a.id = aa2.agent_id)))
                  WHERE ((aa2.user_id = aa.user_id) AND (aa2.date >= (CURRENT_DATE - '30 days'::interval)) AND (aa2.hour IS NULL) AND (aa2.total_calls > 0))
                  GROUP BY a.id
                  ORDER BY ((sum(aa2.successful_calls))::numeric / (sum(aa2.total_calls))::numeric) DESC, (sum(aa2.total_calls)) DESC
                 LIMIT 1) AS best_agent_success_rate
           FROM agent_analytics aa
          WHERE (aa.date >= (CURRENT_DATE - '30 days'::interval))
          GROUP BY aa.user_id) agent_perf ON ((u.id = agent_perf.user_id)))
     LEFT JOIN ( SELECT c.user_id,
            count(c.id) AS calls_last_7d,
            count(la.id) AS leads_last_7d,
            COALESCE(sum(c.credits_used), (0)::bigint) AS credits_used_last_7d
           FROM (calls c
             LEFT JOIN lead_analytics la ON ((c.id = la.call_id)))
          WHERE (c.created_at >= (CURRENT_DATE - '7 days'::interval))
          GROUP BY c.user_id) recent_stats ON ((u.id = recent_stats.user_id)))
     LEFT JOIN ( SELECT c.user_id,
            count(c.id) AS total_calls_lifetime,
            count(la.id) AS total_leads_lifetime,
            COALESCE(sum(c.credits_used), (0)::bigint) AS total_credits_used_lifetime
           FROM (calls c
             LEFT JOIN lead_analytics la ON ((c.id = la.call_id)))
          GROUP BY c.user_id) lifetime_stats ON ((u.id = lifetime_stats.user_id)))
  WHERE (u.is_active = true);```

#### Indexes

- `idx_user_kpi_summary_active_users`: CREATE INDEX idx_user_kpi_summary_active_users ON public.user_kpi_summary USING btree (is_active, calculated_at DESC)
- `idx_user_kpi_summary_calculated_at`: CREATE INDEX idx_user_kpi_summary_calculated_at ON public.user_kpi_summary USING btree (calculated_at DESC)
- `idx_user_kpi_summary_expires_at`: CREATE INDEX idx_user_kpi_summary_expires_at ON public.user_kpi_summary USING btree (expires_at)
- `idx_user_kpi_summary_user_id`: CREATE UNIQUE INDEX idx_user_kpi_summary_user_id ON public.user_kpi_summary USING btree (user_id)

---

## Functions

### public.audit_data_isolation

- **Arguments**: target_user_id uuid
- **Returns**: TABLE(audit_type text, potential_leak boolean, record_count bigint, details text)

```sql
CREATE OR REPLACE FUNCTION public.audit_data_isolation(target_user_id uuid)
 RETURNS TABLE(audit_type text, potential_leak boolean, record_count bigint, details text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Audit calls access
    RETURN QUERY
    SELECT 
        'calls_access'::TEXT,
        COUNT(*) > 0,
        COUNT(*)::BIGINT,
        'Calls accessible to user that should not be'::TEXT
    FROM calls c
    WHERE c.user_id != target_user_id
    AND EXISTS (
        SELECT 1 FROM agents a 
        WHERE a.id = c.agent_id 
        AND a.user_id = target_user_id
    );
    
    -- Audit lead_analytics access
    RETURN QUERY
    SELECT 
        'lead_analytics_access'::TEXT,
        COUNT(*) > 0,
        COUNT(*)::BIGINT,
        'Lead analytics accessible to user that should not be'::TEXT
    FROM lead_analytics la
    JOIN calls c ON la.call_id = c.id
    WHERE c.user_id != target_user_id
    AND la.user_id = target_user_id;
    
    -- Audit agent_analytics access
    RETURN QUERY
    SELECT 
        'agent_analytics_access'::TEXT,
        COUNT(*) > 0,
        COUNT(*)::BIGINT,
        'Agent analytics accessible to user that should not be'::TEXT
    FROM agent_analytics aa
    JOIN agents a ON aa.agent_id = a.id
    WHERE a.user_id != target_user_id
    AND aa.user_id = target_user_id;
END;
$function$

```

---

### public.batch_calculate_call_analytics

- **Arguments**: target_date date DEFAULT CURRENT_DATE
- **Returns**: integer

```sql
CREATE OR REPLACE FUNCTION public.batch_calculate_call_analytics(target_date date DEFAULT CURRENT_DATE)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
    user_record RECORD;
    processed_count INTEGER := 0;
BEGIN
    -- Calculate analytics for all active users
    FOR user_record IN 
        SELECT DISTINCT u.id 
        FROM users u 
        WHERE u.is_active = true
    LOOP
        PERFORM calculate_daily_call_analytics(user_record.id, target_date);
        processed_count := processed_count + 1;
    END LOOP;
    
    RETURN processed_count;
END;
$function$

```

---

### public.batch_calculate_call_analytics

- **Arguments**: target_date date DEFAULT NULL::date, batch_timezone text DEFAULT 'UTC'::text
- **Returns**: void

```sql
CREATE OR REPLACE FUNCTION public.batch_calculate_call_analytics(target_date date DEFAULT NULL::date, batch_timezone text DEFAULT 'UTC'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    calc_date DATE;
BEGIN
    -- Use provided timezone's current date if not specified
    calc_date := COALESCE(
        target_date, 
        DATE((NOW() AT TIME ZONE 'UTC') AT TIME ZONE batch_timezone)
    );
    
    -- Implementation depends on your existing logic
    RAISE NOTICE 'Batch calculating analytics for date % in timezone %', 
        calc_date, batch_timezone;
END;
$function$

```

---

### public.calculate_daily_call_analytics

- **Arguments**: target_user_id uuid, target_date date DEFAULT CURRENT_DATE
- **Returns**: void

```sql
CREATE OR REPLACE FUNCTION public.calculate_daily_call_analytics(target_user_id uuid, target_date date DEFAULT CURRENT_DATE)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    analytics_data RECORD;
BEGIN
    -- Calculate analytics for the target date
    SELECT 
        COUNT(c.id) as total_calls,
        COUNT(CASE WHEN c.status = 'completed' THEN 1 END) as successful_calls,
        COUNT(CASE WHEN c.status = 'failed' THEN 1 END) as failed_calls,
        COUNT(CASE WHEN c.status = 'cancelled' OR c.status IS NULL THEN 1 END) as missed_calls,
        CASE 
            WHEN COUNT(c.id) > 0 
            THEN (COUNT(CASE WHEN c.status = 'completed' THEN 1 END) * 100.0 / COUNT(c.id))
            ELSE 0 
        END as connection_rate,
        COALESCE(SUM(c.duration_minutes), 0) as total_call_duration,
        COALESCE(AVG(CASE WHEN c.status = 'completed' THEN c.duration_minutes END), 0) as average_call_duration,
        COUNT(CASE WHEN la.total_score >= 80 THEN 1 END) as hot_leads,
        COUNT(CASE WHEN la.total_score >= 60 AND la.total_score < 80 THEN 1 END) as warm_leads,
        COUNT(CASE WHEN la.total_score >= 40 AND la.total_score < 60 THEN 1 END) as cold_leads,
        COUNT(CASE WHEN la.total_score < 40 THEN 1 END) as unqualified_leads,
        COUNT(la.id) as total_leads,
        COALESCE(AVG(la.total_score), 0) as average_lead_score,
        CASE 
            WHEN COUNT(c.id) > 0 
            THEN (COUNT(CASE WHEN la.total_score >= 60 THEN 1 END) * 100.0 / COUNT(c.id))
            ELSE 0 
        END as conversion_rate,
        COUNT(CASE WHEN la.cta_interactions->>'pricing_clicked' = 'true' THEN 1 END) as pricing_clicks,
        COUNT(CASE WHEN la.cta_interactions->>'demo_clicked' = 'true' THEN 1 END) as demo_requests,
        COUNT(CASE WHEN la.cta_interactions->>'followup_clicked' = 'true' THEN 1 END) as followup_requests,
        COUNT(CASE WHEN la.cta_interactions->>'sample_clicked' = 'true' THEN 1 END) as sample_requests,
        COUNT(CASE WHEN la.cta_interactions->>'escalated_to_human' = 'true' THEN 1 END) as human_escalations,
        COUNT(CASE WHEN la.intent_score >= 70 THEN 1 END) as high_intent_leads,
        COUNT(CASE WHEN la.budget_score >= 70 THEN 1 END) as high_budget_leads,
        COUNT(CASE WHEN la.urgency_score >= 70 THEN 1 END) as urgent_leads,
        0 as inbound_calls, -- Currently all calls are outbound
        COUNT(c.id) as outbound_calls
    INTO analytics_data
    FROM calls c
    LEFT JOIN lead_analytics la ON c.id = la.call_id
    WHERE c.user_id = target_user_id 
        AND DATE(c.created_at) = target_date;

    -- Insert or update the cache record
    INSERT INTO call_analytics_cache (
        user_id, date_period, period_type,
        total_calls, successful_calls, failed_calls, missed_calls, connection_rate,
        total_call_duration, average_call_duration,
        hot_leads, warm_leads, cold_leads, unqualified_leads, total_leads, 
        average_lead_score, conversion_rate,
        pricing_clicks, demo_requests, followup_requests, sample_requests, human_escalations,
        high_intent_leads, high_budget_leads, urgent_leads,
        inbound_calls, outbound_calls,
        calculated_at
    ) VALUES (
        target_user_id, target_date, 'daily',
        analytics_data.total_calls, analytics_data.successful_calls, 
        analytics_data.failed_calls, analytics_data.missed_calls, analytics_data.connection_rate,
        analytics_data.total_call_duration, analytics_data.average_call_duration,
        analytics_data.hot_leads, analytics_data.warm_leads, 
        analytics_data.cold_leads, analytics_data.unqualified_leads, analytics_data.total_leads,
        analytics_data.average_lead_score, analytics_data.conversion_rate,
        analytics_data.pricing_clicks, analytics_data.demo_requests, 
        analytics_data.followup_requests, analytics_data.sample_requests, analytics_data.human_escalations,
        analytics_data.high_intent_leads, analytics_data.high_budget_leads, analytics_data.urgent_leads,
        analytics_data.inbound_calls, analytics_data.outbound_calls,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (user_id, date_period, period_type)
    DO UPDATE SET
        total_calls = EXCLUDED.total_calls,
        successful_calls = EXCLUDED.successful_calls,
        failed_calls = EXCLUDED.failed_calls,
        missed_calls = EXCLUDED.missed_calls,
        connection_rate = EXCLUDED.connection_rate,
        total_call_duration = EXCLUDED.total_call_duration,
        average_call_duration = EXCLUDED.average_call_duration,
        hot_leads = EXCLUDED.hot_leads,
        warm_leads = EXCLUDED.warm_leads,
        cold_leads = EXCLUDED.cold_leads,
        unqualified_leads = EXCLUDED.unqualified_leads,
        total_leads = EXCLUDED.total_leads,
        average_lead_score = EXCLUDED.average_lead_score,
        conversion_rate = EXCLUDED.conversion_rate,
        pricing_clicks = EXCLUDED.pricing_clicks,
        demo_requests = EXCLUDED.demo_requests,
        followup_requests = EXCLUDED.followup_requests,
        sample_requests = EXCLUDED.sample_requests,
        human_escalations = EXCLUDED.human_escalations,
        high_intent_leads = EXCLUDED.high_intent_leads,
        high_budget_leads = EXCLUDED.high_budget_leads,
        urgent_leads = EXCLUDED.urgent_leads,
        inbound_calls = EXCLUDED.inbound_calls,
        outbound_calls = EXCLUDED.outbound_calls,
        calculated_at = EXCLUDED.calculated_at,
        updated_at = CURRENT_TIMESTAMP;
END;
$function$

```

---

### public.calculate_daily_call_analytics

- **Arguments**: target_user_id uuid, target_date date DEFAULT NULL::date, user_timezone text DEFAULT 'UTC'::text
- **Returns**: void

```sql
CREATE OR REPLACE FUNCTION public.calculate_daily_call_analytics(target_user_id uuid, target_date date DEFAULT NULL::date, user_timezone text DEFAULT 'UTC'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    calc_date DATE;
BEGIN
    -- Use user's current date if not specified
    calc_date := COALESCE(
        target_date, 
        DATE((NOW() AT TIME ZONE 'UTC') AT TIME ZONE user_timezone)
    );
    
    -- Implementation depends on your existing logic
    -- This is a placeholder that would need your actual implementation
    RAISE NOTICE 'Calculating analytics for user % on date % in timezone %', 
        target_user_id, calc_date, user_timezone;
END;
$function$

```

---

### public.cleanup_expired_dashboard_cache

- **Arguments**: None
- **Returns**: void

```sql
CREATE OR REPLACE FUNCTION public.cleanup_expired_dashboard_cache()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    DELETE FROM dashboard_cache 
    WHERE expires_at < CURRENT_TIMESTAMP;
END;
$function$

```

---

### public.cleanup_expired_sessions

- **Arguments**: None
- **Returns**: integer

```sql
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM user_sessions 
    WHERE (expires_at < CURRENT_TIMESTAMP AND refresh_expires_at < CURRENT_TIMESTAMP) 
       OR is_active = false;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$function$

```

---

### public.cleanup_old_login_attempts

- **Arguments**: None
- **Returns**: integer

```sql
CREATE OR REPLACE FUNCTION public.cleanup_old_login_attempts()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM login_attempts 
    WHERE attempted_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$function$

```

---

### public.cleanup_orphaned_active_calls

- **Arguments**: None
- **Returns**: integer

```sql
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_active_calls()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  cleanup_count INTEGER;
BEGIN
  -- Remove active_calls entries where the actual call is no longer in progress
  DELETE FROM active_calls 
  WHERE id IN (
    SELECT ac.id 
    FROM active_calls ac
    LEFT JOIN calls c ON c.id = ac.id
    WHERE c.id IS NULL 
       OR c.status IN ('completed', 'failed', 'cancelled')
  );
  
  GET DIAGNOSTICS cleanup_count = ROW_COUNT;
  RETURN cleanup_count;
END;
$function$

```

---

### public.count_active_calls

- **Arguments**: p_user_id uuid
- **Returns**: integer

```sql
CREATE OR REPLACE FUNCTION public.count_active_calls(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM calls
  WHERE 
    user_id = p_user_id
    AND status IN ('in_progress', 'initiated', 'ringing');
  
  RETURN v_count;
END;
$function$

```

---

### public.count_system_active_calls

- **Arguments**: None
- **Returns**: integer

```sql
CREATE OR REPLACE FUNCTION public.count_system_active_calls()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM calls
  WHERE status IN ('in_progress', 'initiated', 'ringing');
  
  RETURN v_count;
END;
$function$

```

---

### public.count_user_direct_calls_queued

- **Arguments**: p_user_id uuid
- **Returns**: integer

```sql
CREATE OR REPLACE FUNCTION public.count_user_direct_calls_queued(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM call_queue
    WHERE user_id = p_user_id
      AND call_type = 'direct'
      AND status = 'queued'
  );
END;
$function$

```

---

### public.determine_call_source

- **Arguments**: caller_id text, call_type text DEFAULT NULL::text
- **Returns**: character varying

```sql
CREATE OR REPLACE FUNCTION public.determine_call_source(caller_id text, call_type text DEFAULT NULL::text)
 RETURNS character varying
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Check for actual phone number (not 'internal')
    IF caller_id IS NOT NULL 
       AND caller_id != '' 
       AND caller_id != 'internal' 
       AND caller_id ~ '^[\+]?[0-9\-\(\)\s]+$' THEN
        RETURN 'phone';
    END IF;
    
    -- Check for web/browser calls
    IF call_type IN ('web', 'browser') 
       OR caller_id = 'internal' 
       OR caller_id IS NULL 
       OR caller_id = '' THEN
        RETURN 'internet';
    END IF;
    
    -- Default to unknown for unclear cases
    RETURN 'unknown';
END;
$function$

```

---

### public.generate_customer_reference

- **Arguments**: None
- **Returns**: trigger

```sql
CREATE OR REPLACE FUNCTION public.generate_customer_reference()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    user_tz TEXT;
    ref_date DATE;
    sequence_num INTEGER;
BEGIN
    IF NEW.reference IS NOT NULL AND NEW.reference != '' THEN
        RETURN NEW;
    END IF;
    
    -- Get user timezone (customers table should have user_id FK)
    user_tz := COALESCE(
        (SELECT get_user_timezone(NEW.user_id)),
        'UTC'
    );
    
    -- Get current date in user's timezone
    ref_date := DATE((NOW() AT TIME ZONE 'UTC') AT TIME ZONE user_tz);
    
    -- Get next sequence number for this date
    SELECT COALESCE(MAX(CAST(SUBSTRING(reference FROM '\d+$') AS INTEGER)), 0) + 1
    INTO sequence_num
    FROM customers
    WHERE user_id = NEW.user_id
      AND reference LIKE 'CUST-' || TO_CHAR(ref_date, 'YYYYMMDD') || '-%';
    
    -- Generate reference: CUST-YYYYMMDD-NNN
    NEW.reference := 'CUST-' || TO_CHAR(ref_date, 'YYYYMMDD') || '-' || LPAD(sequence_num::TEXT, 3, '0');
    
    RETURN NEW;
END;
$function$

```

---

### public.get_call_queue_position

- **Arguments**: p_queue_id uuid
- **Returns**: integer

```sql
CREATE OR REPLACE FUNCTION public.get_call_queue_position(p_queue_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_user_id UUID;
  v_call_type VARCHAR(20);
  v_priority INTEGER;
  v_position INTEGER;
  v_created_at TIMESTAMPTZ;
  queue_position INTEGER;
BEGIN
  -- Get the call details
  SELECT user_id, call_type, priority, "position", created_at
  INTO v_user_id, v_call_type, v_priority, v_position, v_created_at
  FROM call_queue
  WHERE id = p_queue_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Count calls ahead of this one for the same user and type
  SELECT COUNT(*)::INTEGER INTO queue_position
  FROM call_queue
  WHERE user_id = v_user_id
    AND call_type = v_call_type
    AND status = 'queued'
    AND (
      priority > v_priority OR
      (priority = v_priority AND "position" < v_position) OR
      (priority = v_priority AND "position" = v_position AND created_at < v_created_at)
    );
  
  RETURN queue_position + 1; -- Add 1 because position is 1-indexed
END;
$function$

```

---

### public.get_next_direct_call_queued

- **Arguments**: p_user_id uuid
- **Returns**: TABLE(id uuid, user_id uuid, agent_id uuid, contact_id uuid, phone_number character varying, contact_name character varying, user_data jsonb, call_type character varying, priority integer, "position" integer, scheduled_for timestamp with time zone, created_at timestamp with time zone)

```sql
CREATE OR REPLACE FUNCTION public.get_next_direct_call_queued(p_user_id uuid)
 RETURNS TABLE(id uuid, user_id uuid, agent_id uuid, contact_id uuid, phone_number character varying, contact_name character varying, user_data jsonb, call_type character varying, priority integer, "position" integer, scheduled_for timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    q.id,
    q.user_id,
    q.agent_id,
    q.contact_id,
    q.phone_number,
    q.contact_name,
    q.user_data,
    q.call_type,
    q.priority,
    q."position",
    q.scheduled_for,
    q.created_at
  FROM call_queue q
  WHERE q.user_id = p_user_id
    AND q.call_type = 'direct'
    AND q.status = 'queued'
    AND q.scheduled_for <= NOW()
  ORDER BY q.priority DESC, q."position" ASC, q.created_at ASC
  LIMIT 1;
END;
$function$

```

---

### public.get_next_queued_call

- **Arguments**: p_user_id uuid
- **Returns**: call_queue

```sql
CREATE OR REPLACE FUNCTION public.get_next_queued_call(p_user_id uuid)
 RETURNS call_queue
 LANGUAGE plpgsql
AS $function$
DECLARE
  result call_queue;
  current_time_in_tz TIME;
  effective_timezone TEXT;
BEGIN
  -- First try to get a direct call (highest priority)
  SELECT * INTO result
  FROM call_queue q
  WHERE q.user_id = p_user_id
    AND q.call_type = 'direct'
    AND q.status = 'queued'
    AND q.scheduled_for <= NOW()
  ORDER BY q.priority DESC, q."position" ASC, q.created_at ASC
  LIMIT 1;
  
  -- If no direct call, get campaign call with timezone-aware time window check
  IF result.id IS NULL THEN
    -- Use a subquery to find eligible campaigns
    SELECT q.* INTO result
    FROM call_queue q
    INNER JOIN call_campaigns c ON q.campaign_id = c.id
    INNER JOIN users u ON q.user_id = u.id
    INNER JOIN LATERAL (
      -- Calculate effective timezone and current time in that timezone
      SELECT 
        CASE 
          WHEN c.use_custom_timezone = true AND c.campaign_timezone IS NOT NULL 
            THEN c.campaign_timezone
          WHEN u.timezone IS NOT NULL 
            THEN u.timezone
          ELSE 'UTC'
        END as tz,
        CASE 
          WHEN c.use_custom_timezone = true AND c.campaign_timezone IS NOT NULL 
            THEN (CURRENT_TIMESTAMP AT TIME ZONE c.campaign_timezone)::TIME
          WHEN u.timezone IS NOT NULL 
            THEN (CURRENT_TIMESTAMP AT TIME ZONE u.timezone)::TIME
          ELSE CURRENT_TIME
        END as current_time_tz
    ) tz_calc ON true
    WHERE q.user_id = p_user_id
      AND q.call_type = 'campaign'
      AND q.status = 'queued'
      AND c.status = 'active'
      AND q.scheduled_for <= NOW()
      -- Compare current time in campaign/user timezone with time window
      AND tz_calc.current_time_tz BETWEEN c.first_call_time AND c.last_call_time
    ORDER BY 
      COALESCE(q.last_system_allocation_at, '1970-01-01'::timestamptz) ASC,
      q.priority DESC,
      q."position" ASC,
      q.created_at ASC
    LIMIT 1;
  END IF;
  
  -- Update last_system_allocation_at for round-robin
  IF result.id IS NOT NULL THEN
    UPDATE call_queue 
    SET last_system_allocation_at = NOW()
    WHERE id = result.id;
  END IF;
  
  RETURN result;
END;
$function$

```

---

### public.get_system_active_calls_count

- **Arguments**: None
- **Returns**: integer

```sql
CREATE OR REPLACE FUNCTION public.get_system_active_calls_count()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER 
    FROM active_calls
  );
END;
$function$

```

---

### public.get_user_active_calls_count

- **Arguments**: p_user_id uuid, p_call_type character varying DEFAULT NULL::character varying
- **Returns**: integer

```sql
CREATE OR REPLACE FUNCTION public.get_user_active_calls_count(p_user_id uuid, p_call_type character varying DEFAULT NULL::character varying)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF p_call_type IS NULL THEN
    RETURN (
      SELECT COUNT(*)::INTEGER 
      FROM active_calls 
      WHERE user_id = p_user_id
    );
  ELSE
    RETURN (
      SELECT COUNT(*)::INTEGER 
      FROM active_calls 
      WHERE user_id = p_user_id AND call_type = p_call_type
    );
  END IF;
END;
$function$

```

---

### public.get_user_timezone

- **Arguments**: p_user_id uuid
- **Returns**: text

```sql
CREATE OR REPLACE FUNCTION public.get_user_timezone(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    user_tz TEXT;
BEGIN
    SELECT COALESCE(timezone, 'UTC') 
    INTO user_tz
    FROM users 
    WHERE id = p_user_id;
    
    RETURN COALESCE(user_tz, 'UTC');
END;
$function$

```

---

### public.recompute_agent_daily_from_calls

- **Arguments**: _agent_id uuid, _user_id uuid, _date date
- **Returns**: void

```sql
CREATE OR REPLACE FUNCTION public.recompute_agent_daily_from_calls(_agent_id uuid, _user_id uuid, _date date)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO agent_analytics AS aa (
    agent_id, user_id, date, hour,
    total_calls, successful_calls, failed_calls,
    total_duration_minutes, avg_duration_minutes, credits_used
  )
  SELECT
    _agent_id,
    _user_id,
    _date,
    NULL,
    COUNT(*) FILTER (WHERE DATE(c.created_at) = _date) AS total_calls,
    COUNT(*) FILTER (WHERE DATE(c.created_at) = _date AND c.status = 'completed') AS successful_calls,
    COUNT(*) FILTER (WHERE DATE(c.created_at) = _date AND c.status = 'failed') AS failed_calls,
    COALESCE(SUM(c.duration_minutes) FILTER (WHERE DATE(c.created_at) = _date), 0) AS total_duration_minutes,
    CASE WHEN COUNT(*) FILTER (WHERE DATE(c.created_at) = _date) > 0
         THEN (COALESCE(SUM(c.duration_minutes) FILTER (WHERE DATE(c.created_at) = _date), 0)::DECIMAL
               / NULLIF(COUNT(*) FILTER (WHERE DATE(c.created_at) = _date), 0))
         ELSE 0 END AS avg_duration_minutes,
    COALESCE(SUM(c.credits_used) FILTER (WHERE DATE(c.created_at) = _date), 0) AS credits_used
  FROM calls c
  WHERE c.agent_id = _agent_id AND c.user_id = _user_id AND DATE(c.created_at) = _date
  GROUP BY _agent_id, _user_id, _date
  ON CONFLICT (agent_id, date, hour)
  DO UPDATE SET
    total_calls = EXCLUDED.total_calls,
    successful_calls = EXCLUDED.successful_calls,
    failed_calls = EXCLUDED.failed_calls,
    total_duration_minutes = EXCLUDED.total_duration_minutes,
    avg_duration_minutes = EXCLUDED.avg_duration_minutes,
    credits_used = EXCLUDED.credits_used,
    updated_at = CURRENT_TIMESTAMP;
END;
$function$

```

---

### public.recompute_agent_daily_from_calls

- **Arguments**: _agent_id uuid, _user_id uuid, _date date, _user_tz text DEFAULT 'UTC'::text
- **Returns**: void

```sql
CREATE OR REPLACE FUNCTION public.recompute_agent_daily_from_calls(_agent_id uuid, _user_id uuid, _date date, _user_tz text DEFAULT 'UTC'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    INSERT INTO agent_analytics AS aa (
        agent_id, user_id, date, hour,
        total_calls, successful_calls, failed_calls,
        total_duration_minutes, avg_duration_minutes, credits_used
    )
    SELECT
        _agent_id,
        _user_id,
        _date,
        NULL,
        COUNT(*) FILTER (WHERE DATE(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE _user_tz) = _date) AS total_calls,
        COUNT(*) FILTER (WHERE DATE(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE _user_tz) = _date AND c.status = 'completed') AS successful_calls,
        COUNT(*) FILTER (WHERE DATE(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE _user_tz) = _date AND c.status = 'failed') AS failed_calls,
        COALESCE(SUM(c.duration_minutes) FILTER (WHERE DATE(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE _user_tz) = _date), 0) AS total_duration_minutes,
        CASE WHEN COUNT(*) FILTER (WHERE DATE(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE _user_tz) = _date) > 0
             THEN (COALESCE(SUM(c.duration_minutes) FILTER (WHERE DATE(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE _user_tz) = _date), 0)::DECIMAL
                   / NULLIF(COUNT(*) FILTER (WHERE DATE(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE _user_tz) = _date), 0))
             ELSE 0 END AS avg_duration_minutes,
        COALESCE(SUM(c.credits_used) FILTER (WHERE DATE(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE _user_tz) = _date), 0) AS credits_used
    FROM calls c
    WHERE c.agent_id = _agent_id 
      AND c.user_id = _user_id 
      AND DATE(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE _user_tz) = _date
    GROUP BY _agent_id, _user_id, _date
    ON CONFLICT (agent_id, date, hour)
    DO UPDATE SET
        total_calls = EXCLUDED.total_calls,
        successful_calls = EXCLUDED.successful_calls,
        failed_calls = EXCLUDED.failed_calls,
        total_duration_minutes = EXCLUDED.total_duration_minutes,
        avg_duration_minutes = EXCLUDED.avg_duration_minutes,
        credits_used = EXCLUDED.credits_used,
        updated_at = CURRENT_TIMESTAMP;
END;
$function$

```

---

### public.recompute_agent_daily_from_leads

- **Arguments**: _call_id uuid, _user_tz text DEFAULT 'UTC'::text
- **Returns**: void

```sql
CREATE OR REPLACE FUNCTION public.recompute_agent_daily_from_leads(_call_id uuid, _user_tz text DEFAULT 'UTC'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    _agent UUID;
    _user UUID;
    _date DATE;
BEGIN
    -- Get call details with user timezone
    SELECT 
        c.agent_id, 
        c.user_id, 
        DATE(c.created_at AT TIME ZONE 'UTC' AT TIME ZONE _user_tz)
    INTO _agent, _user, _date
    FROM calls c
    WHERE c.id = _call_id;

    IF _agent IS NULL OR _user IS NULL OR _date IS NULL THEN
        RETURN;
    END IF;

    WITH agg AS (
        SELECT 
            _agent AS agent_id,
            _user AS user_id,
            _date AS date,
            COUNT(*) AS leads_generated,
            COUNT(*) FILTER (WHERE l.total_score >= 70) AS qualified_leads,
            COUNT(*) FILTER (WHERE l.cta_pricing_clicked) AS cta_pricing_clicks,
            COUNT(*) FILTER (WHERE l.cta_demo_clicked) AS cta_demo_clicks,
            COUNT(*) FILTER (WHERE l.cta_followup_clicked) AS cta_followup_clicks,
            COUNT(*) FILTER (WHERE l.cta_sample_clicked) AS cta_sample_clicks,
            COUNT(*) FILTER (WHERE l.cta_escalated_to_human) AS cta_human_escalations,
            AVG(l.intent_score) AS avg_intent_score,
            AVG(l.urgency_score) AS avg_urgency_score,
            AVG(l.budget_score) AS avg_budget_score,
            AVG(l.fit_score) AS avg_fit_score,
            AVG(l.engagement_score) AS avg_engagement_score,
            AVG(l.total_score) AS avg_total_score
        FROM lead_analytics l
        JOIN calls c2 ON c2.id = l.call_id
        WHERE c2.agent_id = _agent 
          AND l.user_id = _user 
          AND DATE(c2.created_at AT TIME ZONE 'UTC' AT TIME ZONE _user_tz) = _date
    )
    INSERT INTO agent_analytics AS aa (
        agent_id, user_id, date, hour,
        leads_generated, qualified_leads,
        cta_pricing_clicks, cta_demo_clicks, cta_followup_clicks, cta_sample_clicks, cta_human_escalations,
        total_cta_interactions, cta_conversion_rate,
        avg_intent_score, avg_urgency_score, avg_budget_score, avg_fit_score, avg_engagement_score, avg_total_score
    )
    SELECT
        agent_id, user_id, date, NULL,
        leads_generated, qualified_leads,
        cta_pricing_clicks, cta_demo_clicks, cta_followup_clicks, cta_sample_clicks, cta_human_escalations,
        (cta_pricing_clicks + cta_demo_clicks + cta_followup_clicks + cta_sample_clicks + cta_human_escalations) AS total_cta_interactions,
        CASE WHEN leads_generated > 0
             THEN ((cta_pricing_clicks + cta_demo_clicks + cta_followup_clicks + cta_sample_clicks + cta_human_escalations)::DECIMAL / leads_generated) * 100
             ELSE 0 END AS cta_conversion_rate,
        avg_intent_score, avg_urgency_score, avg_budget_score, avg_fit_score, avg_engagement_score, avg_total_score
    FROM agg
    ON CONFLICT (agent_id, date, hour)
    DO UPDATE SET
        leads_generated = EXCLUDED.leads_generated,
        qualified_leads = EXCLUDED.qualified_leads,
        cta_pricing_clicks = EXCLUDED.cta_pricing_clicks,
        cta_demo_clicks = EXCLUDED.cta_demo_clicks,
        cta_followup_clicks = EXCLUDED.cta_followup_clicks,
        cta_sample_clicks = EXCLUDED.cta_sample_clicks,
        cta_human_escalations = EXCLUDED.cta_human_escalations,
        total_cta_interactions = EXCLUDED.total_cta_interactions,
        cta_conversion_rate = EXCLUDED.cta_conversion_rate,
        avg_intent_score = EXCLUDED.avg_intent_score,
        avg_urgency_score = EXCLUDED.avg_urgency_score,
        avg_budget_score = EXCLUDED.avg_budget_score,
        avg_fit_score = EXCLUDED.avg_fit_score,
        avg_engagement_score = EXCLUDED.avg_engagement_score,
        avg_total_score = EXCLUDED.avg_total_score,
        updated_at = CURRENT_TIMESTAMP;
END;
$function$

```

---

### public.recompute_agent_daily_from_leads

- **Arguments**: _call_id uuid
- **Returns**: void

```sql
CREATE OR REPLACE FUNCTION public.recompute_agent_daily_from_leads(_call_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  _agent UUID;
  _user UUID;
  _date DATE;
BEGIN
  SELECT c.agent_id, c.user_id, DATE(c.created_at)
  INTO _agent, _user, _date
  FROM calls c
  WHERE c.id = _call_id;

  IF _agent IS NULL OR _user IS NULL OR _date IS NULL THEN
    RETURN;
  END IF;

  WITH agg AS (
    SELECT 
      _agent AS agent_id,
      _user AS user_id,
      _date AS date,
      COUNT(*) AS leads_generated,
      COUNT(*) FILTER (WHERE l.total_score >= 70) AS qualified_leads,
      COUNT(*) FILTER (WHERE l.cta_pricing_clicked) AS cta_pricing_clicks,
      COUNT(*) FILTER (WHERE l.cta_demo_clicked) AS cta_demo_clicks,
      COUNT(*) FILTER (WHERE l.cta_followup_clicked) AS cta_followup_clicks,
      COUNT(*) FILTER (WHERE l.cta_sample_clicked) AS cta_sample_clicks,
      COUNT(*) FILTER (WHERE l.cta_escalated_to_human) AS cta_human_escalations,
      AVG(l.intent_score) AS avg_intent_score,
      AVG(l.urgency_score) AS avg_urgency_score,
      AVG(l.budget_score) AS avg_budget_score,
      AVG(l.fit_score) AS avg_fit_score,
      AVG(l.engagement_score) AS avg_engagement_score,
      AVG(l.total_score) AS avg_total_score
    FROM lead_analytics l
    JOIN calls c2 ON c2.id = l.call_id
    WHERE c2.agent_id = _agent AND l.user_id = _user AND DATE(c2.created_at) = _date
  )
  INSERT INTO agent_analytics AS aa (
    agent_id, user_id, date, hour,
    leads_generated, qualified_leads,
    cta_pricing_clicks, cta_demo_clicks, cta_followup_clicks, cta_sample_clicks, cta_human_escalations,
    total_cta_interactions, cta_conversion_rate,
    avg_intent_score, avg_urgency_score, avg_budget_score, avg_fit_score, avg_engagement_score, avg_total_score
  )
  SELECT
    agent_id, user_id, date, NULL,
    leads_generated, qualified_leads,
    cta_pricing_clicks, cta_demo_clicks, cta_followup_clicks, cta_sample_clicks, cta_human_escalations,
    (cta_pricing_clicks + cta_demo_clicks + cta_followup_clicks + cta_sample_clicks + cta_human_escalations) AS total_cta_interactions,
    CASE WHEN leads_generated > 0
         THEN ((cta_pricing_clicks + cta_demo_clicks + cta_followup_clicks + cta_sample_clicks + cta_human_escalations)::DECIMAL / leads_generated) * 100
         ELSE 0 END AS cta_conversion_rate,
    avg_intent_score, avg_urgency_score, avg_budget_score, avg_fit_score, avg_engagement_score, avg_total_score
  FROM agg
  ON CONFLICT (agent_id, date, hour)
  DO UPDATE SET
    leads_generated = EXCLUDED.leads_generated,
    qualified_leads = EXCLUDED.qualified_leads,
    cta_pricing_clicks = EXCLUDED.cta_pricing_clicks,
    cta_demo_clicks = EXCLUDED.cta_demo_clicks,
    cta_followup_clicks = EXCLUDED.cta_followup_clicks,
    cta_sample_clicks = EXCLUDED.cta_sample_clicks,
    cta_human_escalations = EXCLUDED.cta_human_escalations,
    total_cta_interactions = EXCLUDED.total_cta_interactions,
    cta_conversion_rate = EXCLUDED.cta_conversion_rate,
    avg_intent_score = EXCLUDED.avg_intent_score,
    avg_urgency_score = EXCLUDED.avg_urgency_score,
    avg_budget_score = EXCLUDED.avg_budget_score,
    avg_fit_score = EXCLUDED.avg_fit_score,
    avg_engagement_score = EXCLUDED.avg_engagement_score,
    avg_total_score = EXCLUDED.avg_total_score,
    updated_at = CURRENT_TIMESTAMP;
END;
$function$

```

---

### public.recompute_user_daily_from_agent

- **Arguments**: _user_id uuid, _date date
- **Returns**: void

```sql
CREATE OR REPLACE FUNCTION public.recompute_user_daily_from_agent(_user_id uuid, _date date)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    INSERT INTO user_analytics AS ua (
        user_id, date, hour,
        total_calls, successful_calls, failed_calls,
        total_duration_minutes, avg_duration_minutes,
        leads_generated, qualified_leads,
        cta_pricing_clicks, cta_demo_clicks, cta_followup_clicks, cta_sample_clicks, cta_human_escalations,
        total_cta_interactions, cta_conversion_rate, credits_used,
        success_rate, answer_rate
    )
    SELECT
        _user_id, _date, NULL,
        COALESCE(SUM(aa.total_calls), 0),
        COALESCE(SUM(aa.successful_calls), 0),
        COALESCE(SUM(aa.failed_calls), 0),
        COALESCE(SUM(aa.total_duration_minutes), 0),
        CASE WHEN SUM(aa.total_calls) > 0 THEN (SUM(aa.total_duration_minutes)::DECIMAL / SUM(aa.total_calls)) ELSE 0 END,
        COALESCE(SUM(aa.leads_generated), 0),
        COALESCE(SUM(aa.qualified_leads), 0),
        COALESCE(SUM(aa.cta_pricing_clicks), 0),
        COALESCE(SUM(aa.cta_demo_clicks), 0),
        COALESCE(SUM(aa.cta_followup_clicks), 0),
        COALESCE(SUM(aa.cta_sample_clicks), 0),
        COALESCE(SUM(aa.cta_human_escalations), 0),
        COALESCE(SUM(aa.total_cta_interactions), 0),
        CASE WHEN SUM(aa.leads_generated) > 0 THEN (SUM(aa.total_cta_interactions)::DECIMAL / SUM(aa.leads_generated) * 100) ELSE 0 END,
        COALESCE(SUM(aa.credits_used), 0),
        CASE WHEN SUM(aa.total_calls) > 0 THEN (SUM(aa.successful_calls)::DECIMAL / SUM(aa.total_calls) * 100) ELSE 0 END AS success_rate,
        CASE WHEN SUM(aa.total_calls) > 0 THEN ((SUM(aa.successful_calls) + SUM(aa.failed_calls))::DECIMAL / SUM(aa.total_calls) * 100) ELSE 0 END AS answer_rate
    FROM agent_analytics aa
    WHERE aa.user_id = _user_id AND aa.date = _date AND aa.hour IS NULL
    GROUP BY _user_id, _date
    ON CONFLICT (user_id, date, hour)
    DO UPDATE SET
        total_calls = EXCLUDED.total_calls,
        successful_calls = EXCLUDED.successful_calls,
        failed_calls = EXCLUDED.failed_calls,
        total_duration_minutes = EXCLUDED.total_duration_minutes,
        avg_duration_minutes = EXCLUDED.avg_duration_minutes,
        leads_generated = EXCLUDED.leads_generated,
        qualified_leads = EXCLUDED.qualified_leads,
        cta_pricing_clicks = EXCLUDED.cta_pricing_clicks,
        cta_demo_clicks = EXCLUDED.cta_demo_clicks,
        cta_followup_clicks = EXCLUDED.cta_followup_clicks,
        cta_sample_clicks = EXCLUDED.cta_sample_clicks,
        cta_human_escalations = EXCLUDED.cta_human_escalations,
        total_cta_interactions = EXCLUDED.total_cta_interactions,
        cta_conversion_rate = EXCLUDED.cta_conversion_rate,
        credits_used = EXCLUDED.credits_used,
        success_rate = EXCLUDED.success_rate,
        answer_rate = EXCLUDED.answer_rate,
        updated_at = CURRENT_TIMESTAMP;
END;
$function$

```

---

### public.refresh_user_kpi_summary

- **Arguments**: None
- **Returns**: void

```sql
CREATE OR REPLACE FUNCTION public.refresh_user_kpi_summary()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_kpi_summary;
END;
$function$

```

---

### public.refresh_user_kpi_summary_for_user

- **Arguments**: target_user_id uuid
- **Returns**: void

```sql
CREATE OR REPLACE FUNCTION public.refresh_user_kpi_summary_for_user(target_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- For now, refresh the entire view since PostgreSQL doesn't support partial refresh
    -- In a production environment, consider using a table instead of materialized view
    -- for more granular updates
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_kpi_summary;
END;
$function$

```

---

### public.scheduled_refresh_user_kpi_summary

- **Arguments**: None
- **Returns**: void

```sql
CREATE OR REPLACE FUNCTION public.scheduled_refresh_user_kpi_summary()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Refresh materialized view
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_kpi_summary;
    
    -- Log the refresh
    INSERT INTO system_config (config_key, config_value, description, updated_at)
    VALUES (
        'last_kpi_refresh', 
        EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::text,
        'Timestamp of last user KPI summary refresh',
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (config_key)
    DO UPDATE SET
        config_value = EXCLUDED.config_value,
        updated_at = CURRENT_TIMESTAMP;
END;
$function$

```

---

### public.show_db_tree

- **Arguments**: None
- **Returns**: TABLE(tree_structure text)

```sql
CREATE OR REPLACE FUNCTION public.show_db_tree()
 RETURNS TABLE(tree_structure text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- First show all databases
    RETURN QUERY
    SELECT ':file_folder: ' || datname || ' (DATABASE)'
    FROM pg_database 
    WHERE datistemplate = false;

    -- Then show current database structure
    RETURN QUERY
    WITH RECURSIVE 
    -- Get schemas
    schemas AS (
        SELECT 
            n.nspname AS object_name,
            1 AS level,
            n.nspname AS path,
            'SCHEMA' AS object_type
        FROM pg_namespace n
        WHERE n.nspname NOT LIKE 'pg_%' 
        AND n.nspname != 'information_schema'
    ),

    -- Get all objects (tables, views, functions, etc.)
    objects AS (
        SELECT 
            c.relname AS object_name,
            2 AS level,
            s.path || ' → ' || c.relname AS path,
            CASE c.relkind
                WHEN 'r' THEN 'TABLE'
                WHEN 'v' THEN 'VIEW'
                WHEN 'm' THEN 'MATERIALIZED VIEW'
                WHEN 'i' THEN 'INDEX'
                WHEN 'S' THEN 'SEQUENCE'
                WHEN 'f' THEN 'FOREIGN TABLE'
            END AS object_type
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN schemas s ON n.nspname = s.object_name
        WHERE c.relkind IN ('r','v','m','i','S','f')

        UNION ALL

        SELECT 
            p.proname AS object_name,
            2 AS level,
            s.path || ' → ' || p.proname AS path,
            'FUNCTION' AS object_type
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN schemas s ON n.nspname = s.object_name
    ),

    -- Combine schemas and objects
    combined AS (
        SELECT * FROM schemas
        UNION ALL
        SELECT * FROM objects
    )

    -- Final output with tree-like formatting
    SELECT 
        REPEAT('    ', level) || 
        CASE 
            WHEN level = 1 THEN '└── :open_file_folder: '
            ELSE '    └── ' || 
                CASE object_type
                    WHEN 'TABLE' THEN ':bar_chart: '
                    WHEN 'VIEW' THEN ':eye: '
                    WHEN 'MATERIALIZED VIEW' THEN ':newspaper: '
                    WHEN 'FUNCTION' THEN ':zap: '
                    WHEN 'INDEX' THEN ':mag: '
                    WHEN 'SEQUENCE' THEN ':1234: '
                    WHEN 'FOREIGN TABLE' THEN ':globe_with_meridians: '
                    ELSE ''
                END
        END || object_name || ' (' || object_type || ')'
    FROM combined
    ORDER BY path;
END;
$function$

```

---

### public.test_cache_invalidation

- **Arguments**: test_table_name character varying, test_user_id uuid DEFAULT NULL::uuid
- **Returns**: json

```sql
CREATE OR REPLACE FUNCTION public.test_cache_invalidation(test_table_name character varying, test_user_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
    test_result JSON;
    test_user_id_actual UUID;
BEGIN
    -- Use provided user_id or find a test user
    IF test_user_id IS NULL THEN
        SELECT id INTO test_user_id_actual FROM users LIMIT 1;
        IF test_user_id_actual IS NULL THEN
            RETURN json_build_object(
                'success', false,
                'error', 'No users found for testing'
            );
        END IF;
    ELSE
        test_user_id_actual := test_user_id;
    END IF;

    -- Test notification by sending a manual notification
    PERFORM pg_notify('cache_invalidation', json_build_object(
        'table', test_table_name,
        'operation', 'TEST',
        'user_id', test_user_id_actual,
        'record_id', gen_random_uuid(),
        'agent_id', NULL,
        'timestamp', extract(epoch from now()),
        'batch_id', txid_current(),
        'test', true
    )::text);

    RETURN json_build_object(
        'success', true,
        'message', 'Test cache invalidation notification sent',
        'table', test_table_name,
        'user_id', test_user_id_actual
    );
END;
$function$

```

---

### public.trg_calls_daily_analytics

- **Arguments**: None
- **Returns**: trigger

```sql
CREATE OR REPLACE FUNCTION public.trg_calls_daily_analytics()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    call_date DATE;
    call_hour INTEGER;
    status_changed BOOLEAN := (TG_OP = 'UPDATE' AND (OLD.status IS DISTINCT FROM NEW.status));
BEGIN
    -- Only act when:
    -- 1) INSERT of a completed/failed call, or
    -- 2) UPDATE where status changed to completed/failed
    IF (
         (TG_OP = 'INSERT' AND NEW.status IN ('completed','failed'))
         OR (status_changed AND NEW.status IN ('completed','failed'))
       ) THEN
        call_date := CAST(NEW.created_at AS DATE);
        call_hour := EXTRACT(HOUR FROM NEW.created_at)::INTEGER;

        IF NEW.status = 'completed' THEN
          INSERT INTO agent_analytics (agent_id, user_id, date, hour, total_calls, successful_calls, failed_calls, total_duration_minutes, credits_used)
          VALUES (NEW.agent_id, NEW.user_id, call_date, call_hour, 1, 1, 0, NEW.duration_minutes, NEW.credits_used)
          ON CONFLICT (agent_id, date, hour)
          DO UPDATE SET
            total_calls = agent_analytics.total_calls + 1,
            successful_calls = agent_analytics.successful_calls + 1,
            total_duration_minutes = agent_analytics.total_duration_minutes + NEW.duration_minutes,
            credits_used = agent_analytics.credits_used + NEW.credits_used,
            updated_at = NOW();
        ELSIF NEW.status = 'failed' THEN
          INSERT INTO agent_analytics (agent_id, user_id, date, hour, total_calls, successful_calls, failed_calls, total_duration_minutes, credits_used)
          VALUES (NEW.agent_id, NEW.user_id, call_date, call_hour, 1, 0, 1, 0, 0)
          ON CONFLICT (agent_id, date, hour)
          DO UPDATE SET
            total_calls = agent_analytics.total_calls + 1,
            failed_calls = agent_analytics.failed_calls + 1,
            updated_at = NOW();
        END IF;
    END IF;

    RETURN NEW;
END;
$function$

```

---

### public.trg_leads_daily_analytics

- **Arguments**: None
- **Returns**: trigger

```sql
CREATE OR REPLACE FUNCTION public.trg_leads_daily_analytics()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    _user_id UUID;
    _user_tz TEXT;
BEGIN
    -- Get user_id from the new lead record
    SELECT user_id INTO _user_id FROM lead_analytics WHERE id = NEW.id;
    
    -- Get user timezone
    _user_tz := get_user_timezone(COALESCE(_user_id, NEW.user_id));
    
    -- Recompute with user timezone
    PERFORM recompute_agent_daily_from_leads(NEW.call_id, _user_tz);
    
    RETURN NEW;
END;
$function$

```

---

### public.trg_user_daily_rollup

- **Arguments**: None
- **Returns**: trigger

```sql
CREATE OR REPLACE FUNCTION public.trg_user_daily_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.hour IS NULL THEN
        PERFORM recompute_user_daily_from_agent(NEW.user_id, NEW.date);
    END IF;
    RETURN NEW;
END;
$function$

```

---

### public.trigger_cleanup_active_calls

- **Arguments**: None
- **Returns**: trigger

```sql
CREATE OR REPLACE FUNCTION public.trigger_cleanup_active_calls()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- When a call status changes to completed/failed/cancelled, remove from active_calls
  IF NEW.status IN ('completed', 'failed', 'cancelled') AND 
     OLD.status NOT IN ('completed', 'failed', 'cancelled') THEN
    
    DELETE FROM active_calls WHERE id = NEW.id;
    
    -- Log the cleanup for debugging
    RAISE NOTICE 'Cleaned up active_calls entry for call_id: %, status: %', NEW.id, NEW.status;
  END IF;
  
  RETURN NEW;
END;
$function$

```

---

### public.trigger_refresh_user_kpi_summary

- **Arguments**: None
- **Returns**: trigger

```sql
CREATE OR REPLACE FUNCTION public.trigger_refresh_user_kpi_summary()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    refresh_needed BOOLEAN := false;
    user_id_to_refresh UUID;
BEGIN
    -- Check if the change affects KPI calculations
    IF TG_TABLE_NAME = 'calls' THEN
        -- Refresh if call status changes to completed or if it's a new completed call
        IF (NEW.status = 'completed' AND (OLD IS NULL OR OLD.status != 'completed')) OR
           (OLD IS NOT NULL AND OLD.status = 'completed' AND NEW.status != 'completed') THEN
            refresh_needed := true;
            user_id_to_refresh := COALESCE(NEW.user_id, OLD.user_id);
        END IF;
    ELSIF TG_TABLE_NAME = 'lead_analytics' THEN
        -- Always refresh for new lead analytics
        refresh_needed := true;
        -- Get user_id from the related call since lead_analytics doesn't have user_id
        SELECT c.user_id INTO user_id_to_refresh 
        FROM calls c 
        WHERE c.id = NEW.call_id;
    ELSIF TG_TABLE_NAME = 'agents' THEN
        -- Refresh if agent active status changes
        IF (OLD IS NULL OR OLD.is_active != NEW.is_active) THEN
            refresh_needed := true;
            user_id_to_refresh := COALESCE(NEW.user_id, OLD.user_id);
        END IF;
    ELSIF TG_TABLE_NAME = 'agent_analytics' THEN
        -- Refresh for new or updated agent analytics (daily aggregates only)
        IF NEW.hour IS NULL THEN
            refresh_needed := true;
            user_id_to_refresh := COALESCE(NEW.user_id, OLD.user_id);
        END IF;
    END IF;

    -- Schedule refresh in background (using pg_notify for external processing)
    IF refresh_needed AND user_id_to_refresh IS NOT NULL THEN
        PERFORM pg_notify('refresh_user_kpi_summary',
            json_build_object(
                'user_id', user_id_to_refresh,
                'table', TG_TABLE_NAME,
                'timestamp', EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)
            )::text
        );
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$function$

```

---

### public.update_agent_scores_from_lead_analytics

- **Arguments**: None
- **Returns**: trigger

```sql
CREATE OR REPLACE FUNCTION public.update_agent_scores_from_lead_analytics()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    call_record RECORD;
    analytics_date DATE;
    user_tz TEXT;
BEGIN
    -- Get call information to determine agent_id, user_id, and timezone
    SELECT c.agent_id, c.user_id, c.created_at
    INTO call_record
    FROM calls c
    WHERE c.id = NEW.call_id;
    
    -- Skip if call not found
    IF call_record IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Get user timezone
    user_tz := get_user_timezone(call_record.user_id);
    
    -- Determine date using user timezone
    analytics_date := DATE(call_record.created_at AT TIME ZONE 'UTC' AT TIME ZONE user_tz);
    
    -- Update agent analytics with lead scores
    UPDATE agent_analytics
    SET
        avg_intent_score = (COALESCE(avg_intent_score, 0) * COALESCE(leads_generated, 0) + COALESCE(NEW.intent_score, 0)) / (COALESCE(leads_generated, 0) + 1),
        avg_urgency_score = (COALESCE(avg_urgency_score, 0) * COALESCE(leads_generated, 0) + COALESCE(NEW.urgency_score, 0)) / (COALESCE(leads_generated, 0) + 1),
        avg_budget_score = (COALESCE(avg_budget_score, 0) * COALESCE(leads_generated, 0) + COALESCE(NEW.budget_score, 0)) / (COALESCE(leads_generated, 0) + 1),
        avg_fit_score = (COALESCE(avg_fit_score, 0) * COALESCE(leads_generated, 0) + COALESCE(NEW.fit_score, 0)) / (COALESCE(leads_generated, 0) + 1),
        avg_engagement_score = (COALESCE(avg_engagement_score, 0) * COALESCE(leads_generated, 0) + COALESCE(NEW.engagement_score, 0)) / (COALESCE(leads_generated, 0) + 1),
        avg_total_score = (COALESCE(avg_total_score, 0) * COALESCE(leads_generated, 0) + COALESCE(NEW.total_score, 0)) / (COALESCE(leads_generated, 0) + 1),
        updated_at = CURRENT_TIMESTAMP
    WHERE agent_id = call_record.agent_id
      AND user_id = call_record.user_id
      AND date = analytics_date
      AND hour IS NULL;  -- Update daily aggregate only

    RETURN NEW;
END;
$function$

```

---

### public.update_call_campaigns_updated_at

- **Arguments**: None
- **Returns**: trigger

```sql
CREATE OR REPLACE FUNCTION public.update_call_campaigns_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$function$

```

---

### public.update_call_queue_updated_at

- **Arguments**: None
- **Returns**: trigger

```sql
CREATE OR REPLACE FUNCTION public.update_call_queue_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$function$

```

---

### public.update_campaign_statistics

- **Arguments**: None
- **Returns**: trigger

```sql
CREATE OR REPLACE FUNCTION public.update_campaign_statistics()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE call_campaigns
    SET 
      completed_calls = completed_calls + 1,
      successful_calls = CASE 
        WHEN NEW.call_id IS NOT NULL THEN successful_calls + 1 
        ELSE successful_calls 
      END
    WHERE id = NEW.campaign_id;
  END IF;
  
  IF NEW.status = 'failed' AND OLD.status != 'failed' THEN
    UPDATE call_campaigns
    SET failed_calls = failed_calls + 1
    WHERE id = NEW.campaign_id;
  END IF;
  
  -- Mark campaign as completed if all calls done
  UPDATE call_campaigns
  SET 
    status = 'completed',
    completed_at = CURRENT_TIMESTAMP
  WHERE 
    id = NEW.campaign_id 
    AND status = 'active'
    AND completed_calls + failed_calls >= total_contacts;
  
  RETURN NEW;
END;
$function$

```

---

### public.update_campaign_statistics_on_delete

- **Arguments**: None
- **Returns**: trigger

```sql
CREATE OR REPLACE FUNCTION public.update_campaign_statistics_on_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only process if this queue item belongs to a campaign
  IF OLD.campaign_id IS NOT NULL THEN
    -- Determine success/failure based on call_id presence and status
    -- 
    -- Scenarios:
    -- 1. Successful call: status='processing', call_id IS NOT NULL
    --    -> completed_calls++, successful_calls++
    -- 2. Failed call (busy/no-answer/failed): status='processing' OR 'queued', call_id may or may not exist
    --    -> failed_calls++ (if last_call_outcome indicates failure)
    -- 3. Retry scheduled: We mark as completed (not failed) but create new queue item
    --    -> Don't count as failed
    -- 4. Cancelled: status='cancelled'
    --    -> Don't update stats (campaign was cancelled)
    
    IF OLD.status = 'cancelled' THEN
      -- Cancelled items don't affect stats
      RETURN OLD;
    END IF;
    
    -- Check if this was marked as a failure via last_call_outcome column
    IF OLD.last_call_outcome IN ('busy', 'no-answer', 'failed', 'error') AND OLD.call_id IS NULL THEN
      -- This was a failed call that didn't connect
      UPDATE call_campaigns
      SET 
        failed_calls = failed_calls + 1
      WHERE id = OLD.campaign_id;
    ELSIF OLD.call_id IS NOT NULL THEN
      -- This was a call that connected (successful)
      UPDATE call_campaigns
      SET 
        completed_calls = completed_calls + 1,
        successful_calls = successful_calls + 1
      WHERE id = OLD.campaign_id;
    ELSE
      -- Processing item without call_id and no explicit failure outcome
      -- This could be a retry being scheduled - count as completed but not successful
      UPDATE call_campaigns
      SET completed_calls = completed_calls + 1
      WHERE id = OLD.campaign_id;
    END IF;
  END IF;
  
  RETURN OLD;
END;
$function$

```

---

### public.update_dashboard_cache_from_agents

- **Arguments**: None
- **Returns**: trigger

```sql
CREATE OR REPLACE FUNCTION public.update_dashboard_cache_from_agents()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    user_stats RECORD;
BEGIN
    -- Calculate updated user statistics
    SELECT 
        NEW.user_id as user_id,
        COALESCE(SUM(aa.total_calls), 0) as total_calls,
        COALESCE(SUM(aa.successful_calls), 0) as successful_calls,
        COALESCE(SUM(aa.leads_generated), 0) as total_leads,
        COALESCE(SUM(aa.qualified_leads), 0) as qualified_leads,
        COALESCE(SUM(aa.credits_used), 0) as credits_used,
        COALESCE(AVG(aa.avg_engagement_score), 0) as avg_engagement,
        COUNT(DISTINCT aa.agent_id) as active_agents
    INTO user_stats
    FROM agent_analytics aa
    WHERE aa.user_id = NEW.user_id 
      AND aa.date >= CURRENT_DATE - INTERVAL '30 days'
      AND aa.hour IS NULL;

    -- Update dashboard cache table
    INSERT INTO dashboard_cache (
        user_id,
        cache_key,
        cache_data,
        expires_at,
        created_at,
        updated_at
    )
    VALUES (
        NEW.user_id,
        'overview_stats',
        jsonb_build_object(
            'total_calls', user_stats.total_calls,
            'successful_calls', user_stats.successful_calls,
            'success_rate', CASE 
                WHEN user_stats.total_calls > 0 
                THEN (user_stats.successful_calls::DECIMAL / user_stats.total_calls * 100)
                ELSE 0 
            END,
            'total_leads', user_stats.total_leads,
            'qualified_leads', user_stats.qualified_leads,
            'conversion_rate', CASE 
                WHEN user_stats.total_leads > 0 
                THEN (user_stats.qualified_leads::DECIMAL / user_stats.total_leads * 100)
                ELSE 0 
            END,
            'credits_used', user_stats.credits_used,
            'avg_engagement', user_stats.avg_engagement,
            'active_agents', user_stats.active_agents,
            'last_updated', EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)
        ),
        CURRENT_TIMESTAMP + INTERVAL '1 hour',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (user_id, cache_key)
    DO UPDATE SET
        cache_data = EXCLUDED.cache_data,
        expires_at = EXCLUDED.expires_at,
        updated_at = CURRENT_TIMESTAMP;

    RETURN NEW;
END;
$function$

```

---

### public.update_follow_ups_updated_at

- **Arguments**: None
- **Returns**: trigger

```sql
CREATE OR REPLACE FUNCTION public.update_follow_ups_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$function$

```

---

### public.update_phone_numbers_updated_at

- **Arguments**: None
- **Returns**: trigger

```sql
CREATE OR REPLACE FUNCTION public.update_phone_numbers_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $function$

```

---

### public.update_session_last_used

- **Arguments**: None
- **Returns**: trigger

```sql
CREATE OR REPLACE FUNCTION public.update_session_last_used()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.last_used_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$function$

```

---

### public.update_updated_at_column

- **Arguments**: None
- **Returns**: trigger

```sql
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$function$

```

---

### public.update_user_email_settings_updated_at

- **Arguments**: None
- **Returns**: trigger

```sql
CREATE OR REPLACE FUNCTION public.update_user_email_settings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$function$

```

---

### public.uuid_generate_v1

- **Arguments**: None
- **Returns**: uuid

```sql
CREATE OR REPLACE FUNCTION public.uuid_generate_v1()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v1$function$

```

---

### public.uuid_generate_v1mc

- **Arguments**: None
- **Returns**: uuid

```sql
CREATE OR REPLACE FUNCTION public.uuid_generate_v1mc()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v1mc$function$

```

---

### public.uuid_generate_v3

- **Arguments**: namespace uuid, name text
- **Returns**: uuid

```sql
CREATE OR REPLACE FUNCTION public.uuid_generate_v3(namespace uuid, name text)
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v3$function$

```

---

### public.uuid_generate_v4

- **Arguments**: None
- **Returns**: uuid

```sql
CREATE OR REPLACE FUNCTION public.uuid_generate_v4()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v4$function$

```

---

### public.uuid_generate_v5

- **Arguments**: namespace uuid, name text
- **Returns**: uuid

```sql
CREATE OR REPLACE FUNCTION public.uuid_generate_v5(namespace uuid, name text)
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v5$function$

```

---

### public.uuid_nil

- **Arguments**: None
- **Returns**: uuid

```sql
CREATE OR REPLACE FUNCTION public.uuid_nil()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_nil$function$

```

---

### public.uuid_ns_dns

- **Arguments**: None
- **Returns**: uuid

```sql
CREATE OR REPLACE FUNCTION public.uuid_ns_dns()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_dns$function$

```

---

### public.uuid_ns_oid

- **Arguments**: None
- **Returns**: uuid

```sql
CREATE OR REPLACE FUNCTION public.uuid_ns_oid()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_oid$function$

```

---

### public.uuid_ns_url

- **Arguments**: None
- **Returns**: uuid

```sql
CREATE OR REPLACE FUNCTION public.uuid_ns_url()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_url$function$

```

---

### public.uuid_ns_x500

- **Arguments**: None
- **Returns**: uuid

```sql
CREATE OR REPLACE FUNCTION public.uuid_ns_x500()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_x500$function$

```

---

### public.validate_user_data_consistency

- **Arguments**: None
- **Returns**: TABLE(table_name text, inconsistent_records bigint, details text)

```sql
CREATE OR REPLACE FUNCTION public.validate_user_data_consistency()
 RETURNS TABLE(table_name text, inconsistent_records bigint, details text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Check calls vs agents user_id consistency
    RETURN QUERY
    SELECT 
        'calls_agents_mismatch'::TEXT,
        COUNT(*)::BIGINT,
        'Calls with agent_id that belongs to different user'::TEXT
    FROM calls c
    JOIN agents a ON c.agent_id = a.id
    WHERE c.user_id != a.user_id;
    
    -- Check lead_analytics vs calls user_id consistency
    RETURN QUERY
    SELECT 
        'lead_analytics_calls_mismatch'::TEXT,
        COUNT(*)::BIGINT,
        'Lead analytics with call_id that belongs to different user'::TEXT
    FROM lead_analytics la
    JOIN calls c ON la.call_id = c.id
    WHERE la.user_id != c.user_id;
    
    -- Check transcripts vs calls user_id consistency
    RETURN QUERY
    SELECT 
        'transcripts_calls_mismatch'::TEXT,
        COUNT(*)::BIGINT,
        'Transcripts with call_id that belongs to different user'::TEXT
    FROM transcripts t
    JOIN calls c ON t.call_id = c.id
    WHERE t.user_id != c.user_id;
    
    -- Check agent_call_outcomes consistency
    RETURN QUERY
    SELECT 
        'agent_call_outcomes_mismatch'::TEXT,
        COUNT(*)::BIGINT,
        'Agent call outcomes with mismatched user_id'::TEXT
    FROM agent_call_outcomes aco
    JOIN calls c ON aco.call_id = c.id
    JOIN agents a ON aco.agent_id = a.id
    WHERE aco.user_id != c.user_id OR aco.user_id != a.user_id;
END;
$function$

```

---

## Sequences

| Schema | Sequence Name | Start Value | Min Value | Max Value | Increment | Cycle |
|--------|---------------|-------------|-----------|-----------|-----------|-------|
| public | `migrations_id_seq` | 1 | 1 | 2147483647 | 1 | false |

---

## Database Statistics

- **Database Name**: neondb
- **Database Size**: 30.94 MB
- **PostgreSQL Version**: PostgreSQL 17.6 (0d47993) on aarch64-unknown-linux-gnu, compiled by gcc (Debian 12.2.0-14+deb12u1) 12.2.0, 64-bit

---

*End of Database Schema Documentation*
