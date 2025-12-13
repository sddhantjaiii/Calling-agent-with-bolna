// WhatsApp Template Types
// Comprehensive type definitions for WhatsApp Business API templates

export type TemplateStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED';
export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
export type HeaderFormat = 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';
export type ButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE';
export type ComponentType = 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';

// Template Component Interfaces
export interface TemplateHeader {
  type: 'HEADER';
  format: HeaderFormat;
  text?: string;
  example?: {
    header_handle?: string[];
    header_text?: string[];
  };
}

export interface TemplateBody {
  type: 'BODY';
  text: string;
  example?: {
    body_text: string[][];
  };
}

export interface TemplateFooter {
  type: 'FOOTER';
  text: string;
}

export interface TemplateButton {
  type: ButtonType;
  text: string;
  url?: string;
  phone_number?: string;
  example?: string[];
}

export interface TemplateButtons {
  type: 'BUTTONS';
  buttons: TemplateButton[];
}

export type TemplateComponent = TemplateHeader | TemplateBody | TemplateFooter | TemplateButtons;

// Template Variable
export interface TemplateVariable {
  variable_id?: string;
  template_id?: string;
  variable_name: string; // Direct match to Contact field: "name", "email", "company", etc.
  position: number; // Maps to {{1}}, {{2}}, etc.
  component_type: ComponentType;
  default_value?: string;
  sample_value?: string;
  description?: string;
  is_required?: boolean;
  placeholder?: string;
  created_at?: string;
  updated_at?: string;
}

// Main Template Interface
export interface WhatsAppTemplate {
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
  variables?: TemplateVariable[];
  created_at: string;
  updated_at: string;
}

// Create Template Request
export interface CreateTemplateRequest {
  user_id: string;
  phone_number_id: string;
  name: string;
  category: TemplateCategory;
  language?: string;
  components: TemplateComponent[];
  variables?: Omit<TemplateVariable, 'variable_id' | 'template_id' | 'created_at' | 'updated_at'>[];
}

// Template with Analytics
export interface TemplateWithAnalytics extends WhatsAppTemplate {
  analytics?: {
    totalSent: number;
    totalDelivered: number;
    totalRead: number;
    totalFailed: number;
    deliveryRate: number;
    readRate: number;
  };
}

// Button Click Analytics
export interface ButtonClickAnalytics {
  template_id: string;
  template_name: string;
  button_id: string;
  button_text: string;
  total_clicks: number;
  unique_leads: number;
  click_rate: number;
}

// Button Click Event
export interface ButtonClick {
  click_id: string;
  template_id: string;
  button_id: string;
  button_text: string;
  customer_phone: string;
  contact_id?: string;
  conversation_id?: string;
  clicked_at: string;
}

// Lead Button Activity
export interface LeadButtonActivity {
  customer_phone: string;
  contact_id?: string;
  contact_name?: string;
  buttons_clicked: Array<{
    button_id: string;
    button_text: string;
    template_name: string;
    clicked_at: string;
  }>;
  total_clicks: number;
  last_click_at: string;
}

// Send Message Request
export interface SendTemplateMessageRequest {
  phone_number_id: string;
  template_id: string;
  contact: {
    phone: string;
    name?: string;
    email?: string;
    company?: string;
  };
  variables: Record<string, string>; // { "1": "John", "2": "Acme Corp" }
}

// Campaign Template Request
export interface CampaignTemplateRequest {
  phone_number_id: string;
  template_id: string;
  name: string;
  contacts: Array<{
    phone: string;
    name?: string;
    email?: string;
    company?: string;
    variables?: Record<string, string>; // Per-contact variable overrides
  }>;
}

// Sync Response
export interface TemplateSyncResponse {
  imported: Array<{
    template_id: string;
    name: string;
    meta_template_id: string;
  }>;
  updated: Array<{
    template_id: string;
    name: string;
    changes: string[];
  }>;
  errors: Array<{
    name: string;
    error: string;
  }>;
  summary: {
    totalImported: number;
    totalUpdated: number;
    totalErrors: number;
  };
}

// API Response wrapper
export interface WhatsAppApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp?: string;
  correlationId?: string;
}

// List Templates Options
export interface ListTemplatesOptions {
  limit?: number;
  offset?: number;
  status?: TemplateStatus;
}

// Media Upload Result
export interface MediaUploadResult {
  success: boolean;
  url?: string;
  filename?: string;
  size?: number;
  error?: string;
}

// Contact Field Mapping
export type ContactFieldName = 
  | 'name'
  | 'phoneNumber'
  | 'email'
  | 'company'
  | 'notes'
  | 'city'
  | 'country'
  | 'businessContext';

// Helper type for variable resolution
export interface ResolvedVariables {
  [position: string]: string; // { "1": "John Doe", "2": "john@example.com" }
}
