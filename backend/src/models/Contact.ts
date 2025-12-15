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
  city?: string;
  country?: string;
  business_context?: string;
  auto_created_from_call_id?: string;
  is_auto_created: boolean;
  auto_creation_source?: 'webhook' | 'manual' | 'bulk_upload';
  lead_stage?: string; // Lead pipeline stage (default: 'New Lead')
  tags: string[];
  last_contact_at?: Date;
  call_attempted_busy: number;
  call_attempted_no_answer: number;
  call_attempted_failed: number;
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
  city?: string;
  country?: string;
  business_context?: string;
  auto_created_from_call_id?: string;
  is_auto_created?: boolean;
  auto_creation_source?: 'webhook' | 'manual' | 'bulk_upload';
  lead_stage?: string; // Lead pipeline stage (default: 'New Lead')
  tags?: string[];
  last_contact_at?: Date;
  call_attempted_busy?: number;
  call_attempted_no_answer?: number;
  call_attempted_failed?: number;
}

export interface UpdateContactData {
  name?: string;
  phone_number?: string;
  email?: string;
  company?: string;
  notes?: string;
  city?: string;
  country?: string;
  business_context?: string;
  lead_stage?: string | null; // Lead pipeline stage (can be null to clear)
  tags?: string[];
  auto_creation_source?: 'webhook' | 'manual' | 'bulk_upload';
  last_contact_at?: Date;
  call_attempted_busy?: number;
  call_attempted_no_answer?: number;
  call_attempted_failed?: number;
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
   * Find contact by user ID and phone number
   */
  async findByUserAndPhone(userId: string, phoneNumber: string): Promise<ContactInterface | null> {
    const result = await this.query(
      'SELECT * FROM contacts WHERE user_id = $1 AND phone_number = $2',
      [userId, phoneNumber]
    );
    return result.rows[0] || null;
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
      lead_stage: contactData.lead_stage ?? 'New Lead',
      tags: contactData.tags ?? [],
      call_attempted_busy: contactData.call_attempted_busy ?? 0,
      call_attempted_no_answer: contactData.call_attempted_no_answer ?? 0,
      call_attempted_failed: contactData.call_attempted_failed ?? 0,
    };
    return await this.create(normalizedData);
  }

  /**
   * Update contact
   */
  async updateContact(contactId: string, updateData: UpdateContactData): Promise<ContactInterface | null> {
    // Preserve explicit null so callers can clear lead_stage intentionally.
    // BaseModel typing doesn't model nullable columns, so we cast here.
    const normalizedData: Record<string, unknown> = { ...updateData };
    return await this.update(contactId, normalizedData as any);
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
      const baseIndex = index * 17; // Updated to 17 for lead_stage field
      valuePlaceholders.push(
        `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10}, $${baseIndex + 11}, $${baseIndex + 12}, $${baseIndex + 13}, $${baseIndex + 14}, $${baseIndex + 15}, $${baseIndex + 16}, $${baseIndex + 17})`
      );
      values.push(
        contact.user_id,
        contact.name,
        contact.phone_number,
        contact.email || null,
        contact.company || null,
        contact.notes || null,
        contact.city || null,
        contact.country || null,
        contact.business_context || null,
        contact.is_auto_created ?? false,
        contact.auto_creation_source || null,
        contact.lead_stage || 'New Lead',
        contact.tags || [],
        contact.last_contact_at || null,
        contact.call_attempted_busy ?? 0,
        contact.call_attempted_no_answer ?? 0,
        contact.call_attempted_failed ?? 0
      );
    });

    const query = `
      INSERT INTO contacts (
        user_id, name, phone_number, email, company, notes, city, country, business_context,
        is_auto_created, auto_creation_source, lead_stage, tags, last_contact_at, call_attempted_busy, call_attempted_no_answer, call_attempted_failed
      ) VALUES ${valuePlaceholders.join(', ')}
      RETURNING id
    `;

    const result = await this.query(query, values);
    return result.rowCount || 0;
  }
}

export default new ContactModel();