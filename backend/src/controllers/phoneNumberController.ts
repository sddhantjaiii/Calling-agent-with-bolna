import { Request, Response } from 'express';
import PhoneNumber from '../models/PhoneNumber';
import Agent from '../models/Agent';
import { logger } from '../utils/logger';
import { pool } from '../config/database';

/**
 * Phone Number Management Controller (Admin Only)
 * Handles CRUD operations for phone numbers and agent assignments
 */
export class PhoneNumberController {
  
  /**
   * GET /api/admin/phone-numbers
   * List all phone numbers with agent details
   */
  static async listPhoneNumbers(req: Request, res: Response): Promise<void> {
    try {
      const phoneNumbers = await PhoneNumber.findAllWithAgentDetails();
      
      res.json({
        success: true,
        data: phoneNumbers,
        count: phoneNumbers.length
      });
    } catch (error) {
      logger.error('Error listing phone numbers:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve phone numbers'
      });
    }
  }

  /**
   * GET /api/admin/phone-numbers/unassigned
   * List all unassigned active phone numbers
   */
  static async listUnassignedPhoneNumbers(req: Request, res: Response): Promise<void> {
    try {
      const phoneNumbers = await PhoneNumber.findUnassignedNumbers();
      
      res.json({
        success: true,
        data: phoneNumbers,
        count: phoneNumbers.length
      });
    } catch (error) {
      logger.error('Error listing unassigned phone numbers:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve unassigned phone numbers'
      });
    }
  }

  /**
   * GET /api/admin/phone-numbers/:id
   * Get a single phone number by ID
   */
  static async getPhoneNumber(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      const phoneNumber = await PhoneNumber.findById(id);
      
      if (!phoneNumber) {
        res.status(404).json({
          success: false,
          error: 'Phone number not found'
        });
        return;
      }

      res.json({
        success: true,
        data: phoneNumber
      });
    } catch (error) {
      logger.error('Error getting phone number:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve phone number'
      });
    }
  }

  /**
   * POST /api/admin/phone-numbers
   * Create a new phone number
   */
  static async createPhoneNumber(req: Request, res: Response): Promise<void> {
    try {
      const { name, phone_number, user_id, assigned_to_agent_id } = req.body;
      const adminId = (req.user as any)?.id;

      // Validation
      if (!name || !phone_number || !user_id) {
        res.status(400).json({
          success: false,
          error: 'Name, phone_number, and user_id are required'
        });
        return;
      }

      if (!adminId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
        return;
      }

      // Validate phone number format (E.164)
      const phoneRegex = /^\+[1-9]\d{1,14}$/;
      if (!phoneRegex.test(phone_number)) {
        res.status(400).json({
          success: false,
          error: 'Phone number must be in E.164 format (e.g., +19876543007)'
        });
        return;
      }

      // If assigning to agent, validate agent exists and belongs to the same user
      if (assigned_to_agent_id) {
        const agent = await Agent.findById(assigned_to_agent_id);
        if (!agent) {
          res.status(404).json({
            success: false,
            error: 'Agent not found'
          });
          return;
        }
        
        if (agent.user_id !== user_id) {
          res.status(400).json({
            success: false,
            error: 'Agent must belong to the same user'
          });
          return;
        }
      }

      // Validate user exists
      const userQuery = await pool.query(
        'SELECT id FROM users WHERE id = $1',
        [user_id]
      );
      
      if (userQuery.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      const phoneNumber = await PhoneNumber.createPhoneNumber({
        name,
        phone_number,
        user_id,
        created_by_admin_id: adminId,
        assigned_to_agent_id
      });

      logger.info(`Phone number created by admin ${adminId}: ${phoneNumber.id}`);

      res.status(201).json({
        success: true,
        data: phoneNumber,
        message: 'Phone number created successfully'
      });
    } catch (error: any) {
      logger.error('Error creating phone number:', error);
      
      if (error.message.includes('already exists')) {
        res.status(409).json({
          success: false,
          error: error.message
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to create phone number'
      });
    }
  }

  /**
   * PUT /api/admin/phone-numbers/:id
   * Update phone number details (name, phone_number)
   */
  static async updatePhoneNumber(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { name, phone_number } = req.body;

      // Check if phone number exists
      const existingPhoneNumber = await PhoneNumber.findById(id);
      if (!existingPhoneNumber) {
        res.status(404).json({
          success: false,
          error: 'Phone number not found'
        });
        return;
      }

      // Validate phone number format if provided
      if (phone_number) {
        const phoneRegex = /^\+[1-9]\d{1,14}$/;
        if (!phoneRegex.test(phone_number)) {
          res.status(400).json({
            success: false,
            error: 'Phone number must be in E.164 format (e.g., +19876543007)'
          });
          return;
        }
      }

      const updatedData: any = {};
      if (name !== undefined) updatedData.name = name;
      if (phone_number !== undefined) updatedData.phone_number = phone_number;

      if (Object.keys(updatedData).length === 0) {
        res.status(400).json({
          success: false,
          error: 'No valid fields to update'
        });
        return;
      }

      const updated = await PhoneNumber.updatePhoneNumber(id, updatedData);

      logger.info(`Phone number updated: ${id}`);

      res.json({
        success: true,
        data: updated,
        message: 'Phone number updated successfully'
      });
    } catch (error: any) {
      logger.error('Error updating phone number:', error);
      
      if (error.message.includes('already exists')) {
        res.status(409).json({
          success: false,
          error: error.message
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update phone number'
      });
    }
  }

  /**
   * POST /api/admin/phone-numbers/:id/assign
   * Assign phone number to an agent
   */
  static async assignToAgent(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { agent_id } = req.body;

      if (!agent_id) {
        res.status(400).json({
          success: false,
          error: 'agent_id is required'
        });
        return;
      }

      // Validate agent exists
      const agent = await Agent.findById(agent_id);
      if (!agent) {
        res.status(404).json({
          success: false,
          error: 'Agent not found'
        });
        return;
      }

      // Validate phone number exists
      const phoneNumber = await PhoneNumber.findById(id);
      if (!phoneNumber) {
        res.status(404).json({
          success: false,
          error: 'Phone number not found'
        });
        return;
      }

      // Validate agent belongs to same user as phone number
      if (agent.user_id !== phoneNumber.user_id) {
        res.status(400).json({
          success: false,
          error: 'Agent must belong to the same user as the phone number'
        });
        return;
      }

      const updated = await PhoneNumber.assignToAgent(id, agent_id);

      logger.info(`Phone number ${id} assigned to agent ${agent_id}`);

      res.json({
        success: true,
        data: updated,
        message: 'Phone number assigned to agent successfully'
      });
    } catch (error: any) {
      logger.error('Error assigning phone number to agent:', error);
      
      if (error.message.includes('already has')) {
        res.status(409).json({
          success: false,
          error: error.message
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to assign phone number'
      });
    }
  }

  /**
   * POST /api/admin/phone-numbers/:id/unassign
   * Unassign phone number from agent
   */
  static async unassignFromAgent(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Validate phone number exists
      const phoneNumber = await PhoneNumber.findById(id);
      if (!phoneNumber) {
        res.status(404).json({
          success: false,
          error: 'Phone number not found'
        });
        return;
      }

      if (!phoneNumber.assigned_to_agent_id) {
        res.status(400).json({
          success: false,
          error: 'Phone number is not assigned to any agent'
        });
        return;
      }

      const updated = await PhoneNumber.unassignFromAgent(id);

      logger.info(`Phone number ${id} unassigned from agent ${phoneNumber.assigned_to_agent_id}`);

      res.json({
        success: true,
        data: updated,
        message: 'Phone number unassigned from agent successfully'
      });
    } catch (error) {
      logger.error('Error unassigning phone number:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to unassign phone number'
      });
    }
  }

  /**
   * DELETE /api/admin/phone-numbers/:id
   * Delete (deactivate) a phone number
   */
  static async deletePhoneNumber(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Validate phone number exists
      const phoneNumber = await PhoneNumber.findById(id);
      if (!phoneNumber) {
        res.status(404).json({
          success: false,
          error: 'Phone number not found'
        });
        return;
      }

      const deleted = await PhoneNumber.deactivatePhoneNumber(id);

      logger.info(`Phone number deactivated: ${id}`);

      res.json({
        success: true,
        data: deleted,
        message: 'Phone number deactivated successfully'
      });
    } catch (error) {
      logger.error('Error deleting phone number:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete phone number'
      });
    }
  }

  /**
   * DELETE /api/admin/phone-numbers/:id/permanent
   * Permanently delete an inactive phone number from database
   */
  static async permanentlyDeletePhoneNumber(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Validate phone number exists
      const phoneNumber = await PhoneNumber.findById(id);
      if (!phoneNumber) {
        res.status(404).json({
          success: false,
          error: 'Phone number not found'
        });
        return;
      }

      // Only allow permanent deletion of inactive phone numbers
      if (phoneNumber.is_active) {
        res.status(400).json({
          success: false,
          error: 'Cannot permanently delete an active phone number. Please deactivate it first.'
        });
        return;
      }

      await PhoneNumber.permanentlyDeletePhoneNumber(id);

      logger.info(`Phone number permanently deleted: ${id}`);

      res.json({
        success: true,
        message: 'Phone number permanently deleted successfully'
      });
    } catch (error) {
      logger.error('Error permanently deleting phone number:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to permanently delete phone number'
      });
    }
  }

  /**
   * POST /api/admin/phone-numbers/:id/reassign-user
   * Reassign phone number to a different user (unassigns from agent)
   */
  static async reassignToUser(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { user_id } = req.body;

      if (!user_id) {
        res.status(400).json({
          success: false,
          error: 'user_id is required'
        });
        return;
      }

      // Validate phone number exists
      const phoneNumber = await PhoneNumber.findById(id);
      if (!phoneNumber) {
        res.status(404).json({
          success: false,
          error: 'Phone number not found'
        });
        return;
      }

      // Validate new user exists
      const userQuery = await pool.query(
        'SELECT id FROM users WHERE id = $1',
        [user_id]
      );
      
      if (userQuery.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      const updated = await PhoneNumber.reassignToUser(id, user_id);

      logger.info(`Phone number ${id} reassigned to user ${user_id}`);

      res.json({
        success: true,
        data: updated,
        message: 'Phone number reassigned to user successfully'
      });
    } catch (error: any) {
      logger.error('Error reassigning phone number to user:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reassign phone number to user'
      });
    }
  }

  /**
   * POST /api/admin/phone-numbers/:id/activate
   * Reactivate a deactivated phone number
   */
  static async activatePhoneNumber(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Validate phone number exists
      const phoneNumber = await PhoneNumber.findById(id);
      if (!phoneNumber) {
        res.status(404).json({
          success: false,
          error: 'Phone number not found'
        });
        return;
      }

      const activated = await PhoneNumber.activatePhoneNumber(id);

      logger.info(`Phone number activated: ${id}`);

      res.json({
        success: true,
        data: activated,
        message: 'Phone number activated successfully'
      });
    } catch (error) {
      logger.error('Error activating phone number:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to activate phone number'
      });
    }
  }

  /**
   * GET /api/admin/agents/:agentId/phone-number
   * Get phone number assigned to a specific agent
   */
  static async getAgentPhoneNumber(req: Request, res: Response): Promise<void> {
    try {
      const { agentId } = req.params;

      // Validate agent exists
      const agent = await Agent.findById(agentId);
      if (!agent) {
        res.status(404).json({
          success: false,
          error: 'Agent not found'
        });
        return;
      }

      const phoneNumber = await PhoneNumber.findByAgentId(agentId);

      if (!phoneNumber) {
        res.json({
          success: true,
          data: null,
          message: 'No phone number assigned to this agent'
        });
        return;
      }

      res.json({
        success: true,
        data: phoneNumber
      });
    } catch (error) {
      logger.error('Error getting agent phone number:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve agent phone number'
      });
    }
  }
}
