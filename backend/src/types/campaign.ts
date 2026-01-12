// Type definitions for Call Campaigns and Queue System

/**
 * Call Campaign Status
 */
export type CampaignStatus = 
  | 'draft'      // Campaign created but not started
  | 'scheduled'  // Campaign scheduled for future
  | 'active'     // Campaign currently running
  | 'paused'     // Campaign temporarily paused by user
  | 'completed'  // All calls completed
  | 'cancelled'; // Campaign cancelled by user

/**
 * Call Queue Status
 */
export type QueueStatus = 
  | 'queued'      // Waiting in queue
  | 'processing'  // Call being initiated
  | 'completed'   // Call completed successfully
  | 'failed'      // Call failed
  | 'cancelled'   // Call cancelled
  | 'skipped';    // Call skipped (e.g., contact unreachable)

/**
 * Call Type - Direct or Campaign
 */
export type CallType = 'direct' | 'campaign';

/**
 * Retry Strategy Type
 */
export type RetryStrategy = 'simple' | 'custom';

/**
 * Custom Retry Entry
 */
export interface CustomRetryEntry {
  attempt: number;        // Retry attempt number (1-5)
  delay_minutes: number;  // Minutes to wait after previous attempt
}

/**
 * Custom Retry Schedule
 */
export interface CustomRetrySchedule {
  retries: CustomRetryEntry[];
}

/**
 * Call Campaign Interface
 */
export interface CallCampaign {
  id: string;
  user_id: string;
  
  // Campaign details
  name: string;
  description?: string;
  agent_id: string;
  phone_number_id?: string | null; // User-selected phone number for campaign calls
  
  // Configuration
  next_action: string;
  
  // Time window (daily recurring)
  first_call_time: string; // HH:MM:SS format
  last_call_time: string;  // HH:MM:SS format
  
  // Timezone settings (Phase 2)
  campaign_timezone?: string | null;      // Optional override timezone
  use_custom_timezone?: boolean;          // Use campaign timezone vs user timezone
  
  // Retry configuration for busy/no-answer calls
  max_retries: number;           // Number of retry attempts (0 = no retries)
  retry_interval_minutes: number; // Minutes between retry attempts
  retry_strategy: RetryStrategy;  // 'simple' or 'custom'
  custom_retry_schedule?: CustomRetrySchedule | null; // Custom schedule when strategy is 'custom'
  
  // Status
  status: CampaignStatus;
  
  // Statistics
  total_contacts: number;
  completed_calls: number;
  successful_calls: number;
  failed_calls: number;
  
  // Scheduling
  start_date: string; // YYYY-MM-DD
  end_date?: string;  // YYYY-MM-DD
  
  // Timestamps
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  
  // Relations (populated when needed)
  agent?: any;
  queue_items?: CallQueueItem[];
}

/**
 * Call Queue Item Interface
 */
export interface CallQueueItem {
  id: string;
  user_id: string;
  campaign_id: string | null; // Nullable for direct calls
  agent_id: string;
  contact_id: string;
  
  // Call type
  call_type: CallType;
  
  // Contact details
  phone_number: string;
  contact_name?: string;
  
  // Configuration
  user_data: {
    summary: string;
    next_action: string;
    [key: string]: any; // Custom fields from CSV
  };
  
  // Queue management
  status: QueueStatus;
  priority: number;
  position: number;
  
  // Scheduling
  scheduled_for: string;
  
  // Execution
  started_at?: string;
  completed_at?: string;
  
  // Results
  call_id?: string;
  failure_reason?: string;
  
  // Round-robin
  last_system_allocation_at?: string;
  
  // Retry tracking
  retry_count: number;           // Number of retry attempts made
  original_queue_id?: string;    // Reference to original queue item if this is a retry
  last_call_outcome?: string;    // Outcome of last call attempt (busy, no-answer)
  
  // Timestamps
  created_at: string;
  updated_at: string;
  
  // Relations (populated when needed)
  campaign?: CallCampaign;
  contact?: any;
  call?: any;
}

/**
 * Campaign Creation Request
 */
export interface CreateCampaignRequest {
  name: string;
  description?: string;
  agent_id: string;
  phone_number_id?: string; // Optional: user-selected phone number for campaign calls
  next_action: string;
  
  // Time window
  first_call_time: string; // HH:MM format (e.g., "09:00")
  last_call_time: string;  // HH:MM format (e.g., "18:00")
  
  // Scheduling
  start_date: string; // YYYY-MM-DD
  end_date?: string;  // YYYY-MM-DD
  
  // Timezone override (optional)
  campaign_timezone?: string | null;  // IANA timezone (e.g., "America/New_York")
  use_custom_timezone?: boolean;      // If true, use campaign_timezone; else use user timezone
  
  // Retry configuration
  max_retries?: number;           // Number of retries for busy/no-answer (default: 0)
  retry_interval_minutes?: number; // Minutes between retries (default: 60)
  retry_strategy?: RetryStrategy;  // 'simple' or 'custom' (default: 'simple')
  custom_retry_schedule?: CustomRetrySchedule; // Custom schedule when strategy is 'custom'
  
  // Contacts
  contact_ids: string[]; // Array of contact IDs to add to campaign
}

/**
 * CSV Upload Request
 */
export interface CSVUploadRequest {
  campaign_name: string;
  description?: string;
  agent_id: string;
  next_action: string;
  
  // Time window
  first_call_time: string;
  last_call_time: string;
  
  // Scheduling
  start_date: string;
  end_date?: string;
  
  // CSV data
  csv_data: CSVContactRow[];
}

/**
 * CSV Contact Row
 */
export interface CSVContactRow {
  name: string;
  phone_number: string;
  email?: string;
  company?: string;
  notes?: string;
  [key: string]: any; // Custom columns
}

/**
 * CSV Upload Result
 */
export interface CSVUploadResult {
  campaign_id: string;
  total_rows: number;
  imported: number;
  skipped: number;
  failed: number;
  errors: Array<{
    row: number;
    field: string;
    error: string;
  }>;
}

/**
 * Campaign Update Request
 */
export interface UpdateCampaignRequest {
  name?: string;
  description?: string;
  next_action?: string;
  first_call_time?: string;
  last_call_time?: string;
  start_date?: string;
  end_date?: string;
  status?: CampaignStatus;
  campaign_timezone?: string | null;
  use_custom_timezone?: boolean;
  max_retries?: number;
  retry_interval_minutes?: number;
  retry_strategy?: RetryStrategy;
  custom_retry_schedule?: CustomRetrySchedule | null;
}

/**
 * Queue Statistics
 */
export interface QueueStatistics {
  user_id: string;
  
  // User-level stats
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  
  // Concurrency
  active_calls: number;
  user_concurrent_limit: number;
  system_concurrent_limit: number;
  
  // Estimated times
  estimated_completion_time?: string;
  next_call_scheduled_for?: string;
  
  // Position info
  next_in_queue?: {
    queue_id: string;
    contact_name: string;
    scheduled_for: string;
    position: number;
  };
}

/**
 * Campaign Analytics
 */
export interface CampaignAnalytics {
  campaign_id: string;
  campaign_name: string;
  
  // Overview
  total_contacts: number;
  completed_calls: number;
  successful_calls: number;
  failed_calls: number;
  in_progress: number;
  queued: number;
  
  // Progress metrics
  handled_calls: number; // Unique contacts with any terminal outcome (for progress %)
  total_call_attempts?: number; // Total calls including retries (optional, for detailed view)
  progress_percentage: number; // handled_calls / total_contacts * 100 (capped at 100)
  attempted_calls: number; // Calls that left queue (not counting 'queued' status)
  contacted_calls: number; // Calls where someone picked up (completed, in-progress)
  call_connection_rate: number; // contacted_calls / attempted_calls * 100
  
  // Success metrics
  success_rate: number; // Percentage
  average_call_duration: number; // Seconds (legacy field, kept for compatibility)
  average_duration_seconds: number; // Seconds (primary field)
  total_credits_used: number;
  
  // Time metrics
  campaign_duration: number; // Hours
  estimated_completion: string; // ISO timestamp
  
  // Attempt Distribution (based on call_lifecycle_status)
  attempt_distribution: {
    busy: number;           // call_lifecycle_status = 'busy'
    no_answer: number;      // call_lifecycle_status = 'no-answer'
    contacted: number;      // call_lifecycle_status IN ('completed', 'in-progress')
    failed: number;         // call_lifecycle_status = 'failed'
    not_attempted: number;  // Still queued
  };
  
  // Call outcomes (legacy, kept for compatibility)
  outcomes: {
    answered: number;
    busy: number;
    no_answer: number;
    failed: number;
    voicemail: number;
  };
  
  // Daily breakdown
  daily_stats: Array<{
    date: string;
    calls_made: number;
    successful: number;
    failed: number;
  }>;
}

/**
 * Campaign List Response
 */
export interface CampaignListResponse {
  campaigns: CallCampaign[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

/**
 * Queue List Response
 */
export interface QueueListResponse {
  queue_items: CallQueueItem[];
  total: number;
  statistics: QueueStatistics;
}

/**
 * User Settings Response (Concurrency Limits)
 */
export interface UserConcurrencySettings {
  user_id: string;
  concurrent_calls_limit: number;
  system_concurrent_calls_limit: number;
  current_active_calls: number;
  available_slots: number;
}

/**
 * Round Robin Allocation Result
 */
export interface RoundRobinAllocation {
  user_id: string;
  allocated_slots: number;
  reason: 'user_limit' | 'system_limit' | 'no_queue';
}

/**
 * Campaign Action Response
 */
export interface CampaignActionResponse {
  success: boolean;
  message: string;
  campaign?: CallCampaign;
}

/**
 * Bulk Call Request (from contacts page)
 */
export interface BulkCallRequest {
  contact_ids: string[];
  agent_id: string;
  next_action: string;
  first_call_time: string;
  last_call_time: string;
  start_date: string;
  campaign_name?: string; // Optional: auto-generate if not provided
}

/**
 * Contact Priority Calculation
 */
export interface ContactPriorityScore {
  contact_id: string;
  priority: number;
  reasons: string[]; // Why this priority was assigned
}

/**
 * Direct Call Queue Request
 */
export interface DirectCallQueueRequest {
  user_id: string;
  agent_id: string;
  contact_id: string;
  phone_number: string;
  contact_name?: string;
  priority?: number; // Default 100 for direct calls (higher than campaign)
}

/**
 * Direct Call Queue Response
 */
export interface DirectCallQueueResponse {
  queued: true;
  queue_id: string;
  position: number;
  estimated_wait_seconds: number;
  message: string;
}

/**
 * Queue Position Update
 */
export interface QueuePositionUpdate {
  queue_id: string;
  old_position: number;
  new_position: number;
  reason: string;
}

/**
 * System Concurrency Status
 */
export interface SystemConcurrencyStatus {
  total_active_calls: number;
  system_limit: number;
  available_slots: number;
  users_in_round_robin: Array<{
    user_id: string;
    user_name: string;
    active_calls: number;
    user_limit: number;
    queued_calls: number;
    last_allocation: string;
  }>;
}
