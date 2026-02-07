// Email Template Types
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
  created_at: string;
  updated_at: string;
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

export interface EmailTemplateListResponse {
  success: boolean;
  data: EmailTemplate[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

export interface EmailTemplateResponse {
  success: boolean;
  data: EmailTemplate;
}
