import { Router, Request, Response } from 'express';
import { CallCampaignService } from '../services/CallCampaignService';
import Contact from '../models/Contact';
import { authenticateToken } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

/**
 * @route   POST /api/campaigns
 * @desc    Create a new campaign
 * @access  Private
 */
router.post('/', async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const campaign = await CallCampaignService.createCampaign(userId, req.body);
    
    logger.info(`Campaign created: ${campaign.id} by user ${userId}`);
    
    // Notify scheduler about campaign change
    try {
      const { campaignScheduler } = await import('../services/InMemoryCampaignScheduler');
      await campaignScheduler.onCampaignChange(campaign.id);
      logger.info(`Campaign scheduler notified of new campaign: ${campaign.id}`);
    } catch (error) {
      logger.error('Failed to notify campaign scheduler', { error });
      // Don't fail the request if scheduler notification fails
    }
    
    res.status(201).json({
      success: true,
      campaign
    });
  } catch (error) {
    logger.error('Error creating campaign:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create campaign'
    });
  }
});

/**
 * @route   POST /api/campaigns/upload-csv
 * @desc    Create campaign from CSV upload
 * @access  Private
 */
router.post('/upload-csv', async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      campaign_name,
      description,
      agent_id,
      next_action,
      first_call_time,
      last_call_time,
      start_date,
      end_date,
      csv_data
    } = req.body;

    // Validation
    if (!campaign_name || !agent_id || !next_action || !first_call_time || !last_call_time || !start_date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: campaign_name, agent_id, next_action, first_call_time, last_call_time, start_date'
      });
    }

    if (!csv_data || !Array.isArray(csv_data) || csv_data.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'csv_data must be a non-empty array'
      });
    }

    // Validate CSV data
    const errors: string[] = [];
    const validContacts: any[] = [];
    const seenPhones = new Set<string>();

    csv_data.forEach((row: any, index: number) => {
      // Check required fields
      if (!row.name || !row.phone_number) {
        errors.push(`Row ${index + 1}: Missing required fields (name, phone_number)`);
        return;
      }

      // Check for duplicate phone in CSV
      if (seenPhones.has(row.phone_number)) {
        errors.push(`Row ${index + 1}: Duplicate phone number ${row.phone_number}`);
        return;
      }

      seenPhones.add(row.phone_number);
      validContacts.push(row);
    });

    if (validContacts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid contacts found in CSV',
        validation_errors: errors
      });
    }

    // Step 1: Create contacts from CSV data
    const contactIds: string[] = [];
    const skippedContacts: string[] = [];

    for (const contactData of validContacts) {
      try {
        // Check if contact already exists by phone number  
        // Note: Contact model searches across all users, we filter by user here
        const existingContact = await Contact.findOne({ 
          user_id: userId, 
          phone_number: contactData.phone_number 
        });
        
        if (existingContact) {
          // Skip duplicate, use existing contact ID
          contactIds.push(existingContact.id);
          skippedContacts.push(contactData.phone_number);
          continue;
        }

        // Create new contact
        const newContact = await Contact.createContact({
          user_id: userId,
          name: contactData.name,
          phone_number: contactData.phone_number,
          email: contactData.email || undefined,
          company: contactData.company || undefined,
          notes: contactData.notes || undefined,
          is_auto_created: false
          // custom_data can be stored in notes if needed
        });

        contactIds.push(newContact.id);
      } catch (error) {
        logger.error(`Failed to create contact ${contactData.phone_number}:`, error);
        errors.push(`Failed to create contact: ${contactData.name} (${contactData.phone_number})`);
      }
    }

    if (contactIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Failed to create any contacts',
        validation_errors: errors
      });
    }

    // Step 2: Create campaign with contact IDs
    const campaignData = {
      name: campaign_name,
      description,
      agent_id,
      next_action,
      first_call_time,
      last_call_time,
      start_date,
      end_date,
      contact_ids: contactIds
    };

    const campaign = await CallCampaignService.createCampaign(userId, campaignData);
    
    logger.info(`Campaign created from CSV: ${campaign.id} by user ${userId}, ${contactIds.length} contacts`);
    
    // Notify scheduler about campaign change
    try {
      const { campaignScheduler } = await import('../services/InMemoryCampaignScheduler');
      await campaignScheduler.onCampaignChange(campaign.id);
      logger.info(`Campaign scheduler notified of new campaign: ${campaign.id}`);
    } catch (error) {
      logger.error('Failed to notify campaign scheduler', { error });
      // Don't fail the request if scheduler notification fails
    }
    
    res.status(201).json({
      success: true,
      campaign,
      stats: {
        total_rows: csv_data.length,
        valid_contacts: validContacts.length,
        contacts_created: contactIds.length - skippedContacts.length,
        contacts_skipped: skippedContacts.length,
        errors: errors.length
      },
      validation_errors: errors.length > 0 ? errors : undefined,
      skipped_phones: skippedContacts.length > 0 ? skippedContacts : undefined
    });
  } catch (error) {
    logger.error('Error creating campaign from CSV:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create campaign from CSV'
    });
  }
});

/**
 * @route   GET /api/campaigns
 * @desc    Get all campaigns for user
 * @access  Private
 */
router.get('/', async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { status, agent_id, limit, offset } = req.query;

    const filters: any = {};
    
    if (status && typeof status === 'string') {
      filters.status = status.split(',');
    } else if (status) {
      filters.status = status;
    }
    if (agent_id) {
      filters.agent_id = agent_id as string;
    }
    if (limit) {
      filters.limit = parseInt(limit as string);
    }
    if (offset) {
      filters.offset = parseInt(offset as string);
    }

    const result = await CallCampaignService.getUserCampaigns(userId, filters);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Error fetching campaigns:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch campaigns'
    });
  }
});

/**
 * @route   GET /api/campaigns/summary
 * @desc    Get campaigns summary (count by status)
 * @access  Private
 */
router.get('/summary', async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const summary = await CallCampaignService.getCampaignsSummary(userId);
    
    res.json({
      success: true,
      summary
    });
  } catch (error) {
    logger.error('Error fetching campaigns summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch campaigns summary'
    });
  }
});

/**
 * @route   GET /api/campaigns/:id
 * @desc    Get campaign by ID
 * @access  Private
 */
router.get('/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const campaign = await CallCampaignService.getCampaign(req.params.id, userId);
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }
    
    res.json({
      success: true,
      campaign
    });
  } catch (error) {
    logger.error('Error fetching campaign:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch campaign'
    });
  }
});

/**
 * @route   PUT /api/campaigns/:id
 * @desc    Update campaign
 * @access  Private
 */
router.put('/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const campaign = await CallCampaignService.updateCampaign(
      req.params.id,
      userId,
      req.body
    );
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    logger.info(`Campaign updated: ${campaign.id}`);
    
    res.json({
      success: true,
      campaign
    });
  } catch (error) {
    logger.error('Error updating campaign:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update campaign'
    });
  }
});

/**
 * @route   DELETE /api/campaigns/:id
 * @desc    Delete campaign
 * @access  Private
 */
router.delete('/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const deleted = await CallCampaignService.deleteCampaign(req.params.id, userId);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found or cannot be deleted'
      });
    }

    logger.info(`Campaign deleted: ${req.params.id}`);
    
    res.json({
      success: true,
      message: 'Campaign deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting campaign:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete campaign'
    });
  }
});

/**
 * @route   POST /api/campaigns/:id/start
 * @desc    Start campaign
 * @access  Private
 */
router.post('/:id/start', async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const campaign = await CallCampaignService.startCampaign(req.params.id, userId);
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    logger.info(`Campaign started: ${campaign.id}`);
    
    res.json({
      success: true,
      message: 'Campaign started successfully',
      campaign
    });
  } catch (error) {
    logger.error('Error starting campaign:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start campaign'
    });
  }
});

/**
 * @route   POST /api/campaigns/:id/pause
 * @desc    Pause campaign
 * @access  Private
 */
router.post('/:id/pause', async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const campaign = await CallCampaignService.pauseCampaign(req.params.id, userId);
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    logger.info(`Campaign paused: ${campaign.id}`);
    
    res.json({
      success: true,
      message: 'Campaign paused successfully',
      campaign
    });
  } catch (error) {
    logger.error('Error pausing campaign:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to pause campaign'
    });
  }
});

/**
 * @route   POST /api/campaigns/:id/resume
 * @desc    Resume campaign
 * @access  Private
 */
router.post('/:id/resume', async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const campaign = await CallCampaignService.resumeCampaign(req.params.id, userId);
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    logger.info(`Campaign resumed: ${campaign.id}`);
    
    res.json({
      success: true,
      message: 'Campaign resumed successfully',
      campaign
    });
  } catch (error) {
    logger.error('Error resuming campaign:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resume campaign'
    });
  }
});

/**
 * @route   POST /api/campaigns/:id/cancel
 * @desc    Cancel campaign
 * @access  Private
 */
router.post('/:id/cancel', async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const campaign = await CallCampaignService.cancelCampaign(req.params.id, userId);
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    logger.info(`Campaign cancelled: ${campaign.id}`);
    
    res.json({
      success: true,
      message: 'Campaign cancelled successfully',
      campaign
    });
  } catch (error) {
    logger.error('Error cancelling campaign:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel campaign'
    });
  }
});

/**
 * @route   GET /api/campaigns/:id/statistics
 * @desc    Get campaign statistics
 * @access  Private
 */
router.get('/:id/statistics', async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const statistics = await CallCampaignService.getCampaignStatistics(
      req.params.id,
      userId
    );
    
    if (!statistics) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }
    
    res.json({
      success: true,
      statistics
    });
  } catch (error) {
    logger.error('Error fetching campaign statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch campaign statistics'
    });
  }
});

/**
 * @route   GET /api/campaigns/:id/analytics
 * @desc    Get campaign analytics
 * @access  Private
 */
router.get('/:id/analytics', async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const analytics = await CallCampaignService.getCampaignAnalytics(
      req.params.id,
      userId
    );
    
    if (!analytics) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }
    
    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    logger.error('Error fetching campaign analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch campaign analytics'
    });
  }
});

export default router;
