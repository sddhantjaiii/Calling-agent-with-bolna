import { Request, Response, NextFunction } from 'express';
import { campaignScheduler } from '../services/InMemoryCampaignScheduler';

/**
 * Middleware to track user activity
 * Helps keep connection pool warm when users are actively using the dashboard
 * or when webhooks are being processed
 */
export const trackUserActivity = (req: Request, res: Response, next: NextFunction): void => {
  // Track activity for dashboard/authenticated routes AND webhook routes
  if (
    req.path.startsWith('/api/dashboard') ||
    req.path.startsWith('/api/campaigns') ||
    req.path.startsWith('/api/agents') ||
    req.path.startsWith('/api/calls') ||
    req.path.startsWith('/api/contacts') ||
    req.path.startsWith('/api/webhook')  // Webhooks count as activity
  ) {
    // Extract userId from request (if authenticated)
    const userId = (req as any).user?.id || req.ip || 'anonymous';
    
    // Mark user as active with their ID
    campaignScheduler.markUserActivity(userId);
  }

  next();
};
