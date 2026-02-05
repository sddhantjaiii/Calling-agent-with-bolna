// Frontend types for Auto Engagement Flows
// Mirrors backend types with frontend-specific additions

export type ExecutionStatus = 
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'skipped';

export type ActionLogStatus = 
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped';

export type ActionType = 
  | 'ai_call'
  | 'whatsapp_message'
  | 'email'
  | 'wait';

export type ConditionType = 
  | 'lead_source'
  | 'entry_type'
  | 'custom_field';

export type ConditionOperator = 
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'any';

export type ActionConditionType = 
  | 'call_outcome'
  | 'previous_action_status'
  | 'always';

export type CallOutcome = 
  | 'answered'
  | 'missed'
  | 'failed';

// Auto Engagement Flow
export interface AutoEngagementFlow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  priority: number;
  
  // Business hours
  use_custom_business_hours: boolean;
  business_hours_start: string | null;
  business_hours_end: string | null;
  business_hours_timezone: string | null;
  
  // Metadata
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// Flow Trigger Condition
export interface FlowTriggerCondition {
  id: string;
  flow_id: string;
  condition_type: ConditionType;
  condition_operator: ConditionOperator;
  condition_value: string | null;
  created_at: string;
}

// Action Configurations
export interface AICallActionConfig {
  agent_id: string;
  phone_number_id: string;
  max_retries?: number;
  respect_dnc?: boolean;
}

export interface WhatsAppActionConfig {
  whatsapp_phone_number_id: string;
  template_id: string;
  variable_mappings?: Record<string, string>;
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

// Flow Action
export interface FlowAction {
  id: string;
  flow_id: string;
  action_order: number;
  action_type: ActionType;
  action_config: ActionConfig;
  
  // Conditional execution
  condition_type: ActionConditionType | null;
  condition_value: string | null;
  
  created_at: string;
}

// Flow Execution
export interface FlowExecution {
  id: string;
  flow_id: string;
  contact_id: string;
  user_id: string;
  
  triggered_at: string;
  status: ExecutionStatus;
  current_action_step: number;
  
  completed_at: string | null;
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

// Flow Action Log
export interface FlowActionLog {
  id: string;
  flow_execution_id: string;
  action_id: string;
  
  action_type: ActionType;
  action_order: number;
  
  started_at: string;
  completed_at: string | null;
  
  status: ActionLogStatus;
  
  // Results
  result_data: Record<string, any>;
  error_message: string | null;
  skip_reason: string | null;
}

// Flow with full details
export interface FlowWithDetails extends AutoEngagementFlow {
  trigger_conditions: FlowTriggerCondition[];
  actions: FlowAction[];
}

// Create/Update requests
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
  
  // Triggers and actions
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

export interface BulkPriorityUpdateRequest {
  updates: Array<{
    id: string;
    priority: number;
  }>;
}

// Execution Statistics
export interface FlowExecutionStats {
  total_executions: number;
  completed: number;
  failed: number;
  running: number;
  cancelled: number;
  skipped: number;
}

export interface ActionStats {
  action_type: ActionType;
  total_executions: number;
  successful: number;
  failed: number;
  skipped: number;
}

// API Response types
export interface FlowsListResponse {
  success: boolean;
  data: AutoEngagementFlow[];
  meta?: {
    total: number;
    limit?: number;
    offset?: number;
  };
}

export interface FlowResponse {
  success: boolean;
  data: FlowWithDetails;
}

export interface ExecutionsListResponse {
  success: boolean;
  data: FlowExecution[];
}

export interface ExecutionDetailResponse {
  success: boolean;
  data: FlowExecution & {
    action_logs: FlowActionLog[];
  };
}

export interface FlowStatisticsResponse {
  success: boolean;
  data: {
    execution_statistics: FlowExecutionStats;
    action_statistics: ActionStats[];
  };
}
