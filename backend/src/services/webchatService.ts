import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';

/**
 * Webchat Service Client
 * 
 * Communicates with the Chat Agent Server for webchat widget management
 * This service proxies webchat requests from the main dashboard to the chat agent server
 * 
 * Architecture:
 * Frontend → Main Dashboard Backend (this service) → Chat Agent Server → OpenAI Responses API
 * 
 * Configure via environment variable: CHAT_AGENT_SERVER_URL
 */

const CHAT_AGENT_SERVER_URL = process.env.CHAT_AGENT_SERVER_URL;

export interface WebchatChannel {
  webchat_id: string;
  phone_number_id: string;
  agent_id: string;
  prompt_id: string;
  source_agent_id?: string | null;
  name: string;
  embed_code: string;
  config_url: string;
  created_at: string;
  updated_at?: string;
}

export interface CreateWebchatRequest {
  user_id: string;
  prompt_id?: string;  // Either prompt_id or agent_id is required
  agent_id?: string;   // Either prompt_id or agent_id is required
  name: string;
}

export interface WebchatResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp?: string;
  correlationId?: string;
}

export interface ListWebchatChannelsResponse {
  channels: WebchatChannel[];
  count: number;
}

export interface ChatAgentListResponse {
  agent_id: string;
  user_id: string;
  phone_number_id: string;
  prompt_id: string;
  name: string;
  phone_number: {
    platform: string;
    display_name: string;
  };
  created_at: string;
}

class WebchatServiceClient {
  private client: AxiosInstance | null = null;

  private getClient(): AxiosInstance {
    if (!CHAT_AGENT_SERVER_URL) {
      throw new Error('CHAT_AGENT_SERVER_URL environment variable is not configured');
    }
    
    if (!this.client) {
      logger.info('🔧 Webchat Service initialized', { baseURL: CHAT_AGENT_SERVER_URL });
      
      this.client = axios.create({
        baseURL: CHAT_AGENT_SERVER_URL,
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Request interceptor for logging
      this.client.interceptors.request.use(
        (config) => {
          logger.debug('📤 Webchat Service Request', {
            method: config.method?.toUpperCase(),
            url: config.url,
            baseURL: config.baseURL,
          });
          return config;
        },
        (error) => {
          logger.error('❌ Webchat Service Request Error', { error: error.message });
          return Promise.reject(error);
        }
      );

      // Response interceptor for logging
      this.client.interceptors.response.use(
        (response) => {
          logger.debug('📥 Webchat Service Response', {
            status: response.status,
            url: response.config.url,
          });
          return response;
        },
        (error) => {
          logger.error('❌ Webchat Service Response Error', {
            status: error.response?.status,
            message: error.response?.data?.message || error.message,
            url: error.config?.url,
          });
          return Promise.reject(error);
        }
      );
    }
    
    return this.client;
  }

  /**
   * List all agents available for a user (to copy from)
   * GET /api/v1/agents?user_id=X
   */
  async listAgents(userId: string): Promise<WebchatResponse<ChatAgentListResponse[]>> {
    try {
      if (!CHAT_AGENT_SERVER_URL) {
        logger.warn('⚠️ CHAT_AGENT_SERVER_URL not configured');
        return {
          success: true,
          data: [],
          message: 'Chat Agent Server not configured',
        };
      }

      const response = await this.getClient().get(`/api/v1/agents`, {
        params: { user_id: userId },
      });
      return response.data;
    } catch (error: any) {
      logger.error('❌ List agents failed', { userId, error: error.message });
      
      // Return empty array instead of throwing when Chat Agent Server is unavailable
      if (error.code === 'ECONNREFUSED' || error.response?.status === 404) {
        return {
          success: true,
          data: [],
          message: 'Chat Agent Server unavailable or endpoint not implemented',
        };
      }
      throw error;
    }
  }

  /**
   * Create a new webchat channel
   * POST /api/v1/webchat/channels
   */
  async createWebchatChannel(data: CreateWebchatRequest): Promise<WebchatResponse<WebchatChannel>> {
    try {
      if (!CHAT_AGENT_SERVER_URL) {
        logger.error('❌ CHAT_AGENT_SERVER_URL not configured');
        throw new Error('Chat Agent Server not configured. Please set CHAT_AGENT_SERVER_URL environment variable.');
      }

      logger.info('🔧 Creating webchat channel', {
        userId: data.user_id,
        name: data.name,
        hasPromptId: !!data.prompt_id,
        hasAgentId: !!data.agent_id,
      });

      const response = await this.getClient().post('/api/v1/webchat/channels', data);
      
      logger.info('✅ Webchat channel created', {
        webchatId: response.data?.data?.webchat_id,
        name: data.name,
      });

      return response.data;
    } catch (error: any) {
      logger.error('❌ Create webchat channel failed', {
        name: data.name,
        error: error.response?.data?.message || error.message,
      });
      throw error;
    }
  }

  /**
   * List webchat channels for a user
   * GET /api/v1/webchat/channels?user_id=X
   */
  async listWebchatChannels(userId: string): Promise<WebchatResponse<ListWebchatChannelsResponse>> {
    try {
      if (!CHAT_AGENT_SERVER_URL) {
        logger.warn('⚠️ CHAT_AGENT_SERVER_URL not configured');
        return {
          success: true,
          data: { channels: [], count: 0 },
          message: 'Chat Agent Server not configured',
        };
      }

      const response = await this.getClient().get('/api/v1/webchat/channels', {
        params: { user_id: userId },
      });
      return response.data;
    } catch (error: any) {
      logger.error('❌ List webchat channels failed', { userId, error: error.message });
      
      // Return empty array instead of throwing when Chat Agent Server is unavailable
      if (error.code === 'ECONNREFUSED' || error.response?.status === 404) {
        return {
          success: true,
          data: { channels: [], count: 0 },
          message: 'Chat Agent Server unavailable or endpoint not implemented',
        };
      }
      throw error;
    }
  }

  /**
   * Get embed code for a webchat channel
   * GET /api/v1/webchat/channels/:webchatId/embed
   */
  async getWebchatEmbed(webchatId: string): Promise<WebchatResponse<{
    webchat_id: string;
    name: string;
    embed_code: string;
    config_url: string;
  }>> {
    try {
      const response = await this.getClient().get(`/api/v1/webchat/channels/${webchatId}/embed`);
      return response.data;
    } catch (error: any) {
      logger.error('❌ Get webchat embed failed', { webchatId, error: error.message });
      throw error;
    }
  }

  /**
   * Delete a webchat channel
   * DELETE /api/v1/webchat/channels/:webchatId
   */
  async deleteWebchatChannel(webchatId: string): Promise<WebchatResponse<void>> {
    try {
      logger.info('🗑️ Deleting webchat channel', { webchatId });
      
      const response = await this.getClient().delete(`/api/v1/webchat/channels/${webchatId}`);
      
      logger.info('✅ Webchat channel deleted', { webchatId });
      
      return response.data;
    } catch (error: any) {
      logger.error('❌ Delete webchat channel failed', { webchatId, error: error.message });
      throw error;
    }
  }

  /**
   * Check if Chat Agent Server is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!CHAT_AGENT_SERVER_URL) return false;
      await this.getClient().get('/health', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const webchatService = new WebchatServiceClient();
export { WebchatServiceClient };
