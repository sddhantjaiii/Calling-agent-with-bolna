import apiService from './apiService';
import {
  EmailTemplate,
  CreateEmailTemplateRequest,
  UpdateEmailTemplateRequest,
  EmailTemplateListResponse,
  EmailTemplateResponse
} from '../types/emailTemplate';

/**
 * Email Template Service
 * Handles API calls for email template CRUD operations
 */

export const emailTemplateService = {
  /**
   * Create a new email template
   */
  createTemplate: async (data: CreateEmailTemplateRequest): Promise<EmailTemplate> => {
    const response = await apiService.post<EmailTemplate>('/email-templates', data);
    if (!response.data) {
      throw new Error('No data returned from create template API');
    }
    return response.data;
  },

  /**
   * Get email template by ID
   */
  getTemplate: async (templateId: string): Promise<EmailTemplate> => {
    const response = await apiService.get<EmailTemplate>(`/email-templates/${templateId}`);
    if (!response.data) {
      throw new Error('No data returned from get template API');
    }
    return response.data;
  },

  /**
   * List all email templates
   */
  listTemplates: async (params?: {
    category?: string;
    is_active?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ templates: EmailTemplate[]; total: number }> => {
    const response = await apiService.get<EmailTemplate[]>('/email-templates', { params });
    if (!response.data) {
      throw new Error('No data returned from list templates API');
    }
    
    // Read pagination from top-level response (follows backend pattern)
    const pagination = (response as any).pagination || { total: response.data.length };
    
    return {
      templates: response.data,
      total: pagination.total
    };
  },

  /**
   * Update email template
   */
  updateTemplate: async (
    templateId: string,
    data: UpdateEmailTemplateRequest
  ): Promise<EmailTemplate> => {
    const response = await apiService.patch<EmailTemplate>(
      `/email-templates/${templateId}`,
      data
    );
    if (!response.data) {
      throw new Error('No data returned from update template API');
    }
    return response.data;
  },

  /**
   * Delete email template
   */
  deleteTemplate: async (templateId: string): Promise<void> => {
    await apiService.delete(`/email-templates/${templateId}`);
  },

  /**
   * Extract variables from template content
   * Finds all {{variable}} patterns
   */
  extractVariables: (text: string): string[] => {
    const variablePattern = /\{\{(\w+)\}\}/g;
    const variables = new Set<string>();
    let match;

    while ((match = variablePattern.exec(text)) !== null) {
      variables.add(match[1]);
    }

    return Array.from(variables);
  }
};

export default emailTemplateService;
