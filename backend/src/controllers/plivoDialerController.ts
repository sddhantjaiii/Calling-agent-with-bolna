import { Request, Response } from 'express';
import { pool } from '../config/database';
import { AuthenticatedRequest } from '../types/auth';
import { PlivoDialerService } from '../services/plivoDialerService';
import { ContactService } from '../services/contactService';

function getActorContext(authReq: AuthenticatedRequest): {
  userId: string;
  teamMemberId: string | null;
} {
  const userId = authReq.user?.id;
  if (!userId) {
    throw new Error('User not authenticated');
  }

  const teamMemberId = authReq.user?.isTeamMember ? authReq.user?.teamMemberId || null : null;

  return { userId, teamMemberId };
}

export class PlivoDialerController {
  /**
   * GET /api/plivo-dialer/token
   * Mint a short-lived Plivo Browser SDK v2 token.
   */
  static async getToken(req: Request, res: Response): Promise<Response> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { userId } = getActorContext(authReq);

      const token = await PlivoDialerService.mintAccessToken(userId);

      return res.json({
        success: true,
        data: {
          token: token.token,
          plivoNumber: token.plivoNumber,
          exp: token.exp,
        },
      });
    } catch (error: any) {
      console.error('Error minting Plivo token:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to mint Plivo token',
      });
    }
  }

  /**
   * POST /api/plivo-dialer/calls
   * Create a new dialer call log row and return its id.
   */
  static async createCallLog(req: Request, res: Response): Promise<Response> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { userId, teamMemberId } = getActorContext(authReq);

      const { fromPhoneNumberId, toPhoneNumber } = req.body || {};

      if (!fromPhoneNumberId || typeof fromPhoneNumberId !== 'string') {
        return res.status(400).json({ success: false, error: 'fromPhoneNumberId is required' });
      }
      if (!toPhoneNumber || typeof toPhoneNumber !== 'string') {
        return res.status(400).json({ success: false, error: 'toPhoneNumber is required' });
      }

      let normalizedToPhone: string;
      try {
        normalizedToPhone = ContactService.normalizePhoneNumber(toPhoneNumber);
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid toPhoneNumber format' });
      }

      // Validate the selected phone number belongs to this tenant
      const pn = await pool.query(
        `SELECT id, phone_number
         FROM phone_numbers
         WHERE id = $1 AND user_id = $2 AND is_active = true`,
        [fromPhoneNumberId, userId]
      );

      if (pn.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'Invalid from phone number for this user',
        });
      }

      const fromPhoneNumber = pn.rows[0].phone_number as string;

      // Phase-2: auto-create contact by default (or fetch existing) for the destination number.
      // We keep it minimal: phone_number unique per user, name required.
      const contactUpsert = await pool.query(
        `INSERT INTO contacts (
            user_id,
            name,
            phone_number,
            is_auto_created,
            auto_creation_source
         ) VALUES ($1, $2, $3, true, 'manual')
         ON CONFLICT (user_id, phone_number)
         DO UPDATE SET updated_at = CURRENT_TIMESTAMP
         RETURNING id`,
        [userId, `Anonymous ${normalizedToPhone}`, normalizedToPhone]
      );

      const contactId = contactUpsert.rows[0]?.id as string | undefined;

      const insert = await pool.query(
        `INSERT INTO plivo_calls (
            user_id,
            team_member_id,
            from_phone_number_id,
            from_phone_number,
            to_phone_number,
            contact_id,
            status
         ) VALUES ($1, $2, $3, $4, $5, $6, 'initiated')
         RETURNING id, created_at`,
        [userId, teamMemberId, fromPhoneNumberId, fromPhoneNumber, normalizedToPhone, contactId || null]
      );

      return res.status(201).json({
        success: true,
        data: {
          id: insert.rows[0].id,
          createdAt: insert.rows[0].created_at,
        },
      });
    } catch (error: any) {
      console.error('Error creating Plivo call log:', error);
      return res.status(500).json({ success: false, error: 'Failed to create call log' });
    }
  }

  /**
   * POST /api/plivo-dialer/calls/:id/status
   * Update live status from the browser SDK and optionally bind Plivo CallUUID.
   */
  static async updateCallStatus(req: Request, res: Response): Promise<Response> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { userId } = getActorContext(authReq);

      const callLogId = req.params.id;
      const { status, plivoCallUuid, hangupBy, hangupReason } = req.body || {};

      if (!callLogId) {
        return res.status(400).json({ success: false, error: 'callLogId is required' });
      }

      if (!status || typeof status !== 'string') {
        return res.status(400).json({ success: false, error: 'status is required' });
      }

      const now = new Date();

      const setAnsweredAt = status === 'in-progress' || status === 'answered';
      const setEndedAt = status === 'completed' || status === 'call-disconnected' || status === 'hangup';
      const setStartedAt = status === 'calling' || status === 'ringing' || setAnsweredAt;

      const update = await pool.query(
        `UPDATE plivo_calls
         SET
           status = $1,
           status_updated_at = $2,
           plivo_call_uuid = COALESCE($3, plivo_call_uuid),
           started_at = CASE WHEN $4 THEN COALESCE(started_at, $2) ELSE started_at END,
           answered_at = CASE WHEN $5 THEN COALESCE(answered_at, $2) ELSE answered_at END,
           ended_at = CASE WHEN $6 THEN COALESCE(ended_at, $2) ELSE ended_at END,
           hangup_by = COALESCE($7, hangup_by),
           hangup_reason = COALESCE($8, hangup_reason)
         WHERE id = $9 AND user_id = $10
         RETURNING id, status, status_updated_at, plivo_call_uuid`,
        [status, now, plivoCallUuid || null, setStartedAt, setAnsweredAt, setEndedAt, hangupBy || null, hangupReason || null, callLogId, userId]
      );

      if (update.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Call log not found' });
      }

      return res.json({ success: true, data: update.rows[0] });
    } catch (error: any) {
      console.error('Error updating Plivo call status:', error);
      return res.status(500).json({ success: false, error: 'Failed to update call status' });
    }
  }

  /**
   * GET /api/plivo-dialer/calls
   * List recent plivo_calls for this tenant.
   */
  static async listCallLogs(req: Request, res: Response): Promise<Response> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { userId } = getActorContext(authReq);

      const limit = Math.min(parseInt((req.query.limit as string) || '50', 10) || 50, 200);
      const offset = Math.max(parseInt((req.query.offset as string) || '0', 10) || 0, 0);

      const result = await pool.query(
        `SELECT
           pc.id,
           pc.from_phone_number,
           pc.to_phone_number,
           pc.contact_id,
           pc.status,
           pc.status_updated_at,
           pc.initiated_at,
           pc.started_at,
           pc.answered_at,
           pc.ended_at,
           pc.duration_seconds,
           pc.hangup_by,
           pc.hangup_reason,
           pc.plivo_call_uuid,
           pc.recording_status,
           pc.recording_url,
           pc.recording_duration_seconds,
           pc.transcript_status,
           pc.transcript_updated_at,
           pc.lead_extraction_status,
           pc.lead_extraction_updated_at,
           pc.lead_individual_analysis,
           pc.lead_complete_analysis,
           pc.created_at,
           pc.updated_at,
           tm.name AS team_member_name,
           c.name AS contact_name
         FROM plivo_calls pc
         LEFT JOIN team_members tm ON pc.team_member_id = tm.id
         LEFT JOIN contacts c ON pc.contact_id = c.id
         WHERE pc.user_id = $1
         ORDER BY pc.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      return res.json({ success: true, data: result.rows });
    } catch (error: any) {
      console.error('Error listing Plivo call logs:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch call logs' });
    }
  }

  /**
   * GET /api/plivo-dialer/calls/:id/lead-intelligence
   * Return the dialer-specific lead intelligence JSON stored on plivo_calls.
   */
  static async getCallLeadIntelligence(req: Request, res: Response): Promise<Response> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { userId } = getActorContext(authReq);

      const callId = req.params.id;
      if (!callId) {
        return res.status(400).json({ success: false, error: 'callId is required' });
      }

      const result = await pool.query(
        `SELECT
           id,
           lead_extraction_status,
           lead_extraction_started_at,
           lead_extraction_completed_at,
           lead_extraction_updated_at,
           lead_extraction_error,
           lead_individual_analysis,
           lead_complete_analysis
         FROM plivo_calls
         WHERE id = $1 AND user_id = $2`,
        [callId, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Call not found' });
      }

      return res.json({ success: true, data: result.rows[0] });
    } catch (error: any) {
      console.error('Error fetching Plivo dialer lead intelligence:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch lead intelligence' });
    }
  }

  /**
   * GET /api/plivo-dialer/calls/:id/transcript
   * Serve dialer transcript stored on plivo_calls (Phase-2 Whisper pipeline).
   * Shape is compatible with the shared CallTranscriptViewer (speaker_segments + content).
   */
  static async getCallTranscript(req: Request, res: Response): Promise<Response> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { userId } = getActorContext(authReq);

      const callId = req.params.id;
      if (!callId) {
        return res.status(400).json({ success: false, error: 'callId is required' });
      }

      const result = await pool.query(
        `SELECT
           id,
           transcript_text,
           transcript_status,
           transcript_created_at,
           transcript_updated_at
         FROM plivo_calls
         WHERE id = $1 AND user_id = $2`,
        [callId, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Call not found' });
      }

      const row = result.rows[0] as {
        id: string;
        transcript_text: string | null;
        transcript_status: string;
        transcript_created_at: string | null;
        transcript_updated_at: string | null;
      };

      if (!row.transcript_text || row.transcript_status !== 'completed') {
        return res.status(404).json({
          success: false,
          error: 'Transcript not available yet',
          data: {
            transcriptStatus: row.transcript_status,
          },
        });
      }

      return res.json({
        success: true,
        data: {
          id: row.id,
          callId: row.id,
          content: row.transcript_text,
          speaker_segments: [
            {
              speaker: 'Transcript',
              text: row.transcript_text,
              timestamp: 0,
            },
          ],
          createdAt: row.transcript_created_at || row.transcript_updated_at || new Date().toISOString(),
          updatedAt: row.transcript_updated_at || row.transcript_created_at || new Date().toISOString(),
        },
      });
    } catch (error: any) {
      console.error('Error fetching Plivo dialer transcript:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch transcript' });
    }
  }

  /**
   * GET /api/plivo-dialer/analytics/summary
   * Compute basic KPIs from plivo_calls for the authenticated tenant.
   */
  static async getAnalyticsSummary(req: Request, res: Response): Promise<Response> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { userId } = getActorContext(authReq);

      const result = await pool.query(
        `SELECT
           COUNT(*)::int AS total_calls,
           COUNT(*) FILTER (WHERE answered_at IS NOT NULL)::int AS answered_calls,
           COUNT(*) FILTER (WHERE ended_at IS NOT NULL)::int AS completed_calls,
           COUNT(*) FILTER (WHERE status = 'failed' OR status ILIKE '%fail%' OR status ILIKE '%error%')::int AS failed_calls,
           COALESCE(SUM(COALESCE(duration_seconds, 0)), 0)::int AS total_duration_seconds,
           COALESCE(AVG(NULLIF(duration_seconds, 0)), 0)::float AS average_duration_seconds,
           COUNT(*) FILTER (WHERE recording_url IS NOT NULL OR recording_status = 'available')::int AS recordings_available,
           COUNT(*) FILTER (WHERE transcript_text IS NOT NULL OR transcript_status = 'completed')::int AS transcripts_completed
         FROM plivo_calls
         WHERE user_id = $1`,
        [userId]
      );

      const row = result.rows[0] || {};
      const avg = typeof row.average_duration_seconds === 'number'
        ? Math.round(row.average_duration_seconds)
        : Math.round(Number(row.average_duration_seconds || 0));

      return res.json({
        success: true,
        data: {
          totalCalls: row.total_calls || 0,
          answeredCalls: row.answered_calls || 0,
          completedCalls: row.completed_calls || 0,
          failedCalls: row.failed_calls || 0,
          totalDurationSeconds: row.total_duration_seconds || 0,
          averageDurationSeconds: avg,
          recordingsAvailable: row.recordings_available || 0,
          transcriptsCompleted: row.transcripts_completed || 0,
        },
      });
    } catch (error: any) {
      console.error('Error fetching Plivo dialer analytics summary:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch dialer analytics' });
    }
  }
}
