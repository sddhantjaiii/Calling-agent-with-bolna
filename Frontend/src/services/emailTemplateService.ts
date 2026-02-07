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
    const response = await apiService.post<EmailTemplateResponse>('/email-templates', data);
    return response.data;
  },

  /**
   * Get email template by ID
   */
  getTemplate: async (templateId: string): Promise<EmailTemplate> => {
    const response = await apiService.get<EmailTemplateResponse>(`/email-templates/${templateId}`);
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
    const response = await apiService.get<EmailTemplateListResponse>('/email-templates', { params });
    return {
      templates: response.data,
      total: response.pagination.total
    };
  },

  /**
   * Update email template
   */
  updateTemplate: async (
    templateId: string,
    data: UpdateEmailTemplateRequest
  ): Promise<EmailTemplate> => {
    const response = await apiService.patch<EmailTemplateResponse>(
      `/email-templates/${templateId}`,
      data
    );
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
