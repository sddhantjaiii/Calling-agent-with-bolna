import { logger } from '../utils/logger';
import LeadAnalyticsModel, {
  LeadAnalyticsInterface,
  CreateLeadAnalyticsData,
} from '../models/LeadAnalytics';
import CallModel from '../models/Call';
import { IndividualAnalysis, CompleteAnalysis } from './openaiExtractionService';

/**
 * LeadAnalyticsService - Manages dual analysis system
 * 
 * Individual Analysis: One row per call, extracted from single transcript
 * Complete Analysis: One row per user+phone combo, aggregates all historical calls
 */
class LeadAnalyticsService {
  /**
   * Convert LeadAnalyticsInterface from database to IndividualAnalysis format
   * Used to provide historical context for complete analysis
   */
  private mapLeadAnalyticsToIndividualAnalysis(
    analytics: LeadAnalyticsInterface
  ): IndividualAnalysis {
    return {
      intent_level: analytics.intent_level,
      intent_score: analytics.intent_score,
      urgency_level: analytics.urgency_level,
      urgency_score: analytics.urgency_score,
      budget_constraint: analytics.budget_constraint,
      budget_score: analytics.budget_score,
      fit_alignment: analytics.fit_alignment,
      fit_score: analytics.fit_score,
      engagement_health: analytics.engagement_health,
      engagement_score: analytics.engagement_score,
      total_score: analytics.total_score,
      lead_status_tag: analytics.lead_status_tag,
      demo_book_datetime: analytics.demo_book_datetime || null,
      
      // Convert boolean CTAs back to strings for OpenAI format
      cta_pricing_clicked: analytics.cta_pricing_clicked ? 'Yes' : 'No',
      cta_demo_clicked: analytics.cta_demo_clicked ? 'Yes' : 'No',
      cta_followup_clicked: analytics.cta_followup_clicked ? 'Yes' : 'No',
      cta_sample_clicked: analytics.cta_sample_clicked ? 'Yes' : 'No',
      cta_escalated_to_human: analytics.cta_escalated_to_human ? 'Yes' : 'No',
      
      // Reasoning (already in correct format from JSONB)
      reasoning: analytics.reasoning,
      
      // Extraction data
      extraction: {
        name: analytics.extracted_name || null,
        email_address: analytics.extracted_email || null,
        company_name: analytics.company_name || null,
        smartnotification: analytics.smart_notification || null,
      },
    };
  }

  /**
   * Map IndividualAnalysis to CreateLeadAnalyticsData format
   */
  private mapIndividualAnalysis(
    analysis: IndividualAnalysis,
    callId: string,
    userId: string,
    phoneNumber: string
  ): CreateLeadAnalyticsData {
    return {
      call_id: callId,
      user_id: userId,
      phone_number: phoneNumber,
      analysis_type: 'individual',
      
      // Map OpenAI response fields directly
      intent_level: analysis.intent_level,
      intent_score: analysis.intent_score,
      urgency_level: analysis.urgency_level,
      urgency_score: analysis.urgency_score,
      budget_constraint: analysis.budget_constraint,
      budget_score: analysis.budget_score,
      fit_alignment: analysis.fit_alignment,
      fit_score: analysis.fit_score,
      engagement_health: analysis.engagement_health,
      engagement_score: analysis.engagement_score,
      total_score: analysis.total_score,
      lead_status_tag: analysis.lead_status_tag,
      
      // Reasoning (already in correct format)
      reasoning: analysis.reasoning,
      
      // CTA Interactions
      cta_interactions: {
        pricing_clicked: analysis.cta_pricing_clicked === 'Yes',
        demo_clicked: analysis.cta_demo_clicked === 'Yes',
        followup_clicked: analysis.cta_followup_clicked === 'Yes',
        sample_clicked: analysis.cta_sample_clicked === 'Yes',
        escalated_to_human: analysis.cta_escalated_to_human === 'Yes',
      },
      
      // Extraction data
      company_name: analysis.extraction?.company_name ?? undefined,
      extracted_name: analysis.extraction?.name ?? undefined,
      extracted_email: analysis.extraction?.email_address ?? undefined,
      
      // CTA booleans
      cta_pricing_clicked: analysis.cta_pricing_clicked === 'Yes',
      cta_demo_clicked: analysis.cta_demo_clicked === 'Yes',
      cta_followup_clicked: analysis.cta_followup_clicked === 'Yes',
      cta_sample_clicked: analysis.cta_sample_clicked === 'Yes',
      cta_escalated_to_human: analysis.cta_escalated_to_human === 'Yes',
      
      // Enhanced analytics
      smart_notification: analysis.extraction?.smartnotification ?? undefined,
      demo_book_datetime: analysis.demo_book_datetime ?? undefined,
    };
  }

  /**
   * Map CompleteAnalysis to CreateLeadAnalyticsData format
   */
  private mapCompleteAnalysis(
    analysis: CompleteAnalysis,
    latestCallId: string,
    userId: string,
    phoneNumber: string,
    previousCallsCount: number
  ): CreateLeadAnalyticsData {
    return {
      call_id: latestCallId,
      user_id: userId,
      phone_number: phoneNumber,
      analysis_type: 'complete',
      previous_calls_analyzed: previousCallsCount,
      latest_call_id: latestCallId,
      analysis_timestamp: new Date(),
      
      // Map OpenAI response fields directly (CompleteAnalysis extends IndividualAnalysis)
      intent_level: analysis.intent_level,
      intent_score: analysis.intent_score,
      urgency_level: analysis.urgency_level,
      urgency_score: analysis.urgency_score,
      budget_constraint: analysis.budget_constraint,
      budget_score: analysis.budget_score,
      fit_alignment: analysis.fit_alignment,
      fit_score: analysis.fit_score,
      engagement_health: analysis.engagement_health,
      engagement_score: analysis.engagement_score,
      total_score: analysis.total_score,
      lead_status_tag: analysis.lead_status_tag,
      
      // Reasoning (already in correct format)
      reasoning: analysis.reasoning,
      
      // CTA Interactions (aggregated)
      cta_interactions: {
        pricing_clicked: analysis.cta_pricing_clicked === 'Yes',
        demo_clicked: analysis.cta_demo_clicked === 'Yes',
        followup_clicked: analysis.cta_followup_clicked === 'Yes',
        sample_clicked: analysis.cta_sample_clicked === 'Yes',
        escalated_to_human: analysis.cta_escalated_to_human === 'Yes',
      },
      
      // Enhanced extraction
      company_name: analysis.extraction?.company_name ?? undefined,
      extracted_name: analysis.extraction?.name ?? undefined,
      extracted_email: analysis.extraction?.email_address ?? undefined,
      
      // CTA booleans
      cta_pricing_clicked: analysis.cta_pricing_clicked === 'Yes',
      cta_demo_clicked: analysis.cta_demo_clicked === 'Yes',
      cta_followup_clicked: analysis.cta_followup_clicked === 'Yes',
      cta_sample_clicked: analysis.cta_sample_clicked === 'Yes',
      cta_escalated_to_human: analysis.cta_escalated_to_human === 'Yes',
      
      // Enhanced analytics
      smart_notification: analysis.extraction?.smartnotification ?? undefined,
      demo_book_datetime: analysis.demo_book_datetime ?? undefined,
    };
  }

  /**
   * Create individual analysis from OpenAI extraction
   */
  async createIndividualAnalysis(
    analysis: IndividualAnalysis,
    callId: string,
    userId: string,
    phoneNumber: string
  ): Promise<LeadAnalyticsInterface> {
    logger.info('Creating individual analysis', {
      callId,
      userId,
      phoneNumber,
      total_score: analysis.total_score,
      lead_status_tag: analysis.lead_status_tag,
    });

    const analyticsData = this.mapIndividualAnalysis(
      analysis,
      callId,
      userId,
      phoneNumber
    );

    return await LeadAnalyticsModel.createAnalytics(analyticsData);
  }

  /**
   * Upsert complete analysis (aggregated historical analysis)
   */
  async upsertCompleteAnalysis(
    analysis: CompleteAnalysis,
    latestCallId: string,
    userId: string,
    phoneNumber: string,
    previousCallsCount: number
  ): Promise<LeadAnalyticsInterface> {
    logger.info('Upserting complete analysis', {
      latestCallId,
      userId,
      phoneNumber,
      previousCallsCount,
      total_score: analysis.total_score,
      lead_status_tag: analysis.lead_status_tag,
    });

    const analyticsData = this.mapCompleteAnalysis(
      analysis,
      latestCallId,
      userId,
      phoneNumber,
      previousCallsCount
    );

    return await LeadAnalyticsModel.upsertCompleteAnalysis(analyticsData);
  }

  /**
   * Get all individual analyses for a contact
   * Returns analyses mapped to IndividualAnalysis format for OpenAI context
   */
  async getIndividualAnalysesByContact(
    userId: string,
    phoneNumber: string
  ): Promise<IndividualAnalysis[]> {
    logger.debug('Fetching individual analyses for contact', {
      userId,
      phoneNumber
    });

    const analyses = await LeadAnalyticsModel.getIndividualAnalysesByContact(userId, phoneNumber);
    
    // Map database records to IndividualAnalysis format
    return analyses.map(analytics => this.mapLeadAnalyticsToIndividualAnalysis(analytics));
  }

  /**
   * Get complete analysis for a contact
   */
  async getCompleteAnalysisByContact(
    userId: string,
    phoneNumber: string
  ): Promise<LeadAnalyticsInterface | null> {
    return await LeadAnalyticsModel.getCompleteAnalysisByContact(userId, phoneNumber);
  }

  /**
   * Get all complete analyses for a user
   */
  async getCompleteAnalysesByUser(userId: string): Promise<LeadAnalyticsInterface[]> {
    return await LeadAnalyticsModel.getCompleteAnalysesByUser(userId);
  }

  /**
   * Process dual analysis for a completed call
   * This is the main orchestration method called from webhook
   */
  async processDualAnalysis(
    individualAnalysis: IndividualAnalysis,
    completeAnalysis: CompleteAnalysis,
    callId: string,
    userId: string,
    phoneNumber: string,
    previousCallsCount: number
  ): Promise<{
    individual: LeadAnalyticsInterface;
    complete: LeadAnalyticsInterface;
  }> {
    logger.info('Processing dual analysis', {
      callId,
      userId,
      phoneNumber,
      previousCallsCount,
    });

    // Create individual analysis (always new row)
    const individual = await this.createIndividualAnalysis(
      individualAnalysis,
      callId,
      userId,
      phoneNumber
    );

    // Upsert complete analysis (update existing or create new)
    const complete = await this.upsertCompleteAnalysis(
      completeAnalysis,
      callId,
      userId,
      phoneNumber,
      previousCallsCount
    );

    return { individual, complete };
  }

  // Helper methods for mapping

  private getIntentLevel(score: number): string {
    if (score >= 80) return 'very_high';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    if (score >= 20) return 'low';
    return 'very_low';
  }

  private getLeadStatusTag(score: number): string {
    if (score >= 80) return 'hot';
    if (score >= 60) return 'warm';
    if (score >= 40) return 'cool';
    return 'cold';
  }

  private sentimentToScore(sentiment: string): number {
    switch (sentiment) {
      case 'positive':
        return 80;
      case 'neutral':
        return 50;
      case 'negative':
        return 20;
      default:
        return 50;
    }
  }

  private callOutcomeToScore(outcome: string | null): number {
    if (!outcome) return 50;
    const lower = outcome.toLowerCase();
    if (lower.includes('success') || lower.includes('interested')) return 80;
    if (lower.includes('follow') || lower.includes('callback')) return 60;
    if (lower.includes('not interested') || lower.includes('declined')) return 20;
    return 50;
  }

  private getCallOutcomeLevel(outcome: string | null): string {
    const score = this.callOutcomeToScore(outcome);
    return this.getIntentLevel(score);
  }

  private getTrendLevel(trend: string): string {
    switch (trend) {
      case 'increasing':
        return 'high';
      case 'stable':
        return 'medium';
      case 'decreasing':
        return 'low';
      default:
        return 'medium';
    }
  }

  private trendToScore(trend: string): number {
    switch (trend) {
      case 'increasing':
        return 80;
      case 'stable':
        return 50;
      case 'decreasing':
        return 20;
      default:
        return 50;
    }
  }

  private getConversionLevel(readiness: number): string {
    return this.getIntentLevel(readiness);
  }

  // Helper methods removed - using OpenAI's smart_notification field directly
  // These methods are no longer needed as OpenAI provides structured notifications
}

// Export singleton instance
export const leadAnalyticsService = new LeadAnalyticsService();
