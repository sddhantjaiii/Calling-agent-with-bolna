import { Router, Request, Response } from 'express';
import axios from 'axios';
import { logger } from '../utils/logger';

const router = Router();

const CHAT_AGENT_SERVER_URL = process.env.CHAT_AGENT_SERVER_URL || 'http://localhost:4000';

/**
 * Chat Leads API Routes
 * 
 * Proxies requests to Chat Agent Server for leads and messages
 * Base: /api/chat-leads
 * All routes require authentication (mounted with authenticatedRateLimit in index.ts)
 */

/**
 * Get leads with search and filters
 * GET /api/chat-leads
 * 
 * Proxies to: GET /users/:user_id/leads
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User ID not found in request',
      });
    }

    // Forward all query params to the chat agent server
    const queryParams = new URLSearchParams(req.query as Record<string, string>);
    const url = `${CHAT_AGENT_SERVER_URL}/users/${userId}/leads?${queryParams}`;

    logger.info('🔄 Proxying chat leads request', { userId, url });

    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    res.json(response.data);
  } catch (error: any) {
    logger.error('❌ Chat leads proxy failed', {
      error: error.message,
      status: error.response?.status,
    });

    // Forward error response if available
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch leads',
      message: error.message,
    });
  }
});

/**
 * Get lead statistics
 * GET /api/chat-leads/stats
 * 
 * Proxies to: GET /users/:user_id/leads/stats
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User ID not found in request',
      });
    }

    const queryParams = new URLSearchParams(req.query as Record<string, string>);
    const url = `${CHAT_AGENT_SERVER_URL}/users/${userId}/leads/stats?${queryParams}`;

    logger.info('🔄 Proxying chat leads stats request', { userId });

    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    res.json(response.data);
  } catch (error: any) {
    logger.error('❌ Chat leads stats proxy failed', {
      error: error.message,
      status: error.response?.status,
    });

    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch lead stats',
      message: error.message,
    });
  }
});

/**
 * Get single lead details
 * GET /api/chat-leads/:customerPhone
 * 
 * Proxies to: GET /users/:user_id/leads/:customer_phone
 */
router.get('/:customerPhone', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { customerPhone } = req.params;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User ID not found in request',
      });
    }

    const encodedPhone = encodeURIComponent(customerPhone);
    const url = `${CHAT_AGENT_SERVER_URL}/users/${userId}/leads/${encodedPhone}`;

    logger.info('🔄 Proxying single chat lead request', { userId, customerPhone });

    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    res.json(response.data);
  } catch (error: any) {
    logger.error('❌ Single chat lead proxy failed', {
      error: error.message,
      status: error.response?.status,
      customerPhone: req.params.customerPhone,
    });

    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch lead',
      message: error.message,
    });
  }
});

/**
 * Get messages for a lead
 * GET /api/chat-leads/:customerPhone/messages
 * 
 * Proxies to: GET /users/:user_id/leads/:customer_phone/messages
 */
router.get('/:customerPhone/messages', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { customerPhone } = req.params;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User ID not found in request',
      });
    }

    const encodedPhone = encodeURIComponent(customerPhone);
    const queryParams = new URLSearchParams(req.query as Record<string, string>);
    const url = `${CHAT_AGENT_SERVER_URL}/users/${userId}/leads/${encodedPhone}/messages?${queryParams}`;

    logger.info('🔄 Proxying chat messages request', { userId, customerPhone });

    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    res.json(response.data);
  } catch (error: any) {
    logger.error('❌ Chat messages proxy failed', {
      error: error.message,
      status: error.response?.status,
      customerPhone: req.params.customerPhone,
    });

    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch messages',
      message: error.message,
    });
  }
});

/**
 * Get message status and failure reason
 * GET /api/chat-leads/messages/:messageId/status
 * 
 * Proxies to: GET /users/:user_id/messages/:message_id/status
 */
router.get('/messages/:messageId/status', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { messageId } = req.params;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User ID not found in request',
      });
    }

    const encodedMessageId = encodeURIComponent(messageId);
    const url = `${CHAT_AGENT_SERVER_URL}/users/${userId}/messages/${encodedMessageId}/status`;

    logger.info('🔄 Proxying message status request', { userId, messageId });

    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    res.json(response.data);
  } catch (error: any) {
    logger.error('❌ Message status proxy failed', {
      error: error.message,
      status: error.response?.status,
      messageId: req.params.messageId,
    });

    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch message status',
      message: error.message,
    });
  }
});

export default router;
