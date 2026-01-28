import { Response } from 'express';
import { Pool } from 'pg';
import pool from '../config/database';
import { AuthenticatedRequest } from '../middleware/auth';
import LeadIntelligenceEventModel, { EventActorType, FieldChange } from '../models/LeadIntelligenceEvent';
import TeamMemberModel from '../models/TeamMember';

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
  // Requirements from complete analysis - aggregated product/business requirements
  requirements?: string;
  // Custom CTA string from extraction (e.g., "proposal required, demo booked")
  customCta?: string;
  // Lead stage for pipeline tracking
  leadStage?: string;
  contactId?: string; // Contact ID for updating lead stage
  // Assigned team member
  assignedTo?: {
    id: string;
    name: string;
    role: string;
  } | null;
}

export interface LeadTimelineEntry {
  id: string;
  leadName?: string;
  interactionAgent: string;
  interactionDate: string;
  platform?: string;
  callDirection?: string;
  hangupBy?: string;
  hangupReason?: string;
  companyName?: string;
  status: string;
  smartNotification?: string;
  duration?: string;
  engagementLevel?: string;
  intentLevel?: string;
  budgetConstraint?: string;
  timelineUrgency?: string;
  fitAlignment?: string;
  extractedEmail?: string;
  totalScore?: number;
  intentScore?: number;
  urgencyScore?: number;
  budgetScore?: number;
  fitScore?: number;
  engagementScore?: number;
  overallScore?: number;
  ctaPricingClicked?: boolean;
  ctaDemoClicked?: boolean;
  ctaFollowupClicked?: boolean;
  ctaSampleClicked?: boolean;
  ctaEscalatedToHuman?: boolean;
  demoBookDatetime?: string;
  followUpDate?: string;
  followUpRemark?: string;
  followUpStatus?: string;
  followUpCompleted?: boolean;
  followUpCallId?: string; // The call that triggered this follow-up
  // Requirements field - product/business requirements from call
  requirements?: string;
  // Custom CTA string from extraction (e.g., "proposal required, demo booked")
  customCta?: string;
  // Email-specific fields
  interactionType?: 'call' | 'email' | 'human_edit'; // Type of interaction
  emailSubject?: string; // Email subject
  emailStatus?: 'sent' | 'delivered' | 'opened' | 'failed'; // Email delivery status
  emailTo?: string; // Email recipient
  emailFrom?: string; // Email sender
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
      // Priority: complete analysis (human-edited) > most recent individual call analytics
      const query = `
        WITH phone_interactions AS (
          -- AI calling-agent calls
          SELECT
            c.phone_number::text as phone,
            c.created_at as interaction_date,
            COALESCE(co.email, la.extracted_email)::text as email,
            COALESCE(co.name, la.extracted_name, 'Anonymous')::text as name,
            COALESCE(co.company, la.company_name)::text as company,
            c.lead_type::text as lead_type,
            CASE
              WHEN la.lead_status_tag IS NOT NULL THEN la.lead_status_tag
              WHEN c.status = 'failed' AND c.call_lifecycle_status IS NOT NULL THEN c.call_lifecycle_status
              ELSE 'Cold'
            END::text as lead_status_tag,
            la.engagement_health::text as engagement_health,
            la.intent_level::text as intent_level,
            la.budget_constraint::text as budget_constraint,
            la.urgency_level::text as urgency_level,
            la.fit_alignment::text as fit_alignment,
            la.demo_book_datetime as demo_book_datetime,
            co.lead_stage::text as lead_stage,
            co.id::text as contact_id,
            COALESCE(a.name, '')::text as latest_agent
          FROM calls c
          LEFT JOIN lead_analytics la
            ON c.id = la.call_id
           AND (la.analysis_type = 'individual' OR la.analysis_type IS NULL)
          LEFT JOIN contacts co ON c.contact_id = co.id
          LEFT JOIN agents a ON c.agent_id = a.id
          WHERE c.user_id = $1
            AND c.phone_number IS NOT NULL
            AND c.phone_number != ''
            AND (co.is_customer IS NULL OR co.is_customer = false)

          UNION ALL

          -- CRM Dialer calls (Plivo)
          SELECT
            pc.to_phone_number::text as phone,
            COALESCE(pc.ended_at, pc.answered_at, pc.started_at, pc.initiated_at, pc.created_at) as interaction_date,
            COALESCE(
              co.email,
              pc.lead_complete_analysis->'extraction'->>'email_address',
              pc.lead_individual_analysis->'extraction'->>'email_address'
            )::text as email,
            COALESCE(
              co.name,
              pc.lead_complete_analysis->'extraction'->>'name',
              pc.lead_individual_analysis->'extraction'->>'name',
              'Anonymous'
            )::text as name,
            COALESCE(
              co.company,
              pc.lead_complete_analysis->'extraction'->>'company_name',
              pc.lead_individual_analysis->'extraction'->>'company_name'
            )::text as company,
            'outbound'::text as lead_type,
            COALESCE(
              pc.lead_complete_analysis->>'lead_status_tag',
              pc.lead_individual_analysis->>'lead_status_tag',
              'Cold'
            )::text as lead_status_tag,
            COALESCE(pc.lead_complete_analysis->>'engagement_health', pc.lead_individual_analysis->>'engagement_health')::text as engagement_health,
            COALESCE(pc.lead_complete_analysis->>'intent_level', pc.lead_individual_analysis->>'intent_level')::text as intent_level,
            COALESCE(pc.lead_complete_analysis->>'budget_constraint', pc.lead_individual_analysis->>'budget_constraint')::text as budget_constraint,
            COALESCE(pc.lead_complete_analysis->>'urgency_level', pc.lead_individual_analysis->>'urgency_level')::text as urgency_level,
            COALESCE(pc.lead_complete_analysis->>'fit_alignment', pc.lead_individual_analysis->>'fit_alignment')::text as fit_alignment,
            NULL::timestamptz as demo_book_datetime,
            co.lead_stage::text as lead_stage,
            co.id::text as contact_id,
            COALESCE(tm.name, 'CRM Dialer')::text as latest_agent
          FROM plivo_calls pc
          LEFT JOIN contacts co ON pc.contact_id = co.id
          LEFT JOIN team_members tm ON pc.team_member_id = tm.id
          WHERE pc.user_id = $1
            AND pc.to_phone_number IS NOT NULL
            AND pc.to_phone_number != ''
            AND (co.is_customer IS NULL OR co.is_customer = false)
        ),
        phone_leads_base AS (
          SELECT
            pi.phone::text as group_key,
            'phone'::text as group_type,
            pi.phone::text as phone,
            FIRST_VALUE(pi.email) OVER (PARTITION BY pi.phone ORDER BY pi.interaction_date DESC)::text as email,
            FIRST_VALUE(pi.name) OVER (PARTITION BY pi.phone ORDER BY pi.interaction_date DESC)::text as name,
            FIRST_VALUE(pi.company) OVER (PARTITION BY pi.phone ORDER BY pi.interaction_date DESC)::text as company,
            FIRST_VALUE(pi.lead_type) OVER (PARTITION BY pi.phone ORDER BY pi.interaction_date DESC)::text as lead_type,
            FIRST_VALUE(pi.lead_status_tag) OVER (PARTITION BY pi.phone ORDER BY pi.interaction_date DESC)::text as recent_lead_tag_from_call,
            FIRST_VALUE(pi.engagement_health) OVER (PARTITION BY pi.phone ORDER BY pi.interaction_date DESC)::text as recent_engagement_level_from_call,
            FIRST_VALUE(pi.intent_level) OVER (PARTITION BY pi.phone ORDER BY pi.interaction_date DESC)::text as recent_intent_level_from_call,
            FIRST_VALUE(pi.budget_constraint) OVER (PARTITION BY pi.phone ORDER BY pi.interaction_date DESC)::text as recent_budget_constraint_from_call,
            FIRST_VALUE(pi.urgency_level) OVER (PARTITION BY pi.phone ORDER BY pi.interaction_date DESC)::text as recent_timeline_urgency_from_call,
            FIRST_VALUE(pi.fit_alignment) OVER (PARTITION BY pi.phone ORDER BY pi.interaction_date DESC)::text as recent_fit_alignment_from_call,
            false as escalated_to_human,
            FIRST_VALUE(pi.interaction_date) OVER (PARTITION BY pi.phone ORDER BY pi.interaction_date DESC) as last_contact,
            FIRST_VALUE(pi.demo_book_datetime) OVER (PARTITION BY pi.phone ORDER BY pi.interaction_date DESC) as demo_book_datetime,
            FIRST_VALUE(pi.lead_stage) OVER (PARTITION BY pi.phone ORDER BY pi.interaction_date DESC)::text as lead_stage,
            FIRST_VALUE(pi.contact_id) OVER (PARTITION BY pi.phone ORDER BY pi.interaction_date DESC)::text as contact_id,
            COUNT(*) OVER (PARTITION BY pi.phone)::bigint as interactions,
            ROW_NUMBER() OVER (PARTITION BY pi.phone ORDER BY pi.interaction_date DESC)::bigint as rn,
            FIRST_VALUE(pi.latest_agent) OVER (PARTITION BY pi.phone ORDER BY pi.interaction_date DESC)::text as latest_agent
          FROM phone_interactions pi
        ),
        -- Get the latest analysis values (human_edit takes precedence if newer than complete)
        latest_analysis AS (
          SELECT DISTINCT ON (phone_number)
            phone_number,
            intent_level,
            urgency_level,
            budget_constraint,
            fit_alignment,
            engagement_health,
            lead_status_tag,
            assigned_to_team_member_id,
            analysis_type,
            analysis_timestamp
          FROM lead_analytics
          WHERE user_id = $1 
            AND analysis_type IN ('complete', 'human_edit')
            AND phone_number IS NOT NULL
          ORDER BY phone_number, analysis_timestamp DESC
        ),
        phone_leads AS (
          SELECT 
            plb.group_key,
            plb.group_type,
            plb.phone,
            plb.email,
            plb.name,
            plb.company,
            plb.lead_type,
            -- Prefer latest analysis values (human_edit or complete) over individual call values
            COALESCE(lta.lead_status_tag, plb.recent_lead_tag_from_call, 'Cold')::text as recent_lead_tag,
            COALESCE(lta.engagement_health, plb.recent_engagement_level_from_call)::text as recent_engagement_level,
            COALESCE(lta.intent_level, plb.recent_intent_level_from_call)::text as recent_intent_level,
            COALESCE(lta.budget_constraint, plb.recent_budget_constraint_from_call)::text as recent_budget_constraint,
            COALESCE(lta.urgency_level, plb.recent_timeline_urgency_from_call)::text as recent_timeline_urgency,
            COALESCE(lta.fit_alignment, plb.recent_fit_alignment_from_call)::text as recent_fit_alignment,
            plb.escalated_to_human,
            plb.last_contact,
            plb.demo_book_datetime,
            plb.lead_stage,
            plb.contact_id,
            plb.interactions,
            plb.rn,
            -- Show only the latest interacted agent
            COALESCE(plb.latest_agent, '')::text as interacted_agents,
            (
              SELECT req.requirements
              FROM (
                SELECT
                  la_latest.requirements::text as requirements,
                  la_latest.analysis_timestamp as ts
                FROM lead_analytics la_latest
                WHERE la_latest.user_id = $1
                  AND la_latest.phone_number = plb.phone
                  AND la_latest.analysis_type IN ('complete', 'human_edit')

                UNION ALL

                SELECT
                  pc_latest.lead_complete_analysis->'extraction'->>'requirements' as requirements,
                  COALESCE(pc_latest.lead_extraction_completed_at, pc_latest.created_at) as ts
                FROM plivo_calls pc_latest
                WHERE pc_latest.user_id = $1
                  AND pc_latest.to_phone_number = plb.phone
                  AND pc_latest.lead_extraction_status = 'completed'
                  AND pc_latest.lead_complete_analysis IS NOT NULL
              ) req
              ORDER BY req.ts DESC
              LIMIT 1
            )::text as requirements,
            (
              SELECT cta.custom_cta
              FROM (
                SELECT
                  la_latest.custom_cta::text as custom_cta,
                  la_latest.analysis_timestamp as ts
                FROM lead_analytics la_latest
                WHERE la_latest.user_id = $1
                  AND la_latest.phone_number = plb.phone
                  AND la_latest.analysis_type IN ('complete', 'human_edit')

                UNION ALL

                SELECT
                  pc_latest.lead_complete_analysis->'extraction'->>'custom_cta' as custom_cta,
                  COALESCE(pc_latest.lead_extraction_completed_at, pc_latest.created_at) as ts
                FROM plivo_calls pc_latest
                WHERE pc_latest.user_id = $1
                  AND pc_latest.to_phone_number = plb.phone
                  AND pc_latest.lead_extraction_status = 'completed'
                  AND pc_latest.lead_complete_analysis IS NOT NULL
              ) cta
              ORDER BY cta.ts DESC
              LIMIT 1
            )::text as custom_cta,
            -- Notes now come from contacts table
            (SELECT co_notes.notes 
             FROM contacts co_notes 
             WHERE co_notes.user_id = $1 
               AND co_notes.phone_number = plb.phone 
             LIMIT 1)::text as contact_notes,
            lta.assigned_to_team_member_id
          FROM phone_leads_base plb
          LEFT JOIN latest_analysis lta ON lta.phone_number = plb.phone
          WHERE plb.rn = 1
        ),
        email_leads_base AS (
          SELECT 
            la.extracted_email::text as group_key,
            'email'::text as group_type,
            NULL::text as phone,
            COALESCE(co.email, la.extracted_email)::text as email,
            FIRST_VALUE(COALESCE(co.name, la.extracted_name, 'Anonymous')) OVER (PARTITION BY la.extracted_email ORDER BY c.created_at DESC)::text as name,
            FIRST_VALUE(COALESCE(co.company, la.company_name)) OVER (PARTITION BY la.extracted_email ORDER BY c.created_at DESC)::text as company,
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
            false as escalated_to_human,
            FIRST_VALUE(c.created_at) OVER (PARTITION BY la.extracted_email ORDER BY c.created_at DESC) as last_contact,
            FIRST_VALUE(la.demo_book_datetime) OVER (PARTITION BY la.extracted_email ORDER BY c.created_at DESC) as demo_book_datetime,
            FIRST_VALUE(co.lead_stage) OVER (PARTITION BY la.extracted_email ORDER BY c.created_at DESC)::text as lead_stage,
            FIRST_VALUE(co.id) OVER (PARTITION BY la.extracted_email ORDER BY c.created_at DESC)::text as contact_id,
            COUNT(*) FILTER (WHERE la.analysis_type = 'individual' OR la.analysis_type IS NULL) OVER (PARTITION BY la.extracted_email)::bigint as interactions,
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
             WHERE la2.extracted_email = elb.email AND c2.user_id = $1), '')::text as interacted_agents,
            -- For email-only leads (no phone), get requirements from most recent individual analysis
            (SELECT la_ind.requirements 
             FROM lead_analytics la_ind 
             JOIN calls c_ind ON la_ind.call_id = c_ind.id
             WHERE la_ind.user_id = $1 
               AND la_ind.extracted_email = elb.email 
               AND la_ind.analysis_type = 'individual'
             ORDER BY c_ind.created_at DESC 
             LIMIT 1)::text as requirements,
            -- For email-only leads (no phone), get custom_cta from most recent individual analysis
            (SELECT la_ind.custom_cta 
             FROM lead_analytics la_ind 
             JOIN calls c_ind ON la_ind.call_id = c_ind.id
             WHERE la_ind.user_id = $1 
               AND la_ind.extracted_email = elb.email 
               AND la_ind.analysis_type = 'individual'
             ORDER BY c_ind.created_at DESC 
             LIMIT 1)::text as custom_cta,
            -- Notes from contacts (email-only leads may not have contact record)
            NULL::text as contact_notes,
            NULL::uuid as assigned_to_team_member_id
          FROM email_leads_base elb
          WHERE elb.rn = 1
        ),
        individual_leads AS (
          SELECT 
            c.id::text as group_key,
            'individual'::text as group_type,
            NULL::text as phone,
            COALESCE(co.email, la.extracted_email)::text as email,
            CASE 
              WHEN co.name IS NOT NULL AND co.name != ''
              THEN co.name
              WHEN la.extracted_name IS NOT NULL AND la.extracted_name != ''
              THEN la.extracted_name
              ELSE 'Anonymous ' || TO_CHAR(c.created_at, 'MM/DD/YYYY HH24:MI')
            END::text as name,
            COALESCE(co.company, la.company_name)::text as company,
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
            false as escalated_to_human,
            c.created_at as last_contact,
            la.demo_book_datetime as demo_book_datetime,
            co.lead_stage::text as lead_stage,
            co.id::text as contact_id,
            1::bigint as interactions,
            COALESCE(a.name, '')::text as interacted_agents,
            la.requirements::text as requirements,
            la.custom_cta::text as custom_cta,
            co.notes::text as contact_notes,
            1::bigint as rn,
            NULL::uuid as assigned_to_team_member_id
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
            escalated_to_human, last_contact, demo_book_datetime, lead_stage, contact_id, interactions,
            interacted_agents, requirements, custom_cta, contact_notes, rn, assigned_to_team_member_id
          FROM phone_leads
          UNION ALL
          SELECT 
            group_key, group_type, phone, email, name, company, lead_type,
            recent_lead_tag, recent_engagement_level, recent_intent_level,
            recent_budget_constraint, recent_timeline_urgency, recent_fit_alignment,
            escalated_to_human, last_contact, demo_book_datetime, lead_stage, contact_id, interactions,
            interacted_agents, requirements, custom_cta, contact_notes, rn, assigned_to_team_member_id
          FROM email_leads
          UNION ALL
          SELECT 
            group_key, group_type, phone, email, name, company, lead_type,
            recent_lead_tag, recent_engagement_level, recent_intent_level,
            recent_budget_constraint, recent_timeline_urgency, recent_fit_alignment,
            escalated_to_human, last_contact, demo_book_datetime, lead_stage, contact_id, interactions,
            interacted_agents, requirements, custom_cta, contact_notes, rn, assigned_to_team_member_id
          FROM individual_leads
        )
        SELECT 
          al.*,
          fu.follow_up_date as follow_up_scheduled,
          fu.follow_up_status,
          cm.id as meeting_id,
          cm.meeting_link,
          cm.meeting_start_time,
          cm.attendee_email as meeting_attendee_email,
          cm.meeting_title,
          cm.meeting_description,
          cm.google_event_id,
          tm.id as assigned_member_id,
          tm.name as assigned_member_name,
          tm.role as assigned_member_role
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
        LEFT JOIN LATERAL (
          SELECT cm.id, cm.meeting_link, cm.meeting_start_time, cm.google_event_id, cm.attendee_email, cm.meeting_title, cm.meeting_description
          FROM calendar_meetings cm
          JOIN lead_analytics la ON cm.lead_analytics_id = la.id
          JOIN calls c ON la.call_id = c.id
          WHERE cm.user_id = $1
            AND cm.status = 'scheduled'
            AND (
              (al.group_type = 'phone' AND c.phone_number = al.phone) OR
              (al.group_type = 'email' AND la.extracted_email = al.email) OR
              (al.group_type = 'individual' AND la.id::text = al.group_key)
            )
          ORDER BY cm.meeting_start_time DESC
          LIMIT 1
        ) cm ON true
        LEFT JOIN team_members tm ON al.assigned_to_team_member_id = tm.id
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
        interactedAgents: row.interacted_agents ? row.interacted_agents.split(', ').filter(Boolean) : [],
        interactions: parseInt(row.interactions) || 0,
        lastContact: row.last_contact,
        followUpScheduled: row.follow_up_scheduled,
        followUpStatus: row.follow_up_status,
        demoScheduled: row.meeting_start_time || row.demo_book_datetime, // Use meeting_start_time from calendar_meetings, fallback to demo_book_datetime
        meetingId: row.meeting_id, // UUID of calendar_meetings record for rescheduling
        meetingLink: row.meeting_link, // Google Meet link
        meetingAttendeeEmail: row.meeting_attendee_email, // Email from existing meeting
        meetingTitle: row.meeting_title, // Title from existing meeting
        meetingDescription: row.meeting_description, // Description from existing meeting
        groupType: row.group_type,
        requirements: row.requirements, // From complete analysis (phone leads) or individual analysis (email/individual leads)
        customCta: row.custom_cta, // Custom CTA string from extraction
        contactNotes: row.contact_notes, // Notes from contacts table
        leadStage: row.lead_stage, // Lead stage for pipeline tracking
        contactId: row.contact_id, // Contact ID for updating lead stage
        assignedTo: row.assigned_member_id ? {
          id: row.assigned_member_id,
          name: row.assigned_member_name,
          role: row.assigned_member_role
        } : null
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
      const rawGroupKey = groupKeyParts.join('_');
      const groupKey = (() => {
        try {
          return decodeURIComponent(rawGroupKey);
        } catch {
          return rawGroupKey;
        }
      })();

      if (!groupType || !groupKey) {
        res.status(400).json({ error: 'Invalid groupId format' });
        return;
      }

      let query = '';
      let queryParams: any[] = [userId];

      if (groupType === 'phone') {
        // Some environments do not have the legacy `emails` table.
        // If it's missing, querying it will cause a 500 even if there are no email rows.
        const emailsTableExistsResult = await this.pool.query<{ exists: boolean }>(
          `SELECT (to_regclass('public.emails') IS NOT NULL) AS exists;`
        );
        const includeEmailInteractions = Boolean(emailsTableExistsResult.rows?.[0]?.exists);

        const emailInteractionsUnion = includeEmailInteractions
          ? `
            UNION ALL
            
            -- Email interactions
            SELECT 
              e.id,
              'email'::text as interaction_type,
              co.name as lead_name,
              co.email as extracted_email,
              co.company as company_name,
              'Email System' as interaction_agent,
              e.sent_at as interaction_date,
              'Email' as platform,
              NULL as call_direction,
              NULL as hangup_by,
              NULL as hangup_reason,
              CASE 
                WHEN e.status = 'opened' THEN 'Hot'
                WHEN e.status = 'delivered' THEN 'Warm'
                WHEN e.status = 'failed' THEN 'Cold'
                ELSE 'Warm'
              END as status,
              e.subject as smart_notification,
              NULL as requirements,
              NULL as custom_cta,
              NULL as duration,
              NULL as engagement_level,
              NULL as intent_level,
              NULL as budget_constraint,
              NULL as timeline_urgency,
              NULL as fit_alignment,
              NULL::numeric as total_score,
              NULL::numeric as intent_score,
              NULL::numeric as urgency_score,
              NULL::numeric as budget_score,
              NULL::numeric as fit_score,
              NULL::numeric as engagement_score,
              NULL::timestamp as demo_book_datetime,
              NULL::timestamp as follow_up_date,
              NULL::text as follow_up_remark,
              NULL::text as follow_up_status,
              NULL::boolean as follow_up_completed,
              NULL::uuid as follow_up_call_id,
              e.subject as email_subject,
              e.status as email_status,
              e.to_email as email_to,
              e.from_email as email_from
            FROM emails e
            LEFT JOIN contacts co ON e.contact_id = co.id
            WHERE e.user_id = $1
              AND co.phone_number = $2
          `
          : '';

        // Human edit interactions - show manual edits in timeline
        const humanEditUnion = `
          UNION ALL
          
          -- Human edit interactions
          SELECT 
            la.id,
            'human_edit'::text as interaction_type,
            la.extracted_name as lead_name,
            la.extracted_email as extracted_email,
            la.company_name as company_name,
            COALESCE(la.last_edited_by_name, 'Unknown Editor') as interaction_agent,
            la.last_edited_at as interaction_date,
            COALESCE(la.interaction_platform, 'Manual Edit') as platform,
            NULL::text as call_direction,
            NULL::text as hangup_by,
            NULL::text as hangup_reason,
            la.lead_status_tag as status,
            'Manual intelligence update' as smart_notification,
            la.requirements,
            la.custom_cta,
            NULL::text as duration,
            la.engagement_health as engagement_level,
            la.intent_level,
            la.budget_constraint,
            la.urgency_level as timeline_urgency,
            la.fit_alignment,
            la.total_score,
            la.intent_score,
            la.urgency_score,
            la.budget_score,
            la.fit_score,
            la.engagement_score,
            la.demo_book_datetime,
            NULL::timestamp as follow_up_date,
            NULL::text as follow_up_remark,
            NULL::text as follow_up_status,
            NULL::boolean as follow_up_completed,
            NULL::uuid as follow_up_call_id,
            NULL::text as email_subject,
            NULL::text as email_status,
            NULL::text as email_to,
            NULL::text as email_from
          FROM lead_analytics la
          WHERE la.user_id = $1
            AND la.phone_number = $2
            AND la.analysis_type = 'human_edit'
            AND la.last_edited_at IS NOT NULL
        `;

        query = `
          SELECT * FROM (
            -- Call interactions
            SELECT 
              c.id,
              'call'::text as interaction_type,
              la.extracted_name as lead_name,
              la.extracted_email as extracted_email,
              la.company_name as company_name,
              a.name as interaction_agent,
              c.created_at as interaction_date,
              CASE 
                WHEN c.metadata->>'call_source' = 'internet' THEN 'Internet'
                ELSE 'Phone'
              END as platform,
              CASE 
                WHEN c.lead_type = 'inbound' THEN 'Inbound'
                WHEN c.lead_type = 'outbound' THEN 'Outbound'
                ELSE 'Outbound'
              END as call_direction,
              c.hangup_by,
              c.hangup_reason,
              CASE 
                WHEN la.lead_status_tag IS NOT NULL THEN la.lead_status_tag
                WHEN c.status = 'failed' AND c.call_lifecycle_status IS NOT NULL THEN c.call_lifecycle_status
                ELSE 'Cold'
              END as status,
              la.smart_notification,
              la.requirements,
              la.custom_cta,
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
              la.total_score,
              la.intent_score,
              la.urgency_score,
              la.budget_score,
              la.fit_score,
              la.engagement_score,
              la.demo_book_datetime,
              fu.follow_up_date,
              fu.remark as follow_up_remark,
              fu.follow_up_status,
              fu.is_completed as follow_up_completed,
              fu.call_id as follow_up_call_id,
              NULL::text as email_subject,
              NULL::text as email_status,
              NULL::text as email_to,
              NULL::text as email_from
            FROM calls c
            LEFT JOIN lead_analytics la ON c.id = la.call_id AND la.analysis_type = 'individual'
            LEFT JOIN agents a ON c.agent_id = a.id
            LEFT JOIN contacts ct ON c.contact_id = ct.id
            LEFT JOIN follow_ups fu ON (
              (fu.call_id = c.id) OR 
              (fu.call_id IS NULL AND fu.lead_phone = c.phone_number AND fu.user_id = $1)
            )
            WHERE c.user_id = $1 
              AND c.phone_number = $2

            UNION ALL

            -- CRM Dialer interactions (Plivo)
            SELECT
              pc.id,
              'call'::text as interaction_type,
              COALESCE(
                ct.name,
                pc.lead_individual_analysis->'extraction'->>'name',
                pc.lead_complete_analysis->'extraction'->>'name',
                'Anonymous'
              ) as lead_name,
              COALESCE(
                ct.email,
                pc.lead_individual_analysis->'extraction'->>'email_address',
                pc.lead_complete_analysis->'extraction'->>'email_address'
              ) as extracted_email,
              COALESCE(
                ct.company,
                pc.lead_individual_analysis->'extraction'->>'company_name',
                pc.lead_complete_analysis->'extraction'->>'company_name'
              ) as company_name,
              COALESCE(tm.name, 'CRM Dialer') as interaction_agent,
              COALESCE(pc.ended_at, pc.answered_at, pc.started_at, pc.initiated_at, pc.created_at) as interaction_date,
              'CRM Call' as platform,
              'Outbound' as call_direction,
              pc.hangup_by,
              pc.hangup_reason,
              COALESCE(
                pc.lead_individual_analysis->>'lead_status_tag',
                pc.lead_complete_analysis->>'lead_status_tag',
                'Cold'
              ) as status,
              COALESCE(
                pc.lead_individual_analysis->'extraction'->>'smartnotification',
                pc.lead_individual_analysis->'extraction'->>'smart_notification',
                pc.lead_individual_analysis->'extraction'->>'in_detail_summary'
              ) as smart_notification,
              COALESCE(
                pc.lead_individual_analysis->'extraction'->>'requirements',
                pc.lead_complete_analysis->'extraction'->>'requirements'
              ) as requirements,
              COALESCE(
                pc.lead_individual_analysis->'extraction'->>'custom_cta',
                pc.lead_complete_analysis->'extraction'->>'custom_cta'
              ) as custom_cta,
              CASE
                WHEN COALESCE(pc.duration_seconds, 0) > 0 THEN
                  LPAD(((pc.duration_seconds / 60))::text, 2, '0') || ':' || LPAD((pc.duration_seconds % 60)::text, 2, '0')
                ELSE '00:00'
              END as duration,
              COALESCE(pc.lead_individual_analysis->>'engagement_health', pc.lead_complete_analysis->>'engagement_health') as engagement_level,
              COALESCE(pc.lead_individual_analysis->>'intent_level', pc.lead_complete_analysis->>'intent_level') as intent_level,
              COALESCE(pc.lead_individual_analysis->>'budget_constraint', pc.lead_complete_analysis->>'budget_constraint') as budget_constraint,
              COALESCE(pc.lead_individual_analysis->>'urgency_level', pc.lead_complete_analysis->>'urgency_level') as timeline_urgency,
              COALESCE(pc.lead_individual_analysis->>'fit_alignment', pc.lead_complete_analysis->>'fit_alignment') as fit_alignment,
              NULLIF(COALESCE(pc.lead_individual_analysis->>'total_score', pc.lead_complete_analysis->>'total_score'), '')::numeric as total_score,
              NULLIF(COALESCE(pc.lead_individual_analysis->>'intent_score', pc.lead_complete_analysis->>'intent_score'), '')::numeric as intent_score,
              NULLIF(COALESCE(pc.lead_individual_analysis->>'urgency_score', pc.lead_complete_analysis->>'urgency_score'), '')::numeric as urgency_score,
              NULLIF(COALESCE(pc.lead_individual_analysis->>'budget_score', pc.lead_complete_analysis->>'budget_score'), '')::numeric as budget_score,
              NULLIF(COALESCE(pc.lead_individual_analysis->>'fit_score', pc.lead_complete_analysis->>'fit_score'), '')::numeric as fit_score,
              NULLIF(COALESCE(pc.lead_individual_analysis->>'engagement_score', pc.lead_complete_analysis->>'engagement_score'), '')::numeric as engagement_score,
              NULL::timestamp as demo_book_datetime,
              fu.follow_up_date,
              fu.remark as follow_up_remark,
              fu.follow_up_status,
              fu.is_completed as follow_up_completed,
              fu.call_id as follow_up_call_id,
              NULL::text as email_subject,
              NULL::text as email_status,
              NULL::text as email_to,
              NULL::text as email_from
            FROM plivo_calls pc
            LEFT JOIN contacts ct ON pc.contact_id = ct.id
            LEFT JOIN team_members tm ON pc.team_member_id = tm.id
            LEFT JOIN follow_ups fu ON (
              fu.call_id IS NULL
              AND fu.lead_phone = pc.to_phone_number
              AND fu.user_id = $1
            )
            WHERE pc.user_id = $1
              AND pc.to_phone_number = $2
              AND (ct.is_customer IS NULL OR ct.is_customer = false)
            ${emailInteractionsUnion}
            ${humanEditUnion}
          ) combined
          ORDER BY interaction_date DESC;
        `;
        queryParams.push(groupKey);
      } else if (groupType === 'email') {
        query = `
          SELECT 
            c.id,
            la.extracted_name as lead_name,
            la.extracted_email as extracted_email,
            la.company_name as company_name,
            a.name as interaction_agent,
            c.created_at as interaction_date,
            CASE 
              WHEN c.metadata->>'call_source' = 'internet' THEN 'Internet'
              ELSE 'Phone'
            END as platform,
            CASE 
              WHEN c.lead_type = 'inbound' THEN 'Inbound'
              WHEN c.lead_type = 'outbound' THEN 'Outbound'
              ELSE 'Outbound'
            END as call_direction,
            c.hangup_by,
            c.hangup_reason,
            CASE 
              WHEN la.lead_status_tag IS NOT NULL THEN la.lead_status_tag
              WHEN c.status = 'failed' AND c.call_lifecycle_status IS NOT NULL THEN c.call_lifecycle_status
              ELSE 'Cold'
            END as status,
            la.smart_notification,
            la.requirements,
            la.custom_cta,
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
            la.total_score,
            la.intent_score,
            la.urgency_score,
            la.budget_score,
            la.fit_score,
            la.engagement_score,
            la.demo_book_datetime,
            fu.follow_up_date,
            fu.remark as follow_up_remark,
            fu.follow_up_status,
            fu.is_completed as follow_up_completed,
            fu.call_id as follow_up_call_id
          FROM calls c
          LEFT JOIN lead_analytics la ON c.id = la.call_id AND la.analysis_type = 'individual'
          LEFT JOIN agents a ON c.agent_id = a.id
          LEFT JOIN contacts ct ON c.contact_id = ct.id
          LEFT JOIN follow_ups fu ON (
            (fu.call_id = c.id) OR 
            (fu.call_id IS NULL AND fu.lead_email = la.extracted_email AND fu.user_id = $1)
          )
          WHERE c.user_id = $1 
            AND la.extracted_email = $2
          ORDER BY c.created_at DESC;
        `;
        queryParams.push(groupKey);
      } else if (groupType === 'individual') {
        query = `
          SELECT 
            c.id,
            la.extracted_name as lead_name,
            la.extracted_email as extracted_email,
            la.company_name as company_name,
            a.name as interaction_agent,
            c.created_at as interaction_date,
            CASE 
              WHEN c.metadata->>'call_source' = 'internet' THEN 'Internet'
              ELSE 'Phone'
            END as platform,
            CASE 
              WHEN c.lead_type = 'inbound' THEN 'Inbound'
              WHEN c.lead_type = 'outbound' THEN 'Outbound'
              ELSE 'Outbound'
            END as call_direction,
            c.hangup_by,
            c.hangup_reason,
            CASE 
              WHEN la.lead_status_tag IS NOT NULL THEN la.lead_status_tag
              WHEN c.status = 'failed' AND c.call_lifecycle_status IS NOT NULL THEN c.call_lifecycle_status
              ELSE 'Cold'
            END as status,
            la.smart_notification,
            la.requirements,
            la.custom_cta,
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
            la.total_score,
            la.intent_score,
            la.urgency_score,
            la.budget_score,
            la.fit_score,
            la.engagement_score,
            la.demo_book_datetime,
            NULL as follow_up_date,
            NULL as follow_up_remark,
            NULL as follow_up_status,
            NULL as follow_up_completed,
            NULL as follow_up_call_id
          FROM calls c
          LEFT JOIN lead_analytics la ON c.id = la.call_id AND la.analysis_type = 'individual'
          LEFT JOIN agents a ON c.agent_id = a.id
          LEFT JOIN contacts ct ON c.contact_id = ct.id
          WHERE c.user_id = $1 
            AND c.id = $2
          ORDER BY c.created_at DESC;
        `;
        queryParams.push(groupKey);
      } else {
        res.status(400).json({ error: 'Unsupported group type' });
        return;
      }

      const result = await this.pool.query(query, queryParams);
      
      const timeline: LeadTimelineEntry[] = result.rows.map(row => ({
        id: row.id,
        interactionType: row.interaction_type as 'call' | 'email',
        leadName: row.lead_name,
        interactionAgent: row.interaction_agent || 'Unknown Agent',
        interactionDate: row.interaction_date,
        platform: row.platform,
        callDirection: row.call_direction,
        hangupBy: row.hangup_by,
        hangupReason: row.hangup_reason,
        companyName: row.company_name,
        status: row.status || 'Cold',
        smartNotification: row.smart_notification,
        requirements: row.requirements,
        customCta: row.custom_cta,
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
        // Follow-up information
        followUpDate: row.follow_up_date,
        followUpRemark: row.follow_up_remark,
        followUpStatus: row.follow_up_status,
        followUpCompleted: row.follow_up_completed,
        followUpCallId: row.follow_up_call_id,
        // Extracted data
        extractedEmail: row.extracted_email,
        // Additional fields
        demoBookDatetime: row.demo_book_datetime,
        // Email-specific fields
        emailSubject: row.email_subject,
        emailStatus: row.email_status as 'sent' | 'delivered' | 'opened' | 'failed',
        emailTo: row.email_to,
        emailFrom: row.email_from
      }));

      res.json(timeline);
    } catch (error) {
      console.error('Error fetching lead timeline:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Edit lead intelligence fields for a lead group
   * Creates a new 'human_edit' analysis record instead of updating 'complete'
   * This preserves AI analysis history while allowing human overrides
   */
  async editLeadIntelligence(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const { groupId } = req.params;
      const updates = req.body;

      // Decode the groupId (phone number is URL encoded)
      const decodedGroupId = decodeURIComponent(groupId);

      // Editable fields (text levels and text fields)
      // NOTE: manual_notes removed - notes are now stored in contacts.notes and updated separately
      const editableFields = [
        'intent_level',
        'urgency_level', // This is timeline_urgency in the UI
        'budget_constraint',
        'fit_alignment',
        'engagement_health',
        'lead_status_tag',
        'assigned_to_team_member_id',
        'custom_cta',      // Custom CTA tags
        'requirements',    // Requirements/notes
        'contact_notes',   // Notes from contacts table (handled separately)
        'interaction_platform'  // Platform for manual interaction (Call/WhatsApp/Email)
      ];

      // Validate that only allowed fields are being updated
      const updateKeys = Object.keys(updates);
      const invalidFields = updateKeys.filter(key => !editableFields.includes(key));
      if (invalidFields.length > 0) {
        res.status(400).json({ 
          error: `Cannot edit these fields: ${invalidFields.join(', ')}. Only allowed fields can be edited.` 
        });
        return;
      }

      // Validate level values if provided
      const validLevels = ['High', 'Medium', 'Low', 'N/A', 'Unknown', null, ''];
      const levelFields = ['intent_level', 'urgency_level', 'budget_constraint', 'fit_alignment', 'engagement_health'];
      
      for (const field of levelFields) {
        if (updates[field] !== undefined && !validLevels.includes(updates[field])) {
          res.status(400).json({ 
            error: `Invalid value for ${field}. Must be: High, Medium, Low, N/A, or Unknown` 
          });
          return;
        }
      }

      // Find the latest analysis record (complete or human_edit) to use as base
      const findQuery = `
        SELECT la.*
        FROM lead_analytics la
        WHERE la.user_id = $1 
          AND la.phone_number = $2
          AND la.analysis_type IN ('complete', 'human_edit')
        ORDER BY la.analysis_timestamp DESC
        LIMIT 1
      `;

      const findResult = await this.pool.query(findQuery, [userId, decodedGroupId]);

      if (findResult.rows.length === 0) {
        res.status(404).json({ error: 'Lead not found' });
        return;
      }

      const baseRecord = findResult.rows[0];

      // Determine actor info
      let actorType: EventActorType = 'owner';
      let actorId: string | undefined = userId;
      let actorName: string = req.user?.name || 'Owner';

      // Check if this is a team member
      if ((req as any).isTeamMember && (req as any).teamMemberId) {
        actorType = 'team_member';
        actorId = (req as any).teamMemberId;
        const teamMember = await TeamMemberModel.getWithTenantInfo(actorId!);
        actorName = teamMember?.name || 'Team Member';
      }

      // Track field changes
      const fieldChanges: Record<string, FieldChange> = {};

      // Build the new human_edit record values
      const newValues: Record<string, any> = {
        intent_level: baseRecord.intent_level,
        urgency_level: baseRecord.urgency_level,
        budget_constraint: baseRecord.budget_constraint,
        fit_alignment: baseRecord.fit_alignment,
        engagement_health: baseRecord.engagement_health,
        lead_status_tag: baseRecord.lead_status_tag,
        assigned_to_team_member_id: baseRecord.assigned_to_team_member_id,
        interaction_platform: baseRecord.interaction_platform || 'Call',  // Default to Call
        // Copy scores from base record
        intent_score: baseRecord.intent_score,
        urgency_score: baseRecord.urgency_score,
        budget_score: baseRecord.budget_score,
        fit_score: baseRecord.fit_score,
        engagement_score: baseRecord.engagement_score,
        total_score: baseRecord.total_score,
        // Copy other important fields
        reasoning: baseRecord.reasoning,
        cta_interactions: baseRecord.cta_interactions,
        company_name: baseRecord.company_name,
        extracted_name: baseRecord.extracted_name,
        extracted_email: baseRecord.extracted_email,
        smart_notification: baseRecord.smart_notification,
        demo_book_datetime: baseRecord.demo_book_datetime,
        requirements: baseRecord.requirements,
        custom_cta: baseRecord.custom_cta,
        latest_call_id: baseRecord.latest_call_id || baseRecord.call_id,
        previous_calls_analyzed: baseRecord.previous_calls_analyzed
      };

      // Handle contact_notes separately - update contacts table directly
      let contactNotesUpdated = false;
      if (updates.contact_notes !== undefined) {
        // Find contact by phone number and update notes
        const updateContactNotesQuery = `
          UPDATE contacts 
          SET notes = $1, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $2 AND phone_number = $3
          RETURNING id
        `;
        const contactResult = await this.pool.query(updateContactNotesQuery, [
          updates.contact_notes,
          userId,
          decodedGroupId
        ]);
        if (contactResult.rows.length > 0) {
          contactNotesUpdated = true;
          fieldChanges['contact_notes'] = {
            old: null, // We don't track old value here
            new: updates.contact_notes
          };
        }
        // Remove from updates so it doesn't try to save to lead_analytics
        delete updates.contact_notes;
      }

      // Apply the updates and track changes
      for (const field of editableFields) {
        if (updates[field] !== undefined && field !== 'contact_notes') {
          const oldValue = newValues[field];
          const newValue = updates[field];

          if (oldValue !== newValue) {
            fieldChanges[field] = {
              old: oldValue,
              new: newValue
            };
            newValues[field] = newValue;
          }
        }
      }

      if (Object.keys(fieldChanges).length === 0) {
        res.json({ 
          message: 'No changes to apply',
          lead_analytics_id: baseRecord.id
        });
        return;
      }

      // If this is an agent editing and no explicit assignment, auto-assign to themselves
      if ((req as any).teamMemberRole === 'agent' && !updates.assigned_to_team_member_id) {
        fieldChanges['assigned_to'] = {
          old: newValues.assigned_to_team_member_id,
          new: (req as any).teamMemberId
        };
        newValues.assigned_to_team_member_id = (req as any).teamMemberId;
      }

      // Add editor tracking
      newValues.last_edited_by_type = actorType;
      newValues.last_edited_by_id = actorId;
      newValues.last_edited_by_name = actorName;
      newValues.last_edited_at = new Date();

      // Upsert the human_edit record (one per user+phone)
      const upsertQuery = `
        INSERT INTO lead_analytics (
          user_id, phone_number, analysis_type, call_id,
          intent_level, urgency_level, budget_constraint, fit_alignment, engagement_health,
          lead_status_tag, assigned_to_team_member_id, interaction_platform,
          intent_score, urgency_score, budget_score, fit_score, engagement_score, total_score,
          reasoning, cta_interactions, company_name, extracted_name, extracted_email,
          smart_notification, demo_book_datetime, requirements, custom_cta,
          latest_call_id, previous_calls_analyzed, analysis_timestamp,
          last_edited_by_type, last_edited_by_id, last_edited_by_name, last_edited_at
        ) VALUES (
          $1, $2, 'human_edit', $3,
          $4, $5, $6, $7, $8,
          $9, $10, $11,
          $12, $13, $14, $15, $16, $17,
          $18, $19, $20, $21, $22,
          $23, $24, $25, $26,
          $27, $28, CURRENT_TIMESTAMP,
          $29, $30, $31, $32
        )
        ON CONFLICT (user_id, phone_number, analysis_type) WHERE analysis_type = 'human_edit'
        DO UPDATE SET
          intent_level = EXCLUDED.intent_level,
          urgency_level = EXCLUDED.urgency_level,
          budget_constraint = EXCLUDED.budget_constraint,
          fit_alignment = EXCLUDED.fit_alignment,
          engagement_health = EXCLUDED.engagement_health,
          lead_status_tag = EXCLUDED.lead_status_tag,
          assigned_to_team_member_id = EXCLUDED.assigned_to_team_member_id,
          interaction_platform = EXCLUDED.interaction_platform,
          intent_score = EXCLUDED.intent_score,
          urgency_score = EXCLUDED.urgency_score,
          budget_score = EXCLUDED.budget_score,
          fit_score = EXCLUDED.fit_score,
          engagement_score = EXCLUDED.engagement_score,
          total_score = EXCLUDED.total_score,
          reasoning = EXCLUDED.reasoning,
          cta_interactions = EXCLUDED.cta_interactions,
          company_name = EXCLUDED.company_name,
          extracted_name = EXCLUDED.extracted_name,
          extracted_email = EXCLUDED.extracted_email,
          smart_notification = EXCLUDED.smart_notification,
          demo_book_datetime = EXCLUDED.demo_book_datetime,
          requirements = EXCLUDED.requirements,
          custom_cta = EXCLUDED.custom_cta,
          latest_call_id = EXCLUDED.latest_call_id,
          previous_calls_analyzed = EXCLUDED.previous_calls_analyzed,
          analysis_timestamp = CURRENT_TIMESTAMP,
          last_edited_by_type = EXCLUDED.last_edited_by_type,
          last_edited_by_id = EXCLUDED.last_edited_by_id,
          last_edited_by_name = EXCLUDED.last_edited_by_name,
          last_edited_at = EXCLUDED.last_edited_at
        RETURNING *
      `;

      const upsertValues = [
        userId, decodedGroupId, baseRecord.call_id,
        newValues.intent_level, newValues.urgency_level, newValues.budget_constraint, newValues.fit_alignment, newValues.engagement_health,
        newValues.lead_status_tag, newValues.assigned_to_team_member_id, newValues.interaction_platform,
        newValues.intent_score, newValues.urgency_score, newValues.budget_score, newValues.fit_score, newValues.engagement_score, newValues.total_score,
        newValues.reasoning, newValues.cta_interactions, newValues.company_name, newValues.extracted_name, newValues.extracted_email,
        newValues.smart_notification, newValues.demo_book_datetime, newValues.requirements, newValues.custom_cta,
        newValues.latest_call_id, newValues.previous_calls_analyzed,
        newValues.last_edited_by_type, newValues.last_edited_by_id, newValues.last_edited_by_name, newValues.last_edited_at
      ];

      const upsertResult = await this.pool.query(upsertQuery, upsertValues);
      const humanEditRecord = upsertResult.rows[0];

      // Create event record for timeline
      await LeadIntelligenceEventModel.createEditEvent({
        tenant_user_id: userId,
        phone_number: decodedGroupId,
        lead_analytics_id: humanEditRecord.id,
        actor_type: actorType,
        actor_id: actorId,
        actor_name: actorName,
        field_changes: fieldChanges,
        notes: updates.edit_note || undefined
      });

      res.json({
        message: 'Lead intelligence updated successfully',
        lead_analytics_id: humanEditRecord.id,
        updated_fields: Object.keys(fieldChanges),
        edited_by: actorName,
        updated_at: humanEditRecord.last_edited_at
      });
    } catch (error) {
      console.error('Error editing lead intelligence:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get available team members for assignment dropdown
   */
  async getTeamMembersForAssignment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const teamMembers = await TeamMemberModel.findByTenantUserId(userId);

      // Filter to only active members who can be assigned (not viewers)
      const assignableMembers = teamMembers
        .filter(tm => tm.is_active && tm.role !== 'viewer')
        .map(tm => ({
          id: tm.id,
          name: tm.name,
          role: tm.role
        }));

      res.json({ 
        team_members: assignableMembers,
        // Include owner as option
        include_owner: true
      });
    } catch (error) {
      console.error('Error fetching team members:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get lead intelligence events for timeline (manual edits, assignments, notes)
   */
  async getLeadEvents(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const { groupId } = req.params;
      const decodedGroupId = decodeURIComponent(groupId);

      const events = await LeadIntelligenceEventModel.getEventsByPhone(userId, decodedGroupId, 50);

      res.json({ events });
    } catch (error) {
      console.error('Error fetching lead events:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}