import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../utils/logger';

/**
 * Chat Agent Service
 * 
 * Fetches chat agents from the Chat Agent Server (WhatsApp microservice)
 * This service proxies agent requests to the Chat Agent Server.
 * 
 * Architecture:
 * Frontend → Main Dashboard Backend (this service) → Chat Agent Server (port 4000)
 */

const CHAT_AGENT_SERVER_URL = process.env.CHAT_AGENT_SERVER_URL || 'http://localhost:4000';

export interface ChatAgent {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'draft' | 'inactive';
  type: 'ChatAgent';
  language?: string;
  created_at?: string;
  updated_at?: string;
  conversations?: number;
  // Additional fields from chat agent server
  phone_number_id?: string;
  business_account_id?: string;
  // Platform information
  platform?: 'whatsapp' | 'telegram' | 'messenger' | 'sms' | string;
  phone_number?: {
    platform?: string;
    display_name?: string;
  };
}

export interface ChatAgentsResponse {
  success: boolean;
  data?: ChatAgent[];
  error?: string;
  message?: string;
  timestamp?: string;
}

class ChatAgentServiceClient {
  private client: AxiosInstance;
  
  constructor() {
    this.client = axios.create({
      baseURL: CHAT_AGENT_SERVER_URL,
      timeout: 15000, // 15 second timeout
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('📤 Chat Agent Service Request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          baseURL: config.baseURL,
        });
        return config;
      },
      (error) => {
        logger.error('❌ Chat Agent Service Request Error', { error: error.message });
        return Promise.reject(error);
      }
    );
    
    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('📥 Chat Agent Service Response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error: AxiosError) => {
        logger.error('❌ Chat Agent Service Response Error', {
          status: error.response?.status,
          url: error.config?.url,
          error: error.response?.data || error.message,
        });
        return Promise.reject(error);
      }
    );
  }
  
  /**
   * Get chat agents for a user from the Chat Agent Server
   * API: GET /api/v1/agents?user_id=xxx
   */
  async getChatAgents(userId: string): Promise<ChatAgentsResponse> {
    try {
      if (!process.env.CHAT_AGENT_SERVER_URL) {
        logger.warn('⚠️ CHAT_AGENT_SERVER_URL not configured, returning empty chat agents');
        return {
          success: true,
          data: [],
          message: 'Chat Agent Server not configured',
          timestamp: new Date().toISOString(),
        };
      }
      
      logger.info('🔄 Fetching chat agents from Chat Agent Server', { userId });
      
      const response = await this.client.get('/api/v1/agents', {
        params: {
          user_id: userId,
        },
      });
      
      // The chat agent server returns { success, data: [...agents] } or just an array
      let agents: ChatAgent[] = [];
      
      if (response.data?.data) {
        agents = response.data.data;
      } else if (Array.isArray(response.data)) {
        agents = response.data;
      }
      
      // Normalize agent data to ensure consistent format
      const normalizedAgents = agents.map((agent: any) => ({
        id: agent.id || agent._id || agent.agent_id,
        name: agent.name || 'Unnamed Agent',
        description: agent.description || '',
        status: agent.status || 'active',
        type: 'ChatAgent' as const,
        language: agent.language || 'en',
        created_at: agent.created_at || agent.createdAt,
        updated_at: agent.updated_at || agent.updatedAt,
        conversations: agent.conversations || 0,
        phone_number_id: agent.phone_number_id,
        business_account_id: agent.business_account_id,
        // Platform info from phone_number object
        platform: agent.phone_number?.platform || agent.platform || 'whatsapp',
        phone_display: agent.phone_number?.display_name,
      }));
      
      logger.info('✅ Chat agents fetched successfully', {
        userId,
        count: normalizedAgents.length,
      });
      
      return {
        success: true,
        data: normalizedAgents,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      
      // Handle connection errors gracefully
      if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ENOTFOUND') {
        logger.warn('⚠️ Chat Agent Server not available', {
          userId,
          error: axiosError.message,
        });
        return {
          success: true,
          data: [],
          message: 'Chat Agent Server unavailable',
          timestamp: new Date().toISOString(),
        };
      }
      
      // Handle 404 (no agents found)
      if (axiosError.response?.status === 404) {
        logger.info('ℹ️ No chat agents found for user', { userId });
        return {
          success: true,
          data: [],
          message: 'No chat agents found',
          timestamp: new Date().toISOString(),
        };
      }
      
      logger.error('❌ Failed to fetch chat agents', {
        userId,
        error: axiosError.message,
        status: axiosError.response?.status,
      });
      
      return {
        success: false,
        data: [],
        error: 'Failed to fetch chat agents',
        message: axiosError.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
  
  /**
   * Check if the Chat Agent Server is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!process.env.CHAT_AGENT_SERVER_URL) {
        return false;
      }
      
      await this.client.get('/health', { timeout: 5000 });
      return true;
    } catch (error) {
      logger.debug('Chat Agent Server health check failed');
      return false;
    }
  }
}

// Export singleton instance
export const chatAgentService = new ChatAgentServiceClient();
