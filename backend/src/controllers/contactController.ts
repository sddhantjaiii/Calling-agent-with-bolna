import { Request, Response } from 'express';
import { ContactService } from '../services/contactService';
import { logger } from '../utils/logger';
import { queryCache } from '../services/queryCacheService';
import { AutoEngagementTriggerService } from '../services/autoEngagementTriggerService';

// Contact controller - handles contact management and bulk uploads
export class ContactController {
  /**
   * Get all contacts for the authenticated user
   */
  static async getContacts(req: Request, res: Response): Promise<Response | void> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { 
        search, 
        limit = '50', 
        offset = '0', 
        sortBy = 'name', 
        sortOrder = 'asc',
        ids,
        // Server-side column filters (comma-separated values)
        filterTags,
        filterLastStatus,
        filterCallType,
        filterSource,
        filterCity,
        filterCountry,
        filterLeadStage
      } = req.query;

      // Handle specific IDs query
      if (ids) {
        const contactIds = (ids as string).split(',').map(id => id.trim());
        const result = await ContactService.getContactsByIds(userId, contactIds);
        return res.json(result.contacts);
      }

      // Parse filter arrays from comma-separated strings
      const parseFilterArray = (value: unknown): string[] => {
        if (!value) return [];
        if (typeof value === 'string') {
          return value.split(',').map(v => v.trim()).filter(Boolean);
        }
        if (Array.isArray(value)) {
          return value.map(v => String(v).trim()).filter(Boolean);
        }
        return [];
      };

      const options = {
        search: search as string,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        sortBy: sortBy as 'name' | 'created_at' | 'phone_number',
        sortOrder: sortOrder as 'asc' | 'desc',
        // Server-side filters
        filterTags: parseFilterArray(filterTags),
        filterLastStatus: parseFilterArray(filterLastStatus),
        filterCallType: parseFilterArray(filterCallType),
        filterSource: parseFilterArray(filterSource),
        filterCity: parseFilterArray(filterCity),
        filterCountry: parseFilterArray(filterCountry),
        filterLeadStage: parseFilterArray(filterLeadStage)
      };

      // Only cache first 2 pages (40-50 items) for better memory management
      const shouldCache = options.offset < 40;
      
      let result;
      if (shouldCache) {
        // Generate cache key with all parameters
        const cacheKey = queryCache.generateKey('contacts:list', {
          userId,
          ...options
        });

        // Wrap query with caching (1 minute TTL for frequently accessed data)
        result = await queryCache.wrapQuery(
          cacheKey,
          () => ContactService.getUserContacts(userId, options),
          60 * 1000 // 1 minute TTL - shorter to prevent stale data
        );
      } else {
        // Don't cache pages beyond the first 2 - direct query
        result = await ContactService.getUserContacts(userId, options);
      }
      
      res.json({
        success: true,
        data: {
          contacts: result.contacts,
          pagination: {
            total: result.total,
            limit: options.limit,
            offset: options.offset,
            hasMore: result.total > options.offset + options.limit
          }
        }
      });
    } catch (error) {
      logger.error('Error in getContacts:', error);
      res.status(500).json({ 
        error: 'Failed to retrieve contacts',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Create a new contact
   */
  static async createContact(req: Request, res: Response): Promise<Response | void> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { name, phone_number, phoneNumber, email, company, notes, tags, city, country, business_context } = req.body;
      
      // Handle both field names for compatibility
      const phone = phone_number || phoneNumber;

      // Validate required fields
      if (!name || !phone) {
        return res.status(400).json({ 
          error: 'Name and phone number are required' 
        });
      }

      // Validate phone number format
      if (!ContactService.validatePhoneNumber(phone)) {
        return res.status(400).json({ 
          error: 'Invalid phone number format' 
        });
      }

      const contact = await ContactService.createContact(userId, {
        name,
        phone_number: phone,
        email,
        company,
        notes,
        tags,
        city,
        country,
        business_context
      });

      // Invalidate contacts cache after creating
      queryCache.invalidateTable('contacts');

      // Trigger auto-engagement flows (non-blocking, with enhanced error tracking)
      AutoEngagementTriggerService.onContactCreated(contact, userId).catch(error => {
        logger.error('Error triggering auto-engagement flow:', {
          error: error instanceof Error ? error.message : String(error),
          contactId: contact.id,
          userId: userId,
          stack: error instanceof Error ? error.stack : undefined
        });
        
        // TODO: Add monitoring/alerting for production
        // - Increment failure counter in metrics system
        // - Send alert if failure rate exceeds threshold
        // - Store failed trigger attempts for retry queue
        // Don't fail the request if auto-engagement fails
      });

      res.status(201).json({
        success: true,
        data: { contact }
      });
    } catch (error) {
      logger.error('Error in createContact:', error);
      
      if (error instanceof Error && error.message.includes('already exists')) {
        return res.status(409).json({ 
          error: error.message 
        });
      }

      res.status(500).json({ 
        error: 'Failed to create contact',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Update an existing contact
   */
  static async updateContact(req: Request, res: Response): Promise<Response | void> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { id } = req.params;
      const {
        name,
        phone_number,
        email,
        company,
        notes,
        tags,
        city,
        country,
        business_context,
        lead_stage,
      } = req.body;

      // Validate phone number format if provided
      if (phone_number && !ContactService.validatePhoneNumber(phone_number)) {
        return res.status(400).json({ 
          error: 'Invalid phone number format' 
        });
      }

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (phone_number !== undefined) updateData.phone_number = phone_number;
      if (email !== undefined) updateData.email = email;
      if (company !== undefined) updateData.company = company;
      if (notes !== undefined) updateData.notes = notes;
      if (tags !== undefined) updateData.tags = tags;
      if (city !== undefined) updateData.city = city;
      if (country !== undefined) updateData.country = country;
      if (business_context !== undefined) updateData.business_context = business_context;
      if (lead_stage !== undefined) updateData.lead_stage = lead_stage;

      const contact = await ContactService.updateContact(userId, id, updateData);

      // Invalidate contacts cache after updating
      queryCache.invalidateTable('contacts');

      res.json({
        success: true,
        data: { contact }
      });
    } catch (error) {
      logger.error('Error in updateContact:', error);
      
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ 
          error: error.message 
        });
      }

      if (error instanceof Error && error.message.includes('already exists')) {
        return res.status(409).json({ 
          error: error.message 
        });
      }

      res.status(500).json({ 
        error: 'Failed to update contact',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Delete a contact
   */
  static async deleteContact(req: Request, res: Response): Promise<Response | void> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { id } = req.params;

      await ContactService.deleteContact(userId, id);

      // Invalidate contacts cache after deleting
      queryCache.invalidateTable('contacts');

      res.json({
        success: true,
        message: 'Contact deleted successfully'
      });
    } catch (error) {
      logger.error('Error in deleteContact:', error);
      
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ 
          error: error.message 
        });
      }

      res.status(500).json({ 
        error: 'Failed to delete contact',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get a single contact by ID
   */
  static async getContact(req: Request, res: Response): Promise<Response | void> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { id } = req.params;

      const contact = await ContactService.getContact(userId, id);

      res.json({
        success: true,
        data: { contact }
      });
    } catch (error) {
      logger.error('Error in getContact:', error);
      
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ 
          error: error.message 
        });
      }

      res.status(500).json({ 
        error: 'Failed to retrieve contact',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get contact statistics for the authenticated user
   */
  static async getContactStats(req: Request, res: Response): Promise<Response | void> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Cache contact stats with shorter TTL (1 minute) as stats change frequently
      const cacheKey = queryCache.generateKey('stats:contacts', { userId });
      const stats = await queryCache.wrapQuery(
        cacheKey,
        () => ContactService.getContactStats(userId),
        1 * 60 * 1000 // 1 minute TTL
      );

      res.json({
        success: true,
        data: { stats }
      });
    } catch (error) {
      logger.error('Error in getContactStats:', error);
      res.status(500).json({ 
        error: 'Failed to retrieve contact statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Lookup contact by phone number (for ElevenLabs integration)
   * This endpoint is used by ElevenLabs to check if a phone number exists in our database
   */
  static async lookupContact(req: Request, res: Response): Promise<Response | void> {
    try {
      const { phone } = req.params;
      const startTime = Date.now();

      // Validate phone parameter
      if (!phone) {
        logger.warn('Contact lookup called without phone number:', {
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
        return res.status(400).json({ 
          error: 'Phone number is required',
          message: 'Please provide a phone number in the URL path'
        });
      }

      // Validate phone number format
      if (!ContactService.validatePhoneNumber(phone)) {
        logger.warn('Contact lookup called with invalid phone format:', {
          phone: phone.substring(0, 5) + '...',
          ip: req.ip
        });
        return res.status(400).json({ 
          error: 'Invalid phone number format',
          message: 'Please provide a valid phone number'
        });
      }

      // Perform lookup
      const contact = await ContactService.lookupContactByPhone(phone);
      const responseTime = Date.now() - startTime;

      if (contact) {
        // Log successful lookup (without sensitive data)
        logger.info('Contact lookup successful:', {
          phonePrefix: phone.substring(0, 5) + '...',
          contactFound: true,
          hasCompany: !!contact.company,
          responseTime,
          ip: req.ip
        });

        // Return only the information ElevenLabs needs
        res.json({
          success: true,
          data: {
            found: true,
            name: contact.name,
            company: contact.company || null,
            // Optional: Add additional context that might be useful for the agent
            hasEmail: !!contact.email,
            hasNotes: !!contact.notes
          }
        });
      } else {
        // Log unsuccessful lookup
        logger.info('Contact lookup - no match found:', {
          phonePrefix: phone.substring(0, 5) + '...',
          contactFound: false,
          responseTime,
          ip: req.ip
        });

        res.json({
          success: true,
          data: {
            found: false,
            message: 'No contact found for this phone number'
          }
        });
      }
    } catch (error) {
      logger.error('Error in contact lookup:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        phone: req.params.phone?.substring(0, 5) + '...',
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      res.status(500).json({ 
        error: 'Failed to lookup contact',
        message: 'An internal error occurred while looking up the contact'
      });
    }
  }

  /**
   * Batch lookup contacts by phone numbers (for ElevenLabs integration)
   * This endpoint allows looking up multiple contacts at once for efficiency
   */
  static async batchLookupContacts(req: Request, res: Response): Promise<Response | void> {
    try {
      const { phones } = req.body;
      const startTime = Date.now();

      // Validate input
      if (!phones || !Array.isArray(phones)) {
        return res.status(400).json({ 
          error: 'Phone numbers array is required',
          message: 'Please provide an array of phone numbers in the request body'
        });
      }

      if (phones.length === 0) {
        return res.status(400).json({ 
          error: 'At least one phone number is required',
          message: 'The phones array cannot be empty'
        });
      }

      if (phones.length > 100) {
        return res.status(400).json({ 
          error: 'Too many phone numbers',
          message: 'Maximum 100 phone numbers allowed per batch request'
        });
      }

      // Validate all phone numbers
      const invalidPhones = phones.filter((phone: string) => 
        !phone || typeof phone !== 'string' || !ContactService.validatePhoneNumber(phone)
      );

      if (invalidPhones.length > 0) {
        return res.status(400).json({ 
          error: 'Invalid phone numbers found',
          message: `${invalidPhones.length} phone numbers have invalid format`
        });
      }

      // Perform batch lookup
      const results = await Promise.all(
        phones.map(async (phone: string) => {
          try {
            const contact = await ContactService.lookupContactByPhone(phone);
            return {
              phone,
              found: !!contact,
              name: contact?.name || null,
              company: contact?.company || null,
              hasEmail: !!contact?.email,
              hasNotes: !!contact?.notes
            };
          } catch (error) {
            logger.error(`Error looking up phone ${phone.substring(0, 5)}...`, error);
            return {
              phone,
              found: false,
              error: 'Lookup failed'
            };
          }
        })
      );

      const responseTime = Date.now() - startTime;
      const foundCount = results.filter(r => r.found).length;

      logger.info('Batch contact lookup completed:', {
        totalRequested: phones.length,
        foundCount,
        responseTime,
        ip: req.ip
      });

      res.json({
        success: true,
        data: {
          results,
          summary: {
            total: phones.length,
            found: foundCount,
            notFound: phones.length - foundCount
          }
        }
      });

    } catch (error) {
      logger.error('Error in batch contact lookup:', error);
      res.status(500).json({ 
        error: 'Failed to perform batch lookup',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Upload contacts from Excel file
   */
  static async uploadContacts(req: Request, res: Response): Promise<Response | void> {
    console.log('🚀 UPLOAD CONTROLLER CALLED');
    
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        console.log('❌ User not authenticated');
        return res.status(401).json({ error: 'User not authenticated' });
      }
      
      console.log('✅ User authenticated:', userId);

      // Debug logging
      console.log('=== UPLOAD CONTROLLER DEBUG ===');
      console.log('Request headers:', {
        'content-type': req.headers['content-type'],
        'content-length': req.headers['content-length'],
        'authorization': req.headers['authorization'] ? 'Present' : 'Missing'
      });
      console.log('Request body keys:', Object.keys(req.body || {}));
      console.log('Request file:', req.file ? {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        buffer: req.file.buffer ? `Buffer(${req.file.buffer.length} bytes)` : 'No buffer'
      } : 'NO FILE OBJECT');
      console.log('Raw req.files:', (req as any).files);
      console.log('================================');

      logger.info('Upload request received', {
        userId,
        contentType: req.headers['content-type'],
        hasFile: !!req.file,
        bodyKeys: Object.keys(req.body || {}),
        fileInfo: req.file ? {
          fieldname: req.file.fieldname,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size
        } : null
      });

      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({ 
          error: 'No file uploaded. Please select an Excel file.' 
        });
      }

      const file = req.file;
      
      console.log('📄 FILE DETAILS:', {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        bufferExists: !!file.buffer,
        bufferLength: file.buffer?.length || 0,
        bufferStart: file.buffer ? file.buffer.slice(0, 10).toString('hex') : 'N/A'
      });
      
      // Validate file type
      const allowedMimeTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel' // .xls
      ];

      if (!allowedMimeTypes.includes(file.mimetype)) {
        return res.status(400).json({ 
          error: 'Invalid file type. Please upload an Excel file (.xlsx or .xls).' 
        });
      }

      // Additional validation for file buffer
      if (!file.buffer || file.buffer.length === 0) {
        console.error('❌ Empty or missing file buffer');
        return res.status(400).json({ 
          error: 'File upload failed. The file buffer is empty. Please try uploading the file again.' 
        });
      }

      // Process the upload
      const results = await ContactService.processContactUpload(
        userId, 
        file.buffer, 
        file.originalname
      );

      // Invalidate contacts cache after bulk upload to ensure fresh data
      // This is critical as bulk uploads can add many contacts at once
      queryCache.invalidateTable('contacts');
      
      logger.info('Cache invalidated after bulk contact upload', {
        userId,
        contactsAdded: results.success
      });

      // Return results
      res.json({
        success: true,
        message: `Upload completed. ${results.success} contacts added successfully.`,
        data: {
          summary: {
            totalProcessed: results.totalProcessed,
            successful: results.success,
            failed: results.failed,
            duplicates: results.duplicates
          },
          errors: results.errors.length > 0 ? results.errors : undefined
        }
      });

    } catch (error) {
      logger.error('Error in uploadContacts:', error);
      
      if (error instanceof Error && error.message.includes('Maximum 1000 contacts')) {
        return res.status(400).json({ 
          error: error.message 
        });
      }

      if (error instanceof Error && error.message.includes('Failed to parse')) {
        return res.status(400).json({ 
          error: error.message 
        });
      }

      res.status(500).json({ 
        error: 'Failed to process contact upload',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Download Excel template for contact upload
   */
  static async downloadTemplate(req: Request, res: Response): Promise<Response | void> {
    try {
      const templateBuffer = await ContactService.generateExcelTemplate();
      
      // Set comprehensive headers for Excel file download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="contact_upload_template.xlsx"');
      res.setHeader('Content-Length', templateBuffer.length.toString());
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      // Send the buffer directly
      res.end(templateBuffer);

    } catch (error) {
      logger.error('Error in downloadTemplate:', error);
      res.status(500).json({ 
        error: 'Failed to generate template',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Create contacts from leads for campaign creation
   * Creates new contacts or returns existing ones based on phone numbers
   */
  static async createContactsFromLeads(req: Request, res: Response): Promise<Response | void> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { leads } = req.body;
      if (!leads || !Array.isArray(leads) || leads.length === 0) {
        return res.status(400).json({ error: 'Leads array is required' });
      }

      const contactIds: string[] = [];
      
      for (const lead of leads) {
        if (!lead.phone) continue;
        
        try {
          // Try to find existing contact first
          const existingContact = await ContactService.findByPhone(userId, lead.phone);
          
          if (existingContact) {
            contactIds.push(existingContact.id);
          } else {
            // Create new contact
            const newContact = await ContactService.createContact(userId, {
              name: lead.name || `Lead ${lead.phone}`,
              phone_number: lead.phone,
              email: lead.email || undefined,
              company: lead.company || undefined,
            });
            
            if (newContact?.id) {
              contactIds.push(newContact.id);
            }
          }
        } catch (contactError) {
          logger.error('Error processing lead for contact creation:', {
            lead,
            error: contactError instanceof Error ? contactError.message : String(contactError)
          });
          // Continue with other leads even if one fails
        }
      }

      logger.info(`Created/found ${contactIds.length} contacts from ${leads.length} leads for user ${userId}`);
      
      return res.json({
        success: true,
        contactIds,
        total: contactIds.length
      });
      
    } catch (error) {
      logger.error('Error in createContactsFromLeads:', error);
      return res.status(500).json({ 
        error: 'Failed to create contacts from leads',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get contacts with pipeline view data (quality badges from lead_analytics)
   * Optimized endpoint for kanban/pipeline view
   */
  static async getPipelineContacts(req: Request, res: Response): Promise<Response | void> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { search } = req.query;
      
      const result = await ContactService.getContactsWithQuality(userId, { search: search as string });
      
      res.json({
        success: true,
        data: {
          contacts: result.contacts,
          total: result.total
        }
      });
    } catch (error) {
      logger.error('Error in getPipelineContacts:', error);
      res.status(500).json({ 
        error: 'Failed to retrieve pipeline contacts',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get all distinct filter options for contacts
   * Returns unique values for each filterable column across ALL user's contacts
   */
  static async getFilterOptions(req: Request, res: Response): Promise<Response | void> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const filterOptions = await ContactService.getFilterOptions(userId);

      res.json({
        success: true,
        data: filterOptions
      });
    } catch (error) {
      logger.error('Error in getFilterOptions:', error);
      res.status(500).json({ 
        error: 'Failed to retrieve filter options',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
