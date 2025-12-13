import { Request, Response } from 'express';
import { webchatService } from '../services/webchatService';
import { logger } from '../utils/logger';

/**
 * Webchat Controller
 * 
 * Handles webchat widget management operations
 * Proxies requests to Chat Agent Server
 */

/**
 * List available chat agents for the user
 * GET /api/integrations/webchat/agents
 * 
 * Returns agents that can be copied for webchat widgets
 */
export const listChatAgents = async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    const response = await webchatService.listAgents(userId);
    return res.json(response);
  } catch (error: any) {
    logger.error('❌ List chat agents failed', { error: error.message });
    return res.status(error.response?.status || 500).json({
      success: false,
      error: 'Failed to list agents',
      message: error.response?.data?.message || error.message,
    });
  }
};

/**
 * Create a new webchat channel
 * POST /api/integrations/webchat/channels
 * 
 * Body: { name, prompt_id? | agent_id? }
 */
export const createWebchatChannel = async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    const { name, prompt_id, agent_id } = req.body;

    // Validation
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Widget name is required',
      });
    }

    if (!prompt_id && !agent_id) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Either prompt_id or agent_id is required',
      });
    }

    if (prompt_id && agent_id) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Provide either prompt_id or agent_id, not both',
      });
    }

    const response = await webchatService.createWebchatChannel({
      user_id: userId,
      name,
      prompt_id,
      agent_id,
    });

    return res.status(201).json(response);
  } catch (error: any) {
    logger.error('❌ Create webchat channel failed', { error: error.message });
    return res.status(error.response?.status || 500).json({
      success: false,
      error: 'Failed to create webchat channel',
      message: error.response?.data?.message || error.message,
    });
  }
};

/**
 * List webchat channels for the user
 * GET /api/integrations/webchat/channels
 */
export const listWebchatChannels = async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    const response = await webchatService.listWebchatChannels(userId);
    return res.json(response);
  } catch (error: any) {
    logger.error('❌ List webchat channels failed', { error: error.message });
    return res.status(error.response?.status || 500).json({
      success: false,
      error: 'Failed to list webchat channels',
      message: error.response?.data?.message || error.message,
    });
  }
};

/**
 * Get embed code for a webchat channel
 * GET /api/integrations/webchat/channels/:webchatId/embed
 */
export const getWebchatEmbed = async (req: Request, res: Response) => {
  try {
    const { webchatId } = req.params;

    if (!webchatId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Webchat ID is required',
      });
    }

    const response = await webchatService.getWebchatEmbed(webchatId);
    return res.json(response);
  } catch (error: any) {
    logger.error('❌ Get webchat embed failed', { error: error.message });
    return res.status(error.response?.status || 500).json({
      success: false,
      error: 'Failed to get embed code',
      message: error.response?.data?.message || error.message,
    });
  }
};

/**
 * Delete a webchat channel
 * DELETE /api/integrations/webchat/channels/:webchatId
 */
export const deleteWebchatChannel = async (req: Request, res: Response) => {
  try {
    const { webchatId } = req.params;

    if (!webchatId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Webchat ID is required',
      });
    }

    const response = await webchatService.deleteWebchatChannel(webchatId);
    return res.json(response);
  } catch (error: any) {
    logger.error('❌ Delete webchat channel failed', { error: error.message });
    return res.status(error.response?.status || 500).json({
      success: false,
      error: 'Failed to delete webchat channel',
      message: error.response?.data?.message || error.message,
    });
  }
};

export const webchatController = {
  listChatAgents,
  createWebchatChannel,
  listWebchatChannels,
  getWebchatEmbed,
  deleteWebchatChannel,
};
