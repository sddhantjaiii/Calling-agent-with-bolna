import BaseModel, { BaseModelInterface } from './BaseModel';

// Lead Analytics model - defines lead scoring data structure
export interface LeadReasoning {
  intent: string;
  urgency: string;
  budget: string;
  fit: string;
  engagement: string;
  cta_behavior: string;
}

export interface CTAInteractions {
  pricing_clicked: boolean;
  demo_clicked: boolean;
  followup_clicked: boolean;
  sample_clicked: boolean;
  escalated_to_human: boolean;
}

export interface LeadAnalyticsInterface extends BaseModelInterface {
  id: string;
  call_id: string;
  user_id: string; // NEW: Multi-tenant support
  phone_number: string; // NEW: Direct phone number reference
  analysis_type: 'individual' | 'complete'; // NEW: Distinguishes analysis type
  previous_calls_analyzed?: number; // NEW: For complete analysis
  latest_call_id?: string; // NEW: For complete analysis
  analysis_timestamp?: Date; // NEW: When analysis was performed
  intent_level: string;
  intent_score: number;
  urgency_level: string;
  urgency_score: number;
  budget_constraint: string;
  budget_score: number;
  fit_alignment: string;
  fit_score: number;
  engagement_health: string;
  engagement_score: number;
  total_score: number;
  lead_status_tag: string;
  reasoning: LeadReasoning;
  cta_interactions: CTAInteractions;
  // Enhanced extraction columns
  company_name?: string;
  extracted_name?: string;
  extracted_email?: string;
  // Dedicated CTA boolean columns
  cta_pricing_clicked?: boolean;
  cta_demo_clicked?: boolean;
  cta_followup_clicked?: boolean;
  cta_sample_clicked?: boolean;
  cta_escalated_to_human?: boolean;
  // New enhanced analytics fields
  smart_notification?: string;
  demo_book_datetime?: string;
  created_at: Date;
}

export interface CreateLeadAnalyticsData {
  call_id: string;
  user_id: string; // Required for multi-tenant support
  phone_number: string; // Required
  analysis_type: 'individual' | 'complete'; // Required
  previous_calls_analyzed?: number; // Optional, for complete analysis
  latest_call_id?: string; // Optional, for complete analysis
  analysis_timestamp?: Date; // Optional, defaults to NOW()
  intent_level: string;
  intent_score: number;
  urgency_level: string;
  urgency_score: number;
  budget_constraint: string;
  budget_score: number;
  fit_alignment: string;
  fit_score: number;
  engagement_health: string;
  engagement_score: number;
  total_score: number;
  lead_status_tag: string;
  reasoning: LeadReasoning;
  cta_interactions: CTAInteractions;
  // Enhanced extraction columns
  company_name?: string;
  extracted_name?: string;
  extracted_email?: string;
  // Dedicated CTA boolean columns
  cta_pricing_clicked?: boolean;
  cta_demo_clicked?: boolean;
  cta_followup_clicked?: boolean;
  cta_sample_clicked?: boolean;
  cta_escalated_to_human?: boolean;
  // New enhanced analytics fields
  smart_notification?: string;
  demo_book_datetime?: string;
}

export class LeadAnalyticsModel extends BaseModel<LeadAnalyticsInterface> {
  constructor() {
    super('lead_analytics');
  }

  /**
   * Find analytics by call ID
   */
  async findByCallId(callId: string): Promise<LeadAnalyticsInterface | null> {
    return await this.findOne({ call_id: callId });
  }

  /**
   * Create new lead analytics
   */
  async createAnalytics(analyticsData: CreateLeadAnalyticsData): Promise<LeadAnalyticsInterface> {
    return await this.create(analyticsData);
  }

  /**
   * Get analytics by score range
   */
  async findByScoreRange(minScore: number, maxScore: number): Promise<LeadAnalyticsInterface[]> {
    const query = `
      SELECT * FROM lead_analytics 
      WHERE total_score >= $1 AND total_score <= $2 
      ORDER BY total_score DESC
    `;
    const result = await this.query(query, [minScore, maxScore]);
    return result.rows;
  }

  /**
   * Get analytics by lead status
   */
  async findByLeadStatus(status: string): Promise<LeadAnalyticsInterface[]> {
    return await this.findBy({ lead_status_tag: status });
  }

  /**
   * Upsert complete analysis (insert or update based on user_id + phone_number)
   * Used for aggregated historical analysis across all calls
   */
  async upsertCompleteAnalysis(analyticsData: CreateLeadAnalyticsData): Promise<LeadAnalyticsInterface> {
    // First, check if a complete analysis already exists for this user+phone
    const checkQuery = `
      SELECT id FROM lead_analytics
      WHERE user_id = $1 
        AND phone_number = $2 
        AND analysis_type = 'complete'
      LIMIT 1
    `;
    
    const existing = await this.query(checkQuery, [
      analyticsData.user_id,
      analyticsData.phone_number
    ]);

    const isUpdate = existing.rows.length > 0;
    
    // If exists, UPDATE; otherwise INSERT
    const query = isUpdate ? `
      UPDATE lead_analytics SET
        call_id = $1,
        previous_calls_analyzed = $2,
        latest_call_id = $3,
        intent_level = $4,
        intent_score = $5,
        urgency_level = $6,
        urgency_score = $7,
        budget_constraint = $8,
        budget_score = $9,
        fit_alignment = $10,
        fit_score = $11,
        engagement_health = $12,
        engagement_score = $13,
        total_score = $14,
        lead_status_tag = $15,
        reasoning = $16,
        cta_interactions = $17,
        company_name = $18,
        extracted_name = $19,
        extracted_email = $20,
        cta_pricing_clicked = $21,
        cta_demo_clicked = $22,
        cta_followup_clicked = $23,
        cta_sample_clicked = $24,
        cta_escalated_to_human = $25,
        smart_notification = $26,
        demo_book_datetime = $27,
        analysis_timestamp = CURRENT_TIMESTAMP
      WHERE user_id = $28 
        AND phone_number = $29 
        AND analysis_type = 'complete'
      RETURNING *
    ` : `
      INSERT INTO lead_analytics (
        call_id, user_id, phone_number, analysis_type,
        previous_calls_analyzed, latest_call_id, analysis_timestamp,
        intent_level, intent_score,
        urgency_level, urgency_score,
        budget_constraint, budget_score,
        fit_alignment, fit_score,
        engagement_health, engagement_score,
        total_score, lead_status_tag,
        reasoning, cta_interactions,
        company_name, extracted_name, extracted_email,
        cta_pricing_clicked, cta_demo_clicked, cta_followup_clicked,
        cta_sample_clicked, cta_escalated_to_human,
        smart_notification, demo_book_datetime
      )
      VALUES (
        $1, $2, $3, 'complete',
        $4, $5, COALESCE($6, CURRENT_TIMESTAMP),
        $7, $8,
        $9, $10,
        $11, $12,
        $13, $14,
        $15, $16,
        $17, $18,
        $19, $20,
        $21, $22, $23,
        $24, $25, $26,
        $27, $28,
        $29, $30
      )
      RETURNING *
    `;

    // Build params based on whether we're updating or inserting
    const params = isUpdate ? [
      // UPDATE params (27 fields + 2 WHERE conditions)
      analyticsData.call_id,
      analyticsData.previous_calls_analyzed ?? null,
      analyticsData.latest_call_id ?? null,
      analyticsData.intent_level,
      analyticsData.intent_score,
      analyticsData.urgency_level,
      analyticsData.urgency_score,
      analyticsData.budget_constraint,
      analyticsData.budget_score,
      analyticsData.fit_alignment,
      analyticsData.fit_score,
      analyticsData.engagement_health,
      analyticsData.engagement_score,
      analyticsData.total_score,
      analyticsData.lead_status_tag,
      JSON.stringify(analyticsData.reasoning),
      JSON.stringify(analyticsData.cta_interactions),
      analyticsData.company_name ?? null,
      analyticsData.extracted_name ?? null,
      analyticsData.extracted_email ?? null,
      analyticsData.cta_pricing_clicked ?? false,
      analyticsData.cta_demo_clicked ?? false,
      analyticsData.cta_followup_clicked ?? false,
      analyticsData.cta_sample_clicked ?? false,
      analyticsData.cta_escalated_to_human ?? false,
      analyticsData.smart_notification ?? null,
      analyticsData.demo_book_datetime ?? null,
      // WHERE conditions
      analyticsData.user_id,
      analyticsData.phone_number,
    ] : [
      // INSERT params (30 fields, analysis_type is hardcoded in query)
      analyticsData.call_id,
      analyticsData.user_id,
      analyticsData.phone_number,
      analyticsData.previous_calls_analyzed ?? null,
      analyticsData.latest_call_id ?? null,
      analyticsData.analysis_timestamp ?? null,
      analyticsData.intent_level,
      analyticsData.intent_score,
      analyticsData.urgency_level,
      analyticsData.urgency_score,
      analyticsData.budget_constraint,
      analyticsData.budget_score,
      analyticsData.fit_alignment,
      analyticsData.fit_score,
      analyticsData.engagement_health,
      analyticsData.engagement_score,
      analyticsData.total_score,
      analyticsData.lead_status_tag,
      JSON.stringify(analyticsData.reasoning),
      JSON.stringify(analyticsData.cta_interactions),
      analyticsData.company_name ?? null,
      analyticsData.extracted_name ?? null,
      analyticsData.extracted_email ?? null,
      analyticsData.cta_pricing_clicked ?? false,
      analyticsData.cta_demo_clicked ?? false,
      analyticsData.cta_followup_clicked ?? false,
      analyticsData.cta_sample_clicked ?? false,
      analyticsData.cta_escalated_to_human ?? false,
      analyticsData.smart_notification ?? null,
      analyticsData.demo_book_datetime ?? null,
    ];

    const result = await this.query(query, params);
    return result.rows[0];
  }

  /**
   * Get individual analyses for a specific contact (user_id + phone_number)
   */
  async getIndividualAnalysesByContact(
    userId: string,
    phoneNumber: string
  ): Promise<LeadAnalyticsInterface[]> {
    const query = `
      SELECT la.*, c.created_at as call_created_at
      FROM lead_analytics la
      INNER JOIN calls c ON la.call_id = c.id
      WHERE la.user_id = $1 
        AND la.phone_number = $2 
        AND la.analysis_type = 'individual'
      ORDER BY c.created_at ASC
    `;

    const result = await this.query(query, [userId, phoneNumber]);
    return result.rows;
  }

  /**
   * Get complete analysis for a specific contact (user_id + phone_number)
   */
  async getCompleteAnalysisByContact(
    userId: string,
    phoneNumber: string
  ): Promise<LeadAnalyticsInterface | null> {
    const query = `
      SELECT * FROM lead_analytics
      WHERE user_id = $1 
        AND phone_number = $2 
        AND analysis_type = 'complete'
      ORDER BY analysis_timestamp DESC
      LIMIT 1
    `;

    const result = await this.query(query, [userId, phoneNumber]);
    return result.rows[0] || null;
  }

  /**
   * Get all complete analyses for a user (across all phone numbers)
   */
  async getCompleteAnalysesByUser(userId: string): Promise<LeadAnalyticsInterface[]> {
    const query = `
      SELECT * FROM lead_analytics
      WHERE user_id = $1 
        AND analysis_type = 'complete'
      ORDER BY analysis_timestamp DESC
    `;

    const result = await this.query(query, [userId]);
    return result.rows;
  }
}

export default new LeadAnalyticsModel();