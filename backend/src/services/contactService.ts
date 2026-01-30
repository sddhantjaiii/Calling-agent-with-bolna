import ContactModel, { ContactInterface, CreateContactData, UpdateContactData } from '../models/Contact';
import { logger } from '../utils/logger';
import { configService } from './configService';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

// Contact service - business logic for contact management
export class ContactService {
  /**
   * Get all contacts for a user with optional search and filtering
   */
  static async getUserContacts(
    userId: string, 
    options: {
      search?: string;
      limit?: number;
      offset?: number;
      sortBy?: 'name' | 'created_at' | 'phone_number';
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<{ contacts: ContactInterface[]; total: number }> {
    try {
      const { search, limit = 50, offset = 0, sortBy = 'created_at', sortOrder = 'desc' } = options;

      let contacts: ContactInterface[];
      let total: number;

      if (search) {
        // Enhanced search with auto-creation info and meeting data
        // Universal search across Name, Company, Phone, Email, Notes, Tags
        const query = `
          SELECT c.*, 
            calls.bolna_execution_id as linked_call_id,
            CASE 
              WHEN c.auto_created_from_call_id IS NOT NULL THEN 'auto_created'
              WHEN EXISTS(SELECT 1 FROM calls WHERE contact_id = c.id) THEN 'manually_linked'
              ELSE 'not_linked'
            END as call_link_type,
            CASE 
              WHEN (SELECT COUNT(*) FROM calls WHERE contact_id = c.id) = 0 THEN 'Not contacted'
              WHEN (SELECT lead_type FROM calls WHERE contact_id = c.id ORDER BY created_at DESC LIMIT 1) = 'inbound'
                AND (c.call_attempted_busy > 0 OR c.call_attempted_no_answer > 0)
                THEN 'Callback Received'
              ELSE COALESCE(last_call.call_lifecycle_status, 'Not contacted')
            END as last_call_status,
            COALESCE(
              (SELECT lead_type FROM calls WHERE contact_id = c.id ORDER BY created_at DESC LIMIT 1),
              'outbound'
            ) as call_type,
            -- Meeting data from calendar_meetings (latest upcoming or most recent meeting)
            latest_meeting.meeting_link,
            latest_meeting.meeting_start_time,
            latest_meeting.meeting_end_time,
            latest_meeting.meeting_title,
            latest_meeting.meeting_id,
            latest_meeting.meeting_status
          FROM contacts c
          LEFT JOIN calls ON c.auto_created_from_call_id = calls.id
          LEFT JOIN LATERAL (
            SELECT call_lifecycle_status
            FROM calls
            WHERE (contact_id = c.id OR phone_number = c.phone_number)
            ORDER BY created_at DESC
            LIMIT 1
          ) last_call ON true
          LEFT JOIN LATERAL (
            SELECT 
              cm.id as meeting_id,
              cm.meeting_link,
              cm.meeting_start_time,
              cm.meeting_end_time,
              cm.meeting_title,
              cm.status as meeting_status
            FROM calendar_meetings cm
            WHERE cm.contact_id = c.id 
              AND cm.status IN ('scheduled', 'rescheduled')
            ORDER BY 
              CASE WHEN cm.meeting_start_time >= NOW() THEN 0 ELSE 1 END,
              ABS(EXTRACT(EPOCH FROM (cm.meeting_start_time - NOW())))
            LIMIT 1
          ) latest_meeting ON true
          WHERE c.user_id = $1 
          AND (
            c.name ILIKE $2 
            OR c.phone_number LIKE $3 
            OR c.email ILIKE $2 
            OR c.company ILIKE $2
            OR c.notes ILIKE $2
            OR EXISTS (SELECT 1 FROM unnest(c.tags) tag WHERE tag ILIKE $2)
          )
          ORDER BY c.created_at DESC
        `;
        const result = await ContactModel.query(query, [userId, `%${search}%`, `%${search}%`]);
        contacts = result.rows;
        total = contacts.length;
        
        // Apply pagination to search results
        contacts = contacts.slice(offset, offset + limit);
      } else {
        // Get all contacts with pagination, sorting, auto-creation info, and meeting data
        // Using CASE statement for safe dynamic sorting
        const validSortColumns: Record<string, string> = {
          'name': 'c.name',
          'created_at': 'c.created_at',
          'phone_number': 'c.phone_number'
        };
        const sortColumn = validSortColumns[sortBy] || 'c.name';
        const sortDirection = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
        
        const query = `
          SELECT c.*, 
            calls.bolna_execution_id as linked_call_id,
            CASE 
              WHEN c.auto_created_from_call_id IS NOT NULL THEN 'auto_created'
              WHEN EXISTS(SELECT 1 FROM calls WHERE contact_id = c.id) THEN 'manually_linked'
              ELSE 'not_linked'
            END as call_link_type,
            CASE 
              WHEN (SELECT COUNT(*) FROM calls WHERE contact_id = c.id) = 0 THEN 'Not contacted'
              WHEN (SELECT lead_type FROM calls WHERE contact_id = c.id ORDER BY created_at DESC LIMIT 1) = 'inbound'
                AND (c.call_attempted_busy > 0 OR c.call_attempted_no_answer > 0)
                THEN 'Callback Received'
              ELSE COALESCE(last_call.call_lifecycle_status, 'Not contacted')
            END as last_call_status,
            COALESCE(
              (SELECT lead_type FROM calls WHERE contact_id = c.id ORDER BY created_at DESC LIMIT 1),
              'outbound'
            ) as call_type,
            -- Meeting data from calendar_meetings (latest upcoming or most recent meeting)
            latest_meeting.meeting_link,
            latest_meeting.meeting_start_time,
            latest_meeting.meeting_end_time,
            latest_meeting.meeting_title,
            latest_meeting.meeting_id,
            latest_meeting.meeting_status
          FROM contacts c
          LEFT JOIN calls ON c.auto_created_from_call_id = calls.id
          LEFT JOIN LATERAL (
            SELECT call_lifecycle_status
            FROM calls
            WHERE (contact_id = c.id OR phone_number = c.phone_number)
            ORDER BY created_at DESC
            LIMIT 1
          ) last_call ON true
          LEFT JOIN LATERAL (
            SELECT 
              cm.id as meeting_id,
              cm.meeting_link,
              cm.meeting_start_time,
              cm.meeting_end_time,
              cm.meeting_title,
              cm.status as meeting_status
            FROM calendar_meetings cm
            WHERE cm.contact_id = c.id 
              AND cm.status IN ('scheduled', 'rescheduled')
            ORDER BY 
              CASE WHEN cm.meeting_start_time >= NOW() THEN 0 ELSE 1 END,
              ABS(EXTRACT(EPOCH FROM (cm.meeting_start_time - NOW())))
            LIMIT 1
          ) latest_meeting ON true
          WHERE c.user_id = $1 
          ORDER BY ${sortColumn} ${sortDirection}
          LIMIT $2 OFFSET $3
        `;
        const result = await ContactModel.query(query, [userId, limit, offset]);
        contacts = result.rows;

        // Get total count
        const countResult = await ContactModel.query(
          'SELECT COUNT(*) as count FROM contacts WHERE user_id = $1',
          [userId]
        );
        total = parseInt(countResult.rows[0].count);
      }

      return { contacts, total };
    } catch (error) {
      logger.error('Error getting user contacts:', error);
      throw new Error('Failed to retrieve contacts');
    }
  }

  /**
   * Get specific contacts by IDs
   */
  static async getContactsByIds(userId: string, contactIds: string[]): Promise<{ contacts: any[] }> {
    try {
      if (!contactIds || contactIds.length === 0) {
        return { contacts: [] };
      }

      // Build placeholders for IN clause
      const placeholders = contactIds.map((_, i) => `$${i + 2}`).join(',');
      
      const query = `
        SELECT 
          c.id,
          c.user_id,
          c.name,
          c.phone_number,
          c.email,
          c.company,
          c.notes,
          c.city,
          c.country,
          c.business_context,
          c.created_at,
          c.updated_at,
          c.auto_created_from_call_id,
          c.is_auto_created,
          c.auto_creation_source,
          c.is_customer,
          c.not_connected,
          c.last_contact_at,
          c.call_attempted_busy,
          c.call_attempted_no_answer,
          c.call_attempted_failed,
          c.last_email_sent_at,
          c.total_emails_sent,
          c.total_emails_opened,
          c.lead_stage,
          c.lead_stage_updated_at
        FROM contacts c
        WHERE c.user_id = $1 AND c.id IN (${placeholders})
        ORDER BY c.name
      `;

      const result = await ContactModel.query(query, [userId, ...contactIds]);
      
      // Add empty tags array to each contact
      const contactsWithTags = result.rows.map((contact: any) => ({
        ...contact,
        tags: []
      }));
      
      return { contacts: contactsWithTags };
    } catch (error) {
      logger.error('Error getting contacts by IDs:', error);
      throw new Error('Failed to retrieve contacts');
    }
  }

  /**
   * Create a new contact
   */
  static async createContact(userId: string, contactData: Omit<CreateContactData, 'user_id'>): Promise<ContactInterface> {
    try {
      // Validate phone number format
      const phoneNumber = this.normalizePhoneNumber(contactData.phone_number);
      
      // Check for duplicate phone number for this user
      const existingContact = await ContactModel.query(
        'SELECT id FROM contacts WHERE user_id = $1 AND phone_number = $2',
        [userId, phoneNumber]
      );

      if (existingContact.rows.length > 0) {
        throw new Error('Contact with this phone number already exists');
      }

      const newContact = await ContactModel.createContact({
        ...contactData,
        user_id: userId,
        phone_number: phoneNumber
      });

      logger.info(`Contact created for user ${userId}:`, { contactId: newContact.id });
      return newContact;
    } catch (error) {
      logger.error('Error creating contact:', error);
      throw error;
    }
  }

  /**
   * Update an existing contact
   */
  static async updateContact(
    userId: string, 
    contactId: string, 
    updateData: UpdateContactData
  ): Promise<ContactInterface> {
    try {
      // Verify contact belongs to user
      const existingContact = await ContactModel.query(
        'SELECT id FROM contacts WHERE id = $1 AND user_id = $2',
        [contactId, userId]
      );

      if (existingContact.rows.length === 0) {
        throw new Error('Contact not found or access denied');
      }

      // Normalize phone number if provided
      if (updateData.phone_number) {
        updateData.phone_number = this.normalizePhoneNumber(updateData.phone_number);
        
        // Check for duplicate phone number (excluding current contact)
        const duplicateCheck = await ContactModel.query(
          'SELECT id FROM contacts WHERE user_id = $1 AND phone_number = $2 AND id != $3',
          [userId, updateData.phone_number, contactId]
        );

        if (duplicateCheck.rows.length > 0) {
          throw new Error('Another contact with this phone number already exists');
        }
      }

      const updatedContact = await ContactModel.updateContact(contactId, updateData);
      
      if (!updatedContact) {
        throw new Error('Failed to update contact');
      }

      logger.info(`Contact updated for user ${userId}:`, { contactId });
      return updatedContact;
    } catch (error) {
      logger.error('Error updating contact:', error);
      throw error;
    }
  }

  /**
   * Delete a contact
   */
  static async deleteContact(userId: string, contactId: string): Promise<void> {
    try {
      // Verify contact belongs to user
      const existingContact = await ContactModel.query(
        'SELECT id FROM contacts WHERE id = $1 AND user_id = $2',
        [contactId, userId]
      );

      if (existingContact.rows.length === 0) {
        throw new Error('Contact not found or access denied');
      }

      await ContactModel.delete(contactId);
      logger.info(`Contact deleted for user ${userId}:`, { contactId });
    } catch (error) {
      logger.error('Error deleting contact:', error);
      throw error;
    }
  }

  /**
   * Get a single contact by ID
   */
  static async getContact(userId: string, contactId: string): Promise<ContactInterface> {
    try {
      const query = `
        SELECT c.*, 
          calls.bolna_execution_id as linked_call_id,
          calls.created_at as call_created_at,
          CASE 
            WHEN c.auto_created_from_call_id IS NOT NULL THEN 'auto_created'
            WHEN EXISTS(SELECT 1 FROM calls WHERE contact_id = c.id) THEN 'manually_linked'
            ELSE 'not_linked'
          END as call_link_type
        FROM contacts c
        LEFT JOIN calls ON c.auto_created_from_call_id = calls.id
        WHERE c.id = $1 AND c.user_id = $2
      `;
      
      const result = await ContactModel.query(query, [contactId, userId]);

      if (result.rows.length === 0) {
        throw new Error('Contact not found or access denied');
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error getting contact:', error);
      throw error;
    }
  }

  /**
   * Lookup contact by phone number (for ElevenLabs integration)
   */
  static async lookupContactByPhone(phoneNumber: string): Promise<ContactInterface | null> {
    try {
      const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
      const contact = await ContactModel.findByPhoneNumber(normalizedPhone);
      
      if (contact) {
        logger.info('Contact found for phone lookup:', { phoneNumber: normalizedPhone });
      }
      
      return contact;
    } catch (error) {
      logger.error('Error looking up contact by phone:', error);
      return null; // Return null instead of throwing for external API
    }
  }

  /**
   * Find contact by phone number for a specific user
   */
  static async findByPhone(userId: string, phoneNumber: string): Promise<ContactInterface | null> {
    try {
      const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
      const contact = await ContactModel.findByUserAndPhone(userId, normalizedPhone);
      
      if (contact) {
        logger.info('Contact found for user phone lookup:', { 
          userId,
          phoneNumber: normalizedPhone 
        });
      }
      
      return contact;
    } catch (error) {
      logger.error('Error finding contact by user and phone:', error);
      return null;
    }
  }

  /**
   * Get contact statistics for a user
   */
  static async getContactStats(userId: string): Promise<{
    totalContacts: number;
    recentContacts: number;
    contactsWithCalls: number;
    autoCreatedContacts: number;
    manuallyCreatedContacts: number;
  }> {
    try {
      const statsQuery = `
        SELECT 
          COUNT(*) as total_contacts,
          COUNT(CASE WHEN c.created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as recent_contacts,
          COUNT(CASE WHEN calls.contact_id IS NOT NULL OR c.auto_created_from_call_id IS NOT NULL THEN 1 END) as contacts_with_calls,
          COUNT(CASE WHEN c.is_auto_created = TRUE THEN 1 END) as auto_created_contacts,
          COUNT(CASE WHEN c.is_auto_created = FALSE THEN 1 END) as manually_created_contacts
        FROM contacts c
        LEFT JOIN calls ON c.id = calls.contact_id
        WHERE c.user_id = $1
      `;
      
      const result = await ContactModel.query(statsQuery, [userId]);
      const stats = result.rows[0];
      
      return {
        totalContacts: parseInt(stats.total_contacts),
        recentContacts: parseInt(stats.recent_contacts),
        contactsWithCalls: parseInt(stats.contacts_with_calls),
        autoCreatedContacts: parseInt(stats.auto_created_contacts),
        manuallyCreatedContacts: parseInt(stats.manually_created_contacts)
      };
    } catch (error) {
      logger.error('Error getting contact stats:', error);
      throw new Error('Failed to retrieve contact statistics');
    }
  }

  /**
   * Normalize phone number format to [ISD code] [space] [rest of the number]
   * Takes last 10 digits as number and other digits at front as ISD codes
   * 
   * Note: Made public to allow external services (webhooks) to normalize phone numbers
   *       before checking for existing contacts
   */
  static normalizePhoneNumber(phoneNumber: string): string {
    // Trim whitespace
    const trimmed = phoneNumber.trim();
    
    // Check if user explicitly provided a country code with + prefix
    const hasExplicitCountryCode = trimmed.startsWith('+');
    
    // Remove all non-digit characters except + for initial parsing
    const cleaned = trimmed.replace(/[^\d+]/g, '');
    
    // Remove leading + to work with digits only
    const digitsOnly = cleaned.replace(/^\+/, '');
    
    // Basic validation - should have at least 7 digits for international numbers
    // (Some countries like Singapore have 8-digit numbers)
    if (digitsOnly.length < 7) {
      throw new Error('Invalid phone number format');
    }
    
    let mainNumber: string;
    let isdCode: string;
    
    // If user explicitly provided + prefix, extract country code from the number
    if (hasExplicitCountryCode) {
      // User provided explicit country code - respect it
      // Country codes are 1-3 digits, most common are 1-2 digits
      // Try to match known country code patterns
      
      // 1-digit country codes: 1 (US/Canada)
      // 2-digit country codes: 91 (India), 65 (Singapore), 60 (Malaysia), etc.
      // 3-digit country codes: 971 (UAE), 966 (Saudi), etc.
      
      if (digitsOnly.startsWith('1') && digitsOnly.length >= 11) {
        // US/Canada: +1 followed by 10 digits
        isdCode = '1';
        mainNumber = digitsOnly.substring(1);
      } else if (digitsOnly.length >= 9) {
        // Try to detect 2-digit country codes for shorter local numbers
        const twoDigitCC = digitsOnly.substring(0, 2);
        const threeDigitCC = digitsOnly.substring(0, 3);
        
        // Common 3-digit country codes
        const threeDigitCodes = ['971', '966', '965', '968', '974', '973', '972', '353', '354', '358'];
        
        // Common 2-digit country codes (Asia-Pacific, Europe, etc.)
        const twoDigitCodes = [
          '91', '92', '93', '94', '95', '98', // South Asia
          '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86', // Asia-Pacific
          '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49', // Europe/Africa
          '51', '52', '53', '54', '55', '56', '57', '58', // Americas
          '70', '71', '72', '73', '74', '75', '76', '77', '78', '79', '80', // CIS/Eastern Europe
        ];
        
        if (threeDigitCodes.includes(threeDigitCC) && digitsOnly.length >= 10) {
          isdCode = threeDigitCC;
          mainNumber = digitsOnly.substring(3);
        } else if (twoDigitCodes.includes(twoDigitCC)) {
          isdCode = twoDigitCC;
          mainNumber = digitsOnly.substring(2);
        } else {
          // Unknown country code pattern - take first 2 digits as country code
          isdCode = twoDigitCC;
          mainNumber = digitsOnly.substring(2);
        }
      } else {
        // Very short number with + prefix - take first 1-2 as country code
        if (digitsOnly.length <= 8) {
          isdCode = digitsOnly.substring(0, 1);
          mainNumber = digitsOnly.substring(1);
        } else {
          isdCode = digitsOnly.substring(0, 2);
          mainNumber = digitsOnly.substring(2);
        }
      }
    } else {
      // No explicit + prefix - apply default logic based on length
      // Handle different phone number lengths:
      // - 7-9 digits: Assume local number, default to +91 (India)
      // - 10 digits: Indian number without code
      // - 11+ digits: Has country code included
      
      if (digitsOnly.length <= 10) {
        // Local number without country code - default to India (+91)
        isdCode = '91';
        mainNumber = digitsOnly;
      } else if (digitsOnly.length === 11) {
        // 11 digits - first digit is likely country code (e.g., 1 for US)
        isdCode = digitsOnly.substring(0, 1);
        mainNumber = digitsOnly.substring(1);
      } else if (digitsOnly.length === 12) {
        // 12 digits - first 2 digits likely country code (e.g., 91 for India)
        isdCode = digitsOnly.substring(0, 2);
        mainNumber = digitsOnly.substring(2);
      } else {
        // 13+ digits - first 2-3 digits could be country code
        isdCode = digitsOnly.substring(0, 2);
        mainNumber = digitsOnly.substring(2);
      }
    }
    
    // Return formatted as +[ISD] [main number]
    return `+${isdCode} ${mainNumber}`;
  }

  /**
   * Validate phone number format
   */
  static validatePhoneNumber(phoneNumber: string): boolean {
    try {
      this.normalizePhoneNumber(phoneNumber);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Process Excel bulk upload with async batching for large datasets
   */
  static async processContactUpload(
    userId: string, 
    fileBuffer: Buffer, 
    filename: string
  ): Promise<{
    success: number;
    failed: number;
    duplicates: number;
    errors: Array<{ row: number; error: string; data?: any }>;
    totalProcessed: number;
  }> {
    try {
      logger.info(`Processing contact upload for user ${userId}:`, { filename });

      // Parse Excel file
      const contacts = this.parseExcelFile(fileBuffer, filename);
      
      // Validate contact limit using configuration
      const maxContacts = configService.get('max_contacts_per_upload');
      if (contacts.length > maxContacts) {
        throw new Error(`Maximum ${maxContacts} contacts allowed per upload`);
      }

      // Process contacts efficiently with bulk insert
      const BATCH_SIZE = 1000; // Bulk insert 1000 contacts at a time
      const results = {
        success: 0,
        failed: 0,
        duplicates: 0,
        errors: [] as Array<{ row: number; error: string; data?: any }>,
        totalProcessed: contacts.length
      };

      // Get existing phone numbers for this user to check duplicates
      const existingPhones = await this.getExistingPhoneNumbers(userId);
      const processedPhones = new Set<string>();

      // Validate and prepare contacts for bulk insert
      const validContacts: Array<{
        data: any;
        rowNumber: number;
      }> = [];

      contacts.forEach((contact, index) => {
        const rowNumber = index + 2; // Excel row number (accounting for header)

        try {
          // Only phone_number is required - name is optional
          if (!contact.phone_number || !contact.phone_number.trim()) {
            results.failed++;
            results.errors.push({
              row: rowNumber,
              error: 'Phone number is required',
              data: contact
            });
            return;
          }

          // Normalize and validate phone number
          let normalizedPhone: string;
          try {
            normalizedPhone = this.normalizePhoneNumber(contact.phone_number);
          } catch (error) {
            results.failed++;
            results.errors.push({
              row: rowNumber,
              error: 'Invalid phone number format',
              data: contact
            });
            return;
          }

          // Check for duplicates in existing data
          if (existingPhones.has(normalizedPhone)) {
            results.duplicates++;
            results.errors.push({
              row: rowNumber,
              error: 'Phone number already exists in your contacts',
              data: contact
            });
            return;
          }

          // Check for duplicates within the upload file
          if (processedPhones.has(normalizedPhone)) {
            results.duplicates++;
            results.errors.push({
              row: rowNumber,
              error: 'Duplicate phone number in upload file',
              data: contact
            });
            return;
          }

          // Auto-generate name if not provided
          const contactName = contact.name?.trim() || `Anonymous ${normalizedPhone}`;

          // Parse tags if provided (comma-separated string to array)
          let tagsArray: string[] = [];
          if (contact.tags && typeof contact.tags === 'string') {
            tagsArray = contact.tags
              .split(',')
              .map(tag => tag.trim())
              .filter(tag => tag.length > 0);
          }

          // Add to valid contacts for bulk insert
          validContacts.push({
            data: {
              user_id: userId,
              name: contactName,
              phone_number: normalizedPhone,
              email: contact.email?.trim() || undefined,
              company: contact.company?.trim() || undefined,
              notes: contact.notes?.trim() || undefined,
              city: contact.city?.trim() || undefined,
              country: contact.country?.trim() || undefined,
              business_context: contact.business_context?.trim() || undefined,
              is_auto_created: false,
              auto_creation_source: 'bulk_upload' as const,
              tags: tagsArray,
              call_attempted_busy: 0,
              call_attempted_no_answer: 0
            },
            rowNumber
          });

          processedPhones.add(normalizedPhone);

        } catch (error) {
          logger.error(`Error validating contact at row ${rowNumber}:`, error);
          results.failed++;
          results.errors.push({
            row: rowNumber,
            error: error instanceof Error ? error.message : 'Unknown error',
            data: contact
          });
        }
      });

      // Bulk insert valid contacts in batches
      for (let batchStart = 0; batchStart < validContacts.length; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, validContacts.length);
        const batch = validContacts.slice(batchStart, batchEnd);
        
        try {
          const contactsData = batch.map(c => c.data);
          const insertedCount = await ContactModel.bulkCreateContacts(contactsData);
          results.success += insertedCount;
          
          logger.info(`Bulk inserted batch ${batchStart / BATCH_SIZE + 1}: ${insertedCount} contacts`);
        } catch (error) {
          logger.error(`Error bulk inserting batch starting at ${batchStart}:`, error);
          
          // If bulk insert fails, mark all in batch as failed
          batch.forEach(contact => {
            results.failed++;
            results.errors.push({
              row: contact.rowNumber,
              error: 'Bulk insert failed',
              data: contact.data
            });
          });
        }
      }

      logger.info(`Contact upload completed for user ${userId}:`, results);
      return results;

    } catch (error) {
      logger.error('Error processing contact upload:', error);
      throw error;
    }
  }

  /**
   * Parse Excel file and extract contact data
   */
  private static parseExcelFile(fileBuffer: Buffer, filename: string): Array<{
    name: string;
    phone_number: string;
    email?: string;
    company?: string;
    notes?: string;
    tags?: string;
    city?: string;
    country?: string;
    business_context?: string;
  }> {
    try {
      // Validate buffer
      if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
        throw new Error('Invalid file buffer received');
      }

      if (fileBuffer.length === 0) {
        throw new Error('Empty file received');
      }

      // Log buffer info for debugging
      logger.info('Parsing Excel file', {
        filename,
        bufferSize: fileBuffer.length,
        bufferStart: fileBuffer.slice(0, 10).toString('hex')
      });

      // Determine file type by extension; CSV won't match Excel signatures
      const lowerName = (filename || '').toLowerCase();
      const isCsv = lowerName.endsWith('.csv');

      if (!isCsv) {
        // Check if buffer starts with valid Excel signatures for xlsx/xls
        const signature = fileBuffer.slice(0, 4).toString('hex');
        const isValidExcel = signature === '504b0304' || // ZIP signature (XLSX)
                             signature.startsWith('d0cf11e0'); // OLE signature (XLS)

        if (!isValidExcel) {
          logger.error('Invalid Excel file signature', { signature, filename });
          throw new Error('Invalid Excel file format. Please ensure you are uploading a valid .xlsx or .xls file.');
        }
      }

      // Let XLSX detect file format (works for CSV/XLSX/XLS) and prefer text values
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      
      if (!sheetName) {
        throw new Error('No sheets found in the Excel file');
      }

  const worksheet = workbook.Sheets[sheetName];
  // raw:false returns formatted text (avoids scientific notation like 9.19E+11)
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }) as any[][];

      if (jsonData.length < 2) {
        throw new Error('Excel file must contain at least a header row and one data row');
      }

      // Get header row and normalize column names
      const headers = jsonData[0].map((header: string) => 
        header?.toString().toLowerCase().trim().replace(/\s+/g, '_')
      );

      // Find required column indices
      const nameIndex = this.findColumnIndex(headers, ['name', 'full_name', 'contact_name']);
  const phoneIndex = this.findColumnIndex(headers, ['phone', 'phone_number', 'mobile', 'cell', 'phonenumber']);

      if (nameIndex === -1) {
        throw new Error('Name column not found. Expected columns: name, full_name, or contact_name');
      }

      if (phoneIndex === -1) {
        throw new Error('Phone column not found. Expected columns: phone, phone_number, mobile, or cell');
      }

      // Find optional column indices
      const emailIndex = this.findColumnIndex(headers, ['email', 'email_address']);
      const companyIndex = this.findColumnIndex(headers, ['company', 'organization', 'business']);
      const notesIndex = this.findColumnIndex(headers, ['notes', 'comments', 'description']);
      const tagsIndex = this.findColumnIndex(headers, ['tags', 'tag', 'labels', 'categories']);
      const cityIndex = this.findColumnIndex(headers, ['city', 'town', 'location_city']);
      const countryIndex = this.findColumnIndex(headers, ['country', 'nation', 'location_country']);
      const businessContextIndex = this.findColumnIndex(headers, ['business_context', 'businesscontext', 'industry', 'sector', 'business_description']);

      // Process data rows
      const contacts = [];
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        
        // Skip completely empty rows (undefined, null, or all empty cells)
        if (!row || row.length === 0) {
          continue;
        }
        
        // Skip rows where all cells are empty strings or whitespace
        const hasContent = row.some(cell => cell && cell.toString().trim() !== '');
        if (!hasContent) {
          continue;
        }

        // Coerce values to strings safely and strip formatting
        const rawName = row[nameIndex];
        const rawPhone = row[phoneIndex];
        const toCleanString = (v: any) => (v === undefined || v === null || v === '') ? '' : v.toString().trim();

        const phoneStr = toCleanString(rawPhone);

        // Avoid scientific notation by relying on raw:false above,
        // but add a fallback normalization just in case
        const cleanPhone = phoneStr
          .replace(/\s+/g, '') // remove internal spaces
          .replace(/[\u200B-\u200D\uFEFF]/g, ''); // zero-width chars

        // Skip rows where phone number is empty or doesn't contain any digits
        if (!cleanPhone || cleanPhone === '' || !/\d/.test(cleanPhone)) {
          continue;
        }

        // Skip rows where phone number is clearly not a phone number (e.g., contains only text)
        const digitCount = (cleanPhone.match(/\d/g) || []).length;
        if (digitCount < 10) {
          continue;
        }

        const contact = {
          name: toCleanString(rawName),
          phone_number: cleanPhone,
          email: emailIndex !== -1 ? row[emailIndex]?.toString().trim() : undefined,
          company: companyIndex !== -1 ? row[companyIndex]?.toString().trim() : undefined,
          notes: notesIndex !== -1 ? row[notesIndex]?.toString().trim() : undefined,
          tags: tagsIndex !== -1 ? row[tagsIndex]?.toString().trim() : undefined,
          city: cityIndex !== -1 ? row[cityIndex]?.toString().trim() : undefined,
          country: countryIndex !== -1 ? row[countryIndex]?.toString().trim() : undefined,
          business_context: businessContextIndex !== -1 ? row[businessContextIndex]?.toString().trim() : undefined
        };

        // Remove empty optional fields
        if (!contact.email) delete contact.email;
        if (!contact.company) delete contact.company;
        if (!contact.notes) delete contact.notes;
        if (!contact.tags) delete contact.tags;
        if (!contact.city) delete contact.city;
        if (!contact.country) delete contact.country;
        if (!contact.business_context) delete contact.business_context;

        contacts.push(contact);
      }

      return contacts;

    } catch (error) {
      logger.error('Error parsing Excel file:', error);
      
      // Provide more specific error messages
      if (error instanceof Error) {
        if (error.message.includes('Invalid HTML') || error.message.includes('could not find')) {
          throw new Error('Invalid Excel file format. The file appears to be corrupted or in an unsupported format. Please ensure you are uploading a valid .xlsx or .xls file.');
        }
        if (error.message.includes('Invalid file buffer') || error.message.includes('Empty file')) {
          throw new Error(error.message);
        }
        if (error.message.includes('Invalid Excel file signature')) {
          throw new Error(error.message);
        }
        throw new Error(`Failed to parse Excel file: ${error.message}`);
      }
      
      throw new Error('Failed to parse Excel file: Unknown error');
    }
  }

  /**
   * Find column index by possible column names
   */
  private static findColumnIndex(headers: string[], possibleNames: string[]): number {
    for (const name of possibleNames) {
      const index = headers.findIndex(header => header === name);
      if (index !== -1) {
        return index;
      }
    }
    return -1;
  }

  /**
   * Get existing phone numbers for a user
   */
  private static async getExistingPhoneNumbers(userId: string): Promise<Set<string>> {
    try {
      const result = await ContactModel.query(
        'SELECT phone_number FROM contacts WHERE user_id = $1',
        [userId]
      );
      
      return new Set(result.rows.map((row: any) => row.phone_number));
    } catch (error) {
      logger.error('Error getting existing phone numbers:', error);
      throw new Error('Failed to check existing contacts');
    }
  }

  /**
   * Generate Excel template for contact upload
   */
  static async generateExcelTemplate(): Promise<Buffer> {
    try {
      // Create workbook using ExcelJS for proper cell formatting
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Contacts');

      // Set column headers and formats
      worksheet.columns = [
        { header: 'name', key: 'name', width: 20 },
        { header: 'phone_number', key: 'phone_number', width: 20, style: { numFmt: '@' } }, // TEXT format
        { header: 'email', key: 'email', width: 25 },
        { header: 'company', key: 'company', width: 20 },
        { header: 'city', key: 'city', width: 15 },
        { header: 'country', key: 'country', width: 15 },
        { header: 'business_context', key: 'business_context', width: 30 },
        { header: 'notes', key: 'notes', width: 30 },
        { header: 'tags', key: 'tags', width: 25 }
      ];

      // Format the phone_number column (column B) as TEXT to prevent Excel auto-conversion
      worksheet.getColumn(2).numFmt = '@';

      // Add sample data rows
      worksheet.addRow({
        name: 'John Doe',
        phone_number: '+919876543210',
        email: 'john@example.com',
        company: 'Example Corp',
        city: 'Mumbai',
        country: 'India',
        business_context: 'Technology / SaaS',
        notes: 'Sample contact',
        tags: 'potential,hot-lead'
      });

      worksheet.addRow({
        name: 'Jane Smith',
        phone_number: '+12025551234',
        email: 'jane@company.com',
        company: 'Tech Solutions',
        city: 'New York',
        country: 'USA',
        business_context: 'Finance / Banking',
        notes: 'Important client',
        tags: 'enterprise,qualified'
      });
      
      worksheet.addRow({
        name: 'Ali Ahmed',
        phone_number: '+971501234567',
        email: 'ali@business.ae',
        company: 'Dubai Trading Co',
        city: 'Dubai',
        country: 'UAE',
        business_context: 'Trading / Import-Export',
        notes: 'Priority customer',
        tags: 'vip,callback'
      });

      // Add empty row for separation
      worksheet.addRow({});

      // Add simple instruction rows without colors
      worksheet.addRow({
        name: 'DELETE ROWS 2-15 BEFORE UPLOADING',
        phone_number: 'INSTRUCTIONS BELOW',
        email: '',
        company: '',
        city: '',
        country: '',
        business_context: '',
        notes: '',
        tags: ''
      });

      worksheet.addRow({
        name: '1. Phone MUST start with +',
        phone_number: 'Example: +919876543210',
        email: '(with country code)',
        company: '',
        city: '',
        country: '',
        business_context: '',
        notes: '',
        tags: ''
      });

      worksheet.addRow({
        name: '2. Only phone is required',
        phone_number: 'Name auto-generated if empty',
        email: 'Email optional',
        company: 'Company optional',
        city: 'City optional',
        country: 'Country optional',
        business_context: 'Business Context optional',
        notes: 'Notes optional',
        tags: 'Tags optional'
      });

      worksheet.addRow({
        name: '3. Tags format',
        phone_number: 'comma-separated, no spaces',
        email: 'Example: hot,vip,callback',
        company: '',
        city: '',
        country: '',
        business_context: '',
        notes: '',
        tags: 'potential,qualified'
      });

      worksheet.addRow({
        name: '4. Delete sample data',
        phone_number: 'Delete rows 2-15',
        email: 'Keep only header (row 1)',
        company: 'Add your contacts',
        city: '',
        country: '',
        business_context: '',
        notes: '',
        tags: ''
      });

      worksheet.addRow({
        name: '5. Supported formats',
        phone_number: '+91 (India)',
        email: '+1 (USA)',
        company: '+971 (UAE)',
        city: '',
        country: '',
        business_context: '',
        notes: '+44 (UK)',
        tags: ''
      });

      worksheet.addRow({
        name: 'WARNING: DELETE THIS & ABOVE ROWS',
        phone_number: 'Keep only header + your data',
        email: '',
        company: '',
        city: '',
        country: '',
        business_context: '',
        notes: '',
        tags: ''
      });

      // Write workbook to buffer
      const buffer = await workbook.xlsx.writeBuffer();
      return Buffer.from(buffer);
    } catch (error) {
      logger.error('Error generating Excel template:', error);
      throw new Error('Failed to generate Excel template');
    }
  }

  /**
   * Get contacts with quality badges for pipeline view
   * Optimized payload - returns only fields needed for display:
   * name, lead_status, source, email, phone, company, last_updated, tags
   */
  static async getContactsWithQuality(
    userId: string, 
    options: { search?: string } = {}
  ): Promise<{ 
    contacts: Array<{
      id: string;
      name: string;
      phoneNumber: string;
      email: string | null;
      company: string | null;
      leadStage: string | null;
      leadStageUpdatedAt: string | null;
      autoCreationSource: string | null;
      tags: string[];
      updatedAt: string;
      qualityBadge: 'Hot' | 'Warm' | 'Cold' | null;
      totalScore: number | null;
    }>; 
    total: number 
  }> {
    try {
      const { search } = options;

      // Query contacts with only required fields for pipeline view
      // Optimized payload: ~80% smaller than full contact object
      const query = `
        SELECT 
          c.id,
          c.name,
          c.phone_number,
          c.email,
          c.company,
          c.lead_stage,
          c.lead_stage_updated_at,
          c.auto_creation_source,
          c.tags,
          c.updated_at,
          -- Quality badge from complete analysis (aggregated across all calls)
          COALESCE(
            (SELECT la.lead_status_tag 
             FROM lead_analytics la
             JOIN calls cl ON la.call_id = cl.id
             WHERE cl.contact_id = c.id 
               AND la.user_id = $1
               AND la.analysis_type = 'complete'
             ORDER BY la.analysis_timestamp DESC
             LIMIT 1),
            -- Fallback to individual analysis if no complete analysis exists
            (SELECT la.lead_status_tag 
             FROM lead_analytics la
             JOIN calls cl ON la.call_id = cl.id
             WHERE cl.contact_id = c.id 
               AND la.user_id = $1
               AND la.analysis_type = 'individual'
             ORDER BY la.created_at DESC
             LIMIT 1)
          ) as quality_badge,
          -- Total score for sorting/display
          COALESCE(
            (SELECT la.total_score 
             FROM lead_analytics la
             JOIN calls cl ON la.call_id = cl.id
             WHERE cl.contact_id = c.id 
               AND la.user_id = $1
             ORDER BY la.analysis_timestamp DESC, la.created_at DESC
             LIMIT 1),
            0
          ) as total_score
        FROM contacts c
        WHERE c.user_id = $1
        ${search ? `AND (
          c.name ILIKE $2 
          OR c.phone_number LIKE $2 
          OR c.email ILIKE $2 
          OR c.company ILIKE $2
          OR EXISTS (SELECT 1 FROM unnest(c.tags) tag WHERE tag ILIKE $2)
        )` : ''}
        ORDER BY 
          CASE c.lead_stage
            WHEN 'New Lead' THEN 1
            WHEN 'Contacted' THEN 2
            WHEN 'Qualified' THEN 3
            WHEN 'Proposal Sent' THEN 4
            WHEN 'Negotiation' THEN 5
            WHEN 'Won' THEN 6
            WHEN 'Lost' THEN 7
            ELSE 8
          END,
          c.lead_stage_updated_at DESC NULLS LAST,
          c.created_at DESC
      `;

      const params = search ? [userId, `%${search}%`] : [userId];
      const result = await ContactModel.query(query, params);
      
      // Map to camelCase for frontend with only required fields
      const contacts = result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        phoneNumber: row.phone_number,
        email: row.email || null,
        company: row.company || null,
        leadStage: row.lead_stage || null,
        leadStageUpdatedAt: row.lead_stage_updated_at ? new Date(row.lead_stage_updated_at).toISOString() : null,
        autoCreationSource: row.auto_creation_source || null,
        tags: row.tags || [],
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
        qualityBadge: this.normalizeQualityBadge(row.quality_badge),
        totalScore: row.total_score ? parseInt(row.total_score) : null
      }));

      return { 
        contacts, 
        total: contacts.length 
      };
    } catch (error) {
      logger.error('Error getting contacts with quality:', error);
      throw new Error('Failed to retrieve pipeline contacts');
    }
  }

  /**
   * Normalize quality badge to Hot/Warm/Cold
   */
  private static normalizeQualityBadge(badge: string | null): 'Hot' | 'Warm' | 'Cold' | null {
    if (!badge) return null;
    const lower = badge.toLowerCase();
    if (lower.includes('hot')) return 'Hot';
    if (lower.includes('warm')) return 'Warm';
    if (lower.includes('cold')) return 'Cold';
    return null;
  }

  /**
   * Get all distinct filter options for a user's contacts
   * This queries all unique values for filterable columns across ALL contacts
   */
  static async getFilterOptions(userId: string): Promise<{
    tags: string[];
    lastStatus: string[];
    callType: string[];
    source: string[];
    city: string[];
    country: string[];
    leadStage: string[];
  }> {
    try {
      // Query all distinct values in a single query for efficiency
      const query = `
        WITH contact_data AS (
          SELECT 
            c.id,
            c.tags,
            c.auto_creation_source,
            c.is_auto_created,
            c.city,
            c.country,
            c.lead_stage,
            CASE 
              WHEN (SELECT COUNT(*) FROM calls WHERE contact_id = c.id) = 0 THEN 'Not contacted'
              WHEN (SELECT lead_type FROM calls WHERE contact_id = c.id ORDER BY created_at DESC LIMIT 1) = 'inbound'
                AND (c.call_attempted_busy > 0 OR c.call_attempted_no_answer > 0)
                THEN 'Callback Received'
              ELSE COALESCE(
                (SELECT call_lifecycle_status FROM calls WHERE (contact_id = c.id OR phone_number = c.phone_number) ORDER BY created_at DESC LIMIT 1),
                'Not contacted'
              )
            END as last_call_status,
            COALESCE(
              (SELECT lead_type FROM calls WHERE contact_id = c.id ORDER BY created_at DESC LIMIT 1),
              'outbound'
            ) as call_type
          FROM contacts c
          WHERE c.user_id = $1
        )
        SELECT 
          COALESCE(array_agg(DISTINCT unnested_tag) FILTER (WHERE unnested_tag IS NOT NULL), '{}') as tags,
          COALESCE(array_agg(DISTINCT last_call_status) FILTER (WHERE last_call_status IS NOT NULL), '{}') as statuses,
          COALESCE(array_agg(DISTINCT call_type) FILTER (WHERE call_type IS NOT NULL), '{}') as call_types,
          COALESCE(array_agg(DISTINCT COALESCE(auto_creation_source, CASE WHEN is_auto_created THEN 'webhook' ELSE 'manual' END)) FILTER (WHERE COALESCE(auto_creation_source, CASE WHEN is_auto_created THEN 'webhook' ELSE 'manual' END) IS NOT NULL), '{}') as sources,
          COALESCE(array_agg(DISTINCT city) FILTER (WHERE city IS NOT NULL AND city != ''), '{}') as cities,
          COALESCE(array_agg(DISTINCT country) FILTER (WHERE country IS NOT NULL AND country != ''), '{}') as countries,
          COALESCE(array_agg(DISTINCT lead_stage) FILTER (WHERE lead_stage IS NOT NULL), '{}') as lead_stages
        FROM contact_data
        LEFT JOIN LATERAL unnest(tags) AS unnested_tag ON true
      `;

      const result = await ContactModel.query(query, [userId]);
      const row = result.rows[0] || {};

      return {
        tags: (row.tags || []).filter(Boolean).sort(),
        lastStatus: (row.statuses || []).filter(Boolean).sort(),
        callType: (row.call_types || []).filter(Boolean).sort(),
        source: (row.sources || []).filter(Boolean).sort(),
        city: (row.cities || []).filter(Boolean).sort(),
        country: (row.countries || []).filter(Boolean).sort(),
        leadStage: (row.lead_stages || []).filter(Boolean).sort()
      };
    } catch (error) {
      logger.error('Error getting filter options:', error);
      throw new Error('Failed to retrieve filter options');
    }
  }
}