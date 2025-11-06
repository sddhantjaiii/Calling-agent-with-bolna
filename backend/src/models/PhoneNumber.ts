import BaseModel, { BaseModelInterface } from './BaseModel';

export interface PhoneNumberInterface extends BaseModelInterface {
  id: string;
  name: string;
  phone_number: string;
  assigned_to_agent_id: string | null;
  created_by_admin_id: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export class PhoneNumberModel extends BaseModel<PhoneNumberInterface> {
  constructor() {
    super('phone_numbers');
  }

  /**
   * Find phone number by agent ID
   */
  async findByAgentId(agentId: string): Promise<PhoneNumberInterface | null> {
    const result = await this.findOne({ 
      assigned_to_agent_id: agentId,
      is_active: true 
    });
    return result;
  }

  /**
   * Find phone number by phone number string
   */
  async findByPhoneNumber(phoneNumber: string): Promise<PhoneNumberInterface | null> {
    return await this.findOne({ phone_number: phoneNumber });
  }

  /**
   * Get all active phone numbers
   */
  async findActiveNumbers(): Promise<PhoneNumberInterface[]> {
    return await this.findBy({ is_active: true });
  }

  /**
   * Get all unassigned active phone numbers
   */
  async findUnassignedNumbers(): Promise<PhoneNumberInterface[]> {
    const query = `
      SELECT * FROM phone_numbers
      WHERE is_active = true 
      AND assigned_to_agent_id IS NULL
      ORDER BY created_at DESC
    `;
    const result = await this.query(query);
    return result.rows;
  }

  /**
   * Get all phone numbers with agent details
   */
  async findAllWithAgentDetails(): Promise<any[]> {
    const query = `
      SELECT 
        pn.*,
        a.name as agent_name,
        a.agent_type,
        a.is_active as agent_is_active,
        u.name as user_name,
        u.email as user_email,
        admin.name as created_by_admin_name,
        admin.email as created_by_admin_email
      FROM phone_numbers pn
      LEFT JOIN agents a ON pn.assigned_to_agent_id = a.id
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN users admin ON pn.created_by_admin_id = admin.id
      ORDER BY pn.created_at DESC
    `;
    const result = await this.query(query);
    return result.rows;
  }

  /**
   * Assign phone number to an agent
   */
  async assignToAgent(phoneNumberId: string, agentId: string): Promise<PhoneNumberInterface | null> {
    // First check if agent already has a phone number
    const existingAssignment = await this.findByAgentId(agentId);
    if (existingAssignment && existingAssignment.id !== phoneNumberId) {
      throw new Error('Agent already has a phone number assigned. Please unassign the existing number first.');
    }

    // Check if the phone number is already assigned to another agent
    const phoneNumber = await this.findById(phoneNumberId);
    if (!phoneNumber) {
      throw new Error('Phone number not found');
    }

    if (phoneNumber.assigned_to_agent_id && phoneNumber.assigned_to_agent_id !== agentId) {
      throw new Error('Phone number is already assigned to another agent');
    }

    return await this.update(phoneNumberId, { 
      assigned_to_agent_id: agentId 
    });
  }

  /**
   * Unassign phone number from an agent
   */
  async unassignFromAgent(phoneNumberId: string): Promise<PhoneNumberInterface | null> {
    return await this.update(phoneNumberId, { 
      assigned_to_agent_id: null 
    });
  }

  /**
   * Create a new phone number
   */
  async createPhoneNumber(data: {
    name: string;
    phone_number: string;
    created_by_admin_id: string;
    assigned_to_agent_id?: string;
  }): Promise<PhoneNumberInterface> {
    // Check if phone number already exists
    const existing = await this.findByPhoneNumber(data.phone_number);
    if (existing) {
      throw new Error('Phone number already exists in the system');
    }

    // If assigning to agent, validate the agent exists and doesn't have a number
    if (data.assigned_to_agent_id) {
      const existingAssignment = await this.findByAgentId(data.assigned_to_agent_id);
      if (existingAssignment) {
        throw new Error('Agent already has a phone number assigned');
      }
    }

    return await this.create({
      ...data,
      is_active: true
    });
  }

  /**
   * Deactivate a phone number
   */
  async deactivatePhoneNumber(phoneNumberId: string): Promise<PhoneNumberInterface | null> {
    return await this.update(phoneNumberId, { 
      is_active: false,
      assigned_to_agent_id: null // Unassign when deactivating
    });
  }

  /**
   * Activate a phone number
   */
  async activatePhoneNumber(phoneNumberId: string): Promise<PhoneNumberInterface | null> {
    return await this.update(phoneNumberId, { 
      is_active: true 
    });
  }

  /**
   * Update phone number details
   */
  async updatePhoneNumber(
    phoneNumberId: string, 
    data: Partial<Pick<PhoneNumberInterface, 'name' | 'phone_number'>>
  ): Promise<PhoneNumberInterface | null> {
    // If updating phone number, check it doesn't exist
    if (data.phone_number) {
      const existing = await this.findByPhoneNumber(data.phone_number);
      if (existing && existing.id !== phoneNumberId) {
        throw new Error('Phone number already exists in the system');
      }
    }

    return await this.update(phoneNumberId, data);
  }
}

export default new PhoneNumberModel();
