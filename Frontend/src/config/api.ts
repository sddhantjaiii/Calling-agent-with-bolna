// API Configuration for Backend Integration
// This file configures the frontend to connect to the backend APIs

// Determine API base URL based on environment
export const getApiBaseUrl = () => {
  // Check for explicit environment variable first (REQUIRED for production)
  if (import.meta.env.VITE_API_BASE_URL) {
    console.log('Using VITE_API_BASE_URL:', import.meta.env.VITE_API_BASE_URL);
    return import.meta.env.VITE_API_BASE_URL;
  }
  
  // Development: use localhost backend
  if (!import.meta.env.PROD) {
    console.log('Development mode: using localhost backend');
    return 'http://localhost:3000';
  }
  
  // Production without env var: throw error
  const msg = 'VITE_API_BASE_URL is required in production. Set it in Vercel environment variables.';
  console.error(msg);
  throw new Error(msg);
};

// WhatsApp Chat Agent Service URL
export const getWhatsAppServiceUrl = () => {
  if (import.meta.env.VITE_WHATSAPP_SERVICE_URL) {
    return import.meta.env.VITE_WHATSAPP_SERVICE_URL;
  }
  // Default to localhost:4000 for development
  return 'http://localhost:4000';
};

export const API_BASE_URL = getApiBaseUrl();
export const API_URL = `${API_BASE_URL}/api`;
export const WHATSAPP_SERVICE_URL = getWhatsAppServiceUrl();
export const WHATSAPP_API_URL = `${WHATSAPP_SERVICE_URL}/api/v1`;

// Helper to derive WebSocket base URL from API base (http->ws, https->wss)
export const getWsBaseUrl = () => {
  const base = getApiBaseUrl();
  return base.replace(/^http/i, 'ws');
};

export const API_ENDPOINTS = {
  // Authentication
  AUTH: {
    LOGIN: `${API_URL}/auth/login`,
    REGISTER: `${API_URL}/auth/register`,
    PROFILE: `${API_URL}/auth/profile`,
    VALIDATE: `${API_URL}/auth/validate`,
    REFRESH: `${API_URL}/auth/refresh`,
    LOGOUT: `${API_URL}/auth/logout`,
    SESSION: `${API_URL}/auth/session`,
    GOOGLE: `${API_URL}/auth/google`,
  },

  // Agents
  AGENTS: {
    LIST: `${API_URL}/agents`,
    ALL: `${API_URL}/agents/all`,
    CHAT: `${API_URL}/agents/chat`,
    CREATE: `${API_URL}/agents`,
    GET: (id: string) => `${API_URL}/agents/${id}`,
    UPDATE: (id: string) => `${API_URL}/agents/${id}`,
    DELETE: (id: string) => `${API_URL}/agents/${id}`,
    VOICES: `${API_URL}/agents/voices`,
    TEST_CONNECTION: `${API_URL}/agents/test-connection`,
    UPDATE_STATUS: (id: string) => `${API_URL}/agents/${id}/status`,
  },

  // Dashboard
  DASHBOARD: {
    OVERVIEW: `${API_URL}/dashboard/overview`,
    ANALYTICS: `${API_URL}/dashboard/analytics`,
  },

  // Billing
  BILLING: {
    CREDITS: `${API_URL}/billing/credits`,
    CHAT_CREDITS: `${API_URL}/billing/chat-credits`,
    STATS: `${API_URL}/billing/stats`,
    PURCHASE: `${API_URL}/billing/purchase`,
    CONFIRM_PAYMENT: `${API_URL}/billing/confirm-payment`,
    HISTORY: `${API_URL}/billing/history`,
    PRICING: `${API_URL}/billing/pricing`,
    PAYMENT_HISTORY: `${API_URL}/billing/payment-history`,
    CHECK: `${API_URL}/billing/check`,
    ADMIN_ADJUST: `${API_URL}/billing/admin/adjust`,
    PROCESS_CALL: `${API_URL}/billing/process-call`,
  },

  // Calls
  CALLS: {
    LIST: `${API_URL}/calls`,
    INITIATE: `${API_URL}/calls/initiate`,
    GET: (id: string) => `${API_URL}/calls/${id}`,
    TRANSCRIPT: (id: string) => `${API_URL}/calls/${id}/transcript`,
    RECORDING: (id: string) => `${API_URL}/calls/${id}/recording`,
    STATS: `${API_URL}/calls/stats`,
    RECENT: `${API_URL}/calls/recent`,
    SEARCH: `${API_URL}/calls/search`,
    SEARCH_TRANSCRIPTS: `${API_URL}/calls/search/transcripts`,
    AUDIO: (id: string) => `${API_URL}/calls/${id}/audio`,
  },

  // Contacts
  CONTACTS: {
    LIST: `${API_URL}/contacts`,
    CREATE: `${API_URL}/contacts`,
    GET: (id: string) => `${API_URL}/contacts/${id}`,
    UPDATE: (id: string) => `${API_URL}/contacts/${id}`,
    DELETE: (id: string) => `${API_URL}/contacts/${id}`,
    UPLOAD: `${API_URL}/contacts/upload`,
    STATS: `${API_URL}/contacts/stats`,
    TEMPLATE: `${API_URL}/contacts/template`,
    LOOKUP: (phone: string) => `${API_URL}/contacts/lookup/${phone}`,
    BATCH_LOOKUP: `${API_URL}/contacts/lookup/batch`,
  },

  // Campaigns
  CAMPAIGNS: {
    BASE: `${API_URL}/campaigns`,
    UPLOAD_CSV: `${API_URL}/campaigns/upload-csv`,
    TEMPLATE: `${API_URL}/campaigns/template`,
  },

  // Email Campaigns
  EMAIL_CAMPAIGNS: `${API_URL}/email-campaigns`,

  // Leads
  LEADS: {
    LIST: `${API_URL}/leads`,
    GET: (id: string) => `${API_URL}/leads/${id}`,
    ANALYTICS: `${API_URL}/leads/analytics`,
    TIMELINE: (id: string) => `${API_URL}/leads/${id}/timeline`,
    PROFILE: (id: string) => `${API_URL}/leads/${id}/profile`,
    INTELLIGENCE: `${API_URL}/lead-intelligence`,
    INTELLIGENCE_TIMELINE: (groupId: string) => `${API_URL}/lead-intelligence/${groupId}/timeline`,
    INTELLIGENCE_EDIT: (groupId: string) => `${API_URL}/lead-intelligence/${encodeURIComponent(groupId)}`,
    INTELLIGENCE_EVENTS: (groupId: string) => `${API_URL}/lead-intelligence/${encodeURIComponent(groupId)}/events`,
    INTELLIGENCE_TEAM_MEMBERS: `${API_URL}/lead-intelligence/team-members`,
  },

  // Extractions (Chat Agent Server proxy)
  EXTRACTIONS: {
    SUMMARIES: (phone: string) => `${API_URL}/extractions/summaries?customer_phone=${encodeURIComponent(phone)}`,
    FULL: (phone: string) => `${API_URL}/extractions?customer_phone=${encodeURIComponent(phone)}`,
    BATCH_SUMMARIES: `${API_URL}/extractions/batch-summaries`,
  },

  // Team Members
  TEAM_MEMBERS: {
    LIST: `${API_URL}/team-members`,
    STATS: `${API_URL}/team-members/stats`,
    ROLES: `${API_URL}/team-members/roles`,
    INVITE: `${API_URL}/team-members/invite`,
    UPDATE: (id: string) => `${API_URL}/team-members/${id}`,
    DELETE: (id: string) => `${API_URL}/team-members/${id}`,
    RESEND_INVITE: (id: string) => `${API_URL}/team-members/${id}/resend-invite`,
    SET_PASSWORD: `${API_URL}/team-members/set-password`,
    VALIDATE_TOKEN: (token: string) => `${API_URL}/team-members/validate-token/${token}`,
  },

  // Follow-ups
  FOLLOW_UPS: {
    LIST: `${API_URL}/follow-ups`,
    CREATE: `${API_URL}/follow-ups`,
    UPDATE: (id: string) => `${API_URL}/follow-ups/${id}`,
    COMPLETE: (id: string) => `${API_URL}/follow-ups/${id}/complete`,
    DELETE: (id: string) => `${API_URL}/follow-ups/${id}`,
  },

  // Notifications
  NOTIFICATIONS: {
    LIST: `${API_URL}/notifications`,
    MARK_READ: (id: string) => `${API_URL}/notifications/${id}/read`,
    MARK_ALL_READ: `${API_URL}/notifications/read-all`,
  },

  // Transcripts
  TRANSCRIPTS: {
    SEARCH: `${API_URL}/transcripts/search`,
    ANALYTICS: `${API_URL}/transcripts/analytics`,
    BY_CALL: (callId: string) => `${API_URL}/transcripts/call/${callId}`,
    EXPORT: (callId: string) => `${API_URL}/transcripts/call/${callId}/export`,
    FORMATTED: (callId: string) => `${API_URL}/transcripts/call/${callId}/formatted`,
  },

  // Analytics
  ANALYTICS: {
    CALLS: (callId: string) => `${API_URL}/analytics/calls/${callId}`,
    LEADS: `${API_URL}/analytics/leads`,
    SUMMARY: `${API_URL}/analytics/summary`,
    SCORE_DISTRIBUTION: `${API_URL}/analytics/score-distribution`,
    DASHBOARD: {
      METRICS: `${API_URL}/analytics/dashboard/metrics`,
      CALL_VOLUME: `${API_URL}/analytics/dashboard/call-volume`,
      LEAD_TRENDS: `${API_URL}/analytics/dashboard/lead-trends`,
      CTA_TRENDS: `${API_URL}/analytics/dashboard/cta-trends`,
      TOP_AGENTS: `${API_URL}/analytics/dashboard/top-agents`,
    },
  },

  // Call Analytics
  CALL_ANALYTICS: {
    KPIS: `${API_URL}/call-analytics/kpis`,
    LEAD_QUALITY: `${API_URL}/call-analytics/lead-quality`,
    FUNNEL: `${API_URL}/call-analytics/funnel`,
    INTENT_BUDGET: `${API_URL}/call-analytics/intent-budget`,
    SOURCE_BREAKDOWN: `${API_URL}/call-analytics/source-breakdown`,
    CALL_SOURCE_ANALYTICS: `${API_URL}/call-analytics/call-source-analytics`,
    SUMMARY: `${API_URL}/call-analytics/summary`,
  },

  // Agent Analytics
  AGENT_ANALYTICS: {
    OVERVIEW: (agentId: string) => `${API_URL}/agent-analytics/${agentId}/overview`,
    METRICS: (agentId: string) => `${API_URL}/agent-analytics/${agentId}/metrics`,
    CALL_OUTCOMES: (agentId: string) => `${API_URL}/agent-analytics/${agentId}/call-outcomes`,
    TRENDS: (agentId: string) => `${API_URL}/agent-analytics/${agentId}/trends`,
    TARGETS: (agentId: string) => `${API_URL}/agent-analytics/${agentId}/targets`,
    COMPARISON: (agentId: string) => `${API_URL}/agent-analytics/${agentId}/comparison`,
    RANKING: (agentId: string) => `${API_URL}/agent-analytics/${agentId}/ranking`,
    REALTIME: (agentId: string) => `${API_URL}/agent-analytics/${agentId}/realtime`,
  },

  // User Management
  USER: {
    INITIALIZE: `${API_URL}/user/initialize`,
    PROFILE: `${API_URL}/user/profile`,
    STATS: `${API_URL}/user/stats`,
    CREDITS: `${API_URL}/user/credits`,
    CHECK_CREDITS: `${API_URL}/user/check-credits`,
    DELETE_ACCOUNT: `${API_URL}/user/account`,
    UPDATE_PASSWORD: `${API_URL}/user/password`,
  },

  // Phone Numbers
  PHONE_NUMBERS: {
    LIST: `${API_URL}/phone-numbers`,
  },

  // WhatsApp Chat Agent Service (External Service)
  WHATSAPP: {
    PHONE_NUMBERS: (userId: string, platform?: string) => `${WHATSAPP_API_URL}/phone-numbers?user_id=${userId}${platform ? `&platform=${platform}` : ''}`,
    // Convenience method for WhatsApp-only phone numbers (used in template features)
    WHATSAPP_PHONE_NUMBERS: (userId: string) => `${WHATSAPP_API_URL}/phone-numbers?user_id=${userId}&platform=whatsapp`,
    TEMPLATES: (phoneNumberId: string) => `${WHATSAPP_API_URL}/templates?phone_number_id=${phoneNumberId}`,
    SEND: `${WHATSAPP_API_URL}/send`,
    CAMPAIGN: `${WHATSAPP_API_URL}/campaign`,
    CAMPAIGN_STATUS: (campaignId: string) => `${WHATSAPP_API_URL}/campaign/${campaignId}`,
  },

  // Customers
  CUSTOMERS: {
    LIST: `${API_URL}/customers`,
    CREATE: `${API_URL}/customers`,
    GET: (id: string) => `${API_URL}/customers/${id}`,
    UPDATE: (id: string) => `${API_URL}/customers/${id}`,
    DELETE: (id: string) => `${API_URL}/customers/${id}`,
    CONVERT: `${API_URL}/customers/convert`,
    ANALYTICS: `${API_URL}/customers/analytics`,
  },

  // Chat Leads (Chat Agent Conversations)
  CHAT_LEADS: {
    LIST: `${API_URL}/chat-leads`,
    STATS: `${API_URL}/chat-leads/stats`,
    GET: (customerPhone: string) => `${API_URL}/chat-leads/${encodeURIComponent(customerPhone)}`,
    MESSAGES: (customerPhone: string) => `${API_URL}/chat-leads/${encodeURIComponent(customerPhone)}/messages`,
    MESSAGE_STATUS: (messageId: string) => `${API_URL}/chat-leads/messages/${encodeURIComponent(messageId)}/status`,
  },

  // Email
  EMAIL: {
    SEND_VERIFICATION: `${API_URL}/email/send-verification`,
    VERIFY: `${API_URL}/email/verify`,
    SEND_PASSWORD_RESET: `${API_URL}/email/send-password-reset`,
    RESET_PASSWORD: `${API_URL}/email/reset-password`,
    VALIDATE_RESET_TOKEN: `${API_URL}/email/validate-reset-token`,
    TEST: `${API_URL}/email/test`,
    ADMIN_SEND_REMINDERS: `${API_URL}/email/admin/send-verification-reminders`,
  },

  // Admin (if user has admin access)
  ADMIN: {
    USERS: `${API_URL}/admin/users`,
    USER: (userId: string) => `${API_URL}/admin/users/${userId}`,
    USER_CREDITS: (userId: string) => `${API_URL}/admin/users/${userId}/credits`,
    SYSTEM_STATS: `${API_URL}/admin/stats/system`,
    AUDIT_LOGS: `${API_URL}/admin/audit/logs`,
    AUDIT_STATS: `${API_URL}/admin/audit/stats`,
    CONFIG: `${API_URL}/admin/config`,
    AGENTS: `${API_URL}/admin/agents`,
    AGENTS_STATS: `${API_URL}/admin/agents/stats`,
    AGENTS_MONITOR: `${API_URL}/admin/agents/monitor`,
    USER_AGENT: (userId: string, agentId: string) => `${API_URL}/admin/users/${userId}/agents/${agentId}`,
    AGENTS_BULK_STATUS: `${API_URL}/admin/agents/bulk-status`,
    AGENTS_HEALTH: `${API_URL}/admin/agents/health`,
    VALIDATE: `${API_URL}/admin/validate`,
    PROFILE: `${API_URL}/admin/profile`,
    ANALYTICS_REALTIME: `${API_URL}/admin/analytics/realtime`,
    REPORTS_GENERATE: `${API_URL}/admin/reports/generate`,
    REPORTS_DOWNLOAD: (reportId: string) => `${API_URL}/admin/reports/${reportId}/download`,
    ANALYTICS_EXPORT: `${API_URL}/admin/analytics/export`,
    // Manual Triggers
    MANUAL_TRIGGERS_ANALYSIS: `${API_URL}/admin/manual-triggers/analysis`,
    MANUAL_TRIGGERS_WEBHOOK: `${API_URL}/admin/manual-triggers/webhook`,
    MANUAL_TRIGGERS_CALL: (executionId: string) => `${API_URL}/admin/manual-triggers/call/${executionId}`,
  },

  // Webhooks (for reference, not typically called from frontend)
  WEBHOOKS: {
    ELEVENLABS_POST_CALL: `${API_URL}/webhooks/elevenlabs/post-call`,
    ELEVENLABS_CALL_COMPLETED: `${API_URL}/webhooks/elevenlabs/call-completed`,
    ELEVENLABS_CALL_ANALYTICS: `${API_URL}/webhooks/elevenlabs/call-analytics`,
    CONTACT_LOOKUP: (phone: string) => `${API_URL}/webhooks/contact-lookup/${phone}`,
    HEALTH: `${API_URL}/webhooks/health`,
    STATUS: `${API_URL}/webhooks/status`,
    RETRY: (jobId: string) => `${API_URL}/webhooks/retry/${jobId}`,
  },
};

// Import types from centralized types file
import type { ApiResponse, Agent } from '../types';

// API Client Configuration
export const apiClient = {
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
};

// Helper function to get auth token from custom auth
export const getAuthToken = (): string | null => {
  // Get custom auth token from localStorage
  return localStorage.getItem('auth_token');
};

export default API_ENDPOINTS;

// Re-export types for backward compatibility
export type { ApiResponse, Agent };
