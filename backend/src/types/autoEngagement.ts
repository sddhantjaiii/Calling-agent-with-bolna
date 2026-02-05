// Type definitions for Auto Engagement Flow System

/**
 * Execution Status Types
 */
export type ExecutionStatus = 
  | 'running'     // Currently executing
  | 'completed'   // Successfully completed
  | 'failed'      // Failed with error
  | 'cancelled'   // Manually cancelled
  | 'skipped';    // Skipped (e.g., DNC tag)

/**
 * Action Log Status Types
 */
export type ActionLogStatus = 
  | 'pending'   // Waiting to execute
  | 'running'   // Currently executing
  | 'success'   // Successfully completed
  | 'failed'    // Failed with error
  | 'skipped';  // Skipped based on condition

/**
 * Action Types
 */
export type ActionType = 
  | 'ai_call'           // AI voice call
  | 'whatsapp_message'  // WhatsApp template message
  | 'email'             // Email
  | 'wait';             // Wait/delay action

/**
 * Trigger Condition Types
 */
export type ConditionType = 
  | 'lead_source'    // Based on contact source
  | 'entry_type'     // Based on entry method
  | 'custom_field';  // Based on custom field value

/**
 * Trigger Condition Operators
 */
export type ConditionOperator = 
  | 'equals'      // Exact match
  | 'not_equals'  // Does not match
  | 'contains'    // Contains substring
  | 'any';        // Matches any value

/**
 * Action Condition Types
 */
export type ActionConditionType = 
  | 'call_outcome'              // Based on call result
  | 'previous_action_status'    // Based on previous action status
  | 'always';                   // Always execute

/**
 * Call Outcome Values
 */
export type CallOutcome = 
  | 'answered'  // Call was answered
  | 'missed'    // Call was not answered
  | 'failed';   // Call failed to connect

/**
 * Auto Engagement Flow
 */
export interface AutoEngagementFlow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  priority: number;
  
  // Business hours
  use_custom_business_hours: boolean;
  business_hours_start: string | null;  // TIME format
  business_hours_end: string | null;    // TIME format
  business_hours_timezone: string | null;
  
  // Metadata
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
}

/**
 * Flow Trigger Condition
 */
export interface FlowTriggerCondition {
  id: string;
  flow_id: string;
  condition_type: ConditionType;
  condition_operator: ConditionOperator;
  condition_value: string | null;
  created_at: Date;
}

/**
 * Flow Action Configuration Types
 */
export interface AICallActionConfig {
  agent_id: string;
  phone_number_id: string;  // Which caller ID to use
  max_retries?: number;
  respect_dnc?: boolean;
}

export interface WhatsAppActionConfig {
  whatsapp_phone_number_id: string;
  template_id: string;
  variable_mappings?: Record<string, string>;  // Maps template variable positions to contact fields
}

export interface EmailActionConfig {
  email_template_id: string;
  from_name?: string;
  subject_override?: string | null;
}

export interface WaitActionConfig {
  duration_minutes: number;
  wait_until_business_hours?: boolean;
}

export type ActionConfig = 
  | AICallActionConfig 
  | WhatsAppActionConfig 
  | EmailActionConfig 
  | WaitActionConfig;

/**
 * Flow Action
 */
export interface FlowAction {
  id: string;
  flow_id: string;
  action_order: number;
  action_type: ActionType;
  action_config: ActionConfig;
  
  // Conditional execution
  condition_type: ActionConditionType | null;
  condition_value: string | null;
  
  created_at: Date;
}

/**
 * Flow Execution
 */
export interface FlowExecution {
  id: string;
  flow_id: string;
  contact_id: string;
  user_id: string;
  
  triggered_at: Date;
  status: ExecutionStatus;
  current_action_step: number;
  
  completed_at: Date | null;
  error_message: string | null;
  
  // Execution metadata
  metadata: Record<string, any>;
  
  // Test mode
  is_test_run: boolean;
  
  // Joined fields (when queried with JOINs)
  flow_name?: string;
  contact_name?: string;
  contact_phone?: string;
}

/**
 * Flow Action Log
 */
export interface FlowActionLog {
  id: string;
  flow_execution_id: string;
  action_id: string;
  
  action_type: ActionType;
  action_order: number;
  
  started_at: Date;
  completed_at: Date | null;
  
  status: ActionLogStatus;
  
  // Results
  result_data: Record<string, any>;
  error_message: string | null;
  skip_reason: string | null;
}

/**
 * Flow with full details (including triggers and actions)
 */
export interface FlowWithDetails extends AutoEngagementFlow {
  trigger_conditions: FlowTriggerCondition[];
  actions: FlowAction[];
}

/**
 * Create Flow Request
 */
export interface CreateFlowRequest {
  name: string;
  description?: string;
  is_enabled?: boolean;
  priority: number;
  
  // Business hours
  use_custom_business_hours?: boolean;
  business_hours_start?: string;
  business_hours_end?: string;
  business_hours_timezone?: string;
  
  // Triggers and actions (optional on create)
  trigger_conditions?: Array<{
    condition_type: ConditionType;
    condition_operator: ConditionOperator;
    condition_value: string | null;
  }>;
  
  actions?: Array<{
    action_order: number;
    action_type: ActionType;
    action_config: ActionConfig;
    condition_type?: ActionConditionType | null;
    condition_value?: string | null;
  }>;
}

/**
 * Update Flow Request
 */
export interface UpdateFlowRequest {
  name?: string;
  description?: string;
  is_enabled?: boolean;
  priority?: number;
  
  // Business hours
  use_custom_business_hours?: boolean;
  business_hours_start?: string;
  business_hours_end?: string;
  business_hours_timezone?: string;
}

/**
 * Trigger Condition Match Result
 */
export interface TriggerMatchResult {
  matched: boolean;
  flow: FlowWithDetails | null;
  reason?: string;
}

/**
 * Flow Execution Statistics
 */
export interface FlowExecutionStats {
  total_executions: number;
  completed: number;
  failed: number;
  running: number;
  cancelled: number;
  skipped: number;
}

/**
 * Action Statistics
 */
export interface ActionStats {
  action_type: ActionType;
  total_executions: number;
  successful: number;
  failed: number;
  skipped: number;
}

/**
 * Flow Execution Context
 * Data available during flow execution
 */
export interface FlowExecutionContext {
  flow: FlowWithDetails;
  contact: {
    id: string;
    name: string;
    phone_number: string;
    email: string | null;
    company: string | null;
    auto_creation_source: string | null;
    tags: string[];
    [key: string]: any;  // Custom fields
  };
  user_id: string;
  is_test_run: boolean;
}

/**
 * Test Flow Request
 */
export interface TestFlowRequest {
  contact_id: string;
  simulate_only?: boolean;  // If true, don't actually execute actions
}

/**
 * Test Flow Result
 */
export interface TestFlowResult {
  execution_id: string;
  flow_name: string;
  contact_name: string;
  triggered_at: Date;
  simulated_actions: Array<{
    action_order: number;
    action_type: ActionType;
    would_execute: boolean;
    skip_reason?: string;
    config: ActionConfig;
  }>;
}

/**
 * Bulk Priority Update Request
 */
export interface BulkPriorityUpdateRequest {
  updates: Array<{
    id: string;
    priority: number;
  }>;
}

/**
 * Flow Analytics
 */
export interface FlowAnalytics {
  flow_id: string;
  flow_name: string;
  
  // Execution metrics
  total_executions: number;
  successful_executions: number;
  failed_executions: number;
  average_execution_time_seconds: number;
  
  // Action metrics
  action_statistics: ActionStats[];
  
  // Timing
  first_execution: Date | null;
  last_execution: Date | null;
}

export default {
  ExecutionStatus,
  ActionLogStatus,
  ActionType,
  ConditionType,
  ConditionOperator,
  ActionConditionType,
  CallOutcome
};
