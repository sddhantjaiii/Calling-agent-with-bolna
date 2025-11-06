import { DatabaseService } from './databaseService';
import { userService } from './userService';
import { logger } from '../utils/logger';

export interface CreditEstimate {
  contactCount: number;
  minimumCreditsNeeded: number;
  averageCreditsPerCall: number;
  estimatedTotalCredits: number;
  userCurrentCredits: number;
  canAfford: boolean;
  shortfall: number;
  hasHistoricalData: boolean;
  warning?: string;
  recommendation?: string;
}

/**
 * Service for calculating credit estimates for campaigns
 */
export class CreditEstimationService {

  /**
   * Calculate credit estimate for a campaign based on contact count
   */
  static async estimateCreditsForCampaign(
    userId: string, 
    contactCount: number
  ): Promise<CreditEstimate> {
    try {
      const user = await userService.getUserProfile(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Get user's historical call data
      const userAverage = await this.getUserAverageCreditsPerCall(userId);
      const systemAverage = userAverage.hasData ? userAverage.average : await this.getSystemAverageCreditsPerCall();

      // Calculate estimates
      const minimumCreditsNeeded = contactCount; // 1 credit minimum per call
      const averageCreditsPerCall = userAverage.hasData ? userAverage.average : systemAverage;
      const estimatedTotalCredits = Math.ceil(contactCount * averageCreditsPerCall);

      const canAfford = user.credits >= minimumCreditsNeeded;
      const shortfall = Math.max(0, minimumCreditsNeeded - user.credits);

      // Generate warnings and recommendations
      let warning: string | undefined;
      let recommendation: string | undefined;

      if (!canAfford) {
        warning = user.credits <= 0 
          ? 'You have no credits available. Campaign cannot be started.'
          : `You need at least ${minimumCreditsNeeded} credits to start this campaign, but only have ${user.credits}.`;
        recommendation = `Purchase at least ${shortfall} more credits to start this campaign.`;
      } else if (user.credits < estimatedTotalCredits) {
        const estimatedShortfall = estimatedTotalCredits - user.credits;
        warning = `Based on ${userAverage.hasData ? 'your' : 'system'} average (${averageCreditsPerCall.toFixed(1)} credits/call), you may run out of credits during this campaign.`;
        recommendation = `Consider purchasing ${estimatedShortfall} more credits for optimal campaign completion.`;
      }

      return {
        contactCount,
        minimumCreditsNeeded,
        averageCreditsPerCall,
        estimatedTotalCredits,
        userCurrentCredits: user.credits,
        canAfford,
        shortfall,
        hasHistoricalData: userAverage.hasData,
        warning,
        recommendation
      };

    } catch (error) {
      logger.error('Error calculating credit estimate', { userId, contactCount, error });
      throw error;
    }
  }

  /**
   * Get user's average credits per call from their call history
   */
  private static async getUserAverageCreditsPerCall(userId: string): Promise<{
    average: number;
    callCount: number;
    hasData: boolean;
  }> {
    const client = await DatabaseService.getClient();
    
    try {
      const query = `
        SELECT 
          COUNT(*) as total_calls,
          AVG(credits_used) as avg_credits,
          SUM(credits_used) as total_credits
        FROM calls 
        WHERE user_id = $1 
        AND status = 'completed'
        AND credits_used > 0
        AND created_at >= (CURRENT_TIMESTAMP - INTERVAL '90 days')
      `;
      
      const result = await client.query(query, [userId]);
      const data = result.rows[0];
      
      const callCount = parseInt(data.total_calls) || 0;
      const hasData = callCount >= 10; // Require at least 10 calls for reliable data
      
      if (hasData) {
        return {
          average: parseFloat(data.avg_credits) || 2.5,
          callCount,
          hasData: true
        };
      }

      return {
        average: 2.5, // Default fallback
        callCount,
        hasData: false
      };
      
    } finally {
      client.release();
    }
  }

  /**
   * Get system-wide average credits per call
   */
  private static async getSystemAverageCreditsPerCall(): Promise<number> {
    const client = await DatabaseService.getClient();
    
    try {
      const query = `
        SELECT AVG(credits_used) as avg_credits
        FROM calls 
        WHERE status = 'completed'
        AND credits_used > 0
        AND created_at >= (CURRENT_TIMESTAMP - INTERVAL '30 days')
      `;
      
      const result = await client.query(query);
      const average = parseFloat(result.rows[0]?.avg_credits) || 2.5;
      
      // Ensure reasonable bounds (1-10 credits per call average)
      return Math.max(1, Math.min(10, average));
      
    } finally {
      client.release();
    }
  }

  /**
   * Get user's call statistics for estimation context
   */
  static async getUserCallStatistics(userId: string): Promise<{
    totalCalls: number;
    recentCalls: number;
    averageDuration: number;
    averageCredits: number;
    mostRecentCallDate?: Date;
  }> {
    const client = await DatabaseService.getClient();
    
    try {
      const query = `
        SELECT 
          COUNT(*) as total_calls,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days') as recent_calls,
          AVG(duration_minutes) as avg_duration,
          AVG(credits_used) as avg_credits,
          MAX(created_at) as most_recent_call
        FROM calls 
        WHERE user_id = $1 
        AND status = 'completed'
        AND credits_used > 0
      `;
      
      const result = await client.query(query, [userId]);
      const data = result.rows[0];
      
      return {
        totalCalls: parseInt(data.total_calls) || 0,
        recentCalls: parseInt(data.recent_calls) || 0,
        averageDuration: parseFloat(data.avg_duration) || 0,
        averageCredits: parseFloat(data.avg_credits) || 0,
        mostRecentCallDate: data.most_recent_call
      };
      
    } finally {
      client.release();
    }
  }

  /**
   * Format credit estimate for display in UI
   */
  static formatEstimateForDisplay(estimate: CreditEstimate): {
    title: string;
    severity: 'success' | 'warning' | 'error';
    message: string;
    details: string[];
  } {
    let severity: 'success' | 'warning' | 'error' = 'success';
    let title = 'Credit Estimate';
    let message = '';
    const details: string[] = [];

    if (!estimate.canAfford) {
      severity = 'error';
      title = 'Insufficient Credits';
      message = estimate.warning || 'Not enough credits to start campaign';
    } else if (estimate.warning) {
      severity = 'warning';
      title = 'Credit Warning';
      message = estimate.warning;
    } else {
      severity = 'success';
      title = 'Credit Estimate';
      message = 'You have sufficient credits for this campaign';
    }

    // Add details
    details.push(`Contacts selected: ${estimate.contactCount}`);
    details.push(`Minimum credits needed: ${estimate.minimumCreditsNeeded}`);
    details.push(`Your current balance: ${estimate.userCurrentCredits}`);
    
    if (estimate.hasHistoricalData) {
      details.push(`Estimated total cost: ${estimate.estimatedTotalCredits} credits (based on your avg: ${estimate.averageCreditsPerCall.toFixed(1)}/call)`);
    } else {
      details.push(`Estimated total cost: ${estimate.estimatedTotalCredits} credits (based on system avg: ${estimate.averageCreditsPerCall.toFixed(1)}/call)`);
      details.push(`ℹ️ More accurate estimates available after 10+ calls`);
    }

    if (estimate.recommendation) {
      details.push(`💡 ${estimate.recommendation}`);
    }

    return {
      title,
      severity,
      message,
      details
    };
  }
}