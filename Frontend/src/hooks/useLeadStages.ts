import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/apiService';
import { queryKeys } from '../lib/queryClient';
import { useAuth } from '../contexts/AuthContext';
import { DEFAULT_LEAD_STAGES } from '../types/api';
import type { LeadStage, CustomLeadStage, LeadStageStats, ApiError } from '../types';

export interface UseLeadStagesReturn {
  // Data
  stages: LeadStage[];
  customStages: CustomLeadStage[];
  stats: LeadStageStats[];
  
  // Loading states
  loading: boolean;
  loadingStats: boolean;
  
  // Error states
  error: string | null;
  statsError: string | null;
  
  // Mutation states
  creating: boolean;
  updating: boolean;
  deleting: boolean;
  bulkUpdating: boolean;
  
  // Actions
  addCustomStage: (name: string, color?: string) => Promise<CustomLeadStage[] | null>;
  updateCustomStage: (oldName: string, newName?: string, color?: string) => Promise<CustomLeadStage[] | null>;
  deleteCustomStage: (name: string) => Promise<CustomLeadStage[] | null>;
  bulkUpdateLeadStage: (contactIds: string[], stage: string | null) => Promise<number | null>;
  refreshStages: () => Promise<void>;
  refreshStats: () => Promise<void>;
  
  // Utilities
  getStageColor: (stageName: string) => string;
  isDefaultStage: (stageName: string) => boolean;
  clearError: () => void;
}

export const useLeadStages = (): UseLeadStagesReturn => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Helper function to handle API errors
  const handleError = (error: unknown, operation: string): string => {
    console.error(`Error in ${operation}:`, error);
    
    let errorMessage = `Failed to ${operation}`;
    
    if (error instanceof Error) {
      const apiError = error as ApiError;
      if (apiError.code === 'UNAUTHORIZED') {
        errorMessage = 'Session expired. Please log in again.';
      } else if (apiError.code === 'CONFLICT') {
        errorMessage = apiError.message || 'Stage already exists';
      } else if (apiError.code === 'FORBIDDEN') {
        errorMessage = apiError.message || 'Cannot modify default stages';
      } else {
        errorMessage = apiError.message || errorMessage;
      }
    }
    
    return errorMessage;
  };

  // Query for all stages
  const {
    data: stagesData,
    isLoading: loading,
    error: stagesError,
    refetch: refetchStages,
  } = useQuery({
    queryKey: ['lead-stages', user?.id],
    queryFn: async () => {
      const response = await apiService.get<{
        stages: LeadStage[];
        defaults: typeof DEFAULT_LEAD_STAGES;
      }>('/lead-stages');
      
      return response.data;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)
  });

  // Query for stage stats
  const {
    data: statsData,
    isLoading: loadingStats,
    error: statsError,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['lead-stages-stats', user?.id],
    queryFn: async () => {
      const response = await apiService.get<LeadStageStats[]>('/lead-stages/stats');
      
      return response.data;
    },
    enabled: !!user?.id,
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  // Add custom stage mutation
  const addStageMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color?: string }) => {
      const response = await apiService.post<CustomLeadStage[]>('/lead-stages/custom', { name, color });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-stages'] });
    },
  });

  // Update custom stage mutation
  const updateStageMutation = useMutation({
    mutationFn: async ({ 
      oldName, 
      newName, 
      color 
    }: { 
      oldName: string; 
      newName?: string; 
      color?: string;
    }) => {
      const response = await apiService.put<CustomLeadStage[]>(
        `/lead-stages/custom/${encodeURIComponent(oldName)}`,
        { newName, color }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-stages'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts(user?.id) });
      queryClient.invalidateQueries({ queryKey: ['lead-stages-stats'] });
    },
  });

  // Delete custom stage mutation
  const deleteStageMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiService.delete<CustomLeadStage[]>(`/lead-stages/custom/${encodeURIComponent(name)}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-stages'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts(user?.id) });
      queryClient.invalidateQueries({ queryKey: ['lead-stages-stats'] });
    },
  });

  // Bulk update lead stage mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ 
      contactIds, 
      stage 
    }: { 
      contactIds: string[]; 
      stage: string | null;
    }) => {
      const response = await apiService.post<{ updatedCount: number }>(
        '/lead-stages/bulk-update',
        { contactIds, stage }
      );
      return response.data?.updatedCount ?? 0;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts(user?.id) });
      queryClient.invalidateQueries({ queryKey: ['lead-stages-stats'] });
    },
  });

  // Action handlers
  const addCustomStage = async (name: string, color?: string): Promise<CustomLeadStage[] | null> => {
    try {
      return await addStageMutation.mutateAsync({ name, color });
    } catch (error) {
      handleError(error, 'add custom stage');
      return null;
    }
  };

  const updateCustomStage = async (
    oldName: string, 
    newName?: string, 
    color?: string
  ): Promise<CustomLeadStage[] | null> => {
    try {
      return await updateStageMutation.mutateAsync({ oldName, newName, color });
    } catch (error) {
      handleError(error, 'update custom stage');
      return null;
    }
  };

  const deleteCustomStage = async (name: string): Promise<CustomLeadStage[] | null> => {
    try {
      return await deleteStageMutation.mutateAsync(name);
    } catch (error) {
      handleError(error, 'delete custom stage');
      return null;
    }
  };

  const bulkUpdateLeadStage = async (
    contactIds: string[], 
    stage: string | null
  ): Promise<number | null> => {
    try {
      return await bulkUpdateMutation.mutateAsync({ contactIds, stage });
    } catch (error) {
      handleError(error, 'bulk update lead stage');
      return null;
    }
  };

  const refreshStages = async (): Promise<void> => {
    await refetchStages();
  };

  const refreshStats = async (): Promise<void> => {
    await refetchStats();
  };

  // Utility functions
  const getStageColor = (stageName: string): string => {
    if (!stageName) return '#6B7280'; // Gray for unassigned
    
    // Check in all stages
    const stage = stagesData?.stages?.find(
      s => s.name.toLowerCase() === stageName.toLowerCase()
    );
    if (stage) return stage.color;
    
    // Check default stages as fallback
    const defaultStage = DEFAULT_LEAD_STAGES.find(
      s => s.name.toLowerCase() === stageName.toLowerCase()
    );
    if (defaultStage) return defaultStage.color;
    
    return '#6B7280'; // Gray as fallback
  };

  const isDefaultStage = (stageName: string): boolean => {
    return DEFAULT_LEAD_STAGES.some(
      s => s.name.toLowerCase() === stageName.toLowerCase()
    );
  };

  const clearError = (): void => {
    // Errors are automatically cleared on next query
  };

  // Extract custom stages from all stages
  const customStages = stagesData?.stages?.filter(s => s.isCustom) || [];

  return {
    // Data
    stages: stagesData?.stages || [],
    customStages: customStages.map(({ name, color }) => ({ name, color })),
    stats: statsData || [],
    
    // Loading states
    loading,
    loadingStats,
    
    // Error states
    error: stagesError ? handleError(stagesError, 'load stages') : null,
    statsError: statsError ? handleError(statsError, 'load stats') : null,
    
    // Mutation states
    creating: addStageMutation.isPending,
    updating: updateStageMutation.isPending,
    deleting: deleteStageMutation.isPending,
    bulkUpdating: bulkUpdateMutation.isPending,
    
    // Actions
    addCustomStage,
    updateCustomStage,
    deleteCustomStage,
    bulkUpdateLeadStage,
    refreshStages,
    refreshStats,
    
    // Utilities
    getStageColor,
    isDefaultStage,
    clearError,
  };
};

export default useLeadStages;
