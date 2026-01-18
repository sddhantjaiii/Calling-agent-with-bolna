import { Router, Request, Response } from 'express';
import { EmailCampaignService } from '../services/emailCampaignService';
import { logger } from '../utils/logger';
import { EmailCampaignController } from '../controllers/emailCampaignController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

/**
 * @route   GET /api/email-campaigns/templates
 * @desc    Get system email templates
 * @access  Private
 */
router.get('/templates', authenticateToken, EmailCampaignController.getTemplates);

/**
 * @route   POST /api/email-campaigns/validate
 * @desc    Validate email campaign tokens before creation
 * @access  Private
 */
router.post('/validate', authenticateToken, EmailCampaignController.validateTokens);

/**
 * @route   POST /api/email-campaigns
 * @desc    Create a new email campaign
 * @access  Private
 */
router.post('/', async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { campaign_name, subject, body, contact_ids, schedule, attachments } = req.body;

    // Validation
    if (!campaign_name || !subject || !body) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: campaign_name, subject, body',
      });
    }

    if (!contact_ids || !Array.isArray(contact_ids) || contact_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one contact must be selected',
      });
    }

    const campaign = await EmailCampaignService.createEmailCampaign(userId, {
      campaign_name,
      subject,
      body,
      contact_ids,
      schedule,
      attachments,
    });

    logger.info(`Email campaign created: ${campaign.id} by user ${userId}`);

    res.status(201).json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    logger.error('Error creating email campaign:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create email campaign',
    });
  }
});

/**
 * @route   GET /api/email-campaigns
 * @desc    Get all email campaigns for user
 * @access  Private
 */
router.get('/', async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const campaigns = await EmailCampaignService.getUserEmailCampaigns(userId);

    res.status(200).json({
      success: true,
      data: campaigns,
    });
  } catch (error) {
    logger.error('Error fetching email campaigns:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch email campaigns',
    });
  }
});

/**
 * @route   GET /api/email-campaigns/:id
 * @desc    Get email campaign by ID
 * @access  Private
 */
router.get('/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const campaignDetails = await EmailCampaignService.getEmailCampaignDetails(req.params.id, userId);

    if (!campaignDetails) {
      return res.status(404).json({
        success: false,
        error: 'Email campaign not found',
      });
    }

    res.status(200).json({
      success: true,
      data: campaignDetails,
    });
  } catch (error) {
    logger.error('Error fetching email campaign:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch email campaign',
    });
  }
});

/**
 * @route   POST /api/email-campaigns/:id/cancel
 * @desc    Cancel an email campaign
 * @access  Private
 */
router.post('/:id/cancel', async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await EmailCampaignService.cancelEmailCampaign(req.params.id, userId);

    res.status(200).json({
      success: true,
      message: 'Email campaign cancelled successfully',
    });
  } catch (error) {
    logger.error('Error cancelling email campaign:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel email campaign',
    });
  }
});

export default router;
