import { useState, useCallback, useRef, useEffect } from 'react';
import API_ENDPOINTS from '../config/api';
import { getAuthToken } from '../config/api';

/**
 * Types for Chat Leads API
 */
export interface ChatLead {
  customer_phone: string;
  name: string | null;
  email: string | null;
  company: string | null;
  platforms: string[];
  conversation_count: number;
  total_messages: number;
  lead_status: 'Hot' | 'Warm' | 'Cold' | null;
  total_score: number | null;
  intent_score: number | null;
  urgency_score: number | null;
  budget_score: number | null;
  fit_score: number | null;
  engagement_score: number | null;
  has_extraction: boolean;
  extraction_id: string | null;
  last_message_at: string | null;
  last_message_text: string | null;
  last_message_sender: 'user' | 'agent' | null;
  first_contact_at: string;
  conversations: ChatConversation[];
}

export interface ChatConversation {
  conversation_id: string;
  agent_id: string;
  agent_name: string;
  platform: 'whatsapp' | 'instagram' | 'webchat';
  phone_number_id: string;
  message_count: number;
  is_active: boolean;
  created_at: string;
  last_message_at: string;
}

export interface ChatMessage {
  message_id: string;
  conversation_id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'pending';
  sequence_no: number;
  platform_message_id: string | null;
  agent_name: string;
  platform: string;
  is_template?: boolean;
}

export interface LeadMessagesResponse {
  customer_phone: string;
  conversations: Array<{
    conversation_id: string;
    agent_id: string;
    agent_name: string;
    platform: string;
    phone_number_id: string;
    phone_display_name: string;
    is_active: boolean;
    created_at: string;
    last_message_at: string;
    message_count: number;
  }>;
  messages: ChatMessage[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface ChatLeadFilters {
  search?: string;
  platform?: string;
  agentId?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
  leadStatus?: string;
  minScore?: number;
  hasEmail?: boolean;
  isActive?: boolean;
}

export interface MessageFilters {
  platform?: string;
  conversationId?: string;
  sender?: 'user' | 'agent';
  days?: number;
}

export interface MessageStatusResponse {
  message_id: string;
  conversation_id: string;
  customer_phone: string;
  agent_id: string;
  agent_name: string;
  platform: 'whatsapp' | 'instagram' | 'webchat';
  phone_number_id: string;
  phone_display_name: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
  sequence_no: number;
  status: 'sent' | 'failed' | 'pending';
  platform_message_id: string | null;
  delivery_status: {
    status: string;
    error_reason: string | null;
    updated_at: string;
  } | null;
  is_failed: boolean;
  failure_reason: string | null;
}

interface Pagination {
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Custom hook for managing chat leads with infinite scroll and debounced search
 */
export function useChatLeads() {
  const [leads, setLeads] = useState<ChatLead[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageConversations, setMessageConversations] = useState<LeadMessagesResponse['conversations']>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    page: 1,
    pageSize: 100,
    hasMore: false,
  });
  
  // Refs for debouncing and cancellation
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const filtersRef = useRef<ChatLeadFilters>({});

  /**
   * Fetch leads from API
   */
  const fetchLeads = useCallback(async (
    filters: ChatLeadFilters = {},
    page = 1,
    pageSize = 100,
    append = false
  ) => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String((page - 1) * pageSize),
        sort_by: 'last_message_at',
        sort_order: 'desc',
      });

      // Add filters
      if (filters.search) params.set('search', filters.search);
      if (filters.platform) params.set('platform', filters.platform);
      if (filters.agentId) params.set('agent_id', filters.agentId);
      if (filters.startDate) params.set('start_date', filters.startDate);
      if (filters.endDate) params.set('end_date', filters.endDate);
      if (filters.days) params.set('days', String(filters.days));
      if (filters.leadStatus) params.set('lead_status', filters.leadStatus);
      if (filters.minScore) params.set('min_total_score', String(filters.minScore));
      if (filters.hasEmail !== undefined) params.set('has_email', String(filters.hasEmail));
      if (filters.isActive !== undefined) params.set('is_active', String(filters.isActive));

      const token = getAuthToken();
      const response = await fetch(`${API_ENDPOINTS.CHAT_LEADS.LIST}?${params}`, {
        signal: abortControllerRef.current.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        if (append) {
          setLeads(prev => [...prev, ...result.data]);
        } else {
          setLeads(result.data);
        }
        
        setPagination({
          total: result.pagination.total,
          page,
          pageSize,
          hasMore: result.pagination.hasMore,
        });
      } else {
        throw new Error(result.message || 'Failed to fetch leads');
      }

      return result;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Request was cancelled, ignore
        return null;
      }
      const errorMessage = err.message || 'Failed to fetch leads';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  /**
   * Debounced search - calls API after 300ms of no typing
   */
  const debouncedSearch = useCallback((
    filters: ChatLeadFilters,
    pageSize = 100
  ) => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Store current filters
    filtersRef.current = filters;

    // Set timeout for debounced search
    searchTimeoutRef.current = setTimeout(() => {
      fetchLeads(filters, 1, pageSize, false);
    }, 300);
  }, [fetchLeads]);

  /**
   * Load more leads (infinite scroll)
   */
  const loadMore = useCallback(async () => {
    if (loadingMore || !pagination.hasMore) return;

    const nextPage = pagination.page + 1;
    await fetchLeads(filtersRef.current, nextPage, pagination.pageSize, true);
  }, [fetchLeads, loadingMore, pagination]);

  /**
   * Refresh leads (manual refresh)
   */
  const refresh = useCallback(async () => {
    setLeads([]);
    await fetchLeads(filtersRef.current, 1, pagination.pageSize, false);
  }, [fetchLeads, pagination.pageSize]);

  /**
   * Fetch messages for a specific lead
   */
  const fetchMessages = useCallback(async (
    customerPhone: string,
    filters: MessageFilters = {},
    page = 1,
    pageSize = 100
  ) => {
    setMessagesLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String((page - 1) * pageSize),
      });

      if (filters.platform) params.set('platform', filters.platform);
      if (filters.conversationId) params.set('conversation_id', filters.conversationId);
      if (filters.sender) params.set('sender', filters.sender);
      if (filters.days) params.set('days', String(filters.days));

      const token = getAuthToken();
      const response = await fetch(`${API_ENDPOINTS.CHAT_LEADS.MESSAGES(customerPhone)}?${params}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        setMessages(result.data.messages);
        setMessageConversations(result.data.conversations);
        return result.data as LeadMessagesResponse;
      } else {
        throw new Error(result.message || 'Failed to fetch messages');
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to fetch messages';
      setError(errorMessage);
      throw err;
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  /**
   * Clear messages (when closing panel)
   */
  const clearMessages = useCallback(() => {
    setMessages([]);
    setMessageConversations([]);
  }, []);

  /**
   * Fetch message status and failure reason
   */
  const fetchMessageStatus = useCallback(async (messageId: string): Promise<MessageStatusResponse | null> => {
    try {
      const token = getAuthToken();
      const response = await fetch(API_ENDPOINTS.CHAT_LEADS.MESSAGE_STATUS(messageId), {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        return result.data as MessageStatusResponse;
      } else {
        throw new Error(result.message || 'Failed to fetch message status');
      }
    } catch (err: any) {
      console.error('Error fetching message status:', err);
      return null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    // State
    leads,
    messages,
    messageConversations,
    loading,
    loadingMore,
    messagesLoading,
    error,
    pagination,
    
    // Actions
    fetchLeads,
    debouncedSearch,
    loadMore,
    refresh,
    fetchMessages,
    clearMessages,
    fetchMessageStatus,
  };
}

export default useChatLeads;
