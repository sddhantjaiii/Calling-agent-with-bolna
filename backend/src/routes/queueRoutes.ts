import { Router, Request, Response } from 'express';
import { CallQueueModel } from '../models/CallQueue';
import { authenticateToken } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

/**
 * @route   GET /api/queue
 * @desc    Get user's queue items
 * @access  Private
 */
router.get('/', authenticateToken, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { status, limit, offset } = req.query;

    const options: any = {};
    
    if (status) {
      options.status = typeof status === 'string' ? status.split(',') : status;
    }
    if (limit) {
      options.limit = parseInt(limit as string);
    }
    if (offset) {
      options.offset = parseInt(offset as string);
    }

    const result = await CallQueueModel.getUserQueue(userId, options);
    
    res.json({
      success: true,
      items: result.items,
      total: result.total
    });
  } catch (error) {
    logger.error('Error fetching queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch queue'
    });
  }
});

/**
 * @route   GET /api/queue/statistics
 * @desc    Get queue statistics
 * @access  Private
 */
router.get('/statistics', authenticateToken, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const statistics = await CallQueueModel.getStatistics(userId);
    
    res.json({
      success: true,
      statistics
    });
  } catch (error) {
    logger.error('Error fetching queue statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch queue statistics'
    });
  }
});

/**
 * @route   GET /api/queue/:id
 * @desc    Get specific queue item
 * @access  Private
 */
router.get('/:id', authenticateToken, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const queueItem = await CallQueueModel.findById(req.params.id, userId);
    
    if (!queueItem) {
      return res.status(404).json({
        success: false,
        error: 'Queue item not found'
      });
    }
    
    res.json({
      success: true,
      queue_item: queueItem
    });
  } catch (error) {
    logger.error('Error fetching queue item:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch queue item'
    });
  }
});

/**
 * @route   DELETE /api/queue/:id
 * @desc    Cancel queue item
 * @access  Private
 */
router.delete('/:id', authenticateToken, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const cancelled = await CallQueueModel.cancel(req.params.id, userId);
    
    if (!cancelled) {
      return res.status(404).json({
        success: false,
        error: 'Queue item not found or already processed'
      });
    }

    logger.info(`Queue item cancelled: ${req.params.id}`);
    
    res.json({
      success: true,
      message: 'Queue item cancelled successfully'
    });
  } catch (error) {
    logger.error('Error cancelling queue item:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel queue item'
    });
  }
});

/**
 * @route   GET /api/queue/campaign/:campaignId
 * @desc    Get queue items for a specific campaign
 * @access  Private
 */
router.get('/campaign/:campaignId', authenticateToken, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { status, limit, offset } = req.query;

    const filters: any = {};
    
    if (status) {
      filters.status = typeof status === 'string' ? status.split(',') : status;
    }
    if (limit) {
      filters.limit = parseInt(limit as string);
    }
    if (offset) {
      filters.offset = parseInt(offset as string);
    }

    const items = await CallQueueModel.findByCampaignId(
      req.params.campaignId,
      userId,
      filters
    );
    
    res.json({
      success: true,
      items,
      total: items.length
    });
  } catch (error) {
    logger.error('Error fetching campaign queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch campaign queue'
    });
  }
});

export default router;
