// Webhook types - Bolna.ai webhook payloads (based on real production data)

/**
 * Webhook Event Types (5-stage lifecycle)
 */
export type WebhookEventType = 
  | 'initiated'
  | 'ringing'
  | 'in-progress'
  | 'no-answer'
  | 'busy'
  | 'call-disconnected'
  | 'completed';

/**
 * Bolna.ai Webhook Payload (Real Structure)
 * Based on actual webhook payloads received from Bolna.ai
 */
export interface BolnaWebhookPayload {
  // Primary identifier (this is the main ID field in real payloads)
  id: string;
  
  // Also sent as execution_id for compatibility
  execution_id?: string;
  
  // Agent information
  agent_id: string;
  batch_id?: string | null;
  
  // Timestamps
  created_at: string;
  updated_at: string;
  scheduled_at: string;
  rescheduled_at?: string | null;
  
  // Call status (THIS is how we differentiate webhook stages)
  status: 'initiated' | 'ringing' | 'in-progress' | 'call-disconnected' | 'completed' | 'busy' | 'no-answer' | 'failed';
  
  // Call data
  answered_by_voice_mail?: boolean | null;
  conversation_duration: number;
  total_cost: number;
  
  // Transcript (available from "call-disconnected" status onwards)
  transcript: string | null;
  
  // Telephony data (contains recording URL in "completed" status)
  telephony_data: {
    duration: string;
    to_number: string;
    from_number: string;
    recording_url: string | null;  // ✅ Available at "completed" status
    hosted_telephony: boolean;
    provider_call_id: string;
    call_type: 'inbound' | 'outbound';
    provider: string;
    hangup_by: string | null;
    hangup_reason: string | null;
    hangup_provider_code: number | null;
  };
  
  // Context information
  context_details: {
    recipient_data: any | null;
    recipient_phone_number: string;
  };
  
  // Usage and cost breakdown
  usage_breakdown: any;
  cost_breakdown: any;
  
  // Extraction and analysis
  extracted_data: any | null;
  agent_extraction: string | null;
  summary: string | null;
  
  // Additional fields
  error_message: string | null;
  workflow_retries: any | null;
  custom_extractions: any | null;
  campaign_id: string | null;
  smart_status: string | null;
  arq_job_id: string | null;
  transfer_call_data: any | null;
  batch_run_details: any | null;
  provider: string;
}

export interface StripeWebhookPayload {
  id: string;
  object: string;
  type: string;
  data: {
    object: any;
  };
  created: number;
}
