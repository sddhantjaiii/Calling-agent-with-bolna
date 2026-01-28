import axios, { AxiosError } from 'axios';
import * as Sentry from '@sentry/node';
import { logger } from '../utils/logger';
import openaiPromptService from './openaiPromptService';

// OpenAI Response API types
interface OpenAIResponseAPIRequest {
  prompt: {
    id: string;
  };
  input: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  conversation?: {
    id?: string;
    external_id?: string;
  };
  user?: string;
  metadata?: Record<string, any>;
}

interface OpenAIResponseAPIResponse {
  id: string;
  object: 'response';
  created: number;
  output: Array<{
    index: number;
    finish_reason: string;
    content: Array<{
      type: string;
      text: string;
    }>;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Individual analysis result structure (matches OpenAI prompt output)
export interface IndividualAnalysis {
  intent_level: string;
  intent_score: number;
  urgency_level: string;
  urgency_score: number;
  budget_constraint: string;
  budget_score: number;
  fit_alignment: string;
  fit_score: number;
  engagement_health: string;
  engagement_score: number;
  total_score: number;
  lead_status_tag: string;
  demo_book_datetime: string | null;
  transcript_summary?: string | null; // Bolna's AI-generated summary
  reasoning: {
    intent: string;
    urgency: string;
    budget: string;
    fit: string;
    engagement: string;
    cta_behavior: string;
  };
  extraction: {
    name: string | null;
    email_address: string | null;
    company_name: string | null;
    smartnotification: string | null;
    requirements: string | null;
    custom_cta: string | null;
    in_detail_summary: string | null;
  };
}

// Complete analysis result structure (same as individual for now)
export interface CompleteAnalysis extends IndividualAnalysis {}

// OpenAI service class
class OpenAIExtractionService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.openai.com/v1';
  private readonly timeout: number;
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.timeout = parseInt(process.env.OPENAI_TIMEOUT || '30000', 10);

    if (!this.apiKey) {
      logger.error('OpenAI API key not configured');
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
  }

  /**
   * Call OpenAI Response API with retry logic
   */
  private async callResponseAPI(
    request: OpenAIResponseAPIRequest,
    retryCount = 0
  ): Promise<OpenAIResponseAPIResponse> {
    try {
      logger.info('Calling OpenAI Response API', {
        promptId: request.prompt.id,
        inputLength: request.input.length,
        requestBody: JSON.stringify(request).substring(0, 500), // Log first 500 chars
        retryCount,
      });

      const response = await axios.post<OpenAIResponseAPIResponse>(
        `${this.baseUrl}/responses`,
        request,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: this.timeout,
        }
      );

      logger.info('OpenAI Response API call successful', {
        responseId: response.data.id,
        usage: response.data.usage,
      });

      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;

      const apiMessage: string | undefined = (axiosError.response?.data as any)?.error?.message;
      const isPromptNotFound =
        axiosError.response?.status === 404 &&
        typeof apiMessage === 'string' &&
        apiMessage.includes('Prompt with id') &&
        apiMessage.includes('not found');

      // If the configured prompt template doesn't exist for the current OPENAI_API_KEY,
      // fall back to calling Responses API without `prompt` (model override).
      if (isPromptNotFound) {
        const fallbackModel = process.env.OPENAI_MODEL;
        if (!fallbackModel) {
          throw new Error(
            `OpenAI prompt template not found (${request.prompt.id}). ` +
              `Set valid OPENAI_INDIVIDUAL_PROMPT_ID/OPENAI_COMPLETE_PROMPT_ID (or user prompt IDs), ` +
              `or set OPENAI_MODEL to enable fallback.`
          );
        }

        logger.warn('OpenAI prompt template not found; falling back to OPENAI_MODEL', {
          promptId: request.prompt.id,
          model: fallbackModel,
        });

        const fallbackResponse = await axios.post<OpenAIResponseAPIResponse>(
          `${this.baseUrl}/responses`,
          {
            model: fallbackModel,
            input: [
              {
                role: 'system',
                content:
                  'Return ONLY valid JSON. Do not include markdown, code fences, or commentary. ' +
                  'If a field is unknown, use null. Ensure the JSON matches the expected schema.',
              },
              ...request.input,
            ],
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: this.timeout,
          }
        );

        return fallbackResponse.data;
      }
      
      logger.error('OpenAI Response API call failed', {
        error: axiosError.message,
        status: axiosError.response?.status,
        statusText: axiosError.response?.statusText,
        data: axiosError.response?.data,
        retryCount,
      });

      // Retry logic for transient errors
      if (retryCount < this.maxRetries) {
        const shouldRetry = 
          axiosError.response?.status === 429 || // Rate limit
          axiosError.response?.status === 500 || // Server error
          axiosError.response?.status === 503 || // Service unavailable
          axiosError.code === 'ECONNABORTED' ||   // Timeout
          axiosError.code === 'ETIMEDOUT';        // Timeout

        if (shouldRetry) {
          const delay = this.retryDelay * Math.pow(2, retryCount); // Exponential backoff
          logger.info(`Retrying OpenAI API call in ${delay}ms`, { retryCount: retryCount + 1 });
          
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.callResponseAPI(request, retryCount + 1);
        }
      }

      // Capture final failure in Sentry (after retries exhausted)
      Sentry.captureException(axiosError, {
        level: 'error',
        tags: {
          error_type: 'openai_api_failure',
          status_code: axiosError.response?.status,
          severity: 'high',
          external_api: 'openai',
          retries_exhausted: retryCount >= this.maxRetries ? 'true' : 'false'
        },
        contexts: {
          openai_api: {
            status: axiosError.response?.status,
            statusText: axiosError.response?.statusText,
            error_code: axiosError.code,
            retry_count: retryCount,
            max_retries: this.maxRetries,
            operation: 'callResponseAPI'
          }
        }
      });

      throw new Error(`OpenAI API call failed: ${axiosError.message}`);
    }
  }

  /**
   * Parse JSON from OpenAI response
   */
  private parseOpenAIResponse<T>(response: OpenAIResponseAPIResponse): T {
    try {
      // Log the full response structure for debugging
      logger.info('Parsing OpenAI response', {
        responseId: response.id,
        outputLength: response.output?.length,
        outputStructure: JSON.stringify(response.output).substring(0, 500),
      });

      // OpenAI Response API returns output as an array
      // Find the message type (not reasoning type)
      const messageOutput = response.output.find((item: any) => item.type === 'message');
      
      if (!messageOutput) {
        throw new Error('No message output in OpenAI response');
      }

      // Look for content with type 'output_text' or 'text'
      const textContent = messageOutput.content?.find(
        (c: any) => c.type === 'output_text' || c.type === 'text'
      )?.text;
      
      if (!textContent) {
        // Try alternative response structure (might be output_text directly)
        const alternativeText = (response as any).output_text;
        if (alternativeText) {
          logger.info('Using alternative output_text field');
          return JSON.parse(alternativeText) as T;
        }
        
        throw new Error('No text content in OpenAI response');
      }

      logger.info('Found text content', {
        textLength: textContent.length,
        preview: textContent.substring(0, 100),
      });

      // Remove markdown code blocks if present
      const cleanedText = textContent
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const parsed = JSON.parse(cleanedText);
      return parsed as T;
    } catch (error) {
      logger.error('Failed to parse OpenAI response', {
        error: error instanceof Error ? error.message : 'Unknown error',
        responseId: response.id,
        fullResponse: JSON.stringify(response).substring(0, 1000),
      });
      
      // Capture OpenAI response parsing failure in Sentry
      Sentry.captureException(error, {
        level: 'error',
        tags: {
          error_type: 'openai_response_parse_failed',
          response_id: response.id,
          severity: 'high',
          external_api: 'openai'
        },
        contexts: {
          openai_parsing: {
            response_id: response.id,
            operation: 'parseResponse',
            response_preview: JSON.stringify(response).substring(0, 500)
          }
        }
      });
      
      throw new Error('Failed to parse OpenAI response as JSON');
    }
  }

  /**
   * Extract individual call analysis from transcript
   */
  async extractIndividualCallData(
    transcript: string,
    executionId: string,
    phoneNumber?: string,
    userPromptId?: string | null
  ): Promise<IndividualAnalysis> {
    // Use user's custom prompt or system default
    const promptId = openaiPromptService.getEffectivePromptId(userPromptId, 'individual');

    // Get current date and time for context
    const now = new Date();
    const currentDateTime = now.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });

    logger.info('Extracting individual call data', {
      executionId,
      phoneNumber,
      transcriptLength: transcript.length,
      usingUserPrompt: !!userPromptId,
      promptId: promptId.substring(0, 20) + '...',
      currentDateTime,
    });

    const request: OpenAIResponseAPIRequest = {
      prompt: {
        id: promptId,
      },
      input: [
        {
          role: 'user',
          content: `Current Date and Time: ${currentDateTime}

Use this date and time information to calculate relative meeting times when analyzing the transcript. For example, if someone says "kal" (tomorrow) or "parso" (day after tomorrow), calculate the actual date based on the current date provided above.

Analyze the following call transcript and return the results in JSON format:

${transcript}`,
        },
      ],
    };

    const response = await this.callResponseAPI(request);
    const analysis = this.parseOpenAIResponse<IndividualAnalysis>(response);

    const requirements = analysis?.extraction?.requirements;

    logger.info('Individual call data extracted successfully', {
      executionId,
      totalScore: analysis.total_score,
      leadStatusTag: analysis.lead_status_tag,
      intentScore: analysis.intent_score,
      demo_book_datetime: analysis.demo_book_datetime,
      has_demo_datetime: !!analysis.demo_book_datetime,
      requirements_is_missing: requirements === undefined,
      requirements_is_null: requirements === null,
      requirements_length: typeof requirements === 'string' ? requirements.trim().length : null,
    });

    // ⚠️ DEBUG: Log the COMPLETE extracted analysis for debugging
    logger.debug('🔍 DEBUG: Complete analysis object from OpenAI', {
      executionId,
      analysis: JSON.stringify(analysis, null, 2)
    });

    return analysis;
  }

  /**
   * Extract complete analysis across all historical calls
   */
  async extractCompleteAnalysis(
    currentTranscript: string,
    previousTranscripts: string[],
    previousAnalyses: IndividualAnalysis[],
    userId: string,
    phoneNumber: string,
    userPromptId?: string | null
  ): Promise<CompleteAnalysis> {
    // Use user's custom prompt or system default
    const promptId = openaiPromptService.getEffectivePromptId(userPromptId, 'complete');

    // Get current date and time for context
    const now = new Date();
    const currentDateTime = now.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });

    logger.info('Extracting complete analysis', {
      userId,
      phoneNumber,
      previousCallsCount: previousAnalyses.length,
      previousTranscriptsCount: previousTranscripts.length,
      usingUserPrompt: !!userPromptId,
      promptId: promptId.substring(0, 20) + '...',
      currentDateTime,
    });

    // Build full transcript history with call numbers
    const transcriptHistory = previousTranscripts.map((transcript, index) => `
=== CALL ${index + 1} TRANSCRIPT ===
${transcript}
`).join('\n');

    const contextMessage = `
Current Date and Time: ${currentDateTime}

Use this date and time information to calculate relative meeting times when analyzing the transcript. For example, if someone says "kal" (tomorrow) or "parso" (day after tomorrow), calculate the actual date based on the current date provided above.

Analyze the complete call history and return the results in JSON format.

${previousTranscripts.length > 0 ? `
PREVIOUS CALL TRANSCRIPTS (${previousTranscripts.length} calls):
${transcriptHistory}
` : 'No previous calls.'}

=== CURRENT CALL (Call ${previousTranscripts.length + 1}) TRANSCRIPT ===
${currentTranscript}
`;

    const request: OpenAIResponseAPIRequest = {
      prompt: {
        id: promptId,
      },
      input: [
        {
          role: 'user',
          content: contextMessage,
        },
      ],
    };

    const response = await this.callResponseAPI(request);
    const analysis = this.parseOpenAIResponse<CompleteAnalysis>(response);

    const requirements = analysis?.extraction?.requirements;

    logger.info('Complete analysis extracted successfully', {
      userId,
      phoneNumber,
      totalScore: analysis.total_score,
      leadStatusTag: analysis.lead_status_tag,
      requirements_is_missing: requirements === undefined,
      requirements_is_null: requirements === null,
      requirements_length: typeof requirements === 'string' ? requirements.trim().length : null,
    });

    return analysis;
  }

  /**
   * Test OpenAI API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const testRequest: OpenAIResponseAPIRequest = {
        prompt: {
          id: process.env.OPENAI_INDIVIDUAL_PROMPT_ID || '',
        },
        input: [
          {
            role: 'user',
            content: 'Test connection',
          },
        ],
      };

      await this.callResponseAPI(testRequest);
      return true;
    } catch (error) {
      logger.error('OpenAI connection test failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }
}

// Export singleton instance
export const openaiExtractionService = new OpenAIExtractionService();
