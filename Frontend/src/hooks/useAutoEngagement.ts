import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { autoEngagementService } from '../services/autoEngagementService';
import { queryKeys } from '../lib/queryClient';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import type {
  AutoEngagementFlow,
  FlowWithDetails,
  FlowExecution,
  CreateFlowRequest,
  UpdateFlowRequest,
  BulkPriorityUpdateRequest,
} from '../types/autoEngagement';

/**
 * Hook for managing auto-engagement flows
 */
export const useAutoEngagementFlows = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Query: Get all flows
  const {
    data: flowsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.autoEngagement.flows(),
    queryFn: () => autoEngagementService.getFlows(),
    enabled: !!user,
  });

  const flows = flowsData?.data || [];

  // Mutation: Create flow
  const createFlowMutation = useMutation({
    mutationFn: (data: CreateFlowRequest) => autoEngagementService.createFlow(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.autoEngagement.flows() });
      toast.success('Flow created successfully');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to create flow');
    },
  });

  // Mutation: Update flow
  const updateFlowMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateFlowRequest }) =>
      autoEngagementService.updateFlow(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.autoEngagement.flows() });
      queryClient.invalidateQueries({ queryKey: queryKeys.autoEngagement.flow(variables.id) });
      toast.success('Flow updated successfully');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update flow');
    },
  });

  // Mutation: Delete flow
  const deleteFlowMutation = useMutation({
    mutationFn: (id: string) => autoEngagementService.deleteFlow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.autoEngagement.flows() });
      toast.success('Flow deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to delete flow');
    },
  });

  // Mutation: Toggle flow enabled/disabled
  const toggleFlowMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      autoEngagementService.toggleFlow(id, enabled),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.autoEngagement.flows() });
      queryClient.invalidateQueries({ queryKey: queryKeys.autoEngagement.flow(variables.id) });
      toast.success(`Flow ${variables.enabled ? 'enabled' : 'disabled'}`);
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to toggle flow');
    },
  });

  // Mutation: Bulk update priorities
  const bulkUpdatePrioritiesMutation = useMutation({
    mutationFn: (data: BulkPriorityUpdateRequest) =>
      autoEngagementService.bulkUpdatePriorities(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.autoEngagement.flows() });
      toast.success('Priorities updated successfully');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update priorities');
    },
  });

  return {
    // Data
    flows,
    isLoading,
    error,

    // Mutations
    createFlow: createFlowMutation.mutateAsync,
    updateFlow: updateFlowMutation.mutateAsync,
    deleteFlow: deleteFlowMutation.mutateAsync,
    toggleFlow: toggleFlowMutation.mutateAsync,
    bulkUpdatePriorities: bulkUpdatePrioritiesMutation.mutateAsync,

    // Mutation states
    isCreating: createFlowMutation.isPending,
    isUpdating: updateFlowMutation.isPending,
    isDeleting: deleteFlowMutation.isPending,
    isToggling: toggleFlowMutation.isPending,
    isUpdatingPriorities: bulkUpdatePrioritiesMutation.isPending,

    // Refetch
    refetch,
  };
};

/**
 * Hook for getting a single flow with details
 */
export const useAutoEngagementFlow = (flowId: string | null) => {
  const { user } = useAuth();

  const {
    data: flowData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.autoEngagement.flow(flowId || ''),
    queryFn: () => autoEngagementService.getFlow(flowId!),
    enabled: !!user && !!flowId,
  });

  const flow = flowData?.data || null;

  return {
    flow,
    isLoading,
    error,
    refetch,
  };
};

/**
 * Hook for managing flow executions
 */
export const useAutoEngagementExecutions = (params?: {
  flowId?: string;
  status?: string;
  limit?: number;
}) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Query: Get executions
  const {
    data: executionsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.autoEngagement.executions(params),
    queryFn: () => autoEngagementService.getAllExecutions(params),
    enabled: !!user,
    refetchInterval: 30000, // Refresh every 30 seconds for real-time updates
  });

  const executions = executionsData?.data || [];

  // Mutation: Cancel execution
  const cancelExecutionMutation = useMutation({
    mutationFn: (id: string) => autoEngagementService.cancelExecution(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.autoEngagement.executions() });
      toast.success('Execution cancelled');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to cancel execution');
    },
  });

  return {
    // Data
    executions,
    isLoading,
    error,

    // Actions
    cancelExecution: cancelExecutionMutation.mutateAsync,
    isCancelling: cancelExecutionMutation.isPending,

    // Refetch
    refetch,
  };
};

/**
 * Hook for getting execution details with action logs
 */
export const useAutoEngagementExecutionDetails = (executionId: string | null) => {
  const { user } = useAuth();

  const {
    data: executionData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.autoEngagement.executionDetails(executionId || ''),
    queryFn: () => autoEngagementService.getExecutionDetails(executionId!),
    enabled: !!user && !!executionId,
    refetchInterval: 10000, // Refresh every 10 seconds while viewing
  });

  const execution = executionData?.data || null;

  return {
    execution,
    isLoading,
    error,
    refetch,
  };
};

/**
 * Hook for getting flow statistics
 */
export const useAutoEngagementStatistics = (flowId: string | null) => {
  const { user } = useAuth();

  const {
    data: statsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.autoEngagement.statistics(flowId || ''),
    queryFn: () => autoEngagementService.getFlowStatistics(flowId!),
    enabled: !!user && !!flowId,
  });

  const statistics = statsData?.data || null;

  return {
    statistics,
    isLoading,
    error,
    refetch,
  };
};

/**
 * Hook for getting analytics dashboard data
 */
export const useAutoEngagementAnalytics = () => {
  const { user } = useAuth();

  const {
    data: analyticsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.autoEngagement.analytics(),
    queryFn: () => autoEngagementService.getAnalytics(),
    enabled: !!user,
    refetchInterval: 60000, // Refresh every minute
  });

  const analytics = analyticsData?.data || null;

  return {
    analytics,
    isLoading,
    error,
    refetch,
  };
};

/**
 * Hook for test mode execution
 */
export const useTestFlowExecution = () => {
  const { mutateAsync: testFlow, isPending: isTesting } = useMutation({
    mutationFn: ({ flowId, contactData }: { flowId: string; contactData: any }) =>
      autoEngagementService.testFlowExecution(flowId, contactData),
    onSuccess: () => {
      toast.success('Test execution completed successfully');
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error.message || 'Test execution failed';
      toast.error(message);
    },
  });

  return {
    testFlow,
    isTesting,
  };
};
