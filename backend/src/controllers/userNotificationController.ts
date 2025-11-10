import { Request, Response } from 'express';
import { NotificationModel } from '../models/Notification';
import { NotificationPreferenceModel } from '../models/NotificationPreference';
import { logger } from '../utils/logger';

/**
 * User Notification Controller
 * Handles email notification history and preference management
 * (Separate from lead analytics notifications)
 */
export class UserNotificationController {
  /**
   * Get user's email notification history
   * GET /api/user-notifications
   */
  static async getNotifications(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const notifications = await NotificationModel.getByUser(userId, limit, page);

      res.status(200).json({
        notifications,
        page,
        limit,
      });
    } catch (error) {
      logger.error('Error fetching user notifications', { error });
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  }

  /**
   * Get email notifications for a specific campaign
   * GET /api/user-notifications/campaign/:campaignId
   */
  static async getCampaignNotifications(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { campaignId } = req.params;

      const notifications = await NotificationModel.getByCampaign(campaignId);

      res.status(200).json({ notifications });
    } catch (error) {
      logger.error('Error fetching campaign notifications', { error });
      res.status(500).json({ error: 'Failed to fetch campaign notifications' });
    }
  }

  /**
   * Get user's notification preferences
   * GET /api/user-notifications/preferences
   */
  static async getPreferences(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const preferences = await NotificationPreferenceModel.getByUserId(userId);

      res.status(200).json({ preferences });
    } catch (error) {
      logger.error('Error fetching notification preferences', { error });
      res.status(500).json({ error: 'Failed to fetch preferences' });
    }
  }

  /**
   * Update user's notification preferences
   * PUT /api/user-notifications/preferences
   */
  static async updatePreferences(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const allowedFields = [
        'low_credit_alerts',
        'credits_added_emails',
        'campaign_summary_emails',
        'meeting_booked_notifications',
        'email_verification_reminders',
        'marketing_emails',
      ];

      // Validate request body
      const updates: any = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          if (typeof req.body[field] !== 'boolean') {
            res.status(400).json({ error: `${field} must be a boolean` });
            return;
          }
          updates[field] = req.body[field];
        }
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: 'No valid fields to update' });
        return;
      }

      const updatedPreferences = await NotificationPreferenceModel.update(userId, updates);

      res.status(200).json({
        message: 'Preferences updated successfully',
        preferences: updatedPreferences,
      });
    } catch (error) {
      logger.error('Error updating notification preferences', { error });
      res.status(500).json({ error: 'Failed to update preferences' });
    }
  }
}
