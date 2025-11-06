import { Request, Response } from 'express';
import { UserModel } from '../models/User';
import openaiPromptService from '../services/openaiPromptService';
import { logger } from '../utils/logger';

const userModel = new UserModel();

/**
 * Get user's OpenAI prompt configuration
 */
export const getUserPrompts = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await userModel.findById(userId);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      openai_individual_prompt_id: user.openai_individual_prompt_id,
      openai_complete_prompt_id: user.openai_complete_prompt_id,
      system_defaults: {
        individual: process.env.OPENAI_INDIVIDUAL_PROMPT_ID || null,
        complete: process.env.OPENAI_COMPLETE_PROMPT_ID || null,
      },
    });
  } catch (error) {
    logger.error('Failed to get user prompts', { error });
    res.status(500).json({ error: 'Failed to get prompts' });
  }
};

/**
 * Update user's OpenAI prompt configuration
 */
export const updateUserPrompts = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { openai_individual_prompt_id, openai_complete_prompt_id } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Validate prompt IDs if provided
    if (openai_individual_prompt_id) {
      const validation = await openaiPromptService.validatePromptId(openai_individual_prompt_id);
      if (!validation.valid) {
        res.status(400).json({
          error: 'Invalid individual prompt ID',
          details: validation.error,
        });
        return;
      }
    }

    if (openai_complete_prompt_id) {
      const validation = await openaiPromptService.validatePromptId(openai_complete_prompt_id);
      if (!validation.valid) {
        res.status(400).json({
          error: 'Invalid complete prompt ID',
          details: validation.error,
        });
        return;
      }
    }

    // Update user
    const updated = await userModel.update(userId, {
      openai_individual_prompt_id: openai_individual_prompt_id || null,
      openai_complete_prompt_id: openai_complete_prompt_id || null,
    });

    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    logger.info('User prompts updated', {
      userId,
      hasIndividualPrompt: !!openai_individual_prompt_id,
      hasCompletePrompt: !!openai_complete_prompt_id,
    });

    res.json({
      message: 'Prompts updated successfully',
      openai_individual_prompt_id: updated.openai_individual_prompt_id,
      openai_complete_prompt_id: updated.openai_complete_prompt_id,
    });
  } catch (error) {
    logger.error('Failed to update user prompts', { error });
    res.status(500).json({ error: 'Failed to update prompts' });
  }
};

/**
 * Admin: Get any user's OpenAI prompt configuration
 */
export const adminGetUserPrompts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const user = await userModel.findById(userId);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      user_id: user.id,
      email: user.email,
      name: user.name,
      openai_individual_prompt_id: user.openai_individual_prompt_id,
      openai_complete_prompt_id: user.openai_complete_prompt_id,
    });
  } catch (error) {
    logger.error('Failed to get user prompts (admin)', { error });
    res.status(500).json({ error: 'Failed to get prompts' });
  }
};

/**
 * Admin: Update any user's OpenAI prompt configuration
 */
export const adminUpdateUserPrompts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { openai_individual_prompt_id, openai_complete_prompt_id } = req.body;

    // Validate prompt IDs if provided
    if (openai_individual_prompt_id) {
      const validation = await openaiPromptService.validatePromptId(openai_individual_prompt_id);
      if (!validation.valid) {
        res.status(400).json({
          error: 'Invalid individual prompt ID',
          details: validation.error,
        });
        return;
      }
    }

    if (openai_complete_prompt_id) {
      const validation = await openaiPromptService.validatePromptId(openai_complete_prompt_id);
      if (!validation.valid) {
        res.status(400).json({
          error: 'Invalid complete prompt ID',
          details: validation.error,
        });
        return;
      }
    }

    // Update user
    const updated = await userModel.update(userId, {
      openai_individual_prompt_id: openai_individual_prompt_id || null,
      openai_complete_prompt_id: openai_complete_prompt_id || null,
    });

    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    logger.info('User prompts updated by admin', {
      targetUserId: userId,
      adminUserId: (req as any).user?.id,
      hasIndividualPrompt: !!openai_individual_prompt_id,
      hasCompletePrompt: !!openai_complete_prompt_id,
    });

    res.json({
      message: 'Prompts updated successfully',
      user_id: updated.id,
      openai_individual_prompt_id: updated.openai_individual_prompt_id,
      openai_complete_prompt_id: updated.openai_complete_prompt_id,
    });
  } catch (error) {
    logger.error('Failed to update user prompts (admin)', { error });
    res.status(500).json({ error: 'Failed to update prompts' });
  }
};

/**
 * Validate a prompt ID without saving
 */
export const validatePromptId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { prompt_id } = req.body;

    if (!prompt_id) {
      res.status(400).json({ error: 'prompt_id is required' });
      return;
    }

    const validation = await openaiPromptService.validatePromptId(prompt_id);

    res.json({
      valid: validation.valid,
      error: validation.error,
      details: validation.details,
    });
  } catch (error) {
    logger.error('Failed to validate prompt ID', { error });
    res.status(500).json({ error: 'Failed to validate prompt' });
  }
};
