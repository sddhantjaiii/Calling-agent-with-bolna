import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/apiService';
import type { ChatCreditBalance } from '../types';

export interface UseChatCreditsReturn {
  chatCredits: ChatCreditBalance | null;
  loadingChatCredits: boolean;
  chatCreditsError: string | null;
  refreshChatCredits: () => Promise<void>;
  isChatServiceAvailable: boolean;
}

/**
 * Hook for fetching chat credits from the Chat Agent Server (microservice)
 * These credits are separate from call credits and are used for WhatsApp/chat features
 */
export const useChatCredits = (): UseChatCreditsReturn => {
  const queryClient = useQueryClient();

  // Query for chat credit balance
  const {
    data: chatCredits = null,
    isLoading: loadingChatCredits,
    error: chatCreditsQueryError,
    refetch: refetchChatCredits,
  } = useQuery({
    queryKey: ['chatCredits'],
    queryFn: async () => {
      const response = await apiService.getChatCredits();
      return response.data || response as unknown as ChatCreditBalance;
    },
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 3 * 60 * 1000, // 3 minutes
    retry: 1, // Only retry once for chat credits (external service)
    retryDelay: 2000,
  });

  // Parse error message
  const chatCreditsError = chatCreditsQueryError 
    ? (chatCreditsQueryError instanceof Error 
        ? chatCreditsQueryError.message 
        : 'Failed to load chat credits')
    : null;

  // Check if chat service is available based on response
  const isChatServiceAvailable = chatCredits !== null && 
    !chatCredits.message?.includes('unavailable');

  const refreshChatCredits = async (): Promise<void> => {
    await refetchChatCredits();
  };

  return {
    chatCredits,
    loadingChatCredits,
    chatCreditsError,
    refreshChatCredits,
    isChatServiceAvailable,
  };
};

export default useChatCredits;
