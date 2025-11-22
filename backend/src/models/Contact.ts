import BaseModel, { BaseModelInterface } from './BaseModel';

// Contact model - defines contact data structure
export interface ContactInterface extends BaseModelInterface {
  id: string;
  user_id: string;
  name: string;
  phone_number: string;
  email?: string;
  company?: string;
  notes?: string;
  auto_created_from_call_id?: string;
  is_auto_created: boolean;
  auto_creation_source?: 'webhook' | 'manual' | 'bulk_upload';
  tags: string[];
  last_contact_at?: Date;
  call_attempted_busy: number;
  call_attempted_no_answer: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateContactData {
  user_id: string;
  name: string;
  phone_number: string;
  email?: string;
  company?: string;
  notes?: string;
  auto_created_from_call_id?: string;
  is_auto_created?: boolean;
  auto_creation_source?: 'webhook' | 'manual' | 'bulk_upload';
  tags?: string[];
  last_contact_at?: Date;
  call_attempted_busy?: number;
  call_attempted_no_answer?: number;
}

export interface UpdateContactData {
  name?: string;
  phone_number?: string;
  email?: string;
  company?: string;
  notes?: string;
  tags?: string[];
  auto_creation_source?: 'webhook' | 'manual' | 'bulk_upload';
  last_contact_at?: Date;
  call_attempted_busy?: number;
  call_attempted_no_answer?: number;
}

export class ContactModel extends BaseModel<ContactInterface> {
  constructor() {
    super('contacts');
  }

  /**
   * Find contact by phone number
   */
  async findByPhoneNumber(phoneNumber: string): Promise<ContactInterface | null> {
    return await this.findOne({ phone_number: phoneNumber });
  }

  /**
   * Find contacts by user ID
   */
  async findByUserId(userId: string): Promise<ContactInterface[]> {
    return await this.findBy({ user_id: userId });
  }

  /**
   * Create a new contact
   */
  async createContact(contactData: CreateContactData): Promise<ContactInterface> {
    // Ensure required fields have default values
    const normalizedData = {
      ...contactData,
      is_auto_created: contactData.is_auto_created ?? false,
      tags: contactData.tags ?? [],
      call_attempted_busy: contactData.call_attempted_busy ?? 0,
      call_attempted_no_answer: contactData.call_attempted_no_answer ?? 0,
    };
    return await this.create(normalizedData);
  }

  /**
   * Update contact
   */
  async updateContact(contactId: string, updateData: UpdateContactData): Promise<ContactInterface | null> {
    return await this.update(contactId, updateData);
  }

  /**
   * Search contacts by name or phone
   */
  async searchContacts(userId: string, searchTerm: string): Promise<ContactInterface[]> {
    const query = `
      SELECT * FROM contacts 
      WHERE user_id = $1 
      AND (name ILIKE $2 OR phone_number LIKE $3)
      ORDER BY name
    `;
    const result = await this.query(query, [userId, `%${searchTerm}%`, `%${searchTerm}%`]);
    return result.rows;
  }

  /**
   * Find auto-created contacts for a user
   */
  async findAutoCreatedContacts(userId: string): Promise<ContactInterface[]> {
    const query = `
      SELECT c.*, calls.bolna_conversation_id, calls.created_at as call_created_at
      FROM contacts c
      LEFT JOIN calls ON c.auto_created_from_call_id = calls.id
      WHERE c.user_id = $1 AND c.is_auto_created = TRUE
      ORDER BY c.created_at DESC
    `;
    const result = await this.query(query, [userId]);
    return result.rows;
  }

  /**
   * Find contacts linked to calls (either auto-created or manually linked)
   */
  async findContactsLinkedToCalls(userId: string): Promise<ContactInterface[]> {
    const query = `
      SELECT DISTINCT c.*, 
        CASE 
          WHEN c.auto_created_from_call_id IS NOT NULL THEN 'auto_created'
          WHEN EXISTS(SELECT 1 FROM calls WHERE contact_id = c.id) THEN 'manually_linked'
          ELSE 'not_linked'
        END as call_link_type
      FROM contacts c
      WHERE c.user_id = $1 
      AND (
        c.auto_created_from_call_id IS NOT NULL 
        OR EXISTS(SELECT 1 FROM calls WHERE contact_id = c.id)
      )
      ORDER BY c.created_at DESC
    `;
    const result = await this.query(query, [userId]);
    return result.rows;
  }

  /**
   * Bulk insert contacts - MUCH faster for large uploads
   * Uses PostgreSQL's COPY or multi-row INSERT for optimal performance
   */
  async bulkCreateContacts(contactsData: CreateContactData[]): Promise<number> {
    if (contactsData.length === 0) {
      return 0;
    }

    // Build a multi-row INSERT query
    // This is MUCH faster than individual INSERTs (100x+ faster for large batches)
    const values: any[] = [];
    const valuePlaceholders: string[] = [];
    
    contactsData.forEach((contact, index) => {
      const baseIndex = index * 12; // Updated from 8 to 12 for new fields
      valuePlaceholders.push(
        `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10}, $${baseIndex + 11}, $${baseIndex + 12})`
      );
      values.push(
        contact.user_id,
        contact.name,
        contact.phone_number,
        contact.email || null,
        contact.company || null,
        contact.notes || null,
        contact.is_auto_created ?? false,
        contact.auto_creation_source || null,
        contact.tags || [],
        contact.last_contact_at || null,
        contact.call_attempted_busy ?? 0,
        contact.call_attempted_no_answer ?? 0
      );
    });

    const query = `
      INSERT INTO contacts (
        user_id, name, phone_number, email, company, notes, is_auto_created, auto_creation_source,
        tags, last_contact_at, call_attempted_busy, call_attempted_no_answer
      ) VALUES ${valuePlaceholders.join(', ')}
      RETURNING id
    `;

    const result = await this.query(query, values);
    return result.rowCount || 0;
  }
}

export default new ContactModel();