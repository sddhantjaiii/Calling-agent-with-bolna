-- Migration: Convert credits columns from INTEGER to DECIMAL for pulse-based billing
-- This allows fractional credit deduction (e.g., 0.5 credits per 30-second pulse)

-- First, drop ALL views that depend on credits columns (cascading)
-- Views from calls table (credits_used column)
DROP VIEW IF EXISTS call_source_analytics CASCADE;
DROP VIEW IF EXISTS call_queue_summary CASCADE;
DROP VIEW IF EXISTS active_calls_summary CASCADE;
DROP VIEW IF EXISTS user_concurrent_calls CASCADE;
DROP VIEW IF EXISTS user_login_summary CASCADE;

-- Views from users table (credits column)
DROP VIEW IF EXISTS user_performance_summary CASCADE;
DROP VIEW IF EXISTS user_stats CASCADE;
DROP MATERIALIZED VIEW IF EXISTS user_kpi_summary CASCADE;

-- 1. Convert users.credits to DECIMAL(10,2)
-- First drop the CHECK constraint, then alter column, then re-add constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_credits_check;
ALTER TABLE users ALTER COLUMN credits TYPE DECIMAL(10,2) USING credits::DECIMAL(10,2);
-- Allow negative credits (already enabled in previous migration)
-- No CHECK constraint needed since negative credits are allowed

-- 2. Convert calls.credits_used to DECIMAL(10,2)
ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_credits_used_check;
ALTER TABLE calls ALTER COLUMN credits_used TYPE DECIMAL(10,2) USING credits_used::DECIMAL(10,2);
ALTER TABLE calls ADD CONSTRAINT calls_credits_used_check CHECK (credits_used >= 0);

-- 3. Convert agent_analytics.credits_used to DECIMAL(10,2)
ALTER TABLE agent_analytics ALTER COLUMN credits_used TYPE DECIMAL(10,2) USING credits_used::DECIMAL(10,2);

-- 4. Convert credit_transactions.amount to DECIMAL(10,2)
ALTER TABLE credit_transactions ALTER COLUMN amount TYPE DECIMAL(10,2) USING amount::DECIMAL(10,2);

-- 5. Convert credit_transactions.balance_after to DECIMAL(10,2)
ALTER TABLE credit_transactions ALTER COLUMN balance_after TYPE DECIMAL(10,2) USING balance_after::DECIMAL(10,2);

-- 6. Convert campaigns.total_credits_used to DECIMAL(10,2) if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campaigns' AND column_name = 'total_credits_used') THEN
        ALTER TABLE campaigns ALTER COLUMN total_credits_used TYPE DECIMAL(10,2) USING total_credits_used::DECIMAL(10,2);
    END IF;
END $$;

-- 7. Convert contacts.total_credits_used to DECIMAL(10,2) if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contacts' AND column_name = 'total_credits_used') THEN
        ALTER TABLE contacts ALTER COLUMN total_credits_used TYPE DECIMAL(10,2) USING total_credits_used::DECIMAL(10,2);
    END IF;
END $$;

-- Add comment documenting the change
COMMENT ON COLUMN users.credits IS 'User credit balance - DECIMAL(10,2) to support pulse-based fractional billing';
COMMENT ON COLUMN calls.credits_used IS 'Credits consumed by this call - DECIMAL(10,2) for fractional billing';

-- ================================================================================
-- RECREATE MATERIALIZED VIEW user_kpi_summary
-- Now that the credits column is DECIMAL, recreate the view
-- ================================================================================

CREATE MATERIALIZED VIEW user_kpi_summary AS
SELECT 
    u.id as user_id,
    u.email,
    u.name,
    u.credits,
    u.is_active,
    u.created_at as user_created_at,
    
    -- Call metrics (last 30 days)
    COALESCE(call_stats.total_calls_30d, 0) as total_calls_30d,
    COALESCE(call_stats.successful_calls_30d, 0) as successful_calls_30d,
    COALESCE(call_stats.failed_calls_30d, 0) as failed_calls_30d,
    COALESCE(call_stats.success_rate_30d, 0) as success_rate_30d,
    COALESCE(call_stats.total_duration_30d, 0) as total_duration_30d,
    COALESCE(call_stats.avg_duration_30d, 0) as avg_duration_30d,
    COALESCE(call_stats.total_credits_used_30d, 0) as total_credits_used_30d,
    
    -- Lead metrics (last 30 days)
    COALESCE(lead_stats.total_leads_30d, 0) as total_leads_30d,
    COALESCE(lead_stats.qualified_leads_30d, 0) as qualified_leads_30d,
    COALESCE(lead_stats.conversion_rate_30d, 0) as conversion_rate_30d,
    COALESCE(lead_stats.avg_lead_score_30d, 0) as avg_lead_score_30d,
    COALESCE(lead_stats.avg_intent_score_30d, 0) as avg_intent_score_30d,
    COALESCE(lead_stats.avg_engagement_score_30d, 0) as avg_engagement_score_30d,
    
    -- Agent metrics (current)
    COALESCE(agent_stats.total_agents, 0) as total_agents,
    COALESCE(agent_stats.active_agents, 0) as active_agents,
    COALESCE(agent_stats.draft_agents, 0) as draft_agents,
    
    -- Agent performance metrics (last 30 days)
    COALESCE(agent_perf.avg_conversations_per_hour_30d, 0) as avg_conversations_per_hour_30d,
    COALESCE(agent_perf.best_performing_agent_id, NULL) as best_performing_agent_id,
    COALESCE(agent_perf.best_performing_agent_name, NULL) as best_performing_agent_name,
    COALESCE(agent_perf.best_agent_success_rate, 0) as best_agent_success_rate,
    
    -- Recent activity metrics (last 7 days)
    COALESCE(recent_stats.calls_last_7d, 0) as calls_last_7d,
    COALESCE(recent_stats.leads_last_7d, 0) as leads_last_7d,
    COALESCE(recent_stats.credits_used_last_7d, 0) as credits_used_last_7d,
    
    -- All-time metrics
    COALESCE(lifetime_stats.total_calls_lifetime, 0) as total_calls_lifetime,
    COALESCE(lifetime_stats.total_leads_lifetime, 0) as total_leads_lifetime,
    COALESCE(lifetime_stats.total_credits_used_lifetime, 0) as total_credits_used_lifetime,
    
    -- Cache metadata
    CURRENT_TIMESTAMP as calculated_at,
    CURRENT_TIMESTAMP + INTERVAL '1 hour' as expires_at
    
FROM users u

-- Call statistics for last 30 days
LEFT JOIN (
    SELECT 
        user_id,
        COUNT(*) as total_calls_30d,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_calls_30d,
        COUNT(CASE WHEN status IN ('failed', 'cancelled') THEN 1 END) as failed_calls_30d,
        CASE 
            WHEN COUNT(*) > 0 
            THEN ROUND((COUNT(CASE WHEN status = 'completed' THEN 1 END) * 100.0 / COUNT(*))::NUMERIC, 2)
            ELSE 0 
        END as success_rate_30d,
        COALESCE(SUM(duration_minutes), 0) as total_duration_30d,
        COALESCE(ROUND(AVG(duration_minutes)::NUMERIC, 2), 0) as avg_duration_30d,
        COALESCE(SUM(credits_used), 0) as total_credits_used_30d
    FROM calls 
    WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY user_id
) call_stats ON u.id = call_stats.user_id

-- Lead statistics for last 30 days
LEFT JOIN (
    SELECT 
        c.user_id,
        COUNT(la.id) as total_leads_30d,
        COUNT(CASE WHEN la.total_score >= 70 THEN 1 END) as qualified_leads_30d,
        CASE 
            WHEN COUNT(la.id) > 0 
            THEN ROUND((COUNT(CASE WHEN la.total_score >= 70 THEN 1 END) * 100.0 / COUNT(la.id))::NUMERIC, 2)
            ELSE 0 
        END as conversion_rate_30d,
        COALESCE(ROUND(AVG(la.total_score)::NUMERIC, 2), 0) as avg_lead_score_30d,
        COALESCE(ROUND(AVG(la.intent_score)::NUMERIC, 2), 0) as avg_intent_score_30d,
        COALESCE(ROUND(AVG(la.engagement_score)::NUMERIC, 2), 0) as avg_engagement_score_30d
    FROM calls c
    INNER JOIN lead_analytics la ON c.id = la.call_id
    WHERE c.created_at >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY c.user_id
) lead_stats ON u.id = lead_stats.user_id

-- Agent statistics (current)
LEFT JOIN (
    SELECT 
        user_id,
        COUNT(*) as total_agents,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_agents,
        COUNT(CASE WHEN is_active = false THEN 1 END) as draft_agents
    FROM agents
    GROUP BY user_id
) agent_stats ON u.id = agent_stats.user_id

-- Agent performance metrics (last 30 days)
LEFT JOIN (
    SELECT 
        aa.user_id,
        -- Calculate average conversations per hour across all agents
        COALESCE(ROUND(AVG(
            CASE 
                WHEN aa.hour IS NOT NULL AND aa.total_calls > 0 
                THEN aa.total_calls 
                ELSE 0 
            END
        )::NUMERIC, 2), 0) as avg_conversations_per_hour_30d,
        
        -- Find best performing agent by success rate
        (SELECT a.id 
         FROM agents a 
         INNER JOIN agent_analytics aa2 ON a.id = aa2.agent_id 
         WHERE aa2.user_id = aa.user_id 
           AND aa2.date >= CURRENT_DATE - INTERVAL '30 days'
           AND aa2.hour IS NULL
           AND aa2.total_calls > 0
         GROUP BY a.id, a.name
         ORDER BY (SUM(aa2.successful_calls)::DECIMAL / SUM(aa2.total_calls)) DESC, SUM(aa2.total_calls) DESC
         LIMIT 1
        ) as best_performing_agent_id,
        
        (SELECT a.name 
         FROM agents a 
         INNER JOIN agent_analytics aa2 ON a.id = aa2.agent_id 
         WHERE aa2.user_id = aa.user_id 
           AND aa2.date >= CURRENT_DATE - INTERVAL '30 days'
           AND aa2.hour IS NULL
           AND aa2.total_calls > 0
         GROUP BY a.id, a.name
         ORDER BY (SUM(aa2.successful_calls)::DECIMAL / SUM(aa2.total_calls)) DESC, SUM(aa2.total_calls) DESC
         LIMIT 1
        ) as best_performing_agent_name,
        
        (SELECT ROUND((SUM(aa2.successful_calls)::DECIMAL / SUM(aa2.total_calls) * 100)::NUMERIC, 2)
         FROM agents a 
         INNER JOIN agent_analytics aa2 ON a.id = aa2.agent_id 
         WHERE aa2.user_id = aa.user_id 
           AND aa2.date >= CURRENT_DATE - INTERVAL '30 days'
           AND aa2.hour IS NULL
           AND aa2.total_calls > 0
         GROUP BY a.id
         ORDER BY (SUM(aa2.successful_calls)::DECIMAL / SUM(aa2.total_calls)) DESC, SUM(aa2.total_calls) DESC
         LIMIT 1
        ) as best_agent_success_rate
        
    FROM agent_analytics aa
    WHERE aa.date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY aa.user_id
) agent_perf ON u.id = agent_perf.user_id

-- Recent activity statistics (last 7 days)
LEFT JOIN (
    SELECT 
        c.user_id,
        COUNT(c.id) as calls_last_7d,
        COUNT(la.id) as leads_last_7d,
        COALESCE(SUM(c.credits_used), 0) as credits_used_last_7d
    FROM calls c
    LEFT JOIN lead_analytics la ON c.id = la.call_id
    WHERE c.created_at >= CURRENT_DATE - INTERVAL '7 days'
    GROUP BY c.user_id
) recent_stats ON u.id = recent_stats.user_id

-- Lifetime statistics
LEFT JOIN (
    SELECT 
        c.user_id,
        COUNT(c.id) as total_calls_lifetime,
        COUNT(la.id) as total_leads_lifetime,
        COALESCE(SUM(c.credits_used), 0) as total_credits_used_lifetime
    FROM calls c
    LEFT JOIN lead_analytics la ON c.id = la.call_id
    GROUP BY c.user_id
) lifetime_stats ON u.id = lifetime_stats.user_id

WHERE u.is_active = true;

-- Recreate indexes on materialized view
CREATE UNIQUE INDEX idx_user_kpi_summary_user_id ON user_kpi_summary(user_id);
CREATE INDEX idx_user_kpi_summary_calculated_at ON user_kpi_summary(calculated_at DESC);
CREATE INDEX idx_user_kpi_summary_expires_at ON user_kpi_summary(expires_at);
CREATE INDEX idx_user_kpi_summary_active_users ON user_kpi_summary(is_active, calculated_at DESC);

-- Update materialized view comment
COMMENT ON MATERIALIZED VIEW user_kpi_summary IS 'Pre-calculated KPI summary for all users with 30-day rolling metrics - credits now DECIMAL(10,2)';

-- ================================================================================
-- RECREATE VIEW user_stats
-- ================================================================================
CREATE VIEW user_stats AS
SELECT 
    u.id,
    u.email,
    u.name,
    u.credits,
    u.is_active,
    u.created_at,
    COUNT(DISTINCT a.id) as agent_count,
    COUNT(DISTINCT c.id) as call_count,
    COUNT(DISTINCT ct.id) as contact_count,
    COALESCE(SUM(CASE WHEN c.status = 'completed' THEN c.credits_used ELSE 0 END), 0) as total_credits_used,
    -- Add call source breakdown
    COUNT(CASE WHEN c.call_source = 'phone' THEN 1 END) as phone_calls,
    COUNT(CASE WHEN c.call_source = 'internet' THEN 1 END) as internet_calls,
    COUNT(CASE WHEN c.call_source = 'unknown' THEN 1 END) as unknown_calls
FROM users u
LEFT JOIN agents a ON u.id = a.user_id AND a.is_active = true
LEFT JOIN calls c ON u.id = c.user_id
LEFT JOIN contacts ct ON u.id = ct.user_id
GROUP BY u.id, u.email, u.name, u.credits, u.is_active, u.created_at;

COMMENT ON VIEW user_stats IS 'User statistics view - credits now DECIMAL(10,2) for fractional billing';

-- ================================================================================
-- RECREATE VIEW user_performance_summary
-- ================================================================================
CREATE VIEW user_performance_summary AS
SELECT 
    u.id as user_id,
    u.name as user_name,
    u.email,
    u.credits,
    
    -- Current day metrics
    COALESCE(today.total_calls, 0) as today_calls,
    COALESCE(today.successful_calls, 0) as today_successful_calls,
    COALESCE(today.success_rate, 0) as today_success_rate,
    COALESCE(today.leads_generated, 0) as today_leads,
    COALESCE(today.total_cta_interactions, 0) as today_cta_interactions,
    COALESCE(today.cta_conversion_rate, 0) as today_cta_conversion_rate,
    
    -- Current month metrics
    COALESCE(month.total_calls, 0) as month_calls,
    COALESCE(month.successful_calls, 0) as month_successful_calls,
    COALESCE(month.success_rate, 0) as month_success_rate,
    COALESCE(month.leads_generated, 0) as month_leads,
    COALESCE(month.conversion_rate, 0) as month_conversion_rate,
    COALESCE(month.total_cta_interactions, 0) as month_cta_interactions,
    COALESCE(month.cta_conversion_rate, 0) as month_cta_conversion_rate,
    
    -- All-time metrics
    COALESCE(total.total_calls, 0) as total_calls,
    COALESCE(total.successful_calls, 0) as total_successful_calls,
    COALESCE(total.success_rate, 0) as total_success_rate,
    COALESCE(total.leads_generated, 0) as total_leads,
    COALESCE(total.avg_duration_minutes, 0) as avg_call_duration,
    COALESCE(total.total_cta_interactions, 0) as total_cta_interactions,
    COALESCE(total.cta_conversion_rate, 0) as total_cta_conversion_rate,
    
    -- CTA breakdown (all-time)
    COALESCE(total.cta_pricing_clicks, 0) as total_pricing_clicks,
    COALESCE(total.cta_demo_clicks, 0) as total_demo_clicks,
    COALESCE(total.cta_followup_clicks, 0) as total_followup_clicks,
    COALESCE(total.cta_sample_clicks, 0) as total_sample_clicks,
    COALESCE(total.cta_human_escalations, 0) as total_human_escalations,
    
    -- Agent count
    COALESCE(agent_count.active_agents, 0) as active_agents

FROM users u
LEFT JOIN (
    SELECT 
        user_id,
        SUM(total_calls) as total_calls,
        SUM(successful_calls) as successful_calls,
        CASE WHEN SUM(total_calls) > 0 THEN (SUM(successful_calls)::DECIMAL / SUM(total_calls) * 100) ELSE 0 END as success_rate,
        SUM(leads_generated) as leads_generated,
        SUM(total_cta_interactions) as total_cta_interactions,
        CASE WHEN SUM(total_calls) > 0 THEN (SUM(total_cta_interactions)::DECIMAL / SUM(total_calls) * 100) ELSE 0 END as cta_conversion_rate
    FROM user_analytics 
    WHERE date = CURRENT_DATE AND hour IS NULL
    GROUP BY user_id
) today ON u.id = today.user_id
LEFT JOIN (
    SELECT 
        user_id,
        SUM(total_calls) as total_calls,
        SUM(successful_calls) as successful_calls,
        CASE WHEN SUM(total_calls) > 0 THEN (SUM(successful_calls)::DECIMAL / SUM(total_calls) * 100) ELSE 0 END as success_rate,
        SUM(leads_generated) as leads_generated,
        CASE WHEN SUM(leads_generated) > 0 THEN (SUM(qualified_leads)::DECIMAL / SUM(leads_generated) * 100) ELSE 0 END as conversion_rate,
        SUM(total_cta_interactions) as total_cta_interactions,
        CASE WHEN SUM(total_calls) > 0 THEN (SUM(total_cta_interactions)::DECIMAL / SUM(total_calls) * 100) ELSE 0 END as cta_conversion_rate
    FROM user_analytics 
    WHERE date >= DATE_TRUNC('month', CURRENT_DATE) AND hour IS NULL
    GROUP BY user_id
) month ON u.id = month.user_id
LEFT JOIN (
    SELECT 
        user_id,
        SUM(total_calls) as total_calls,
        SUM(successful_calls) as successful_calls,
        CASE WHEN SUM(total_calls) > 0 THEN (SUM(successful_calls)::DECIMAL / SUM(total_calls) * 100) ELSE 0 END as success_rate,
        SUM(leads_generated) as leads_generated,
        AVG(avg_duration_minutes) as avg_duration_minutes,
        SUM(total_cta_interactions) as total_cta_interactions,
        CASE WHEN SUM(total_calls) > 0 THEN (SUM(total_cta_interactions)::DECIMAL / SUM(total_calls) * 100) ELSE 0 END as cta_conversion_rate,
        SUM(cta_pricing_clicks) as cta_pricing_clicks,
        SUM(cta_demo_clicks) as cta_demo_clicks,
        SUM(cta_followup_clicks) as cta_followup_clicks,
        SUM(cta_sample_clicks) as cta_sample_clicks,
        SUM(cta_human_escalations) as cta_human_escalations
    FROM user_analytics 
    WHERE hour IS NULL
    GROUP BY user_id
) total ON u.id = total.user_id
LEFT JOIN (
    SELECT 
        user_id,
        COUNT(*) as active_agents
    FROM agents 
    WHERE is_active = true
    GROUP BY user_id
) agent_count ON u.id = agent_count.user_id
WHERE u.is_active = true;

COMMENT ON VIEW user_performance_summary IS 'Summary view of user performance metrics - credits now DECIMAL(10,2)';

-- ================================================================================
-- RECREATE VIEW call_source_analytics
-- ================================================================================
CREATE VIEW call_source_analytics AS
SELECT
  user_id,
  call_source,
  count(*) AS total_calls,
  count(
    CASE
      WHEN status::text = 'completed'::text THEN 1
      ELSE NULL::integer
    END
  ) AS completed_calls,
  count(
    CASE
      WHEN status::text = 'failed'::text THEN 1
      ELSE NULL::integer
    END
  ) AS failed_calls,
  avg(duration_minutes) AS avg_duration_minutes,
  sum(credits_used) AS total_credits_used,
  min(created_at) AS first_call_date,
  max(created_at) AS last_call_date
FROM
  calls c
GROUP BY
  user_id,
  call_source;

COMMENT ON VIEW call_source_analytics IS 'Call analytics by source - credits now DECIMAL(10,2)';

-- ================================================================================
-- RECREATE VIEW call_queue_summary
-- ================================================================================
CREATE VIEW call_queue_summary AS
SELECT
  q.user_id,
  u.email AS user_email,
  q.call_type,
  q.status,
  count(*) AS call_count,
  min(q.created_at) AS oldest_call,
  max(q.created_at) AS newest_call
FROM
  call_queue q
  JOIN users u ON q.user_id = u.id
GROUP BY
  q.user_id,
  u.email,
  q.call_type,
  q.status
ORDER BY
  q.user_id,
  q.call_type,
  q.status;

COMMENT ON VIEW call_queue_summary IS 'Call queue summary by user and status';

-- ================================================================================
-- RECREATE VIEW active_calls_summary
-- ================================================================================
CREATE VIEW active_calls_summary AS
SELECT
  (
    SELECT
      count(*) AS count
    FROM
      active_calls
  ) AS total_active_calls,
  (
    SELECT
      count(*) AS count
    FROM
      active_calls
    WHERE
      active_calls.call_type::text = 'direct'::text
  ) AS direct_calls,
  (
    SELECT
      count(*) AS count
    FROM
      active_calls
    WHERE
      active_calls.call_type::text = 'campaign'::text
  ) AS campaign_calls,
  (
    SELECT
      count(DISTINCT active_calls.user_id) AS count
    FROM
      active_calls
  ) AS users_with_active_calls,
  10 AS system_limit,
  now() AS snapshot_time;

COMMENT ON VIEW active_calls_summary IS 'Summary of currently active calls';

-- ================================================================================
-- RECREATE VIEW user_concurrent_calls
-- ================================================================================
CREATE VIEW user_concurrent_calls AS
SELECT
  u.id AS user_id,
  u.name AS user_name,
  u.email AS user_email,
  u.concurrent_calls_limit AS user_limit,
  COALESCE(total_calls.count, 0::bigint) AS active_calls,
  COALESCE(direct_calls.count, 0::bigint) AS direct_calls,
  COALESCE(campaign_calls.count, 0::bigint) AS campaign_calls,
  u.concurrent_calls_limit - COALESCE(total_calls.count, 0::bigint) AS available_slots,
  CASE
    WHEN COALESCE(total_calls.count, 0::bigint) >= u.concurrent_calls_limit THEN 'AT_LIMIT'::text
    WHEN COALESCE(total_calls.count, 0::bigint) = 0 THEN 'IDLE'::text
    ELSE 'ACTIVE'::text
  END AS status
FROM
  users u
  LEFT JOIN (
    SELECT
      active_calls.user_id,
      count(*) AS count
    FROM
      active_calls
    GROUP BY
      active_calls.user_id
  ) total_calls ON total_calls.user_id = u.id
  LEFT JOIN (
    SELECT
      active_calls.user_id,
      count(*) AS count
    FROM
      active_calls
    WHERE
      active_calls.call_type::text = 'direct'::text
    GROUP BY
      active_calls.user_id
  ) direct_calls ON direct_calls.user_id = u.id
  LEFT JOIN (
    SELECT
      active_calls.user_id,
      count(*) AS count
    FROM
      active_calls
    WHERE
      active_calls.call_type::text = 'campaign'::text
    GROUP BY
      active_calls.user_id
  ) campaign_calls ON campaign_calls.user_id = u.id
ORDER BY
  (COALESCE(total_calls.count, 0::bigint)) DESC,
  u.name;

COMMENT ON VIEW user_concurrent_calls IS 'User concurrent call status and limits';

-- ================================================================================
-- RECREATE VIEW user_login_summary
-- ================================================================================
CREATE VIEW user_login_summary AS
SELECT
  u.id,
  u.email,
  u.name,
  count(la.id) AS total_attempts,
  count(
    CASE
      WHEN la.success = true THEN 1
      ELSE NULL::integer
    END
  ) AS successful_logins,
  count(
    CASE
      WHEN la.success = false THEN 1
      ELSE NULL::integer
    END
  ) AS failed_attempts,
  max(
    CASE
      WHEN la.success = true THEN la.attempted_at
      ELSE NULL::timestamp with time zone
    END
  ) AS last_successful_login,
  max(
    CASE
      WHEN la.success = false THEN la.attempted_at
      ELSE NULL::timestamp with time zone
    END
  ) AS last_failed_attempt
FROM
  users u
  LEFT JOIN login_attempts la ON u.email::text = la.email::text
GROUP BY
  u.id,
  u.email,
  u.name;

COMMENT ON VIEW user_login_summary IS 'User login attempt summary';