// WhatsApp Template Service
// Handles all API communication with WhatsApp microservice for templates
// Uses External API endpoints (no authentication required) for READ operations
// Uses Backend API (authenticated) for WRITE operations with media upload
// Reference: MIGRATION_GUIDE_ADMIN_TO_EXTERNAL_API.md

import { authenticatedFetch } from '@/utils/auth';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type TemplateStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED';
export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
export type HeaderFormat = 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';
export type ButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE';
export type ComponentType = 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';

export interface TemplateComponent {
  type: ComponentType;
  format?: HeaderFormat;
  text?: string;
  example?: {
    header_handle?: string[];
    header_text?: string[];
    body_text?: string[][];
  };
  buttons?: TemplateButton[];
}

export interface TemplateButton {
  type: ButtonType;
  text: string;
  url?: string;
  phone_number?: string;
  example?: string[];
}

export interface TemplateVariable {
  variable_id?: string;
  variable_name: string;
  position: number;
  component_type: ComponentType;
  dashboard_mapping?: string; // Dashboard's identifier for this variable (e.g., "name", "email", "meetingLink", "meetingTime")
  default_value?: string;
  sample_value?: string;
  description?: string;
  is_required?: boolean;
  placeholder?: string;
}

export interface Template {
  template_id: string;
  user_id: string;
  phone_number_id: string;
  name: string;
  category: TemplateCategory;
  status: TemplateStatus;
  language: string;
  header_type?: HeaderFormat;
  header_media_url?: string;
  meta_template_id?: string;
  components: TemplateComponent[];
  created_at: string;
  updated_at: string;
}

export interface TemplateWithDetails extends Template {
  variables: TemplateVariable[];
  analytics?: TemplateAnalytics;
}

export interface TemplateAnalytics {
  total_sends: number;
  delivered_count: number;
  read_count: number;
}

export interface ButtonClickAnalytics {
  button_id: string;
  button_text: string;
  total_clicks: number;
  unique_clicks: number;
}

export interface CreateTemplateRequest {
  user_id: string;
  phone_number_id: string;
  name: string;
  category: TemplateCategory;
  language?: string;
  components: TemplateComponent[];
  variables?: Array<{
    variable_name: string;
    position: number;
    description?: string;
    default_value?: string;
    sample_value?: string;
    is_required?: boolean;
    placeholder?: string;
  }>;
}

export interface SendTemplateRequest {
  phone_number_id: string;
  template_id: string;
  contact: {
    phone: string;
    name?: string;
    email?: string;
    company?: string;
  };
  variables?: Record<string, string>; // Position-keyed: { "1": "John", "2": "Order123" }
}

export interface CampaignTemplateRequest {
  phone_number_id: string;
  template_id: string;
  name: string;
  contacts: Array<{
    phone: string;
    name?: string;
    variables?: Record<string, string>;
  }>;
}

// API Response wrapper
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
  correlationId: string;
}

// ============================================================================
// API SERVICE CLASS
// ============================================================================

class WhatsAppTemplateService {
  // Base URL for WhatsApp microservice external API (no auth required)
  private baseUrl = import.meta.env.VITE_WHATSAPP_SERVICE_URL || 'http://localhost:4000';

  /**
   * Generic API call helper - NO AUTHENTICATION
   */
  private async apiCall<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        ...options,
      });
      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: 'Network Error',
        message: error instanceof Error ? error.message : 'Failed to connect',
        timestamp: new Date().toISOString(),
        correlationId: 'local',
      };
    }
  }

  /**
   * List all templates for a phone number
   * GET /api/v1/templates?phone_number_id=xxx
   */
  async listTemplates(options?: {
    phoneNumberId?: string;
    limit?: number;
    offset?: number;
    status?: TemplateStatus;
  }): Promise<{ templates: Template[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.phoneNumberId) params.append('phone_number_id', options.phoneNumberId);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    if (options?.status) params.append('status', options.status);

    const result = await this.apiCall<Template[]>(`/api/v1/templates?${params.toString()}`);

    if (!result.success) {
      throw new Error(result.message || 'Failed to fetch templates');
    }

    return {
      templates: result.data || [],
      total: (result.data || []).length,
    };
  }

  /**
   * Get single template with variables and analytics
   * GET /api/v1/templates/:templateId
   */
  async getTemplate(templateId: string): Promise<TemplateWithDetails> {
    const result = await this.apiCall<{
      template: Template;
      variables: TemplateVariable[];
      analytics: TemplateAnalytics;
    }>(`/api/v1/templates/${templateId}`);

    if (!result.success || !result.data) {
      throw new Error(result.message || 'Failed to fetch template');
    }

    return {
      ...result.data.template,
      variables: result.data.variables || [],
      analytics: result.data.analytics,
    };
  }

  /**
   * Upload media file to R2 storage
   * Returns public URL for use in template
   */
  async uploadMedia(file: File, userId: string): Promise<string> {
    const formData = new FormData();
    formData.append('media', file);
    formData.append('userId', userId);
    
    try {
      const response = await authenticatedFetch('/api/whatsapp/media/upload', {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      
      if (!result.success || !result.url) {
        throw new Error(result.message || 'Failed to upload media');
      }
      
      return result.url;
    } catch (error) {
      throw error instanceof Error ? error : new Error('Failed to upload media');
    }
  }

  /**
   * Create template
   * POST /api/v1/templates (external API, no auth)
   * 
   * For templates with media:
   * 1. Upload media to R2 first via uploadMedia()
   * 2. Pass the URL in header_handle
   */
  async createTemplate(
    data: CreateTemplateRequest,
    mediaFile?: File
  ): Promise<Template> {
    let templateData = { ...data };
    
    // If media file provided, upload to R2 first and get URL
    if (mediaFile) {
      try {
        const mediaUrl = await this.uploadMedia(mediaFile, data.user_id);
        
        // Find HEADER component and add media URL
        const headerIndex = templateData.components.findIndex(c => c.type === 'HEADER');
        if (headerIndex >= 0) {
          templateData.components[headerIndex] = {
            ...templateData.components[headerIndex],
            example: {
              header_handle: [mediaUrl],
            },
          };
        }
      } catch (error) {
        console.error('Media upload failed:', error);
        throw new Error('Failed to upload media file');
      }
    }
    
    // Create template via external API (no auth)
    const result = await this.apiCall<Template>('/api/v1/templates', {
      method: 'POST',
      body: JSON.stringify(templateData),
    });

    if (!result.success || !result.data) {
      throw new Error(result.message || 'Failed to create template');
    }

    return result.data;
  }

  /**
   * Delete template
   * DELETE /api/v1/templates/:templateId
   */
  async deleteTemplate(templateId: string): Promise<void> {
    const result = await this.apiCall<void>(`/api/v1/templates/${templateId}`, {
      method: 'DELETE',
    });

    if (!result.success) {
      throw new Error(result.message || 'Failed to delete template');
    }
  }

  /**
   * Submit template to Meta for approval
   * POST /api/v1/templates/:templateId/submit
   */
  async submitTemplate(templateId: string): Promise<Template> {
    const result = await this.apiCall<Template>(`/api/v1/templates/${templateId}/submit`, {
      method: 'POST',
    });

    if (!result.success || !result.data) {
      throw new Error(result.message || 'Failed to submit template');
    }

    return result.data;
  }

  /**
   * Sync templates from Meta
   * POST /api/v1/templates/sync
   */
  async syncTemplates(
    userId: string,
    phoneNumberId: string
  ): Promise<{ imported: number; updated: number }> {
    const result = await this.apiCall<{
      imported: Array<{ template_id: string; name: string }>;
      updated: Array<{ template_id: string; name: string }>;
      errors: string[];
      summary: { totalImported: number; totalUpdated: number; totalErrors: number };
    }>('/api/v1/templates/sync', {
      method: 'POST',
      body: JSON.stringify({ 
        user_id: userId, 
        phone_number_id: phoneNumberId 
      }),
    });

    if (!result.success || !result.data) {
      throw new Error(result.message || 'Failed to sync templates');
    }

    return {
      imported: result.data.summary?.totalImported || result.data.imported?.length || 0,
      updated: result.data.summary?.totalUpdated || result.data.updated?.length || 0,
    };
  }

  /**
   * Get button click analytics for template
   * GET /api/v1/templates/:templateId/button-clicks
   */
  async getButtonClicks(templateId: string): Promise<{
    template_id: string;
    template_name: string;
    buttons: ButtonClickAnalytics[];
    total_clicks: number;
  }> {
    const result = await this.apiCall<{
      template_id: string;
      template_name: string;
      buttons: ButtonClickAnalytics[];
      total_clicks: number;
    }>(`/api/v1/templates/${templateId}/button-clicks`);

    if (!result.success || !result.data) {
      throw new Error(result.message || 'Failed to fetch button clicks');
    }

    return result.data;
  }

  /**
   * Get all button clicks with filters
   * GET /api/v1/button-clicks?user_id=xxx&template_id=xxx
   */
  async listButtonClicks(options: {
    userId: string;
    templateId?: string;
    limit?: number;
    offset?: number;
  }): Promise<Array<{
    click_id: string;
    template_id: string;
    button_id: string;
    button_text: string;
    customer_phone: string;
    clicked_at: string;
  }>> {
    const params = new URLSearchParams();
    params.append('user_id', options.userId); // snake_case per external API
    if (options.templateId) params.append('template_id', options.templateId);
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.offset) params.append('offset', options.offset.toString());

    const result = await this.apiCall<Array<{
      click_id: string;
      template_id: string;
      button_id: string;
      button_text: string;
      customer_phone: string;
      clicked_at: string;
    }>>(`/api/v1/button-clicks?${params.toString()}`);

    if (!result.success) {
      throw new Error(result.message || 'Failed to fetch button clicks');
    }

    return result.data || [];
  }

  /**
   * Get lead button activity
   * GET /api/v1/leads/:phone/button-activity?user_id=xxx
   */
  async getLeadButtonActivity(
    customerPhone: string,
    userId: string
  ): Promise<{
    customer_phone: string;
    buttons_clicked: Array<{
      template_name: string;
      button_text: string;
      clicked_at: string;
    }>;
    total_clicks: number;
  }> {
    const result = await this.apiCall<{
      customer_phone: string;
      buttons_clicked: Array<{
        template_name: string;
        button_text: string;
        clicked_at: string;
      }>;
      total_clicks: number;
    }>(`/api/v1/leads/${encodeURIComponent(customerPhone)}/button-activity?user_id=${userId}`);

    if (!result.success || !result.data) {
      throw new Error(result.message || 'Failed to fetch lead activity');
    }

    return result.data;
  }

  /**
   * Send single template message
   * POST /api/v1/send
   */
  async sendTemplate(data: SendTemplateRequest): Promise<{
    message_id: string;
    contact_id: string;
    conversation_id: string;
    credits_remaining: number;
  }> {
    const result = await this.apiCall<{
      message_id: string;
      contact_id: string;
      conversation_id: string;
      credits_remaining: number;
    }>('/api/v1/send', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (!result.success || !result.data) {
      throw new Error(result.message || 'Failed to send template');
    }

    return result.data;
  }

  /**
   * Send campaign with template
   * POST /api/v1/campaign
   */
  async sendCampaign(data: CampaignTemplateRequest): Promise<{
    campaign_id: string;
    total_contacts: number;
    status: string;
  }> {
    const result = await this.apiCall<{
      campaign_id: string;
      total_contacts: number;
      status: string;
    }>('/api/v1/campaign', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (!result.success || !result.data) {
      throw new Error(result.message || 'Failed to send campaign');
    }

    return result.data;
  }

  /**
   * List phone numbers for a user
   * GET /api/v1/phone-numbers?user_id=xxx
   */
  async listPhoneNumbers(userId: string): Promise<Array<{
    id: string;
    user_id: string;
    platform: string;
    meta_phone_number_id: string;
    display_name: string;
  }>> {
    const result = await this.apiCall<Array<{
      id: string;
      user_id: string;
      platform: string;
      meta_phone_number_id: string;
      display_name: string;
    }>>(`/api/v1/phone-numbers?user_id=${userId}`);

    if (!result.success) {
      throw new Error(result.message || 'Failed to fetch phone numbers');
    }

    return result.data || [];
  }

  /**
   * Resolve template variables from contact data
   * Uses dashboard_mapping to auto-fill variables from contact fields
   * 
   * Dashboard is the source of truth for all variable resolution.
   * Mapping options include:
   * - Contact fields: name, phone_number, email, company, city, country, business_context, notes, tags
   * - Meeting fields: meetingLink, meetingTime, meetingDate, meetingDateTime, meetingDetails
   * 
   * @param variables - Array of template variables with dashboard_mapping
   * @param contact - Contact data object (can include meeting data)
   * @returns Record mapping position to resolved value
   */
  resolveVariables(
    variables: TemplateVariable[],
    contact: Record<string, any>
  ): Record<string, string> {
    const resolved: Record<string, string> = {};

    // Contact field mappings (supports both snake_case and camelCase)
    const contactFieldMap: Record<string, () => string | undefined> = {
      'name': () => contact.name,
      'phone_number': () => contact.phone_number || contact.phone || contact.phoneNumber,
      'email': () => contact.email,
      'company': () => contact.company,
      'city': () => contact.city,
      'country': () => contact.country,
      'business_context': () => contact.business_context || contact.businessContext,
      'notes': () => contact.notes,
      'tags': () => Array.isArray(contact.tags) ? contact.tags.join(', ') : contact.tags,
    };

    // Meeting field mappings
    const meetingFieldMap: Record<string, () => string | undefined> = {
      'meetingLink': () => contact.meetingLink || contact.meeting_link,
      'meetingTime': () => contact.meetingTime || contact.meeting_time,
      'meetingDate': () => contact.meetingDate || contact.meeting_date,
      'meetingDateTime': () => contact.meetingDateTime || contact.meeting_datetime,
      'meetingDetails': () => contact.meetingDetails || contact.meeting_details,
    };

    for (const variable of variables) {
      const position = variable.position.toString();

      // Priority 1: Use dashboard_mapping to get value from contact data
      if (variable.dashboard_mapping) {
        // Check contact fields
        if (variable.dashboard_mapping in contactFieldMap) {
          const value = contactFieldMap[variable.dashboard_mapping]();
          if (value) {
            resolved[position] = String(value);
            continue;
          }
        }
        
        // Check meeting fields
        if (variable.dashboard_mapping in meetingFieldMap) {
          const value = meetingFieldMap[variable.dashboard_mapping]();
          if (value) {
            resolved[position] = String(value);
            continue;
          }
        }
        
        // Try direct property access as fallback
        if (contact[variable.dashboard_mapping]) {
          resolved[position] = String(contact[variable.dashboard_mapping]);
          continue;
        }
      }

      // Priority 2: Try direct match with variable_name
      if (contact[variable.variable_name]) {
        resolved[position] = String(contact[variable.variable_name]);
        continue;
      }

      // Priority 3: Use default_value
      if (variable.default_value) {
        resolved[position] = variable.default_value;
        continue;
      }

      // Priority 4: Empty string (don't use sample_value - that's for Meta template preview only)
      resolved[position] = '';
    }

    return resolved;
  }

  /**
   * Validate variables before sending
   */
  validateVariables(
    variables: TemplateVariable[],
    values: Record<string, string>
  ): { valid: boolean; missing: string[] } {
    const missing: string[] = [];

    for (const variable of variables) {
      if (variable.is_required) {
        const value = values[variable.position.toString()];
        if (!value || value.trim() === '') {
          missing.push(variable.variable_name);
        }
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }
}

// Export singleton instance
export const whatsappTemplateService = new WhatsAppTemplateService();
export default whatsappTemplateService;