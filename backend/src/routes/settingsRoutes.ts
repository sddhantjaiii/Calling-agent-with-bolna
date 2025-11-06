import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { authenticateToken } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

/**
 * @route   GET /api/settings/concurrency
 * @desc    Get user's concurrency settings
 * @access  Private
 */
router.get('/concurrency', authenticateToken, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get user's concurrency limit
    const userResult = await pool.query(
      'SELECT concurrent_calls_limit FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userLimit = userResult.rows[0].concurrent_calls_limit;

    // Get system-wide limit from ENV
    const systemLimit = parseInt(process.env.SYSTEM_CONCURRENT_CALLS_LIMIT || '10');

    // Get current active calls for this user
    const activeCallsResult = await pool.query(
      `SELECT COUNT(*)::int as active_calls 
       FROM call_queue 
       WHERE user_id = $1 AND status = 'processing'`,
      [userId]
    );

    const activeCalls = activeCallsResult.rows[0]?.active_calls || 0;

    // Get system-wide active calls
    const systemActiveResult = await pool.query(
      `SELECT COUNT(*)::int as system_active_calls 
       FROM call_queue 
       WHERE status = 'processing'`
    );

    const systemActiveCalls = systemActiveResult.rows[0]?.system_active_calls || 0;

    res.json({
      success: true,
      settings: {
        user_concurrent_calls_limit: userLimit,
        user_active_calls: activeCalls,
        user_available_slots: Math.max(0, userLimit - activeCalls),
        system_concurrent_calls_limit: systemLimit,
        system_active_calls: systemActiveCalls,
        system_available_slots: Math.max(0, systemLimit - systemActiveCalls)
      }
    });
  } catch (error) {
    logger.error('Error fetching concurrency settings:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch settings'
    });
  }
});

/**
 * @route   PUT /api/settings/concurrency
 * @desc    Update user's concurrency limit
 * @access  Private
 */
router.put('/concurrency', authenticateToken, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { concurrent_calls_limit } = req.body;

    // Validation
    if (typeof concurrent_calls_limit !== 'number' || concurrent_calls_limit < 1 || concurrent_calls_limit > 10) {
      return res.status(400).json({
        success: false,
        error: 'concurrent_calls_limit must be a number between 1 and 10'
      });
    }

    // Update user's concurrency limit
    const result = await pool.query(
      `UPDATE users 
       SET concurrent_calls_limit = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING concurrent_calls_limit`,
      [concurrent_calls_limit, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    logger.info(`User ${userId} updated concurrency limit to ${concurrent_calls_limit}`);

    res.json({
      success: true,
      message: 'Concurrency limit updated successfully',
      concurrent_calls_limit: result.rows[0].concurrent_calls_limit
    });
  } catch (error) {
    logger.error('Error updating concurrency settings:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update settings'
    });
  }
});

export default router;
