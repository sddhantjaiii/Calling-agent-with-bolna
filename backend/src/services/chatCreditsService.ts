import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../utils/logger';

/**
 * Chat Credits Service
 * 
 * Fetches chat credits from the Chat Agent Server (WhatsApp microservice)
 * This service proxies credit requests to maintain a single source of truth
 * for chat-related credits while the main dashboard handles call credits.
 * 
 * Architecture:
 * Frontend → Main Dashboard Backend (this service) → Chat Agent Server (port 4000)
 */

const CHAT_AGENT_SERVER_URL = process.env.CHAT_AGENT_SERVER_URL || 'http://localhost:4000';

export interface ChatCreditsResponse {
  success: boolean;
  data?: {
    user_id: string;
    remaining_credits: number;
    total_used: number;
    last_updated: string;
  };
  error?: string;
  message?: string;
  timestamp?: string;
  correlationId?: string;
}

class ChatCreditsServiceClient {
  private client: AxiosInstance;
  
  constructor() {
    this.client = axios.create({
      baseURL: CHAT_AGENT_SERVER_URL,
      timeout: 10000, // 10 second timeout for credits
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('📤 Chat Credits Service Request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          baseURL: config.baseURL,
        });
        return config;
      },
      (error) => {
        logger.error('❌ Chat Credits Service Request Error', { error: error.message });
        return Promise.reject(error);
      }
    );
    
    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('📥 Chat Credits Service Response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error: AxiosError) => {
        logger.error('❌ Chat Credits Service Response Error', {
          status: error.response?.status,
          url: error.config?.url,
          error: error.response?.data || error.message,
        });
        return Promise.reject(error);
      }
    );
  }
  
  /**
   * Get chat credits for a user from the Chat Agent Server
   * Uses the x-user-id header as specified in the External API
   */
  async getCredits(userId: string): Promise<ChatCreditsResponse> {
    try {
      if (!process.env.CHAT_AGENT_SERVER_URL) {
        logger.warn('⚠️ CHAT_AGENT_SERVER_URL not configured, returning default chat credits');
        return {
          success: true,
          data: {
            user_id: userId,
            remaining_credits: 0,
            total_used: 0,
            last_updated: new Date().toISOString(),
          },
          timestamp: new Date().toISOString(),
        };
      }
      
      logger.info('🔄 Fetching chat credits from Chat Agent Server', { userId });
      
      const response = await this.client.get('/api/v1/credits', {
        headers: {
          'x-user-id': userId,
        },
      });
      
      logger.info('✅ Chat credits fetched successfully', {
        userId,
        credits: response.data?.data?.remaining_credits,
      });
      
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      
      // Handle specific error cases
      if (axiosError.response?.status === 400) {
        logger.warn('⚠️ Bad request to Chat Agent Server', {
          userId,
          error: axiosError.response.data,
        });
        return {
          success: false,
          error: 'Bad Request',
          message: 'Failed to fetch chat credits - invalid request',
          timestamp: new Date().toISOString(),
        };
      }
      
      if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ENOTFOUND') {
        logger.warn('⚠️ Chat Agent Server not available', {
          userId,
          error: axiosError.message,
        });
        // Return default credits when service is unavailable
        return {
          success: true,
          data: {
            user_id: userId,
            remaining_credits: 0,
            total_used: 0,
            last_updated: new Date().toISOString(),
          },
          message: 'Chat Agent Server unavailable - showing default credits',
          timestamp: new Date().toISOString(),
        };
      }
      
      logger.error('❌ Failed to fetch chat credits', {
        userId,
        error: axiosError.message,
      });
      
      return {
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to fetch chat credits from microservice',
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
      
      // Try to reach the health endpoint or just the base
      await this.client.get('/health', { timeout: 5000 });
      return true;
    } catch (error) {
      logger.debug('Chat Agent Server health check failed');
      return false;
    }
  }

  /**
   * Adjust chat credits for a user via Chat Agent Server
   * This is used by admin panel to add/subtract chat credits
   * 
   * API: POST /api/v1/credits/adjust
   * Headers: x-user-id
   * Body: { amount, operation: 'add' | 'subtract', reason }
   */
  async adjustCredits(userId: string, amount: number, operation: 'add' | 'subtract', reason: string): Promise<{
    success: boolean;
    data?: {
      newBalance: number;
      previousBalance: number;
      adjustment: {
        amount: number;
        operation: string;
        reason: string;
      };
    };
    error?: string;
    message?: string;
  }> {
    try {
      if (!process.env.CHAT_AGENT_SERVER_URL) {
        logger.error('❌ CHAT_AGENT_SERVER_URL not configured');
        return {
          success: false,
          error: 'Chat Agent Server not configured',
          message: 'CHAT_AGENT_SERVER_URL environment variable is not set',
        };
      }

      logger.info('🔄 Adjusting chat credits via Chat Agent Server', { 
        userId, 
        amount, 
        operation, 
        reason 
      });

      const response = await this.client.post('/api/v1/credits/adjust', {
        amount,
        operation,
        reason,
      }, {
        headers: {
          'x-user-id': userId,
        },
      });

      logger.info('✅ Chat credits adjusted successfully', {
        userId,
        newBalance: response.data?.data?.newBalance || response.data?.newBalance,
      });

      // Normalize the response format
      const responseData = response.data?.data || response.data;
      return {
        success: true,
        data: {
          newBalance: responseData?.newBalance || responseData?.remaining_credits || 0,
          previousBalance: responseData?.previousBalance || responseData?.previous_balance || 0,
          adjustment: {
            amount,
            operation,
            reason,
          },
        },
        message: 'Chat credits adjusted successfully',
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      
      logger.error('❌ Failed to adjust chat credits', {
        userId,
        amount,
        operation,
        error: axiosError.response?.data || axiosError.message,
        status: axiosError.response?.status,
      });

      // Handle specific error cases
      if (axiosError.response?.status === 400) {
        return {
          success: false,
          error: 'Bad Request',
          message: (axiosError.response.data as any)?.message || 'Invalid request to Chat Agent Server',
        };
      }

      if (axiosError.response?.status === 404) {
        return {
          success: false,
          error: 'User Not Found',
          message: 'User not found in Chat Agent Server',
        };
      }

      if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ENOTFOUND') {
        return {
          success: false,
          error: 'Service Unavailable',
          message: 'Chat Agent Server is not available. Please try again later.',
        };
      }

      return {
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to adjust chat credits. Please try again.',
      };
    }
  }
}

// Export singleton instance
export const chatCreditsService = new ChatCreditsServiceClient();
