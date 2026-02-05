import { Request, Response } from 'express';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { 
  FIELD_LIBRARY, 
  generateExtractionJSON, 
  getCustomFieldDefinitions,
  FieldDefinition 
} from '../config/fieldLibrary';

/**
 * Field Configuration Controller
 * Handles admin operations for managing user-specific custom field configurations
 */
export class FieldConfigurationController {
  /**
   * GET /api/admin/users/:userId/field-configuration
   * Get field configuration for a specific user
   */
  static async getUserFieldConfiguration(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      const result = await pool.query(
        `SELECT id, email, field_configuration 
         FROM users 
         WHERE id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const user = result.rows[0];
      const fieldConfiguration = user.field_configuration || {
        enabled_fields: [],
        field_definitions: []
      };

      res.json({
        userId: user.id,
        email: user.email,
        fieldConfiguration
      });
    } catch (error) {
      logger.error('Error fetching user field configuration:', error);
      res.status(500).json({ error: 'Failed to fetch field configuration' });
    }
  }

  /**
   * PUT /api/admin/users/:userId/field-configuration
   * Update field configuration for a specific user
   */
  static async updateUserFieldConfiguration(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { enabled_fields } = req.body;

      // Validate enabled_fields is an array
      if (!Array.isArray(enabled_fields)) {
        res.status(400).json({ 
          error: 'enabled_fields must be an array of field keys' 
        });
        return;
      }

      // Validate all field keys exist in FIELD_LIBRARY
      const validKeys = FIELD_LIBRARY.map(f => f.key);
      const invalidKeys = enabled_fields.filter(key => !validKeys.includes(key));
      
      if (invalidKeys.length > 0) {
        res.status(400).json({ 
          error: `Invalid field keys: ${invalidKeys.join(', ')}` 
        });
        return;
      }

      // Get full definitions for enabled fields (excluding core fields)
      const customFieldDefs = getCustomFieldDefinitions(enabled_fields);
      
      // Prepare field_configuration object
      const fieldConfiguration = {
        enabled_fields,
        field_definitions: customFieldDefs.map(field => ({
          key: field.key,
          label: field.label,
          type: field.type,
          category: field.category,
          extraction_hint: field.extraction_hint,
          options: field.options || null
        }))
      };

      // Update user's field_configuration
      await pool.query(
        `UPDATE users 
         SET field_configuration = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [JSON.stringify(fieldConfiguration), userId]
      );

      logger.info(`Field configuration updated for user ${userId} by admin`);

      res.json({
        success: true,
        message: 'Field configuration updated successfully',
        fieldConfiguration
      });
    } catch (error) {
      logger.error('Error updating user field configuration:', error);
      res.status(500).json({ error: 'Failed to update field configuration' });
    }
  }

  /**
   * POST /api/admin/users/:userId/generate-extraction-json
   * Generate OpenAI extraction JSON for admin to copy
   */
  static async generateExtractionJSONForUser(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      // Fetch user's field configuration
      const result = await pool.query(
        `SELECT email, field_configuration 
         FROM users 
         WHERE id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const user = result.rows[0];
      const fieldConfiguration = user.field_configuration || {
        enabled_fields: [],
        field_definitions: []
      };

      // Ensure enabled_fields is always an array
      const enabledFields = Array.isArray(fieldConfiguration.enabled_fields) 
        ? fieldConfiguration.enabled_fields 
        : [];

      // Generate extraction JSON
      const extractionJSON = generateExtractionJSON(enabledFields);

      res.json({
        userId,
        userEmail: user.email,
        enabledFields: enabledFields,
        extractionJSON,
        instructions: {
          step1: 'Copy the extractionJSON object below',
          step2: 'Open OpenAI Platform (https://platform.openai.com)',
          step3: 'Navigate to Prompts → User\'s System Prompt',
          step4: 'Paste this JSON in the extraction section of the prompt',
          step5: 'Save the prompt in OpenAI platform',
          note: 'The AI will now extract these custom fields from call transcripts'
        }
      });
    } catch (error) {
      logger.error('Error generating extraction JSON:', error);
      res.status(500).json({ error: 'Failed to generate extraction JSON' });
    }
  }

  /**
   * GET /api/admin/field-library
   * Get complete field library (all 23 available fields)
   */
  static async getFieldLibrary(req: Request, res: Response): Promise<void> {
    try {
      // Group fields by category for better UI organization
      const fieldsByCategory = FIELD_LIBRARY.reduce((acc, field) => {
        if (!acc[field.category]) {
          acc[field.category] = [];
        }
        acc[field.category].push({
          key: field.key,
          label: field.label,
          type: field.type,
          category: field.category,
          extraction_hint: field.extraction_hint,
          options: field.options || null,
          core: field.core || false,
          db_column: field.db_column || null
        });
        return acc;
      }, {} as Record<string, any[]>);

      res.json({
        total: FIELD_LIBRARY.length,
        categories: ['WHO', 'WHAT', 'HOW MUCH', 'WHERE', 'WHEN', 'HOW', 'SO WHAT'],
        fieldsByCategory,
        allFields: FIELD_LIBRARY
      });
    } catch (error) {
      logger.error('Error fetching field library:', error);
      res.status(500).json({ error: 'Failed to fetch field library' });
    }
  }

  /**
   * POST /api/admin/field-library/custom
   * Add a custom field definition (admin can define new fields beyond the 23)
   */
  static async addCustomFieldDefinition(req: Request, res: Response): Promise<void> {
    try {
      const { key, label, type, category, extraction_hint, options } = req.body;

      // Validate required fields
      if (!key || !label || !type || !category || !extraction_hint) {
        res.status(400).json({ 
          error: 'Missing required fields: key, label, type, category, extraction_hint' 
        });
        return;
      }

      // Validate type
      const validTypes = ['text', 'number', 'date', 'boolean', 'dropdown', 'email', 'phone'];
      if (!validTypes.includes(type)) {
        res.status(400).json({ 
          error: `Invalid type. Must be one of: ${validTypes.join(', ')}` 
        });
        return;
      }

      // Validate category
      const validCategories = ['WHO', 'WHAT', 'HOW MUCH', 'WHERE', 'WHEN', 'HOW', 'SO WHAT'];
      if (!validCategories.includes(category)) {
        res.status(400).json({ 
          error: `Invalid category. Must be one of: ${validCategories.join(', ')}` 
        });
        return;
      }

      // Check if key already exists in FIELD_LIBRARY
      const existingField = FIELD_LIBRARY.find(f => f.key === key);
      if (existingField) {
        res.status(400).json({ 
          error: `Field with key "${key}" already exists in library` 
        });
        return;
      }

      // Note: In a production system, you would store custom field definitions in a database table
      // For now, return the validated custom field definition
      const customField: FieldDefinition = {
        key,
        label,
        type,
        category,
        extraction_hint,
        options: options || undefined
      };

      res.json({
        success: true,
        message: 'Custom field definition created',
        customField,
        note: 'In production, this should be saved to a database table for persistence'
      });
    } catch (error) {
      logger.error('Error adding custom field definition:', error);
      res.status(500).json({ error: 'Failed to add custom field definition' });
    }
  }

  /**
   * GET /api/admin/users/:userId/leads-with-custom-fields
   * Get lead analytics with custom fields for a specific user (for testing)
   */
  static async getLeadsWithCustomFields(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { limit = 20, offset = 0 } = req.query;

      const result = await pool.query(
        `SELECT 
          la.id,
          la.phone_number,
          la.company_name,
          la.extracted_name,
          la.extracted_email,
          la.requirements,
          la.custom_fields,
          la.total_score,
          la.lead_status_tag,
          la.analysis_type,
          la.created_at
         FROM lead_analytics la
         WHERE la.user_id = $1
           AND la.analysis_type = 'complete'
         ORDER BY la.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, parseInt(limit as string), parseInt(offset as string)]
      );

      res.json({
        userId,
        total: result.rows.length,
        leads: result.rows
      });
    } catch (error) {
      logger.error('Error fetching leads with custom fields:', error);
      res.status(500).json({ error: 'Failed to fetch leads' });
    }
  }
}
