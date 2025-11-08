import { Request, Response } from 'express';
import { CallService } from '../services/callService';
import { ContactService } from '../services/contactService';
import { userService } from '../services/userService';
import { bolnaService } from '../services/bolnaService';
import { concurrencyManager } from '../services/ConcurrencyManager';
import database from '../config/database';
import { AgentOwnershipRequest } from '../middleware/agentOwnership';
import { logger } from '../utils/logger';
import fetch from 'node-fetch';
import { randomUUID } from 'crypto';

// Call controller - handles call data and transcript management
export class CallController {
  /**
   * Get calls for the authenticated user with filtering, pagination and search
   * GET /api/calls
   */
  static async getCalls(req: Request, res: Response): Promise<Response> {
    try {
      const authReq = req as AgentOwnershipRequest;
      const userId = (req.user as any)?.id;
      const specificAgent = authReq.agent;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Parse query parameters for filtering
      const filters: any = {};
      const options: any = {
        limit: 30, // Default page size for infinite scroll
        offset: 0,
        sortBy: 'created_at',
        sortOrder: 'DESC'
      };

      // Search term filter (searches across contact name, phone, agent name)
      if (req.query.search && typeof req.query.search === 'string') {
        filters.search = req.query.search.trim();
      }

      // Status filter
      if (req.query.status && typeof req.query.status === 'string') {
        const validStatuses = ['completed', 'failed', 'in_progress', 'cancelled'];
        if (validStatuses.includes(req.query.status)) {
          filters.status = req.query.status as any;
        }
      }

      // Agent filter
      if (req.query.agent_id && typeof req.query.agent_id === 'string') {
        filters.agentId = req.query.agent_id;
      }

      // Agent name filter
      if (req.query.agent && typeof req.query.agent === 'string') {
        filters.agentName = req.query.agent;
      }

      // Phone number search
      if (req.query.phone && typeof req.query.phone === 'string') {
        filters.phoneNumber = req.query.phone;
      }

      // Contact name search
      if (req.query.contact && typeof req.query.contact === 'string') {
        filters.contactName = req.query.contact;
      }

      // Date range filters
      if (req.query.start_date && typeof req.query.start_date === 'string') {
        filters.startDate = new Date(req.query.start_date);
      }

      if (req.query.end_date && typeof req.query.end_date === 'string') {
        filters.endDate = new Date(req.query.end_date);
      }

      // Duration filters (in seconds)
      if (req.query.min_duration && typeof req.query.min_duration === 'string') {
        const minDuration = parseInt(req.query.min_duration);
        if (!isNaN(minDuration)) {
          filters.minDurationSeconds = minDuration;
        }
      }

      if (req.query.max_duration && typeof req.query.max_duration === 'string') {
        const maxDuration = parseInt(req.query.max_duration);
        if (!isNaN(maxDuration)) {
          filters.maxDurationSeconds = maxDuration;
        }
      }

      // Content filters
      if (req.query.has_transcript === 'true') {
        filters.hasTranscript = true;
      } else if (req.query.has_transcript === 'false') {
        filters.hasTranscript = false;
      }

      if (req.query.has_analytics === 'true') {
        filters.hasAnalytics = true;
      } else if (req.query.has_analytics === 'false') {
        filters.hasAnalytics = false;
      }

      // Lead scoring filters
      if (req.query.min_score && typeof req.query.min_score === 'string') {
        const minScore = parseInt(req.query.min_score);
        if (!isNaN(minScore)) {
          filters.minScore = minScore;
        }
      }

      if (req.query.max_score && typeof req.query.max_score === 'string') {
        const maxScore = parseInt(req.query.max_score);
        if (!isNaN(maxScore)) {
          filters.maxScore = maxScore;
        }
      }

      if (req.query.lead_status && typeof req.query.lead_status === 'string') {
        filters.leadStatus = req.query.lead_status;
      }

      // Lead tag filter (Hot, Warm, Cold)
      if (req.query.lead_tag && typeof req.query.lead_tag === 'string') {
        filters.leadTag = req.query.lead_tag;
      }

      // Pagination options
      if (req.query.limit && typeof req.query.limit === 'string') {
        const limit = parseInt(req.query.limit);
        if (!isNaN(limit) && limit > 0 && limit <= 100) {
          options.limit = limit;
        }
      }

      if (req.query.offset && typeof req.query.offset === 'string') {
        const offset = parseInt(req.query.offset);
        if (!isNaN(offset) && offset >= 0) {
          options.offset = offset;
        }
      }

      // Sorting options - Updated to include duration_seconds
      if (req.query.sortBy && typeof req.query.sortBy === 'string') {
        const validSortFields = ['created_at', 'duration_seconds', 'duration_minutes', 'total_score', 'contact_name', 'phone_number'];
        if (validSortFields.includes(req.query.sortBy)) {
          options.sortBy = req.query.sortBy as any;
        }
      }

      if (req.query.sortOrder && typeof req.query.sortOrder === 'string') {
        if (['ASC', 'DESC', 'asc', 'desc'].includes(req.query.sortOrder)) {
          options.sortOrder = req.query.sortOrder.toUpperCase() as any;
        }
      }

      // Use CallService with database-level filtering
      const result = await CallService.getFilteredCalls(userId, filters, options);

      return res.json({
        success: true,
        data: result.calls,
        pagination: {
          total: result.total,
          limit: options.limit,
          offset: options.offset,
          hasMore: result.hasMore
        }
      });
    } catch (error) {
      logger.error('Error in getCalls controller:', error);
      return res.status(500).json({
        error: 'Failed to fetch calls',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get a specific call with full details
   * GET /api/calls/:id
   */
  static async getCall(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const callId = req.params.id;
      if (!callId) {
        return res.status(400).json({ error: 'Call ID is required' });
      }

      const call = await CallService.getCallDetails(callId, userId);

      if (!call) {
        return res.status(404).json({ error: 'Call not found' });
      }

      return res.json({
        success: true,
        data: call
      });
    } catch (error) {
      logger.error('Error in getCall controller:', error);
      return res.status(500).json({
        error: 'Failed to fetch call details',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get transcript for a specific call
   * GET /api/calls/:id/transcript
   */
  static async getCallTranscript(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const callId = req.params.id;
      if (!callId) {
        return res.status(400).json({ error: 'Call ID is required' });
      }

      const transcript = await CallService.getCallTranscript(callId, userId);

      if (!transcript) {
        return res.status(404).json({ error: 'Transcript not found' });
      }

      return res.json({
        success: true,
        data: transcript
      });
    } catch (error) {
      logger.error('Error in getCallTranscript controller:', error);
      return res.status(500).json({
        error: 'Failed to fetch transcript',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get recording URL for a specific call
   * GET /api/calls/:id/recording
   */
  static async getCallRecording(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const callId = req.params.id;
      if (!callId) {
        return res.status(400).json({ error: 'Call ID is required' });
      }

      const recording = await CallService.getCallRecording(callId, userId);

      if (!recording) {
        return res.status(404).json({ error: 'Recording not found' });
      }

      return res.json({
        success: true,
        data: recording
      });
    } catch (error) {
      logger.error('Error in getCallRecording controller:', error);
      return res.status(500).json({
        error: 'Failed to fetch recording',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Search calls across all user calls with advanced filtering
   * GET /api/calls/search
   */
  static async searchCalls(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const searchTerm = req.query.q;
      if (!searchTerm || typeof searchTerm !== 'string') {
        return res.status(400).json({ error: 'Search term (q) is required' });
      }

      if (searchTerm.length < 2) {
        return res.status(400).json({ error: 'Search term must be at least 2 characters' });
      }

      const options: any = {};

      // Pagination
      if (req.query.limit && typeof req.query.limit === 'string') {
        const limit = parseInt(req.query.limit);
        if (!isNaN(limit) && limit > 0 && limit <= 100) {
          options.limit = limit;
        }
      }

      if (req.query.offset && typeof req.query.offset === 'string') {
        const offset = parseInt(req.query.offset);
        if (!isNaN(offset) && offset >= 0) {
          options.offset = offset;
        }
      }

      // Get all calls for the user
      let calls = await CallService.getUserCalls(userId);

      // Search across multiple fields
      const searchTermLower = searchTerm.toLowerCase();
      const matchingCalls = calls.filter(call => 
        (call.contact_name && call.contact_name.toLowerCase().includes(searchTermLower)) ||
        call.phone_number.includes(searchTerm) ||
        // call_summary not available in call model
        (call.agent_name && call.agent_name.toLowerCase().includes(searchTermLower)) ||
        (call.transcript?.content && call.transcript.content.toLowerCase().includes(searchTermLower))
      );

      // Apply pagination
      const total = matchingCalls.length;
      const limit = options.limit || 50;
      const offset = options.offset || 0;
      const paginatedResults = matchingCalls.slice(offset, offset + limit);

      return res.json({
        success: true,
        data: {
          results: paginatedResults,
          search_term: searchTerm,
          pagination: {
            total,
            limit,
            offset,
            hasMore: offset + limit < total
          }
        }
      });
    } catch (error) {
      logger.error('Error in searchCalls controller:', error);
      return res.status(500).json({
        error: 'Failed to search calls',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Search transcripts across all user calls
   * GET /api/calls/search/transcripts
   */
  static async searchTranscripts(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const searchTerm = req.query.q;
      if (!searchTerm || typeof searchTerm !== 'string') {
        return res.status(400).json({ error: 'Search term (q) is required' });
      }

      if (searchTerm.length < 2) {
        return res.status(400).json({ error: 'Search term must be at least 2 characters' });
      }

      const options: any = {};

      // Pagination
      if (req.query.limit && typeof req.query.limit === 'string') {
        const limit = parseInt(req.query.limit);
        if (!isNaN(limit) && limit > 0 && limit <= 100) {
          options.limit = limit;
        }
      }

      if (req.query.offset && typeof req.query.offset === 'string') {
        const offset = parseInt(req.query.offset);
        if (!isNaN(offset) && offset >= 0) {
          options.offset = offset;
        }
      }

      const result = await CallService.searchTranscripts(userId, searchTerm, options);

      return res.json({
        success: true,
        data: {
          results: result.results,
          search_term: searchTerm,
          pagination: {
            total: result.total,
            limit: options.limit || 50,
            offset: options.offset || 0
          }
        }
      });
    } catch (error) {
      logger.error('Error in searchTranscripts controller:', error);
      return res.status(500).json({
        error: 'Failed to search transcripts',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get call statistics for dashboard
   * GET /api/calls/stats
   */
  static async getCallStats(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const period = req.query.period;
      let validPeriod: 'day' | 'week' | 'month' | undefined;

      if (period && typeof period === 'string') {
        if (['day', 'week', 'month'].includes(period)) {
          validPeriod = period as 'day' | 'week' | 'month';
        }
      }

      const stats = await CallService.getCallStatistics(userId, validPeriod);

      return res.json({
        success: true,
        data: {
          ...stats,
          period: validPeriod || 'all_time'
        }
      });
    } catch (error) {
      logger.error('Error in getCallStats controller:', error);
      return res.status(500).json({
        error: 'Failed to fetch call statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get recent calls for dashboard
   * GET /api/calls/recent
   */
  static async getRecentCalls(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      let limit = 10;
      if (req.query.limit && typeof req.query.limit === 'string') {
        const parsedLimit = parseInt(req.query.limit);
        if (!isNaN(parsedLimit) && parsedLimit > 0 && parsedLimit <= 50) {
          limit = parsedLimit;
        }
      }

      const calls = await CallService.getRecentCalls(userId, limit);

      return res.json({
        success: true,
        data: calls
      });
    } catch (error) {
      logger.error('Error in getRecentCalls controller:', error);
      return res.status(500).json({
        error: 'Failed to fetch recent calls',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get call audio recording URL
   * GET /api/calls/:id/audio
   */
  static async getCallAudio(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const callId = req.params.id;
      if (!callId) {
        res.status(400).json({ error: 'Call ID is required' });
        return;
      }

      const call = await CallService.getCallDetails(callId, userId);

      if (!call) {
        res.status(404).json({ error: 'Call not found or you do not have permission to access it.' });
        return;
      }

      // Check if recording URL exists
      if (!call.recording_url) {
        res.status(404).json({ 
          error: 'Recording not available', 
          message: 'No recording URL found for this call. Recording may still be processing or the call did not complete successfully.' 
        });
        return;
      }

      // Return the recording URL
      res.json({
        success: true,
        recording_url: call.recording_url,
        call_id: call.id,
        duration_seconds: call.duration_seconds
      });
      return;

    } catch (error) {
      logger.error('Error in getCallAudio controller:', error);
      res.status(500).json({
        error: 'Failed to fetch call audio',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Initiate a direct call to a contact
   * POST /api/calls/initiate
   */
  static async initiateCall(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { contactId, agentId, phoneNumber, callerPhoneNumberId } = req.body;

      // Validate required fields
      if (!agentId) {
        return res.status(400).json({ error: 'Agent ID is required' });
      }

      if (!phoneNumber && !contactId) {
        return res.status(400).json({ error: 'Either phone number or contact ID is required' });
      }

      // Get the actual phone number if contactId is provided
      let recipientPhone = phoneNumber;

      if (contactId) {
        const contact = await ContactService.getContact(userId, contactId);
        
        if (!contact) {
          return res.status(404).json({ error: 'Contact not found' });
        }

        recipientPhone = contact.phone_number;
      }

      // Check user credits - block if zero or negative
      const user = await userService.getUserProfile(userId);
      
      if (!user || user.credits <= 0) {
        logger.warn('[CallController] Call blocked due to insufficient credits', {
          userId,
          credits: user?.credits || 0,
          contactId,
          agentId
        });
        
        return res.status(402).json({ 
          error: 'Insufficient credits',
          message: user?.credits === 0 
            ? 'You have no credits remaining. Please purchase more credits to continue calling.'
            : 'Your credit balance is negative. Please purchase more credits to continue calling.',
          credits: user?.credits || 0
        });
      }

      // Generate call ID for atomic slot reservation
      const callId = randomUUID();

      // ATOMICALLY reserve concurrency slot BEFORE external API call
      // This prevents race conditions where multiple calls could exceed limits
      const slotReservation = await concurrencyManager.atomicReserveDirectCallSlot(userId, callId);
      
      // If shouldQueue is true, add to queue instead of rejecting
      if (slotReservation.shouldQueue) {
        logger.info('[CallController] Direct call queued due to concurrency limits', {
          userId,
          reason: slotReservation.reason,
          contactId,
          agentId,
          callId
        });

        // Import CallQueueModel at the top of the file if not already imported
        const CallQueueModel = (await import('../models/CallQueue')).default;
        
        // Add to queue with high priority
        const queueItem = await CallQueueModel.addDirectCallToQueue({
          user_id: userId,
          agent_id: agentId,
          contact_id: contactId || '',
          phone_number: recipientPhone,
          contact_name: req.body.contact_name,
          priority: 100 // Direct calls get highest priority
        });

        // Get queue position
        const position = await CallQueueModel.getQueuePosition(queueItem.id);
        const queuedCount = await CallQueueModel.countDirectCallsInQueue(userId);

        // Notify scheduler about direct call queued
        try {
          const { campaignScheduler } = await import('../services/InMemoryCampaignScheduler');
          await campaignScheduler.onDirectCallQueued(userId);
          logger.info('[CallController] Campaign scheduler notified of queued direct call');
        } catch (error) {
          logger.error('[CallController] Failed to notify campaign scheduler', { error });
          // Don't fail the request if scheduler notification fails
        }

        return res.status(202).json({
          message: 'Call queued successfully',
          reason: slotReservation.reason,
          queue: {
            id: queueItem.id,
            position: position,
            total_in_queue: queuedCount,
            estimated_wait: position ? Math.ceil(position * 2) : 0 // Rough estimate: 2 min per call
          }
        });
      }
      
      if (!slotReservation.success) {
        // This shouldn't happen if shouldQueue logic is correct, but keep as safety net
        logger.warn('[CallController] Direct call blocked due to concurrency limits', {
          userId,
          reason: slotReservation.reason,
          contactId,
          agentId,
          callId
        });
        
        return res.status(429).json({ 
          error: 'Concurrency limit reached',
          message: slotReservation.reason || 'Cannot make direct call due to concurrency limits'
        });
      }

      // Log successful slot reservation
      logger.info('[CallController] Direct call slot reserved successfully', {
        userId,
        agentId,
        contactId,
        phoneNumber: recipientPhone,
        userCredits: user.credits,
        callId
      });

      try {
        // Now make the external API call with pre-reserved slot
        const result = await CallService.initiateCall({
          userId,
          agentId,
          contactId: contactId || undefined,
          phoneNumber: recipientPhone,
          callerPhoneNumberId: callerPhoneNumberId || undefined,
          metadata: {
            preReservedCallId: callId // Pass the pre-reserved ID
          }
        });

        // Update the active_calls record with the execution ID
        await database.query(`
          UPDATE active_calls 
          SET bolna_execution_id = $1 
          WHERE id = $2
        `, [result.executionId, callId]);

        logger.info('[CallController] Direct call initiated successfully', {
          callId: result.callId,
          executionId: result.executionId,
          preReservedCallId: callId
        });

        return res.status(201).json({
          success: true,
          call: {
            id: result.callId,
            execution_id: result.executionId,
            status: result.status,
            recipient: recipientPhone
          }
        });

      } catch (error) {
        // If external API call fails, we need to release the reserved slot
        logger.error('[CallController] External API call failed, releasing reserved slot', {
          callId,
          userId,
          error: error instanceof Error ? error.message : String(error)
        });
        
        await concurrencyManager.releaseCallSlot(callId);
        
        // Re-throw the error for normal error handling
        throw error;
      }

    } catch (error) {
      logger.error('[CallController] Error initiating call:', error);
      return res.status(500).json({
        error: 'Failed to initiate call',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get queue status for user's direct calls
   */
  static async getQueueStatus(req: Request, res: Response) {
    try {
      const userId = (req.user as any)?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const CallQueueModel = (await import('../models/CallQueue')).default;
      
      // Get comprehensive queue status
      const queueStatus = await CallQueueModel.getQueueStatusByType(userId);
      
      // Get next queued direct call if any
      const nextDirectCall = await CallQueueModel.getNextDirectCall(userId);
      const nextPosition = nextDirectCall 
        ? await CallQueueModel.getQueuePosition(nextDirectCall.id)
        : null;

      return res.status(200).json({
        direct_calls: {
          queued: queueStatus.direct.queued,
          processing: queueStatus.direct.processing,
          total: queueStatus.direct.total,
          next_call: nextDirectCall ? {
            id: nextDirectCall.id,
            phone_number: nextDirectCall.phone_number,
            contact_name: nextDirectCall.contact_name,
            position: nextPosition,
            queued_at: nextDirectCall.created_at
          } : null
        },
        campaign_calls: {
          queued: queueStatus.campaign.queued,
          processing: queueStatus.campaign.processing,
          total: queueStatus.campaign.total
        }
      });

    } catch (error) {
      logger.error('[CallController] Error getting queue status:', error);
      return res.status(500).json({
        error: 'Failed to get queue status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

