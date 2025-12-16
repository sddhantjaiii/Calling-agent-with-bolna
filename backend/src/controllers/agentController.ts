import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { agentService } from '../services/agentService';
import { chatAgentService } from '../services/chatAgentService';
import { logger } from '../utils/logger';
import { queryCache } from '../services/queryCacheService';

export class AgentController {
  async createAgent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const agentData = req.body;

      // Debug logging to check what we receive from frontend
      if (agentData.data_collection?.default?.description) {
        const receivedLength = agentData.data_collection.default.description.length;
        logger.info(`[AgentController] Received data_collection description with ${receivedLength} characters from frontend`);
        logger.info(`[AgentController] First 200 chars: ${agentData.data_collection.default.description.substring(0, 200)}...`);
        logger.info(`[AgentController] Last 200 chars: ...${agentData.data_collection.default.description.substring(Math.max(0, receivedLength - 200))}`);
      }

      // Validate required fields
      if (!agentData.name) {
        res.status(400).json({
          success: false,
          error: 'Agent name is required',
        });
        return;
      }

      // Set default type if not provided
      if (!agentData.type) {
        agentData.type = 'CallAgent';
      }

      // Handle language - convert display language to language code if needed
      if (agentData.language) {
        const languageCodeMap: { [key: string]: string } = {
          'English': 'en',
          'Spanish': 'es',
          'French': 'fr',
          'German': 'de',
          'Italian': 'it',
          'Portuguese': 'pt',
          'Polish': 'pl',
          'Turkish': 'tr',
          'Russian': 'ru',
          'Dutch': 'nl',
          'Czech': 'cs',
          'Arabic': 'ar',
          'Chinese': 'zh',
          'Japanese': 'ja',
          'Hungarian': 'hu',
          'Korean': 'ko'
        };
        agentData.language = languageCodeMap[agentData.language] || agentData.language || 'en';
      } else {
        agentData.language = 'en';
      }

      const agent = await agentService.createAgent(userId, agentData);
      const frontendAgent = await agentService.getAgentForFrontend(userId, agent.id);

      // Invalidate agents cache after creating new agent
      queryCache.invalidateTable('agents');

      res.status(201).json({
        success: true,
        data: frontendAgent,
      });
    } catch (error) {
      logger.error('Error creating agent:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create agent',
      });
    }
  }

  async getAgents(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      // Generate cache key for this user's agents
      const cacheKey = queryCache.generateKey('agents:list', { userId });
      
      // Try to get from cache first
      const agents = await queryCache.wrapQuery(
        cacheKey,
        () => agentService.listAgentsForFrontend(userId),
        2 * 60 * 1000 // 2 minutes TTL
      );

      res.json({
        success: true,
        data: agents,
      });
    } catch (error) {
      logger.error('Error fetching agents:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch agents',
      });
    }
  }

  async getAgent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const agent = await agentService.getAgentForFrontend(userId, id);

      if (!agent) {
        res.status(404).json({
          success: false,
          error: 'Agent not found',
        });
        return;
      }

      res.json({
        success: true,
        data: agent,
      });
    } catch (error) {
      logger.error('Error fetching agent:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch agent',
      });
    }
  }

  async updateAgent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const updateData = req.body;

      // Handle status updates - convert frontend status to backend format
      if (updateData.status) {
        updateData.is_active = updateData.status === 'active';
        delete updateData.status; // Remove frontend field
      }

      // Handle type updates - convert frontend type to backend format
      if (updateData.type) {
        updateData.agent_type = updateData.type === 'CallAgent' ? 'call' : 'chat';
        delete updateData.type; // Remove frontend field
      }

      // Handle language updates - convert display language to language code
      if (updateData.language) {
        const languageCodeMap: { [key: string]: string } = {
          'English': 'en',
          'Spanish': 'es',
          'French': 'fr',
          'German': 'de',
          'Italian': 'it',
          'Portuguese': 'pt',
          'Polish': 'pl',
          'Turkish': 'tr',
          'Russian': 'ru',
          'Dutch': 'nl',
          'Czech': 'cs',
          'Arabic': 'ar',
          'Chinese': 'zh',
          'Japanese': 'ja',
          'Hungarian': 'hu',
          'Korean': 'ko'
        };
        updateData.language = languageCodeMap[updateData.language] || 'en';
      }

      await agentService.updateAgent(userId, id, updateData);
      const updatedAgent = await agentService.getAgentForFrontend(userId, id);

      // Invalidate agents cache after updating
      queryCache.invalidateTable('agents');

      res.json({
        success: true,
        data: updatedAgent,
      });
    } catch (error) {
      logger.error('Error updating agent:', error);
      
      if (error instanceof Error && error.message === 'Agent not found') {
        res.status(404).json({
          success: false,
          error: 'Agent not found',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update agent',
      });
    }
  }

  async deleteAgent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      await agentService.deleteAgent(userId, id);

      // Invalidate agents cache after deleting
      queryCache.invalidateTable('agents');

      res.json({
        success: true,
        message: 'Agent deleted successfully',
      });
    } catch (error) {
      logger.error('Error deleting agent:', error);
      
      if (error instanceof Error && error.message === 'Agent not found') {
        res.status(404).json({
          success: false,
          error: 'Agent not found',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete agent',
      });
    }
  }

  async getVoices(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const voices = await agentService.getVoices();

      res.json({
        success: true,
        data: voices,
      });
    } catch (error) {
      logger.error('Error fetching voices:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch voices',
      });
    }
  }

  async testConnection(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const isConnected = await agentService.testConnection();

      res.json({
        success: true,
        data: { connected: isConnected },
      });
    } catch (error) {
      logger.error('Error testing Bolna.ai connection:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to test connection',
      });
    }
  }

  async updateAgentStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = req.user!.id;

      if (!status || !['active', 'draft'].includes(status)) {
        res.status(400).json({
          success: false,
          error: 'Invalid status. Must be "active" or "draft"',
        });
        return;
      }

      const updateData = {
        is_active: status === 'active'
      };

      await agentService.updateAgent(userId, id, updateData);
      const updatedAgent = await agentService.getAgentForFrontend(userId, id);

      // Invalidate agents cache after status update
      queryCache.invalidateTable('agents');

      res.json({
        success: true,
        data: updatedAgent,
      });
    } catch (error) {
      logger.error('Error updating agent status:', error);
      
      if (error instanceof Error && error.message === 'Agent not found') {
        res.status(404).json({
          success: false,
          error: 'Agent not found',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update agent status',
      });
    }
  }

  /**
   * Get chat agents from the Chat Agent Server (WhatsApp microservice)
   * This proxies the request to the Chat Agent Server
   */
  async getChatAgents(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      logger.info('🔄 Fetching chat agents for user', { userId });

      const response = await chatAgentService.getChatAgents(userId);

      if (!response.success) {
        res.status(500).json({
          success: false,
          error: response.error || 'Failed to fetch chat agents',
          message: response.message,
        });
        return;
      }

      // Transform chat agents to match the frontend Agent interface
      const chatAgents = (response.data || []).map((agent) => ({
        id: `chat_${agent.id}`, // Prefix to distinguish from call agents
        userId: userId,
        bolnaAgentId: '', // Not applicable for chat agents
        name: agent.name,
        agentType: 'chat',
        isActive: agent.status === 'active',
        createdAt: agent.created_at || new Date().toISOString(),
        updatedAt: agent.updated_at || new Date().toISOString(),
        // Frontend-specific fields
        status: agent.status || 'active',
        type: 'ChatAgent' as const,
        conversations: agent.conversations || 0,
        language: agent.language || 'en',
        description: agent.description || '',
        // Chat agent specific
        phoneNumberId: agent.phone_number_id,
        businessAccountId: agent.business_account_id,
        // Platform info
        platform: (agent as any).platform || 'whatsapp',
        phoneDisplay: (agent as any).phone_display,
      }));

      res.json({
        success: true,
        data: chatAgents,
        message: response.message,
      });
    } catch (error) {
      logger.error('Error fetching chat agents:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch chat agents',
      });
    }
  }

  /**
   * Get all agents (both call agents and chat agents combined)
   */
  async getAllAgents(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      logger.info('🔄 Fetching all agents (call + chat) for user', { userId });

      // Fetch both types in parallel
      const [callAgentsResult, chatAgentsResponse] = await Promise.all([
        queryCache.wrapQuery(
          queryCache.generateKey('agents:list', { userId }),
          () => agentService.listAgentsForFrontend(userId),
          2 * 60 * 1000
        ),
        chatAgentService.getChatAgents(userId),
      ]);

      // Transform chat agents to match the frontend Agent interface
      const chatAgents = (chatAgentsResponse.data || []).map((agent) => ({
        id: `chat_${agent.id}`,
        userId: userId,
        bolnaAgentId: '',
        name: agent.name,
        agentType: 'chat',
        isActive: agent.status === 'active',
        createdAt: agent.created_at || new Date().toISOString(),
        updatedAt: agent.updated_at || new Date().toISOString(),
        status: agent.status || 'active',
        type: 'ChatAgent' as const,
        conversations: agent.conversations || 0,
        language: agent.language || 'en',
        description: agent.description || '',
        phoneNumberId: agent.phone_number_id,
        businessAccountId: agent.business_account_id,
        // Platform info
        platform: (agent as any).platform || 'whatsapp',
        phoneDisplay: (agent as any).phone_display,
      }));

      // Combine both types of agents
      const allAgents = [...callAgentsResult, ...chatAgents];

      res.json({
        success: true,
        data: allAgents,
        meta: {
          callAgentsCount: callAgentsResult.length,
          chatAgentsCount: chatAgents.length,
          totalCount: allAgents.length,
        },
      });
    } catch (error) {
      logger.error('Error fetching all agents:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch agents',
      });
    }
  }
}