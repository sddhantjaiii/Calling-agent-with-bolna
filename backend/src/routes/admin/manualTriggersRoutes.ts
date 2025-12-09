import { Router, Request, Response } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requireAdmin, logAdminAction } from '../../middleware/adminAuth';
import { triggerAnalysisForCall, simulateBolnaWebhook } from '../../scripts/manualTriggers';
import { logger } from '../../utils/logger';

const router = Router();

/**
 * @route POST /api/admin/manual-triggers/analysis
 * @desc Manually trigger OpenAI analysis for an existing call
 * @access Admin only
 * @body { execution_id: string }
 */
router.post(
  '/analysis',
  authenticateToken,
  requireAdmin,
  logAdminAction('MANUAL_TRIGGER_ANALYSIS', 'system'),
  async (req: Request, res: Response) => {
    try {
      const { execution_id } = req.body;

      if (!execution_id) {
        return res.status(400).json({
          success: false,
          message: 'execution_id is required'
        });
      }

      logger.info('🔧 Admin manual trigger: Analysis', {
        admin_user_id: (req as any).userId,
        execution_id
      });

      const result = await triggerAnalysisForCall(execution_id);

      if (result.success) {
        return res.status(200).json(result);
      } else {
        return res.status(400).json(result);
      }

    } catch (error) {
      logger.error('❌ Admin manual trigger failed', {
        error: error instanceof Error ? error.message : String(error)
      });

      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * @route POST /api/admin/manual-triggers/webhook
 * @desc Simulate a Bolna webhook by processing a completed payload
 * @access Admin only
 * @body Bolna webhook payload (same format as received from Bolna)
 */
router.post(
  '/webhook',
  authenticateToken,
  requireAdmin,
  logAdminAction('MANUAL_TRIGGER_WEBHOOK', 'system'),
  async (req: Request, res: Response) => {
    try {
      const payload = req.body;

      if (!payload || Object.keys(payload).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Webhook payload is required'
        });
      }

      // Validate required fields
      if (!payload.id && !payload.execution_id) {
        return res.status(400).json({
          success: false,
          message: 'Payload must have id or execution_id field'
        });
      }

      if (!payload.agent_id) {
        return res.status(400).json({
          success: false,
          message: 'Payload must have agent_id field'
        });
      }

      logger.info('🔧 Admin manual trigger: Webhook simulation', {
        admin_user_id: (req as any).userId,
        execution_id: payload.id || payload.execution_id,
        has_transcript: !!payload.transcript,
        has_recording: !!payload.telephony_data?.recording_url
      });

      const result = await simulateBolnaWebhook(payload);

      if (result.success) {
        return res.status(200).json(result);
      } else {
        return res.status(400).json(result);
      }

    } catch (error) {
      logger.error('❌ Admin webhook simulation failed', {
        error: error instanceof Error ? error.message : String(error)
      });

      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * @route GET /api/admin/manual-triggers/call/:executionId
 * @desc Get call details by execution_id (for verification before triggering)
 * @access Admin only
 */
router.get(
  '/call/:executionId',
  authenticateToken,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { executionId } = req.params;

      // Import Call model
      const Call = (await import('../../models/Call')).default;
      const Transcript = (await import('../../models/Transcript')).default;

      const call = await Call.findByExecutionId(executionId);

      if (!call) {
        return res.status(404).json({
          success: false,
          message: 'Call not found',
          execution_id: executionId
        });
      }

      // Get transcript if exists
      let transcriptPreview = null;
      if (call.transcript_id) {
        const transcript = await Transcript.findById(call.transcript_id);
        if (transcript) {
          transcriptPreview = {
            id: transcript.id,
            content_length: transcript.content?.length || 0,
            preview: transcript.content?.substring(0, 500) + (transcript.content?.length > 500 ? '...' : '')
          };
        }
      }

      return res.status(200).json({
        success: true,
        data: {
          call_id: call.id,
          execution_id: call.bolna_execution_id,
          user_id: call.user_id,
          agent_id: call.agent_id,
          phone_number: call.phone_number,
          status: call.status,
          call_lifecycle_status: call.call_lifecycle_status,
          duration_seconds: call.duration_seconds,
          recording_url: call.recording_url,
          has_transcript: !!call.transcript_id,
          transcript: transcriptPreview,
          created_at: call.created_at,
          completed_at: call.completed_at
        }
      });

    } catch (error) {
      logger.error('❌ Failed to get call details', {
        error: error instanceof Error ? error.message : String(error)
      });

      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

export default router;
