import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { logger } from '../utils/logger';
import { RetryService, createBolnaRetryConfig, RetryResult, RetryConfig } from './retryService';
import * as Sentry from '@sentry/node';

// Bolna.ai API interfaces based on official documentation
// https://docs.bolna.ai/api-reference/

export interface BolnaVoiceSettings {
  voice: string; // Voice name for the provider
  engine?: string; // 'generative' or 'neural'
  sampling_rate?: string; // '8000', '16000', '22050'
  language?: string; // e.g., 'en-US', 'es-ES'
}

export interface BolnaLLMConfig {
  agent_flow_type: 'streaming' | 'batch';
  provider: 'openai' | 'anthropic' | 'groq';
  family: string; // e.g., 'openai', 'anthropic'
  model: string; // e.g., 'gpt-3.5-turbo', 'gpt-4'
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  min_p?: number;
  top_k?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  base_url?: string;
  request_json?: boolean;
  summarization_details?: any;
  extraction_details?: any;
}

export interface BolnaSynthesizerConfig {
  provider: 'polly' | 'azure' | 'openai' | 'bolna';
  provider_config: BolnaVoiceSettings;
  stream: boolean;
  buffer_size: number;
  audio_format: 'wav' | 'mp3' | 'opus';
}

export interface BolnaTranscriberConfig {
  provider: 'deepgram' | 'whisper' | 'azure';
  model?: string; // e.g., 'nova-2'
  language: string; // e.g., 'en'
  stream: boolean;
  sampling_rate: number;
  encoding: string; // e.g., 'linear16'
  endpointing?: number;
}

export interface BolnaInputOutputConfig {
  provider: 'twilio' | 'websocket' | 'sip';
  format: 'wav' | 'mp3';
}

export interface BolnaToolsConfig {
  llm_agent?: {
    agent_type: 'simple_llm_agent';
    agent_flow_type: 'streaming';
    routes?: any;
    llm_config: BolnaLLMConfig;
  };
  synthesizer: BolnaSynthesizerConfig;
  transcriber: BolnaTranscriberConfig;
  input: BolnaInputOutputConfig;
  output: BolnaInputOutputConfig;
  api_tools?: any;
}

export interface BolnaToolchain {
  execution: 'parallel' | 'sequential';
  pipelines: string[][];
}

export interface BolnaTaskConfig {
  hangup_after_silence?: number;
  incremental_delay?: number;
  number_of_words_for_interruption?: number;
  hangup_after_LLMCall?: boolean;
  call_cancellation_prompt?: string;
  backchanneling?: boolean;
  backchanneling_message_gap?: number;
  backchanneling_start_delay?: number;
  ambient_noise?: boolean;
  ambient_noise_track?: string;
  call_terminate?: number;
  voicemail?: boolean;
  inbound_limit?: number;
  whitelist_phone_numbers?: string[];
  disallow_unknown_numbers?: boolean;
}

export interface BolnaTask {
  task_type: 'conversation';
  tools_config: BolnaToolsConfig;
  toolchain: BolnaToolchain;
  task_config: BolnaTaskConfig;
}

export interface BolnaIngestConfig {
  source_type: 'api' | 'file';
  source_url?: string;
  source_auth_token?: string;
  source_name?: string;
}

export interface BolnaAgentConfig {
  agent_name: string;
  agent_welcome_message: string;
  webhook_url: string | null;
  agent_type?: string;
  tasks: BolnaTask[];
  ingest_source_config?: BolnaIngestConfig;
}

export interface BolnaAgentPrompts {
  [key: string]: {
    system_prompt: string;
  };
}

export interface CreateBolnaAgentRequest {
  agent_config: BolnaAgentConfig;
  agent_prompts: BolnaAgentPrompts;
}

export interface BolnaAgent {
  agent_id: string;
  status: 'created' | 'active' | 'inactive';
  agent_config?: BolnaAgentConfig;
  agent_prompts?: BolnaAgentPrompts;
  created_at?: string;
  updated_at?: string;
}

export interface BolnaCallRequest {
  agent_id: string;
  recipient_phone_number: string;
  from_phone_number?: string;
  scheduled_at?: string;
  user_data?: Record<string, any>;
  webhook_url?: string;
  metadata?: {
    user_id?: string;
    campaign_id?: string;
    [key: string]: any;
  };
}

export interface BolnaCallResponse {
  message: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  execution_id: string;
}

export interface BolnaVoice {
  id: string;
  voice_id: string;
  provider: string;
  name: string;
  model: string;
  accent: string;
}

export interface BolnaWebhookPayload {
  execution_id: string;
  agent_id: string;
  status: 'completed' | 'failed' | 'in_progress';
  duration_seconds?: number;
  transcript?: string;
  analytics?: any;
  metadata?: Record<string, any>;
  created_at?: string;
  completed_at?: string;
}

export interface BolnaError {
  error: {
    message: string;
    code?: string;
    details?: any;
  };
}

class BolnaService {
  private client: AxiosInstance;
  private apiKey: string;
  private baseUrl: string;
  private retryConfig: RetryConfig;
  private readonly REQUEST_TIMEOUT = 15000; // 15 seconds per individual request
  private readonly TOTAL_TIMEOUT = 30000; // 30 seconds total including retries
  // Allowlist of valid Bolna API domains for SSRF protection
  private static readonly ALLOWED_BOLNA_DOMAINS = [
    'api.bolna.ai',
    'api.bolna.dev', // staging/development environment
  ];

  constructor() {
    this.apiKey = process.env.BOLNA_API_KEY || '';
    this.baseUrl = process.env.BOLNA_BASE_URL || 'https://api.bolna.ai';
    this.retryConfig = createBolnaRetryConfig();

    if (!this.apiKey) {
      throw new Error('BOLNA_API_KEY is required');
    }

    // SSRF Protection: Validate that the base URL is an allowed Bolna API domain
    this.validateBaseUrl(this.baseUrl);

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: this.REQUEST_TIMEOUT,
    });

    // Add request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.info(`Bolna API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error('Bolna API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        logger.info(`Bolna API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        logger.error('Bolna API Error:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          url: error.config?.url,
          method: error.config?.method,
        });
        return Promise.reject(this.handleApiError(error));
      }
    );
  }

  /**
   * SSRF Protection: Validate that the base URL is an allowed Bolna API domain
   */
  private validateBaseUrl(url: string): void {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();
      
      // Check if the hostname is in the allowlist
      if (!BolnaService.ALLOWED_BOLNA_DOMAINS.includes(hostname)) {
        throw new Error(`Invalid BOLNA_BASE_URL: ${hostname} is not an allowed Bolna API domain`);
      }
      
      // Ensure HTTPS is used in production
      if (process.env.NODE_ENV === 'production' && parsedUrl.protocol !== 'https:') {
        throw new Error('BOLNA_BASE_URL must use HTTPS in production');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid BOLNA_BASE_URL')) {
        throw error;
      }
      throw new Error(`Invalid BOLNA_BASE_URL format: ${url}`);
    }
  }

  /**
   * Validate agent ID format to prevent path traversal attacks
   * Agent IDs should be alphanumeric with hyphens/underscores only
   */
  private validateAgentId(agentId: string): void {
    // Agent IDs should match UUID format or alphanumeric pattern
    const validAgentIdPattern = /^[a-zA-Z0-9_-]+$/;
    if (!agentId || !validAgentIdPattern.test(agentId) || agentId.length > 128) {
      throw new Error('Invalid agent ID format');
    }
  }

  /**
   * Validate execution ID format
   */
  private validateExecutionId(executionId: string): void {
    const validExecutionIdPattern = /^[a-zA-Z0-9_-]+$/;
    if (!executionId || !validExecutionIdPattern.test(executionId) || executionId.length > 128) {
      throw new Error('Invalid execution ID format');
    }
  }

  private handleApiError(error: any): Error {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      switch (status) {
        case 401:
          return new Error('Bolna API authentication failed. Check API key.');
        case 403:
          return new Error('Bolna API access forbidden. Check permissions.');
        case 404:
          return new Error('Bolna API resource not found.');
        case 422:
          return new Error(`Bolna API validation error: ${data?.error?.message || 'Invalid request data'}`);
        case 429:
          return new Error('Bolna API rate limit exceeded. Please try again later.');
        case 500:
        case 502:
        case 503:
        case 504:
          return new Error('Bolna API server error. Please try again later.');
        default:
          return new Error(data?.error?.message || `Bolna API error: ${status}`);
      }
    } else if (error.request) {
      return new Error('Bolna API request failed. Check network connection.');
    } else {
      return new Error(`Bolna API client error: ${error.message}`);
    }
  }

  /**
   * Execute API call with retry logic and timeout handling
   * Includes comprehensive Sentry monitoring for external API calls
   */
  private async executeWithRetry<T>(
    operation: () => Promise<AxiosResponse<T>>,
    operationName: string
  ): Promise<T> {
    // Start Sentry span for Bolna API monitoring
    return await Sentry.startSpan(
      {
        op: 'bolna.api',
        name: `Bolna API: ${operationName}`,
        attributes: {
          operation: operationName,
          api_base_url: this.baseUrl
        }
      },
      async () => {
        Sentry.addBreadcrumb({
          category: 'bolna_api',
          message: `Starting Bolna API call: ${operationName}`,
          level: 'info',
          data: {
            operation: operationName,
            max_retries: this.retryConfig.maxRetries,
            timeout: this.TOTAL_TIMEOUT
          }
        });

        const result = await RetryService.executeWithRetryAndTimeout(
          operation,
          this.retryConfig,
          this.TOTAL_TIMEOUT,
          operationName
        );

        if (result.success && result.data) {
          logger.info(`Bolna API ${operationName} succeeded`, {
            attempts: result.attempts,
            totalTime: `${result.totalTime}ms`
          });
          
          Sentry.addBreadcrumb({
            category: 'bolna_api',
            message: `Bolna API call succeeded: ${operationName}`,
            level: 'info',
            data: {
              operation: operationName,
              attempts: result.attempts,
              total_time_ms: result.totalTime
            }
          });
          
          return result.data.data;
        } else {
          const error = result.error || new Error(`Failed to execute ${operationName}`);
          
          logger.error(`Bolna API ${operationName} failed after ${result.attempts} attempts`, {
            error: error.message,
            totalTime: `${result.totalTime}ms`,
            attempts: result.attempts
          });

          // Capture Bolna API failure in Sentry
          Sentry.captureException(error, {
            level: 'error',
            tags: {
              error_type: 'bolna_api_failure',
              operation: operationName,
              severity: 'high',
              external_api: 'bolna.ai'
            },
            contexts: {
              bolna_api: {
                operation: operationName,
                base_url: this.baseUrl,
                attempts: result.attempts,
                total_time_ms: result.totalTime,
                max_retries: this.retryConfig.maxRetries,
                timeout_ms: this.TOTAL_TIMEOUT,
                error_message: error.message,
                all_attempts_failed: true
              }
            }
          });
          
          throw error;
        }
      }
    );
  }

  /**
   * Create a new conversational agent
   * POST /v2/agent
   */
  async createAgent(agentData: CreateBolnaAgentRequest): Promise<BolnaAgent> {
    logger.info('[Bolna] Creating agent with config', {
      agentName: agentData.agent_config.agent_name,
      tasksCount: agentData.agent_config.tasks.length,
      hasPrompts: !!agentData.agent_prompts
    });
    
    const result = await this.executeWithRetry(
      () => this.client.post('/v2/agent', agentData),
      'createAgent'
    );
    
    return result;
  }

  /**
   * Get agent by ID
   * GET /v2/agent/:agent_id
   */
  async getAgent(agentId: string): Promise<BolnaAgent> {
    this.validateAgentId(agentId);
    return this.executeWithRetry(
      () => this.client.get(`/v2/agent/${encodeURIComponent(agentId)}`),
      `getAgent(${agentId})`
    );
  }

  /**
   * List all agents
   * GET /v2/agent/all
   */
  async listAgents(): Promise<BolnaAgent[]> {
    const result = await this.executeWithRetry(
      () => this.client.get('/v2/agent/all'),
      'listAgents'
    );
    return Array.isArray(result) ? result : (result as any).agents || [];
  }

  /**
   * Update an existing agent
   * PUT /v2/agent/:agent_id
   */
  async updateAgent(agentId: string, agentData: Partial<CreateBolnaAgentRequest>): Promise<BolnaAgent> {
    this.validateAgentId(agentId);
    logger.info(`[Bolna] Updating agent ${agentId}`, {
      hasConfig: !!agentData.agent_config,
      hasPrompts: !!agentData.agent_prompts
    });
    
    const result = await this.executeWithRetry(
      () => this.client.put(`/v2/agent/${encodeURIComponent(agentId)}`, agentData),
      `updateAgent(${agentId})`
    );
    
    return result;
  }

  /**
   * Patch agent system prompt (partial update)
   * PATCH /v2/agent/:agent_id
   * Used to update only the system prompt without affecting other agent config
   */
  async patchAgentSystemPrompt(agentId: string, systemPrompt: string): Promise<BolnaAgent> {
    this.validateAgentId(agentId);
    logger.info(`[Bolna] Patching agent ${agentId} system prompt`);
    
    const patchData = {
      agent_prompts: {
        task_1: {
          system_prompt: systemPrompt
        }
      }
    };
    
    const result = await this.executeWithRetry(
      () => this.client.patch(`/v2/agent/${encodeURIComponent(agentId)}`, patchData),
      `patchAgentSystemPrompt(${agentId})`
    );
    
    return result;
  }

  /**
   * Patch agent webhook URL (partial update)
   * PATCH /v2/agent/:agent_id
   * Used to update only the webhook URL without affecting other agent config
   */
  async patchAgentWebhookUrl(agentId: string, webhookUrl: string): Promise<BolnaAgent> {
    this.validateAgentId(agentId);
    logger.info(`[Bolna] Patching agent ${agentId} webhook URL`);
    
    const patchData = {
      agent_config: {
        webhook_url: webhookUrl
      }
    };
    
    const result = await this.executeWithRetry(
      () => this.client.patch(`/v2/agent/${encodeURIComponent(agentId)}`, patchData),
      `patchAgentWebhookUrl(${agentId})`
    );
    
    return result;
  }

  /**
   * Delete an agent
   * DELETE /v2/agent/:agent_id
   */
  async deleteAgent(agentId: string): Promise<void> {
    this.validateAgentId(agentId);
    await this.executeWithRetry(
      () => this.client.delete(`/v2/agent/${encodeURIComponent(agentId)}`),
      `deleteAgent(${agentId})`
    );
  }

  /**
   * Make a phone call
   * POST /call
   */
  async makeCall(callData: BolnaCallRequest): Promise<BolnaCallResponse> {
    this.validateAgentId(callData.agent_id);
    logger.info('[Bolna] Initiating call', {
      agentId: callData.agent_id,
      recipient: callData.recipient_phone_number,
      hasUserData: !!callData.user_data
    });

    return this.executeWithRetry(
      () => this.client.post('/call', callData),
      'makeCall'
    );
  }

  /**
   * Stop a call
   * POST /call/stop/:execution_id (assuming this endpoint exists)
   */
  async stopCall(executionId: string): Promise<void> {
    this.validateExecutionId(executionId);
    await this.executeWithRetry(
      () => this.client.post(`/call/stop/${encodeURIComponent(executionId)}`),
      `stopCall(${executionId})`
    );
  }

  /**
   * Get available voices from Bolna.ai API
   */
  async getVoices(): Promise<BolnaVoice[]> {
    try {
      const result = await this.executeWithRetry(
        () => this.client.get('/me/voices'), // Using correct Bolna.ai endpoint: /me/voices
        'getVoices'
      );
      
      // Parse the result - Bolna returns voices in different formats
      let voices: BolnaVoice[] = [];
      
      // Check if it's a direct array
      if (Array.isArray(result)) {
        voices = result;
      } 
      // Check if it has a 'data' property with array (Bolna v2 format)
      else if ((result as any).data && Array.isArray((result as any).data)) {
        voices = (result as any).data;
      }
      // Check if it has a 'voices' property with array
      else if ((result as any).voices && Array.isArray((result as any).voices)) {
        voices = (result as any).voices;
      }
      
      logger.info(`Bolna API returned ${voices.length} voices`);
      
      // If no voices returned from API, use defaults
      if (voices.length === 0) {
        logger.warn('Bolna voices endpoint returned empty array, using default voices');
        return this.getDefaultVoices();
      }
      
      return voices;
    } catch (error) {
      // If endpoint doesn't exist or fails, return default voices
      logger.warn('Bolna voices endpoint not available, returning default voices:', error);
      return this.getDefaultVoices();
    }
  }

  /**
   * Get default voices for different providers
   */
  private getDefaultVoices(): BolnaVoice[] {
    return [
      // Amazon Polly voices
      { id: 'polly-matthew', voice_id: 'Matthew', name: 'Matthew', provider: 'polly', model: 'standard', accent: 'United States (English) male' },
      { id: 'polly-joanna', voice_id: 'Joanna', name: 'Joanna', provider: 'polly', model: 'standard', accent: 'United States (English) female' },
      { id: 'polly-amy', voice_id: 'Amy', name: 'Amy', provider: 'polly', model: 'standard', accent: 'United Kingdom (English) female' },
      { id: 'polly-brian', voice_id: 'Brian', name: 'Brian', provider: 'polly', model: 'standard', accent: 'United Kingdom (English) male' },
      { id: 'polly-emma', voice_id: 'Emma', name: 'Emma', provider: 'polly', model: 'standard', accent: 'United Kingdom (English) female' },
      
      // Azure voices (if supported)
      { id: 'azure-jenny', voice_id: 'en-US-JennyNeural', name: 'Jenny', provider: 'azure', model: 'neural', accent: 'United States (English) female' },
      { id: 'azure-guy', voice_id: 'en-US-GuyNeural', name: 'Guy', provider: 'azure', model: 'neural', accent: 'United States (English) male' },
      
      // OpenAI voices (if supported)
      { id: 'openai-alloy', voice_id: 'alloy', name: 'Alloy', provider: 'openai', model: 'tts-1', accent: 'United States (English)' },
      { id: 'openai-echo', voice_id: 'echo', name: 'Echo', provider: 'openai', model: 'tts-1', accent: 'United States (English)' },
      { id: 'openai-fable', voice_id: 'fable', name: 'Fable', provider: 'openai', model: 'tts-1', accent: 'United States (English)' },
      { id: 'openai-onyx', voice_id: 'onyx', name: 'Onyx', provider: 'openai', model: 'tts-1', accent: 'United States (English)' },
      { id: 'openai-nova', voice_id: 'nova', name: 'Nova', provider: 'openai', model: 'tts-1', accent: 'United States (English)' },
      { id: 'openai-shimmer', voice_id: 'shimmer', name: 'Shimmer', provider: 'openai', model: 'tts-1', accent: 'United States (English)' },
    ];
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      // Try to list agents as a connection test
      await this.listAgents();
      logger.info('Bolna API connection test successful');
      return true;
    } catch (error) {
      logger.error('Bolna API connection test failed:', error);
      return false;
    }
  }

  async getCallStatus(executionId: string): Promise<any> {
    this.validateExecutionId(executionId);
    try {
      const response = await this.executeWithRetry(
        () => this.client.get(`/call/${encodeURIComponent(executionId)}`),
        'getCallStatus'
      );
      return response;
    } catch (error) {
      logger.error('Error getting call status from Bolna.ai:', error);
      throw error;
    }
  }


}

// Export the class for testing
export { BolnaService };

// Create singleton instance
export const bolnaService = new BolnaService();