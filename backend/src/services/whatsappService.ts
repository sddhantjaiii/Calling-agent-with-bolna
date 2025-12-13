import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../utils/logger';

/**
 * WhatsApp Microservice Client
 * 
 * Communicates with the WhatsApp template microservice running at port 4000
 * Handles template CRUD, submission to Meta, syncing, and button click analytics
 * 
 * Architecture:
 * Frontend → Backend (this service) → R2 Upload → WhatsApp Microservice → Meta API
 */

const WHATSAPP_SERVICE_URL = process.env.CHAT_AGENT_SERVER_URL || 'http://localhost:4000';

interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';
  text?: string;
  example?: any;
  buttons?: any[];
}

interface TemplateVariable {
  variable_name: string;
  position: number;
  component_type: string;
  dashboard_mapping?: string; // Dashboard's identifier for this variable (e.g., "name", "email", "meetingLink", "meetingTime")
  default_value?: string;
  sample_value?: string;
}

interface CreateTemplateRequest {
  user_id: string;
  phone_number_id: string;
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  components: TemplateComponent[];
  variables?: TemplateVariable[];
}

interface TemplateResponse {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
  timestamp?: string;
  correlationId?: string;
}

interface ListTemplatesOptions {
  limit?: number;
  offset?: number;
  status?: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED';
}

class WhatsAppServiceClient {
  private client: AxiosInstance;
  
  constructor() {
    this.client = axios.create({
      baseURL: WHATSAPP_SERVICE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('📤 WhatsApp Service Request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          baseURL: config.baseURL,
        });
        return config;
      },
      (error) => {
        logger.error('❌ WhatsApp Service Request Error', { error: error.message });
        return Promise.reject(error);
      }
    );
    
    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('📥 WhatsApp Service Response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error: AxiosError) => {
        logger.error('❌ WhatsApp Service Response Error', {
          status: error.response?.status,
          url: error.config?.url,
          error: error.response?.data || error.message,
        });
        return Promise.reject(error);
      }
    );
  }
  
  /**
   * List all templates
   */
  async listTemplates(options: ListTemplatesOptions = {}): Promise<TemplateResponse> {
    try {
      const params = new URLSearchParams();
      if (options.limit) params.append('limit', options.limit.toString());
      if (options.offset) params.append('offset', options.offset.toString());
      if (options.status) params.append('status', options.status);
      
      const response = await this.client.get(`/admin/templates?${params.toString()}`);
      return response.data;
    } catch (error: any) {
      logger.error('❌ Failed to list templates', { error: error.message });
      throw this.handleError(error);
    }
  }
  
  /**
   * Get single template by ID
   */
  async getTemplate(templateId: string): Promise<TemplateResponse> {
    try {
      const response = await this.client.get(`/admin/templates/${templateId}`);
      return response.data;
    } catch (error: any) {
      logger.error('❌ Failed to get template', { templateId, error: error.message });
      throw this.handleError(error);
    }
  }
  
  /**
   * Create new template
   */
  async createTemplate(templateData: CreateTemplateRequest): Promise<TemplateResponse> {
    try {
      logger.info('📝 Creating WhatsApp template', {
        userId: templateData.user_id,
        name: templateData.name,
        category: templateData.category,
      });
      
      const response = await this.client.post('/admin/templates', templateData);
      
      logger.info('✅ Template created', {
        templateId: response.data.data?.template_id,
        name: templateData.name,
      });
      
      return response.data;
    } catch (error: any) {
      logger.error('❌ Failed to create template', {
        name: templateData.name,
        error: error.message,
      });
      throw this.handleError(error);
    }
  }
  
  /**
   * Delete template
   */
  async deleteTemplate(templateId: string): Promise<TemplateResponse> {
    try {
      const response = await this.client.delete(`/admin/templates/${templateId}`);
      return response.data;
    } catch (error: any) {
      logger.error('❌ Failed to delete template', { templateId, error: error.message });
      throw this.handleError(error);
    }
  }
  
  /**
   * Submit template to Meta for approval
   */
  async submitTemplate(templateId: string): Promise<TemplateResponse> {
    try {
      logger.info('📤 Submitting template to Meta', { templateId });
      
      const response = await this.client.post(`/admin/templates/${templateId}/submit`);
      
      logger.info('✅ Template submitted to Meta', {
        templateId,
        metaTemplateId: response.data.data?.meta_template_id,
        status: response.data.data?.status,
      });
      
      return response.data;
    } catch (error: any) {
      logger.error('❌ Failed to submit template to Meta', {
        templateId,
        error: error.message,
      });
      throw this.handleError(error);
    }
  }
  
  /**
   * Sync templates from Meta
   */
  async syncTemplates(userId: string, phoneNumberId: string): Promise<TemplateResponse> {
    try {
      logger.info('🔄 Syncing templates from Meta', { userId, phoneNumberId });
      
      const response = await this.client.post('/admin/templates/sync', {
        user_id: userId,
        phone_number_id: phoneNumberId,
      });
      
      logger.info('✅ Templates synced from Meta', {
        userId,
        imported: response.data.data?.summary?.totalImported,
        updated: response.data.data?.summary?.totalUpdated,
      });
      
      return response.data;
    } catch (error: any) {
      logger.error('❌ Failed to sync templates from Meta', {
        userId,
        error: error.message,
      });
      throw this.handleError(error);
    }
  }
  
  /**
   * Get button clicks for a template
   */
  async getButtonClicks(templateId: string): Promise<TemplateResponse> {
    try {
      const response = await this.client.get(`/admin/templates/${templateId}/button-clicks`);
      return response.data;
    } catch (error: any) {
      logger.error('❌ Failed to get button clicks', { templateId, error: error.message });
      throw this.handleError(error);
    }
  }
  
  /**
   * List all button clicks with filters
   */
  async listButtonClicks(options: {
    userId: string;
    templateId?: string;
    limit?: number;
    offset?: number;
  }): Promise<TemplateResponse> {
    try {
      const params = new URLSearchParams();
      params.append('userId', options.userId);
      if (options.templateId) params.append('templateId', options.templateId);
      if (options.limit) params.append('limit', options.limit.toString());
      if (options.offset) params.append('offset', options.offset.toString());
      
      const response = await this.client.get(`/admin/button-clicks?${params.toString()}`);
      return response.data;
    } catch (error: any) {
      logger.error('❌ Failed to list button clicks', {
        userId: options.userId,
        error: error.message,
      });
      throw this.handleError(error);
    }
  }
  
  /**
   * Get lead button activity
   */
  async getLeadButtonActivity(customerPhone: string, userId: string): Promise<TemplateResponse> {
    try {
      const response = await this.client.get(
        `/admin/leads/${encodeURIComponent(customerPhone)}/button-activity?userId=${userId}`
      );
      return response.data;
    } catch (error: any) {
      logger.error('❌ Failed to get lead button activity', {
        customerPhone,
        userId,
        error: error.message,
      });
      throw this.handleError(error);
    }
  }
  
  /**
   * Handle Axios errors and convert to consistent format
   */
  private handleError(error: any): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      
      // Check if it's a connection error
      if (!axiosError.response) {
        return new Error(
          `Cannot connect to WhatsApp service at ${WHATSAPP_SERVICE_URL}. Please ensure the service is running.`
        );
      }
      
      // Extract error message from response
      const responseData: any = axiosError.response.data;
      const errorMessage = responseData?.message || responseData?.error || 'Unknown error occurred';
      
      return new Error(errorMessage);
    }
    
    return error;
  }
}

// Export singleton instance
export const whatsappService = new WhatsAppServiceClient();

// Export types
export type {
  TemplateComponent,
  TemplateVariable,
  CreateTemplateRequest,
  TemplateResponse,
  ListTemplatesOptions,
};
