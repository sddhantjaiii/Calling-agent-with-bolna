// API Service for Auto Engagement Flows
import { apiService } from './apiService';
import { API_ENDPOINTS } from '../config/api';
import type {
  AutoEngagementFlow,
  FlowWithDetails,
  FlowExecution,
  CreateFlowRequest,
  UpdateFlowRequest,
  BulkPriorityUpdateRequest,
  FlowsListResponse,
  FlowResponse,
  ExecutionsListResponse,
  ExecutionDetailResponse,
  FlowStatisticsResponse,
} from '../types/autoEngagement';

export const autoEngagementService = {
  // Flow Management
  async getFlows(params?: { enabled_only?: boolean; limit?: number; offset?: number }): Promise<FlowsListResponse> {
    const queryParams = new URLSearchParams();
    if (params?.enabled_only) queryParams.append('enabled_only', 'true');
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    
    const url = `${API_ENDPOINTS.AUTO_ENGAGEMENT.FLOWS}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return apiService.get<FlowsListResponse>(url);
  },

  async getFlow(id: string): Promise<FlowResponse> {
    return apiService.get<FlowResponse>(API_ENDPOINTS.AUTO_ENGAGEMENT.FLOW(id));
  },

  async createFlow(data: CreateFlowRequest): Promise<FlowResponse> {
    return apiService.post<FlowResponse>(API_ENDPOINTS.AUTO_ENGAGEMENT.FLOWS, data);
  },

  async updateFlow(id: string, data: UpdateFlowRequest): Promise<{ success: boolean; data: AutoEngagementFlow }> {
    return apiService.patch<{ success: boolean; data: AutoEngagementFlow }>(
      API_ENDPOINTS.AUTO_ENGAGEMENT.FLOW(id),
      data
    );
  },

  async deleteFlow(id: string): Promise<{ success: boolean; message: string }> {
    return apiService.delete<{ success: boolean; message: string }>(
      API_ENDPOINTS.AUTO_ENGAGEMENT.FLOW(id)
    );
  },

  async toggleFlow(id: string, enabled: boolean): Promise<{ success: boolean; data: AutoEngagementFlow }> {
    return apiService.patch<{ success: boolean; data: AutoEngagementFlow }>(
      API_ENDPOINTS.AUTO_ENGAGEMENT.FLOW_TOGGLE(id),
      { enabled }
    );
  },

  async bulkUpdatePriorities(updates: BulkPriorityUpdateRequest): Promise<{ success: boolean; message: string }> {
    return apiService.post<{ success: boolean; message: string }>(
      API_ENDPOINTS.AUTO_ENGAGEMENT.PRIORITIES_BULK_UPDATE,
      updates
    );
  },

  async updateTriggerConditions(
    id: string,
    conditions: Array<{
      condition_type: string;
      condition_operator: string;
      condition_value: string | null;
    }>
  ): Promise<{ success: boolean; data: any[] }> {
    // Backend expects camelCase, normalize from snake_case
    const normalizedConditions = conditions.map(c => ({
      conditionType: c.condition_type,
      conditionOperator: c.condition_operator,
      conditionValue: c.condition_value ?? null
    }));

    return apiService.put<{ success: boolean; data: any[] }>(
      API_ENDPOINTS.AUTO_ENGAGEMENT.FLOW_CONDITIONS(id),
      { conditions: normalizedConditions }
    );
  },

  async updateActions(
    id: string,
    actions: Array<{
      actionOrder: number;
      actionType: string;
      actionConfig: any;
      conditionType?: string | null;
      conditionValue?: string | null;
    }>
  ): Promise<{ success: boolean; data: any[] }> {
    return apiService.put<{ success: boolean; data: any[] }>(
      API_ENDPOINTS.AUTO_ENGAGEMENT.FLOW_ACTIONS(id),
      { actions }
    );
  },

  // Execution Management
  async getFlowExecutions(
    id: string,
    params?: { status?: string; limit?: number; offset?: number }
  ): Promise<ExecutionsListResponse> {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    
    const url = `${API_ENDPOINTS.AUTO_ENGAGEMENT.FLOW_EXECUTIONS(id)}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return apiService.get<ExecutionsListResponse>(url);
  },

  async getAllExecutions(params?: {
    status?: string;
    flow_id?: string;
    limit?: number;
    offset?: number;
    test_runs_only?: boolean;
  }): Promise<ExecutionsListResponse> {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.flow_id) queryParams.append('flow_id', params.flow_id);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    if (params?.test_runs_only) queryParams.append('test_runs_only', 'true');
    
    const url = `${API_ENDPOINTS.AUTO_ENGAGEMENT.EXECUTIONS}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return apiService.get<ExecutionsListResponse>(url);
  },

  async getExecutionDetails(id: string): Promise<ExecutionDetailResponse> {
    return apiService.get<ExecutionDetailResponse>(API_ENDPOINTS.AUTO_ENGAGEMENT.EXECUTION(id));
  },

  async cancelExecution(id: string): Promise<{ success: boolean; data: FlowExecution }> {
    return apiService.post<{ success: boolean; data: FlowExecution }>(
      API_ENDPOINTS.AUTO_ENGAGEMENT.EXECUTION_CANCEL(id),
      {}
    );
  },

  // Statistics
  async getFlowStatistics(id: string): Promise<FlowStatisticsResponse> {
    return apiService.get<FlowStatisticsResponse>(API_ENDPOINTS.AUTO_ENGAGEMENT.FLOW_STATISTICS(id));
  },

  // Test execution (simulation)
  async testFlowExecution(id: string, contactData: any): Promise<any> {
    return apiService.post<any>(
      API_ENDPOINTS.AUTO_ENGAGEMENT.FLOW_TEST(id),
      { contact_data: contactData }
    );
  },

  // Analytics
  async getAnalytics(): Promise<any> {
    return apiService.get<any>(API_ENDPOINTS.AUTO_ENGAGEMENT.ANALYTICS);
  },
};
