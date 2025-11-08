import { Response } from 'express';
import { Pool } from 'pg';
import pool from '../config/database';
import { AuthenticatedRequest } from '../middleware/auth';

export interface LeadGroup {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  leadType: 'inbound' | 'outbound';
  recentLeadTag: string;
  recentEngagementLevel?: string;
  recentIntentLevel?: string;
  recentBudgetConstraint?: string;
  recentTimelineUrgency?: string;
  recentFitAlignment?: string;
  escalatedToHuman: boolean;
  interactedAgents: string[];
  interactions: number;
  lastContact: string;
  followUpScheduled?: string;
  followUpStatus?: string;
  demoScheduled?: string; // Now stores ISO date string instead of boolean
  groupType: 'phone' | 'email' | 'individual'; // How leads are grouped
}

export interface LeadTimelineEntry {
  id: string;
  interactionAgent: string;
  interactionDate: string;
  platform: string;
  phoneNumber?: string;
  callStatus: string;
  callLifecycleStatus?: string;
  companyName?: string;
  status: string;
  useCase: string;
  duration?: string;
  engagementLevel?: string;
  intentLevel?: string;
  budgetConstraint?: string;
  timelineUrgency?: string;
  fitAlignment?: string;
  extractedName?: string;
  extractedEmail?: string;
  totalScore?: number;
  intentScore?: number;
  urgencyScore?: number;
  budgetScore?: number;
  fitScore?: number;
  engagementScore?: number;
  ctaPricingClicked?: boolean;
  ctaDemoClicked?: boolean;
  ctaFollowupClicked?: boolean;
  ctaSampleClicked?: boolean;
  ctaEscalatedToHuman?: boolean;
  demoBookDatetime?: string;
  smartNotification?: string;
  followUpDate?: string;
  followUpRemark?: string;
  followUpStatus?: string;
  followUpCompleted?: boolean;
  followUpCallId?: string; // The call that triggered this follow-up
}

export class LeadIntelligenceController {
  private pool: Pool;

  constructor() {
    this.pool = pool as any;
  }

  async getLeadIntelligence(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Enhanced query to group leads and get their analytics with new fields
      const query = `
        WITH phone_leads_base AS (
          SELECT 
            c.phone_number::text as group_key,
            'phone'::text as group_type,
            c.phone_number::text as phone,
            FIRST_VALUE(la.extracted_email) OVER (PARTITION BY c.phone_number ORDER BY c.created_at DESC)::text as email,
            FIRST_VALUE(COALESCE(la.extracted_name, 'Anonymous')) OVER (PARTITION BY c.phone_number ORDER BY c.created_at DESC)::text as name,
            FIRST_VALUE(la.company_name) OVER (PARTITION BY c.phone_number ORDER BY c.created_at DESC)::text as company,
            FIRST_VALUE(c.lead_type) OVER (PARTITION BY c.phone_number ORDER BY c.created_at DESC)::text as lead_type,
            FIRST_VALUE(
              CASE 
                WHEN la.lead_status_tag IS NOT NULL THEN la.lead_status_tag
                WHEN c.status = 'failed' AND c.call_lifecycle_status IS NOT NULL THEN c.call_lifecycle_status
                ELSE 'Cold'
              END
            ) OVER (PARTITION BY c.phone_number ORDER BY c.created_at DESC)::text as recent_lead_tag,
            FIRST_VALUE(la.engagement_health) OVER (PARTITION BY c.phone_number ORDER BY c.created_at DESC)::text as recent_engagement_level,
            FIRST_VALUE(la.intent_level) OVER (PARTITION BY c.phone_number ORDER BY c.created_at DESC)::text as recent_intent_level,
            FIRST_VALUE(la.budget_constraint) OVER (PARTITION BY c.phone_number ORDER BY c.created_at DESC)::text as recent_budget_constraint,
            FIRST_VALUE(la.urgency_level) OVER (PARTITION BY c.phone_number ORDER BY c.created_at DESC)::text as recent_timeline_urgency,
            FIRST_VALUE(la.fit_alignment) OVER (PARTITION BY c.phone_number ORDER BY c.created_at DESC)::text as recent_fit_alignment,
            FIRST_VALUE(COALESCE(la.cta_escalated_to_human, false)) OVER (PARTITION BY c.phone_number ORDER BY c.created_at DESC) as escalated_to_human,
            FIRST_VALUE(c.created_at) OVER (PARTITION BY c.phone_number ORDER BY c.created_at DESC) as last_contact,
            FIRST_VALUE(COALESCE(la.demo_book_datetime, la.demo_scheduled_at)) OVER (PARTITION BY c.phone_number ORDER BY c.created_at DESC) as demo_book_datetime,
            COUNT(*) OVER (PARTITION BY c.phone_number)::bigint as interactions,
            ROW_NUMBER() OVER (PARTITION BY c.phone_number ORDER BY c.created_at DESC)::bigint as rn
          FROM calls c
          LEFT JOIN lead_analytics la ON c.id = la.call_id
          LEFT JOIN contacts co ON c.contact_id = co.id
          WHERE c.user_id = $1 
            AND c.phone_number IS NOT NULL
            AND c.phone_number != ''
            AND (co.is_customer IS NULL OR co.is_customer = false)
        ),
        phone_leads AS (
          SELECT 
            plb.*,
            COALESCE((SELECT STRING_AGG(DISTINCT a.name, ', ') 
             FROM calls c2 
             LEFT JOIN agents a ON c2.agent_id = a.id 
             WHERE c2.phone_number = plb.phone AND c2.user_id = $1), '')::text as interacted_agents
          FROM phone_leads_base plb
          WHERE plb.rn = 1
        ),
        email_leads_base AS (
          SELECT 
            la.extracted_email::text as group_key,
            'email'::text as group_type,
            NULL::text as phone,
            la.extracted_email::text as email,
            FIRST_VALUE(COALESCE(la.extracted_name, 'Anonymous')) OVER (PARTITION BY la.extracted_email ORDER BY c.created_at DESC)::text as name,
            FIRST_VALUE(la.company_name) OVER (PARTITION BY la.extracted_email ORDER BY c.created_at DESC)::text as company,
            FIRST_VALUE(c.lead_type) OVER (PARTITION BY la.extracted_email ORDER BY c.created_at DESC)::text as lead_type,
            FIRST_VALUE(
              CASE 
                WHEN la.lead_status_tag IS NOT NULL THEN la.lead_status_tag
                WHEN c.status = 'failed' AND c.call_lifecycle_status IS NOT NULL THEN c.call_lifecycle_status
                ELSE 'Cold'
              END
            ) OVER (PARTITION BY la.extracted_email ORDER BY c.created_at DESC)::text as recent_lead_tag,
            FIRST_VALUE(la.engagement_health) OVER (PARTITION BY la.extracted_email ORDER BY c.created_at DESC)::text as recent_engagement_level,
            FIRST_VALUE(la.intent_level) OVER (PARTITION BY la.extracted_email ORDER BY c.created_at DESC)::text as recent_intent_level,
            FIRST_VALUE(la.budget_constraint) OVER (PARTITION BY la.extracted_email ORDER BY c.created_at DESC)::text as recent_budget_constraint,
            FIRST_VALUE(la.urgency_level) OVER (PARTITION BY la.extracted_email ORDER BY c.created_at DESC)::text as recent_timeline_urgency,
            FIRST_VALUE(la.fit_alignment) OVER (PARTITION BY la.extracted_email ORDER BY c.created_at DESC)::text as recent_fit_alignment,
            FIRST_VALUE(COALESCE(la.cta_escalated_to_human, false)) OVER (PARTITION BY la.extracted_email ORDER BY c.created_at DESC) as escalated_to_human,
            FIRST_VALUE(c.created_at) OVER (PARTITION BY la.extracted_email ORDER BY c.created_at DESC) as last_contact,
            FIRST_VALUE(COALESCE(la.demo_book_datetime, la.demo_scheduled_at)) OVER (PARTITION BY la.extracted_email ORDER BY c.created_at DESC) as demo_book_datetime,
            COUNT(*) OVER (PARTITION BY la.extracted_email)::bigint as interactions,
            ROW_NUMBER() OVER (PARTITION BY la.extracted_email ORDER BY c.created_at DESC)::bigint as rn
          FROM calls c
          LEFT JOIN lead_analytics la ON c.id = la.call_id
          LEFT JOIN contacts co ON c.contact_id = co.id
          WHERE c.user_id = $1 
            AND (c.phone_number IS NULL OR c.phone_number = '')
            AND la.extracted_email IS NOT NULL
            AND la.extracted_email != ''
            AND (co.is_customer IS NULL OR co.is_customer = false)
        ),
        email_leads AS (
          SELECT 
            elb.*,
            COALESCE((SELECT STRING_AGG(DISTINCT a.name, ', ') 
             FROM calls c2 
             LEFT JOIN lead_analytics la2 ON c2.id = la2.call_id
             LEFT JOIN agents a ON c2.agent_id = a.id 
             WHERE la2.extracted_email = elb.email AND c2.user_id = $1), '')::text as interacted_agents
          FROM email_leads_base elb
          WHERE elb.rn = 1
        ),
        individual_leads AS (
          SELECT 
            c.id::text as group_key,
            'individual'::text as group_type,
            NULL::text as phone,
            NULL::text as email,
            CASE 
              WHEN la.extracted_name IS NOT NULL AND la.extracted_name != ''
              THEN la.extracted_name
              ELSE 'Anonymous ' || TO_CHAR(c.created_at, 'MM/DD/YYYY HH24:MI')
            END::text as name,
            la.company_name::text as company,
            c.lead_type::text as lead_type,
            CASE 
              WHEN la.lead_status_tag IS NOT NULL THEN la.lead_status_tag
              WHEN c.status = 'failed' AND c.call_lifecycle_status IS NOT NULL THEN c.call_lifecycle_status
              ELSE 'Cold'
            END::text as recent_lead_tag,
            la.engagement_health::text as recent_engagement_level,
            la.intent_level::text as recent_intent_level,
            la.budget_constraint::text as recent_budget_constraint,
            la.urgency_level::text as recent_timeline_urgency,
            la.fit_alignment::text as recent_fit_alignment,
            COALESCE(la.cta_escalated_to_human, false) as escalated_to_human,
            c.created_at as last_contact,
            COALESCE(la.demo_book_datetime, la.demo_scheduled_at) as demo_book_datetime,
            1::bigint as interactions,
            COALESCE(a.name, '')::text as interacted_agents,
            1::bigint as rn
          FROM calls c
          LEFT JOIN lead_analytics la ON c.id = la.call_id
          LEFT JOIN agents a ON c.agent_id = a.id
          LEFT JOIN contacts co ON c.contact_id = co.id
          WHERE c.user_id = $1 
            AND (c.phone_number IS NULL OR c.phone_number = '')
            AND (la.extracted_email IS NULL OR la.extracted_email = '')
            AND (co.is_customer IS NULL OR co.is_customer = false)
        ),
        all_leads AS (
          SELECT 
            group_key, group_type, phone, email, name, company, lead_type,
            recent_lead_tag, recent_engagement_level, recent_intent_level,
            recent_budget_constraint, recent_timeline_urgency, recent_fit_alignment,
            escalated_to_human, last_contact, demo_book_datetime, interactions,
            interacted_agents, rn
          FROM phone_leads
          UNION ALL
          SELECT 
            group_key, group_type, phone, email, name, company, lead_type,
            recent_lead_tag, recent_engagement_level, recent_intent_level,
            recent_budget_constraint, recent_timeline_urgency, recent_fit_alignment,
            escalated_to_human, last_contact, demo_book_datetime, interactions,
            interacted_agents, rn
          FROM email_leads
          UNION ALL
          SELECT 
            group_key, group_type, phone, email, name, company, lead_type,
            recent_lead_tag, recent_engagement_level, recent_intent_level,
            recent_budget_constraint, recent_timeline_urgency, recent_fit_alignment,
            escalated_to_human, last_contact, demo_book_datetime, interactions,
            interacted_agents, rn
          FROM individual_leads
        )
        SELECT 
          al.*,
          fu.follow_up_date as follow_up_scheduled,
          fu.follow_up_status
        FROM all_leads al
        LEFT JOIN (
          SELECT DISTINCT ON (lead_phone, lead_email)
            COALESCE(lead_phone, lead_email) as lead_identifier,
            follow_up_date,
            follow_up_status
          FROM follow_ups 
          WHERE user_id = $1 AND follow_up_status != 'cancelled'
          ORDER BY lead_phone, lead_email, follow_up_date DESC
        ) fu ON (
          (al.group_type = 'phone' AND fu.lead_identifier = al.phone) OR
          (al.group_type = 'email' AND fu.lead_identifier = al.email)
        )
        ORDER BY al.last_contact DESC;
      `;

      const result = await this.pool.query(query, [userId]);
      
      const leadGroups: LeadGroup[] = result.rows.map((row, index) => ({
        id: `${row.group_type}_${row.group_key || index}`,
        name: row.name || 'Anonymous',
        email: row.email,
        phone: row.phone,
        company: row.company,
        leadType: row.lead_type || 'outbound',
        recentLeadTag: row.recent_lead_tag || 'Cold',
        recentEngagementLevel: row.recent_engagement_level,
        recentIntentLevel: row.recent_intent_level,
        recentBudgetConstraint: row.recent_budget_constraint,
        recentTimelineUrgency: row.recent_timeline_urgency,
        recentFitAlignment: row.recent_fit_alignment,
        escalatedToHuman: row.escalated_to_human || false,
        interactedAgents: row.interacted_agents ? row.interacted_agents.split(', ') : [],
        interactions: parseInt(row.interactions) || 0,
        lastContact: row.last_contact,
        followUpScheduled: row.follow_up_scheduled,
        followUpStatus: row.follow_up_status,
        demoScheduled: row.demo_book_datetime,
        groupType: row.group_type
      }));

      res.json(leadGroups);
    } catch (error) {
      console.error('Error fetching lead intelligence:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getLeadTimeline(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params;
      
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Parse group ID to get type and key
      const [groupType, ...groupKeyParts] = groupId.split('_');
      const groupKey = groupKeyParts.join('_');

      let query = '';
      let queryParams: any[] = [userId];

      if (groupType === 'phone') {
        query = `
          SELECT 
            c.id,
            a.name as interaction_agent,
            c.created_at as interaction_date,
            CASE 
              WHEN c.metadata->>'call_source' = 'internet' THEN 'Internet'
              ELSE 'Phone'
            END as platform,
            c.phone_number,
            c.status as call_status,
            c.call_lifecycle_status,
            la.company_name,
            CASE 
              WHEN la.lead_status_tag IS NOT NULL THEN la.lead_status_tag
              WHEN c.status = 'failed' AND c.call_lifecycle_status IS NOT NULL THEN c.call_lifecycle_status
              ELSE 'Cold'
            END as status,
            la.call_summary_title as use_case,
            CASE 
              WHEN COALESCE(c.duration_seconds, 0) > 0 THEN 
                LPAD(((c.duration_seconds / 60))::text, 2, '0') || ':' || LPAD((c.duration_seconds % 60)::text, 2, '0')
              WHEN c.duration_minutes IS NOT NULL THEN 
                LPAD((c.duration_minutes)::text, 2, '0') || ':00'
              ELSE '00:00'
            END as duration,
            la.engagement_health as engagement_level,
            la.intent_level,
            la.budget_constraint,
            la.urgency_level as timeline_urgency,
            la.fit_alignment,
            la.extracted_name,
            la.extracted_email,
            la.total_score,
            la.intent_score,
            la.urgency_score,
            la.budget_score,
            la.fit_score,
            la.engagement_score,
            la.cta_pricing_clicked,
            la.cta_demo_clicked,
            la.cta_followup_clicked,
            la.cta_sample_clicked,
            la.cta_escalated_to_human,
            la.demo_book_datetime,
            la.smart_notification,
            fu.follow_up_date,
            fu.remark as follow_up_remark,
            fu.follow_up_status,
            fu.is_completed as follow_up_completed,
            fu.call_id as follow_up_call_id
          FROM calls c
          LEFT JOIN lead_analytics la ON c.id = la.call_id AND la.analysis_type = 'individual'
          LEFT JOIN agents a ON c.agent_id = a.id
          LEFT JOIN follow_ups fu ON fu.lead_phone = c.phone_number AND fu.user_id = $1
          WHERE c.user_id = $1 
            AND c.phone_number = $2
          ORDER BY c.created_at DESC;
        `;
        queryParams.push(groupKey);
      } else if (groupType === 'email') {
        query = `
          SELECT 
            c.id,
            a.name as interaction_agent,
            c.created_at as interaction_date,
            'Internet' as platform,
            c.phone_number,
            c.status as call_status,
            c.call_lifecycle_status,
            la.company_name,
            CASE 
              WHEN la.lead_status_tag IS NOT NULL THEN la.lead_status_tag
              WHEN c.status = 'failed' AND c.call_lifecycle_status IS NOT NULL THEN c.call_lifecycle_status
              ELSE 'Cold'
            END as status,
            la.call_summary_title as use_case,
            CASE 
              WHEN COALESCE(c.duration_seconds, 0) > 0 THEN 
                LPAD(((c.duration_seconds / 60))::text, 2, '0') || ':' || LPAD((c.duration_seconds % 60)::text, 2, '0')
              WHEN c.duration_minutes IS NOT NULL THEN 
                LPAD((c.duration_minutes)::text, 2, '0') || ':00'
              ELSE '00:00'
            END as duration,
            la.engagement_health as engagement_level,
            la.intent_level,
            la.budget_constraint,
            la.urgency_level as timeline_urgency,
            la.fit_alignment,
            la.extracted_name,
            la.extracted_email,
            la.total_score,
            la.intent_score,
            la.urgency_score,
            la.budget_score,
            la.fit_score,
            la.engagement_score,
            la.cta_pricing_clicked,
            la.cta_demo_clicked,
            la.cta_followup_clicked,
            la.cta_sample_clicked,
            la.cta_escalated_to_human,
            la.demo_book_datetime,
            la.smart_notification,
            fu.follow_up_date,
            fu.remark as follow_up_remark,
            fu.follow_up_status,
            fu.is_completed as follow_up_completed,
            fu.call_id as follow_up_call_id
          FROM calls c
          LEFT JOIN lead_analytics la ON c.id = la.call_id AND la.analysis_type = 'individual'
          LEFT JOIN agents a ON c.agent_id = a.id
          LEFT JOIN follow_ups fu ON fu.lead_email = la.extracted_email AND fu.user_id = $1
          WHERE c.user_id = $1 
            AND la.extracted_email = $2
          ORDER BY c.created_at DESC;
        `;
        queryParams.push(groupKey);
      } else if (groupType === 'individual') {
        query = `
          SELECT 
            c.id,
            a.name as interaction_agent,
            c.created_at as interaction_date,
            'Internet' as platform,
            c.phone_number,
            c.status as call_status,
            c.call_lifecycle_status,
            la.company_name,
            CASE 
              WHEN la.lead_status_tag IS NOT NULL THEN la.lead_status_tag
              WHEN c.status = 'failed' AND c.call_lifecycle_status IS NOT NULL THEN c.call_lifecycle_status
              ELSE 'Cold'
            END as status,
            la.call_summary_title as use_case,
            CASE 
              WHEN COALESCE(c.duration_seconds, 0) > 0 THEN 
                LPAD(((c.duration_seconds / 60))::text, 2, '0') || ':' || LPAD((c.duration_seconds % 60)::text, 2, '0')
              WHEN c.duration_minutes IS NOT NULL THEN 
                LPAD((c.duration_minutes)::text, 2, '0') || ':00'
              ELSE '00:00'
            END as duration,
            la.engagement_health as engagement_level,
            la.intent_level,
            la.budget_constraint,
            la.urgency_level as timeline_urgency,
            la.fit_alignment,
            la.extracted_name,
            la.extracted_email,
            la.total_score,
            la.intent_score,
            la.urgency_score,
            la.budget_score,
            la.fit_score,
            la.engagement_score,
            la.cta_pricing_clicked,
            la.cta_demo_clicked,
            la.cta_followup_clicked,
            la.cta_sample_clicked,
            la.cta_escalated_to_human,
            la.demo_book_datetime,
            la.smart_notification,
            NULL as follow_up_date,
            NULL as follow_up_remark,
            NULL as follow_up_status,
            NULL as follow_up_completed,
            NULL as follow_up_call_id
          FROM calls c
          LEFT JOIN lead_analytics la ON c.id = la.call_id AND la.analysis_type = 'individual'
          LEFT JOIN agents a ON c.agent_id = a.id
          WHERE c.user_id = $1 
            AND c.id = $2
          ORDER BY c.created_at DESC;
        `;
        queryParams.push(groupKey);
      }

      const result = await this.pool.query(query, queryParams);
      
      const timeline: LeadTimelineEntry[] = result.rows.map(row => ({
        id: row.id,
        interactionAgent: row.interaction_agent || 'Unknown Agent',
        interactionDate: row.interaction_date,
        platform: row.platform,
        phoneNumber: row.phone_number,
        callStatus: row.call_status,
        callLifecycleStatus: row.call_lifecycle_status,
        companyName: row.company_name,
        status: row.status || 'Cold',
        useCase: row.use_case || 'No summary available',
        duration: row.duration,
        engagementLevel: row.engagement_level,
        intentLevel: row.intent_level,
        budgetConstraint: row.budget_constraint,
        timelineUrgency: row.timeline_urgency,
        fitAlignment: row.fit_alignment,
        // Analytics scores
        intentScore: row.intent_score,
        urgencyScore: row.urgency_score,
        budgetScore: row.budget_score,
        fitScore: row.fit_score,
        engagementScore: row.engagement_score,
        overallScore: row.overall_score,
        // CTA interactions
        ctaPricingClicked: row.cta_pricing_clicked,
        ctaDemoRequested: row.cta_demo_requested,
        ctaCalendlyOpened: row.cta_calendly_opened,
        ctaLinkShared: row.cta_link_shared,
        // Follow-up information
        followUpDate: row.follow_up_date,
        followUpRemark: row.follow_up_remark,
        followUpStatus: row.follow_up_status,
        followUpCompleted: row.follow_up_completed,
        followUpCallId: row.follow_up_call_id,
        // Extracted data
        extractedName: row.extracted_name,
        extractedEmail: row.extracted_email,
        extractedCompany: row.extracted_company,
        // Additional fields
        smartNotificationsSent: row.smart_notifications_sent,
        demoBookingConfirmed: row.demo_booking_confirmed,
        customActionTaken: row.custom_action_taken,
        // Lead analytics metadata
        leadStatusTag: row.lead_status_tag,
        leadPriority: row.lead_priority,
        conversionProbability: row.conversion_probability
      }));

      res.json(timeline);
    } catch (error) {
      console.error('Error fetching lead timeline:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}