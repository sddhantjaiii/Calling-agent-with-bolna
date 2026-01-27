import { pool } from '../config/database';
import { logger } from '../utils/logger';

interface TeamMemberKPIs {
  teamMemberId: string;
  teamMemberName: string;
  teamMemberRole: string;
  leadsAssigned: number;
  leadsActive: number;
  qualifiedLeads: number;
  followUpsAssigned: number;
  followUpsCompleted: number;
  followUpsPending: number;
  leadEdits: number;
  notesAdded: number;
  statusChanges: number;
  manualCallsLogged: number;
  demosScheduled: number;
}

interface TeamMemberActivityLog {
  id: string;
  activityType: 'edit' | 'assign' | 'note' | 'status_change' | 'call' | 'follow_up';
  activityDescription: string;
  leadName?: string;
  leadPhone?: string;
  timestamp: Date;
  details?: Record<string, any>;
}

class TeamMemberAnalyticsService {
  /**
   * Get analytics for all team members (salespersons)
   * @param tenantUserId - The tenant/owner user ID
   * @param dateRange - Optional date range { startDate, endDate }
   */
  async getAllTeamMembersAnalytics(
    tenantUserId: string,
    dateRange?: { startDate: Date; endDate: Date }
  ): Promise<TeamMemberKPIs[]> {
    try {
      const startDate = dateRange?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: last 30 days
      const endDate = dateRange?.endDate || new Date();

      const query = `
        SELECT 
          tm.id as team_member_id,
          tm.name as team_member_name,
          tm.role as team_member_role,
          
          -- Real-time calculations from actual data
          COUNT(DISTINCT CASE WHEN la.assigned_to_team_member_id = tm.id THEN la.id END) as leads_assigned,
          COUNT(DISTINCT CASE 
            WHEN la.assigned_to_team_member_id = tm.id 
            AND (la.lead_status_tag IS NULL OR la.lead_status_tag NOT IN ('closed', 'lost', 'converted')) 
            THEN la.id 
          END) as leads_active,
          COUNT(DISTINCT CASE 
            WHEN la.assigned_to_team_member_id = tm.id 
            AND la.total_score >= 70 
            THEN la.id 
          END) as qualified_leads,
          
          -- Follow-up metrics
          COUNT(DISTINCT CASE 
            WHEN fu.assigned_to_team_member_id = tm.id 
            THEN fu.id 
          END) as follow_ups_assigned,
          COUNT(DISTINCT CASE 
            WHEN fu.assigned_to_team_member_id = tm.id 
            AND fu.follow_up_status = 'completed' 
            THEN fu.id 
          END) as follow_ups_completed,
          COUNT(DISTINCT CASE 
            WHEN fu.assigned_to_team_member_id = tm.id 
            AND fu.follow_up_status = 'pending' 
            THEN fu.id 
          END) as follow_ups_pending,
          
          -- Activity metrics from lead_intelligence_events
          COUNT(DISTINCT CASE 
            WHEN lie.actor_type = 'team_member' 
            AND lie.actor_id = tm.id 
            AND lie.event_type = 'edit' 
            THEN lie.id 
          END) as lead_edits,
          COUNT(DISTINCT CASE 
            WHEN lie.actor_type = 'team_member' 
            AND lie.actor_id = tm.id 
            AND lie.event_type = 'note' 
            THEN lie.id 
          END) as notes_added,
          COUNT(DISTINCT CASE 
            WHEN lie.actor_type = 'team_member' 
            AND lie.actor_id = tm.id 
            AND lie.event_type = 'status_change' 
            THEN lie.id 
          END) as status_changes,
          COUNT(DISTINCT CASE 
            WHEN lie.actor_type = 'team_member' 
            AND lie.actor_id = tm.id 
            AND lie.event_type = 'call' 
            THEN lie.id 
          END) as manual_calls_logged,
          
          -- Demo scheduling
          COUNT(DISTINCT CASE 
            WHEN la.assigned_to_team_member_id = tm.id 
            AND la.demo_book_datetime IS NOT NULL 
            THEN la.id 
          END) as demos_scheduled
          
        FROM team_members tm
        LEFT JOIN lead_analytics la ON la.assigned_to_team_member_id = tm.id
        LEFT JOIN follow_ups fu ON fu.assigned_to_team_member_id = tm.id
        LEFT JOIN lead_intelligence_events lie ON (
          lie.actor_type = 'team_member' 
          AND lie.actor_id = tm.id
          AND lie.created_at >= $2 
          AND lie.created_at <= $3
        )
        WHERE tm.tenant_user_id = $1
          AND tm.is_active = true
        GROUP BY tm.id, tm.name, tm.role
        ORDER BY leads_assigned DESC;
      `;

      const result = await pool.query(query, [tenantUserId, startDate, endDate]);

      return result.rows.map((row: any) => ({
        teamMemberId: row.team_member_id,
        teamMemberName: row.team_member_name,
        teamMemberRole: row.team_member_role,
        leadsAssigned: parseInt(row.leads_assigned) || 0,
        leadsActive: parseInt(row.leads_active) || 0,
        qualifiedLeads: parseInt(row.qualified_leads) || 0,
        followUpsAssigned: parseInt(row.follow_ups_assigned) || 0,
        followUpsCompleted: parseInt(row.follow_ups_completed) || 0,
        followUpsPending: parseInt(row.follow_ups_pending) || 0,
        leadEdits: parseInt(row.lead_edits) || 0,
        notesAdded: parseInt(row.notes_added) || 0,
        statusChanges: parseInt(row.status_changes) || 0,
        manualCallsLogged: parseInt(row.manual_calls_logged) || 0,
        demosScheduled: parseInt(row.demos_scheduled) || 0,
      }));
    } catch (error) {
      logger.error('Error fetching team members analytics:', error);
      throw error;
    }
  }

  /**
   * Get analytics for a specific team member
   */
  async getTeamMemberAnalytics(
    tenantUserId: string,
    teamMemberId: string,
    dateRange?: { startDate: Date; endDate: Date }
  ): Promise<TeamMemberKPIs> {
    const analytics = await this.getAllTeamMembersAnalytics(tenantUserId, dateRange);
    const memberAnalytics = analytics.find((a) => a.teamMemberId === teamMemberId);

    if (!memberAnalytics) {
      throw new Error('Team member not found or not part of this tenant');
    }

    return memberAnalytics;
  }

  /**
   * Get activity log for a specific team member
   */
  async getTeamMemberActivityLog(
    tenantUserId: string,
    teamMemberId: string,
    options?: {
      limit?: number;
      offset?: number;
      activityType?: string[];
    }
  ): Promise<{ activities: TeamMemberActivityLog[]; total: number }> {
    try {
      const limit = options?.limit || 50;
      const offset = options?.offset || 0;

      // Build activity type filter
      let activityTypeFilter = '';
      if (options?.activityType && options.activityType.length > 0) {
        const types = options.activityType.map((t) => `'${t}'`).join(',');
        activityTypeFilter = `AND lie.event_type IN (${types})`;
      }

      // Get activity log from lead_intelligence_events
      const query = `
        SELECT 
          lie.id,
          lie.event_type as activity_type,
          lie.actor_name,
          lie.notes,
          lie.field_changes,
          lie.created_at as timestamp,
          lie.phone_number as lead_phone,
          la.extracted_name as lead_name
        FROM lead_intelligence_events lie
        LEFT JOIN lead_analytics la ON lie.lead_analytics_id = la.id
        WHERE lie.tenant_user_id = $1
          AND lie.actor_type = 'team_member'
          AND lie.actor_id = $2
          ${activityTypeFilter}
        ORDER BY lie.created_at DESC
        LIMIT $3 OFFSET $4;
      `;

      const countQuery = `
        SELECT COUNT(*) as total
        FROM lead_intelligence_events lie
        WHERE lie.tenant_user_id = $1
          AND lie.actor_type = 'team_member'
          AND lie.actor_id = $2
          ${activityTypeFilter};
      `;

      const [activitiesResult, countResult] = await Promise.all([
        pool.query(query, [tenantUserId, teamMemberId, limit, offset]),
        pool.query(countQuery, [tenantUserId, teamMemberId]),
      ]);

      const activities: TeamMemberActivityLog[] = activitiesResult.rows.map((row: any) => {
        let activityDescription = '';
        
        switch (row.activity_type) {
          case 'edit':
            activityDescription = `Edited lead ${row.lead_name || row.lead_phone || 'details'}`;
            if (row.field_changes) {
              const fields = Object.keys(row.field_changes);
              if (fields.length > 0) {
                activityDescription += ` (${fields.join(', ')})`;
              }
            }
            break;
          case 'assign':
            activityDescription = `Lead ${row.lead_name || row.lead_phone} assigned`;
            break;
          case 'note':
            activityDescription = `Added note to ${row.lead_name || row.lead_phone}`;
            break;
          case 'status_change':
            activityDescription = `Changed status for ${row.lead_name || row.lead_phone}`;
            break;
          case 'call':
            activityDescription = `Logged manual call with ${row.lead_name || row.lead_phone}`;
            break;
          default:
            activityDescription = `${row.activity_type} for ${row.lead_name || row.lead_phone}`;
        }

        return {
          id: row.id,
          activityType: row.activity_type,
          activityDescription,
          leadName: row.lead_name,
          leadPhone: row.lead_phone,
          timestamp: row.timestamp,
          details: row.field_changes || { notes: row.notes },
        };
      });

      return {
        activities,
        total: parseInt(countResult.rows[0].total) || 0,
      };
    } catch (error) {
      logger.error('Error fetching team member activity log:', error);
      throw error;
    }
  }

  /**
   * Get follow-ups for a specific team member
   */
  async getTeamMemberFollowUps(
    tenantUserId: string,
    teamMemberId: string,
    status?: 'pending' | 'completed' | 'cancelled'
  ): Promise<any[]> {
    try {
      let statusFilter = '';
      if (status) {
        statusFilter = `AND fu.follow_up_status = $3`;
      }

      const query = `
        SELECT 
          fu.id,
          fu.lead_phone,
          fu.lead_email,
          fu.lead_name,
          fu.follow_up_date,
          fu.remark,
          fu.follow_up_status,
          fu.is_completed,
          fu.completed_at,
          fu.created_at,
          fu.call_id
        FROM follow_ups fu
        WHERE fu.user_id = $1
          AND fu.assigned_to_team_member_id = $2
          ${statusFilter}
        ORDER BY fu.follow_up_date ASC;
      `;

      const params = status
        ? [tenantUserId, teamMemberId, status]
        : [tenantUserId, teamMemberId];

      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching team member follow-ups:', error);
      throw error;
    }
  }
}

export default new TeamMemberAnalyticsService();
