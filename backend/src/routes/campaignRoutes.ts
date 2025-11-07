import { Router, Request, Response } from 'express';
import { CallCampaignService } from '../services/CallCampaignService';
import Contact from '../models/Contact';
import { authenticateToken } from '../middleware/auth';
import { logger } from '../utils/logger';
import { uploadExcel } from '../middleware/upload';
import * as XLSX from 'xlsx';
import { ContactService } from '../services/contactService';

const router = Router();

/**
 * @route   GET /api/campaigns/template
 * @desc    Download campaign contact upload template (same as contact template)
 * @access  Private
 */
router.get('/template', async (req: Request, res: Response): Promise<Response | void> => {
  try {
    // Use the same template generation method as contacts
    const templateBuffer = await ContactService.generateExcelTemplate();
    
    // Set comprehensive headers for Excel file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="campaign_contacts_template.xlsx"');
    res.setHeader('Content-Length', templateBuffer.length.toString());
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Send the buffer directly
    res.end(templateBuffer);

  } catch (error) {
    logger.error('Error in campaign template download:', error);
    return res.status(500).json({ 
      error: 'Failed to generate template',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

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
// Unified upload endpoint supporting .xlsx, .xls and .csv
router.post('/upload-csv', uploadExcel.single('file'), async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get form data from req.body (sent as FormData fields)
    const {
      name,
      campaign_name,
      description,
      agent_id,
      next_action,
      first_call_time,
      last_call_time,
      start_date,
      end_date,
      max_concurrent_calls
    } = req.body;

    const campaignName = name || campaign_name;

    // Validation
    if (!campaignName || !agent_id || !next_action || !first_call_time || !last_call_time || !start_date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name/campaign_name, agent_id, next_action, first_call_time, last_call_time, start_date'
      });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No CSV file uploaded'
      });
    }
    const originalName = req.file.originalname.toLowerCase();
    const isCsv = originalName.endsWith('.csv');
    let rows: any[] = [];
    try {
      if (isCsv) {
        // Parse CSV manually (simple parser)
        const text = req.file.buffer.toString('utf8');
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length < 2) {
          return res.status(400).json({ success: false, error: 'CSV must have header and at least one data row' });
        }
        const headerParts = lines[0].split(',').map(h => h.trim().toLowerCase());
        const nameIdx = headerParts.findIndex(h => ['name','full_name','contact_name'].includes(h));
        const phoneIdx = headerParts.findIndex(h => ['phone','phone_number','phonenumber','mobile','cell'].includes(h));
        const emailIdx = headerParts.findIndex(h => ['email','email_address'].includes(h));
        const companyIdx = headerParts.findIndex(h => ['company','organization','business'].includes(h));
        const notesIdx = headerParts.findIndex(h => ['notes','comments','description'].includes(h));
        if (phoneIdx === -1) {
          return res.status(400).json({ success: false, error: 'CSV must include phone_number column' });
        }
        for (let i=1;i<lines.length;i++) {
          const parts = lines[i].split(',');
          if (parts.every(p => p.trim()==='')) continue;
          
          const toStr = (v: string|undefined) => (v||'').trim();
          const phoneValue = toStr(parts[phoneIdx]);
          
          // Skip rows without valid phone numbers (filters out instruction text)
          if (!phoneValue || !/\d/.test(phoneValue)) {
            logger.debug(`Skipping CSV row ${i + 1}: No valid phone number`);
            continue;
          }
          
          // Skip rows with less than 10 digits (not a valid phone number)
          const digitCount = (phoneValue.match(/\d/g) || []).length;
          if (digitCount < 10) {
            logger.debug(`Skipping CSV row ${i + 1}: Phone has less than 10 digits`);
            continue;
          }
          
          rows.push({
            name: nameIdx !== -1 ? toStr(parts[nameIdx]) : undefined,
            phone_number: phoneValue,
            email: emailIdx !== -1 ? toStr(parts[emailIdx]) : undefined,
            company: companyIdx !== -1 ? toStr(parts[companyIdx]) : undefined,
            notes: notesIdx !== -1 ? toStr(parts[notesIdx]) : undefined,
          });
        }
      } else {
        // Use XLSX to parse Excel (supports numeric coercion avoidance via raw:false)
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        rows = XLSX.utils.sheet_to_json(worksheet, { raw: false });
      }
    } catch (parseErr) {
      logger.error('Failed to parse upload file for campaign', parseErr);
      return res.status(400).json({ success: false, error: 'Failed to parse upload file. Ensure valid .xlsx or .csv format.' });
    }

    if (!rows || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Upload file contains no rows' });
    }

    // Validate row limit - increased to 10,000
    if (rows.length > 10000) {
      return res.status(400).json({ 
        success: false, 
        error: 'Maximum 10,000 contacts allowed per campaign upload. Please split your data into smaller batches.' 
      });
    }

    // Validate data rows - only phone_number is required
    const errors: string[] = [];
    const validContacts: any[] = [];
    const seenPhones = new Set<string>();
    rows.forEach((row: any, index: number) => {
      // Only phone_number is required
      if (!row.phone_number || !row.phone_number.trim()) {
        errors.push(`Row ${index + 1}: Missing required field (phone_number)`);
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

    // Step 1: Create contacts from CSV data using async batching
    const BATCH_SIZE = 100; // Process 100 contacts at a time
    const contactIds: string[] = [];
    const skippedContacts: string[] = [];
    const createErrors: string[] = [];

    // Get existing phone numbers for this user to check duplicates efficiently
    const existingContactsResult = await Contact.query(
      'SELECT id, phone_number FROM contacts WHERE user_id = $1',
      [userId]
    );
    const existingPhoneMap = new Map<string, string>();
    existingContactsResult.rows.forEach((contact: any) => {
      existingPhoneMap.set(contact.phone_number, contact.id);
    });

    // Process contacts in batches for better performance
    for (let batchStart = 0; batchStart < validContacts.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, validContacts.length);
      const batch = validContacts.slice(batchStart, batchEnd);
      
      // Process batch concurrently with Promise.allSettled for error isolation
      const batchPromises = batch.map(async (contactData) => {
        try {
          // Check if contact already exists by phone number using in-memory map
          const existingContactId = existingPhoneMap.get(contactData.phone_number);
          
          if (existingContactId) {
            // Skip duplicate, use existing contact ID
            skippedContacts.push(contactData.phone_number);
            return { success: true, contactId: existingContactId, skipped: true };
          }

          // Create new contact - generate name from phone if not provided
          const newContact = await Contact.createContact({
            user_id: userId,
            name: contactData.name || `Anonymous ${contactData.phone_number}`,
            phone_number: contactData.phone_number,
            email: contactData.email || undefined,
            company: contactData.company || undefined,
            notes: contactData.notes || undefined,
            is_auto_created: false
          });

          // Add to existing map for subsequent batch checks
          existingPhoneMap.set(contactData.phone_number, newContact.id);
          return { success: true, contactId: newContact.id, skipped: false };

        } catch (error) {
          logger.error(`Failed to create contact ${contactData.phone_number}:`, error);
          return { 
            success: false, 
            error: `Failed to create contact: ${contactData.name || contactData.phone_number} (${contactData.phone_number})` 
          };
        }
      });

      // Wait for batch to complete
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Aggregate results
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.success && result.value.contactId) {
          contactIds.push(result.value.contactId);
        } else if (result.status === 'fulfilled' && !result.value.success) {
          createErrors.push(result.value.error!);
        } else if (result.status === 'rejected') {
          createErrors.push(`Batch processing error: ${result.reason?.message || 'Unknown error'}`);
        }
      });
    }

    if (contactIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Failed to create any contacts',
        validation_errors: [...errors, ...createErrors]
      });
    }

    // Step 2: Create campaign with contact IDs
    const campaignData = {
      name: campaignName,
      description,
      agent_id,
      next_action,
      first_call_time,
      last_call_time,
      start_date,
      end_date,
      max_concurrent_calls: max_concurrent_calls ? parseInt(max_concurrent_calls) : undefined,
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
        total_rows: rows.length,
        valid_contacts: validContacts.length,
        contacts_created: contactIds.length - skippedContacts.length,
        contacts_skipped: skippedContacts.length,
        validation_errors: errors.length,
        creation_errors: createErrors.length
      },
      validation_errors: errors.length > 0 ? errors.slice(0, 50) : undefined, // Limit to 50 errors in response
      creation_errors: createErrors.length > 0 ? createErrors.slice(0, 50) : undefined,
      skipped_phones: skippedContacts.length > 0 ? skippedContacts.slice(0, 50) : undefined
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
