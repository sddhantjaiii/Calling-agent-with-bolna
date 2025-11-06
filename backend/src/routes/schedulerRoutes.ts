import { Router, Request, Response } from 'express';
import { campaignScheduler } from '../services/InMemoryCampaignScheduler';
import { authenticateToken } from '../middleware/auth';
import { logger } from '../middleware';

const router = Router();

/**
 * Get campaign scheduler status
 * Shows next wake time, active campaigns, etc.
 */
router.get('/status', authenticateToken, async (req: Request, res: Response): Promise<any> => {
  try {
    const status = campaignScheduler.getStatus();
    
    const now = new Date();
    const minutesUntilWake = status.nextWakeTime
      ? Math.round((status.nextWakeTime.getTime() - now.getTime()) / (60 * 1000))
      : null;

    res.json({
      success: true,
      data: {
        currentTime: now.toISOString(),
        nextWakeTime: status.nextWakeTime?.toISOString() || null,
        minutesUntilWake,
        campaignCount: status.campaignCount,
        isProcessing: status.isProcessing,
        activeUserCount: status.activeUserCount,
        lastScheduleLoad: status.lastScheduleLoad?.toISOString() || null,
        campaigns: status.campaigns,
        message: minutesUntilWake 
          ? `Database will wake in ${minutesUntilWake} minutes`
          : 'No campaigns scheduled - database can sleep'
      }
    });
  } catch (error) {
    logger.error('Error getting scheduler status', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get scheduler status'
    });
  }
});

/**
 * Force reload campaign schedules
 * Useful for debugging or manual intervention
 * ADMIN ONLY - expensive operation
 */
router.post('/reload', authenticateToken, async (req: Request, res: Response): Promise<any> => {
  try {
    // Check if user is admin
    const user = (req as any).user;
    if (user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required to reload scheduler'
      });
    }
    
    await campaignScheduler.onCampaignChange();
    
    const status = campaignScheduler.getStatus();
    
    res.json({
      success: true,
      message: 'Campaign schedules reloaded',
      data: {
        campaignCount: status.campaignCount,
        nextWakeTime: status.nextWakeTime?.toISOString() || null
      }
    });
  } catch (error) {
    logger.error('Error reloading campaign schedules', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to reload campaign schedules'
    });
  }
});

export default router;
