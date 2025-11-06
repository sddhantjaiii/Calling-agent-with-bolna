/**
 * OpenAI Response API Types
 * Documentation: https://platform.openai.com/docs/api-reference/responses
 */

// Request types
export interface OpenAIResponseRequest {
  prompt: {
    id: string; // Prompt ID from OpenAI Platform (e.g., "pmpt_68de2bd80fa08196ab95184e7787c6e30c231f4a29f082a0")
  };
  input: OpenAIMessageInput[];
  conversation?: {
    id?: string; // OpenAI conversation ID
    external_id?: string; // Your own conversation ID
  };
  user?: string; // User identifier for tracking
  metadata?: Record<string, any>; // Custom metadata
  modalities?: string[]; // e.g., ["text"]
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}

export interface OpenAIMessageInput {
  role: 'system' | 'user' | 'assistant';
  content: string | OpenAIContentPart[];
}

export interface OpenAIContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
  };
}

// Response types
export interface OpenAIResponseData {
  id: string; // Unique response ID
  object: 'response';
  created: number; // Unix timestamp
  output: OpenAIOutputItem[];
  usage?: OpenAIUsage;
  metadata?: Record<string, any>;
}

export interface OpenAIOutputItem {
  index: number;
  finish_reason: 'stop' | 'length' | 'content_filter' | 'tool_calls';
  content: OpenAIContentItem[];
}

export interface OpenAIContentItem {
  type: 'text' | 'image';
  text?: string;
  image?: {
    url: string;
  };
}

export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// Extraction result types
export interface IndividualAnalysis {
  name: string | null;
  email: string | null;
  phone: string | null;
  leadScore: number; // 0-100
  nextSteps: string | null;
  keyTopics: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  callDuration: number; // seconds
  callOutcome: string | null;
  objections: string[];
  painPoints: string[];
  interests: string[];
}

export interface CompleteAnalysis {
  totalInteractions: number;
  averageLeadScore: number; // 0-100
  overallSentiment: 'positive' | 'neutral' | 'negative';
  commonThemes: string[];
  progressionSummary: string;
  recommendedActions: string[];
  engagementTrend: 'increasing' | 'stable' | 'decreasing';
  conversionReadiness: number; // 0-100
  keyDecisionFactors: string[];
}

// Service types
export interface OpenAIExtractionResult {
  individual?: IndividualAnalysis;
  complete?: CompleteAnalysis;
  rawResponse: OpenAIResponseData;
  tokensUsed: number;
  processingTimeMs: number;
}

export interface OpenAIServiceConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

// Error types
export interface OpenAIError {
  message: string;
  type: string;
  code?: string;
  status?: number;
}

export interface OpenAIErrorResponse {
  error: OpenAIError;
}
