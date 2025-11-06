import axios from 'axios';
import { logger } from '../utils/logger';

/**
 * Service for managing user-specific OpenAI prompt configurations
 */
export class OpenAIPromptService {
  private apiKey: string;
  private baseUrl = 'https://api.openai.com/v1';

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    if (!this.apiKey) {
      logger.warn('⚠️  OPENAI_API_KEY not configured');
    }
  }

  /**
   * Validate a prompt ID by testing it with OpenAI API
   * @param promptId - The prompt ID to validate (e.g., "pmpt_...")
   * @returns Promise<{ valid: boolean; error?: string; details?: any }>
   */
  async validatePromptId(promptId: string): Promise<{
    valid: boolean;
    error?: string;
    details?: any;
  }> {
    // Check format
    if (!promptId || !promptId.startsWith('pmpt_')) {
      return {
        valid: false,
        error: 'Invalid prompt ID format. Must start with "pmpt_"',
      };
    }

    try {
      // Use OpenAI Responses API and reference the prompt template by ID
      // Minimal request: ask the prompt to reply with "OK" to validate accessibility
      const validationModel = process.env.OPENAI_VALIDATION_MODEL || undefined;
      const response = await axios.post(
        `${this.baseUrl}/responses`,
        {
          // Let the prompt carry model/config; do not force a model here unless needed.
          prompt: { id: promptId },
          // Use simple string input to match Responses API minimal schema
          input: 'Run this prompt for testing. json',
          // If the prompt doesn't embed a model, allow a safe override for validation only
          ...(validationModel ? { model: validationModel } : {}),
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: 10000,
        }
      );

      logger.info('✅ Prompt validation successful (Responses API)', {
        promptId: promptId.substring(0, 20) + '...',
        responseId: response.data?.id,
      });

      return {
        valid: true,
        details: {
          responseId: response.data?.id,
          usage: response.data?.usage,
          promptId,
        },
      };
    } catch (error: any) {
      const requestId = error.response?.headers?.['x-request-id'] || error.response?.data?.request_id;
      logger.error('❌ Prompt validation failed', {
        promptId: promptId.substring(0, 20) + '...',
        error: error.response?.data?.error?.message || error.message,
        requestId,
      });

      // Check for specific errors
      if (error.response?.status === 404) {
        return {
          valid: false,
          error: 'Prompt ID not found. Please check the ID is correct.',
        };
      }

      if (error.response?.status === 401) {
        return {
          valid: false,
          error: 'OpenAI API authentication failed. Please check API key.',
        };
      }

      // Common developer mistake: using Chat Completions with a `prompt` field
      // Surfaces as: "Unrecognized request argument supplied: prompt"
      const apiMessage: string | undefined = error.response?.data?.error?.message;
      if (apiMessage?.includes('Unrecognized request argument supplied: prompt')) {
        return {
          valid: false,
          error:
            'Unrecognized request argument: prompt. Ensure you are calling the Responses API (/v1/responses) with `input` and reference the prompt as { prompt: { id: "pmpt_..." } }.',
        };
      }

      if (apiMessage) {
        return {
          valid: false,
          error: requestId ? `${apiMessage} (request_id: ${requestId})` : apiMessage,
        };
      }

      return {
        valid: false,
        error: requestId
          ? `Failed to validate prompt. Please try again. (request_id: ${requestId})`
          : 'Failed to validate prompt. Please try again.',
      };
    }
  }

  /**
   * Get effective prompt ID (user-specific or system default)
   * @param userPromptId - User's custom prompt ID (can be null)
   * @param promptType - 'individual' or 'complete'
   * @returns The prompt ID to use
   */
  getEffectivePromptId(
    userPromptId: string | null | undefined,
    promptType: 'individual' | 'complete'
  ): string {
    // If user has custom prompt, use it
    if (userPromptId) {
      return userPromptId;
    }

    // Fall back to system default
    const envKey =
      promptType === 'individual'
        ? 'OPENAI_INDIVIDUAL_PROMPT_ID'
        : 'OPENAI_COMPLETE_PROMPT_ID';

    const systemDefault = process.env[envKey];

    if (!systemDefault) {
      throw new Error(
        `No ${promptType} prompt ID configured for user and no system default found in ${envKey}`
      );
    }

    logger.debug(`Using system default prompt for ${promptType} analysis`, {
      promptId: systemDefault.substring(0, 20) + '...',
    });

    return systemDefault;
  }

  /**
   * Validate both individual and complete prompt IDs
   * @param individualPromptId - Individual analysis prompt
   * @param completePromptId - Complete analysis prompt
   * @returns Validation results for both
   */
  async validateBothPrompts(
    individualPromptId: string,
    completePromptId: string
  ): Promise<{
    individual: { valid: boolean; error?: string };
    complete: { valid: boolean; error?: string };
    allValid: boolean;
  }> {
    const [individualResult, completeResult] = await Promise.all([
      this.validatePromptId(individualPromptId),
      this.validatePromptId(completePromptId),
    ]);

    return {
      individual: {
        valid: individualResult.valid,
        error: individualResult.error,
      },
      complete: {
        valid: completeResult.valid,
        error: completeResult.error,
      },
      allValid: individualResult.valid && completeResult.valid,
    };
  }
}

export default new OpenAIPromptService();
