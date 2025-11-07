import ContactModel, { ContactInterface, CreateContactData, UpdateContactData } from '../models/Contact';
import { logger } from '../utils/logger';
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
      const { search, limit = 50, offset = 0, sortBy = 'name', sortOrder = 'asc' } = options;

      let contacts: ContactInterface[];
      let total: number;

      if (search) {
        // Enhanced search with auto-creation info
        const query = `
          SELECT c.*, 
            calls.bolna_execution_id as linked_call_id,
            CASE 
              WHEN c.auto_created_from_call_id IS NOT NULL THEN 'auto_created'
              WHEN EXISTS(SELECT 1 FROM calls WHERE contact_id = c.id) THEN 'manually_linked'
              ELSE 'not_linked'
            END as call_link_type
          FROM contacts c
          LEFT JOIN calls ON c.auto_created_from_call_id = calls.id
          WHERE c.user_id = $1 
          AND (c.name ILIKE $2 OR c.phone_number LIKE $3 OR c.email ILIKE $2 OR c.company ILIKE $2)
          ORDER BY c.name
        `;
        const result = await ContactModel.query(query, [userId, `%${search}%`, `%${search}%`]);
        contacts = result.rows;
        total = contacts.length;
        
        // Apply pagination to search results
        contacts = contacts.slice(offset, offset + limit);
      } else {
        // Get all contacts with pagination, sorting, and auto-creation info
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
            END as call_link_type
          FROM contacts c
          LEFT JOIN calls ON c.auto_created_from_call_id = calls.id
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
   */
  private static normalizePhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters except +
    const cleaned = phoneNumber.replace(/[^\d+]/g, '');
    
    // Remove leading + to work with digits only
    const digitsOnly = cleaned.replace(/^\+/, '');
    
    // Basic validation - should have at least 10 digits
    if (digitsOnly.length < 10) {
      throw new Error('Invalid phone number format');
    }
    
    // Take last 10 digits as the main number
    const mainNumber = digitsOnly.slice(-10);
    
    // Take everything before the last 10 digits as ISD code
    const isdCode = digitsOnly.slice(0, -10);
    
    // If no ISD code found, default to +91 (India)
    const finalIsdCode = isdCode || '91';
    
    // Return formatted as +[ISD] [main number]
    return `+${finalIsdCode} ${mainNumber}`;
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
      
      // Validate contact limit - increased to 10,000
      if (contacts.length > 10000) {
        throw new Error('Maximum 10,000 contacts allowed per upload');
      }

      // Process contacts in batches for efficiency
      const BATCH_SIZE = 100; // Process 100 contacts at a time
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

      // Process in batches for better performance
      for (let batchStart = 0; batchStart < contacts.length; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, contacts.length);
        const batch = contacts.slice(batchStart, batchEnd);
        
        // Process batch concurrently with Promise.allSettled for error isolation
        const batchPromises = batch.map(async (contact, batchIndex) => {
          const i = batchStart + batchIndex;
          const rowNumber = i + 2; // Excel row number (accounting for header)

          try {
            // Only phone_number is required - name is optional
            if (!contact.phone_number || !contact.phone_number.trim()) {
              return {
                success: false,
                type: 'failed',
                row: rowNumber,
                error: 'Phone number is required',
                data: contact
              };
            }

            // Normalize and validate phone number
            let normalizedPhone: string;
            try {
              normalizedPhone = this.normalizePhoneNumber(contact.phone_number);
            } catch (error) {
              return {
                success: false,
                type: 'failed',
                row: rowNumber,
                error: 'Invalid phone number format',
                data: contact
              };
            }

            // Check for duplicates in existing data
            if (existingPhones.has(normalizedPhone)) {
              return {
                success: false,
                type: 'duplicate',
                row: rowNumber,
                error: 'Phone number already exists in your contacts',
                data: contact
              };
            }

            // Check for duplicates within the upload file
            if (processedPhones.has(normalizedPhone)) {
              return {
                success: false,
                type: 'duplicate',
                row: rowNumber,
                error: 'Duplicate phone number in upload file',
                data: contact
              };
            }

            // Auto-generate name if not provided
            const contactName = contact.name?.trim() || `Anonymous ${normalizedPhone}`;

            // Create contact
            await ContactModel.createContact({
              user_id: userId,
              name: contactName,
              phone_number: normalizedPhone,
              email: contact.email?.trim() || undefined,
              company: contact.company?.trim() || undefined,
              notes: contact.notes?.trim() || undefined
            });

            processedPhones.add(normalizedPhone);
            return {
              success: true,
              type: 'success'
            };

          } catch (error) {
            logger.error(`Error processing contact at row ${rowNumber}:`, error);
            return {
              success: false,
              type: 'failed',
              row: rowNumber,
              error: error instanceof Error ? error.message : 'Unknown error',
              data: contact
            };
          }
        });

        // Wait for batch to complete
        const batchResults = await Promise.allSettled(batchPromises);
        
        // Aggregate results
        batchResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            const value = result.value;
            if (value.success) {
              results.success++;
            } else if (value.type === 'duplicate') {
              results.duplicates++;
              results.errors.push({
                row: value.row!,
                error: value.error!,
                data: value.data
              });
            } else {
              results.failed++;
              results.errors.push({
                row: value.row!,
                error: value.error!,
                data: value.data
              });
            }
          } else {
            results.failed++;
            results.errors.push({
              row: 0,
              error: result.reason?.message || 'Batch processing failed'
            });
          }
        });
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
          notes: notesIndex !== -1 ? row[notesIndex]?.toString().trim() : undefined
        };

        // Remove empty optional fields
        if (!contact.email) delete contact.email;
        if (!contact.company) delete contact.company;
        if (!contact.notes) delete contact.notes;

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
        { header: 'notes', key: 'notes', width: 30 }
      ];

      // Format the phone_number column (column B) as TEXT to prevent Excel auto-conversion
      worksheet.getColumn(2).numFmt = '@';

      // Add sample data rows
      worksheet.addRow({
        name: 'John Doe',
        phone_number: '+919876543210',
        email: 'john@example.com',
        company: 'Example Corp',
        notes: 'Sample contact'
      });

      worksheet.addRow({
        name: 'Jane Smith',
        phone_number: '+12025551234',
        email: 'jane@company.com',
        company: 'Tech Solutions',
        notes: 'Important client'
      });
      
      worksheet.addRow({
        name: 'Ali Ahmed',
        phone_number: '+971501234567',
        email: 'ali@business.ae',
        company: 'Dubai Trading Co',
        notes: 'Priority customer'
      });

      // Add empty row for separation
      worksheet.addRow({});

      // Add simple instruction rows without colors
      worksheet.addRow({
        name: 'DELETE ROWS 2-11 BEFORE UPLOADING',
        phone_number: 'INSTRUCTIONS BELOW',
        email: '',
        company: '',
        notes: ''
      });

      worksheet.addRow({
        name: '1. Phone MUST start with +',
        phone_number: 'Example: +919876543210',
        email: '(with country code)',
        company: '',
        notes: ''
      });

      worksheet.addRow({
        name: '2. Only phone is required',
        phone_number: 'Name auto-generated if empty',
        email: 'Email optional',
        company: 'Company optional',
        notes: 'Notes optional'
      });

      worksheet.addRow({
        name: '3. Delete sample data',
        phone_number: 'Delete rows 2-11',
        email: 'Keep only header (row 1)',
        company: 'Add your contacts',
        notes: ''
      });

      worksheet.addRow({
        name: '4. Supported formats',
        phone_number: '+91 (India)',
        email: '+1 (USA)',
        company: '+971 (UAE)',
        notes: '+44 (UK)'
      });

      worksheet.addRow({
        name: 'WARNING: DELETE THIS & ABOVE ROWS',
        phone_number: 'Keep only header + your data',
        email: '',
        company: '',
        notes: ''
      });

      // Write workbook to buffer
      const buffer = await workbook.xlsx.writeBuffer();
      return Buffer.from(buffer);
    } catch (error) {
      logger.error('Error generating Excel template:', error);
      throw new Error('Failed to generate Excel template');
    }
  }
}