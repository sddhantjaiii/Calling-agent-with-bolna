import { pool } from '../config/database';
import { logger } from '../utils/logger';

export interface EmailTemplate {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  subject: string;
  body_html: string | null;
  body_text: string | null;
  variables: string[];
  category: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateEmailTemplateRequest {
  name: string;
  description?: string;
  subject: string;
  body_html?: string;
  body_text?: string;
  variables?: string[];
  category?: string;
}

export interface UpdateEmailTemplateRequest {
  name?: string;
  description?: string;
  subject?: string;
  body_html?: string;
  body_text?: string;
  variables?: string[];
  category?: string;
  is_active?: boolean;
}

export class EmailTemplateModel {
  /**
   * Create a new email template
   */
  static async create(
    userId: string,
    data: CreateEmailTemplateRequest
  ): Promise<EmailTemplate> {
    const result = await pool.query(
      `INSERT INTO email_templates (
        user_id, name, description, subject, body_html, body_text, variables, category
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        userId,
        data.name,
        data.description || null,
        data.subject,
        data.body_html || null,
        data.body_text || null,
        JSON.stringify(data.variables || []),
        data.category || 'general'
      ]
    );

    logger.info('[EmailTemplateModel] Email template created', {
      templateId: result.rows[0].id,
      userId,
      name: data.name
    });

    return result.rows[0];
  }

  /**
   * Get email template by ID
   */
  static async findById(templateId: string, userId: string): Promise<EmailTemplate | null> {
    const result = await pool.query(
      'SELECT * FROM email_templates WHERE id = $1 AND user_id = $2',
      [templateId, userId]
    );

    return result.rows[0] || null;
  }

  /**
   * List all email templates for a user
   */
  static async findByUserId(
    userId: string,
    options?: {
      category?: string;
      isActive?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ templates: EmailTemplate[]; total: number }> {
    let query = 'SELECT * FROM email_templates WHERE user_id = $1';
    const params: any[] = [userId];
    let paramIndex = 2;

    if (options?.category) {
      query += ` AND category = $${paramIndex}`;
      params.push(options.category);
      paramIndex++;
    }

    if (options?.isActive !== undefined) {
      query += ` AND is_active = $${paramIndex}`;
      params.push(options.isActive);
      paramIndex++;
    }

    // Get total count
    const countResult = await pool.query(
      query.replace('SELECT *', 'SELECT COUNT(*)'),
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Add ordering and pagination
    query += ' ORDER BY created_at DESC';

    if (options && options.limit !== undefined) {
      query += ` LIMIT $${paramIndex}`;
      params.push(options.limit);
      paramIndex++;
    }

    if (options && options.offset !== undefined) {
      query += ` OFFSET $${paramIndex}`;
      params.push(options.offset);
    }

    const result = await pool.query(query, params);

    return {
      templates: result.rows,
      total
    };
  }

  /**
   * Update email template
   */
  static async update(
    templateId: string,
    userId: string,
    data: UpdateEmailTemplateRequest
  ): Promise<EmailTemplate | null> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      params.push(data.name);
      paramIndex++;
    }

    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(data.description);
      paramIndex++;
    }

    if (data.subject !== undefined) {
      updates.push(`subject = $${paramIndex}`);
      params.push(data.subject);
      paramIndex++;
    }

    if (data.body_html !== undefined) {
      updates.push(`body_html = $${paramIndex}`);
      params.push(data.body_html);
      paramIndex++;
    }

    if (data.body_text !== undefined) {
      updates.push(`body_text = $${paramIndex}`);
      params.push(data.body_text);
      paramIndex++;
    }

    if (data.variables !== undefined) {
      updates.push(`variables = $${paramIndex}`);
      params.push(JSON.stringify(data.variables));
      paramIndex++;
    }

    if (data.category !== undefined) {
      updates.push(`category = $${paramIndex}`);
      params.push(data.category);
      paramIndex++;
    }

    if (data.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      params.push(data.is_active);
      paramIndex++;
    }

    if (updates.length === 0) {
      // No updates to perform
      return await this.findById(templateId, userId);
    }

    params.push(templateId, userId);

    const result = await pool.query(
      `UPDATE email_templates
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
       RETURNING *`,
      params
    );

    if (result.rows.length > 0) {
      logger.info('[EmailTemplateModel] Email template updated', {
        templateId,
        userId
      });
    }

    return result.rows[0] || null;
  }

  /**
   * Delete email template
   */
  static async delete(templateId: string, userId: string): Promise<boolean> {
    const result = await pool.query(
      'DELETE FROM email_templates WHERE id = $1 AND user_id = $2',
      [templateId, userId]
    );

    const deleted = result.rowCount > 0;

    if (deleted) {
      logger.info('[EmailTemplateModel] Email template deleted', {
        templateId,
        userId
      });
    }

    return deleted;
  }

  /**
   * Extract variables from template content
   * Finds all {{variable}} patterns in subject and body
   */
  static extractVariables(subject: string, bodyHtml: string, bodyText: string): string[] {
    const variablePattern = /\{\{(\w+)\}\}/g;
    const variables = new Set<string>();

    // Extract from subject
    let match;
    while ((match = variablePattern.exec(subject)) !== null) {
      variables.add(match[1]);
    }

    // Extract from body HTML
    variablePattern.lastIndex = 0;
    while ((match = variablePattern.exec(bodyHtml)) !== null) {
      variables.add(match[1]);
    }

    // Extract from body text
    variablePattern.lastIndex = 0;
    while ((match = variablePattern.exec(bodyText)) !== null) {
      variables.add(match[1]);
    }

    return Array.from(variables);
  }
}

export default EmailTemplateModel;
