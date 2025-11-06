import { API_URL } from '@/config/api';

export interface OpenAIPromptConfig {
  openai_individual_prompt_id: string | null;
  openai_complete_prompt_id: string | null;
  system_defaults?: {
    individual: string | null;
    complete: string | null;
  };
}

export interface PromptValidationResult {
  valid: boolean;
  error?: string;
  details?: {
    model: string;
    promptId: string;
  };
}

const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
};

const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  return data.success ? data.data : data;
};

/**
 * Service for managing user-specific OpenAI prompt configurations
 */
export const openaiPromptService = {
  /**
   * Get current user's OpenAI prompt configuration
   */
  async getMyPrompts(): Promise<OpenAIPromptConfig> {
    const response = await fetch(`${API_URL}/openai-prompts/my-prompts`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse<OpenAIPromptConfig>(response);
  },

  /**
   * Update current user's OpenAI prompt configuration
   */
  async updateMyPrompts(data: {
    openai_individual_prompt_id?: string | null;
    openai_complete_prompt_id?: string | null;
  }): Promise<OpenAIPromptConfig> {
    const response = await fetch(`${API_URL}/openai-prompts/my-prompts`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<OpenAIPromptConfig>(response);
  },

  /**
   * Validate a prompt ID before saving
   */
  async validatePrompt(promptId: string): Promise<PromptValidationResult> {
    const response = await fetch(`${API_URL}/openai-prompts/validate`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ prompt_id: promptId }),
    });
    return handleResponse<PromptValidationResult>(response);
  },

  /**
   * Admin: Get any user's OpenAI prompt configuration
   */
  async adminGetUserPrompts(userId: string): Promise<OpenAIPromptConfig & { user_id: string; email: string; name: string }> {
    const response = await fetch(`${API_URL}/openai-prompts/admin/users/${userId}/prompts`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse<OpenAIPromptConfig & { user_id: string; email: string; name: string }>(response);
  },

  /**
   * Admin: Update any user's OpenAI prompt configuration
   */
  async adminUpdateUserPrompts(
    userId: string,
    data: {
      openai_individual_prompt_id?: string | null;
      openai_complete_prompt_id?: string | null;
    }
  ): Promise<OpenAIPromptConfig & { user_id: string }> {
    const response = await fetch(`${API_URL}/openai-prompts/admin/users/${userId}/prompts`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<OpenAIPromptConfig & { user_id: string }>(response);
  },
};

