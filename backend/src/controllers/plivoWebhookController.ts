import { Request, Response } from 'express';
import { pool } from '../config/database';
import { PlivoDialerService } from '../services/plivoDialerService';
import { PlivoTranscriptionService } from '../services/plivoTranscriptionService';
import { PlivoDialerLeadIntelligenceService } from '../services/plivoDialerLeadIntelligenceService';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return null;
}

function safeDigits(value: string): string {
  return value.replace(/\s+/g, '');
}

function getPublicBaseUrl(req: Request): string {
  // Prefer explicit public base URL if configured (recommended for prod).
  const configured = process.env.PLIVO_WEBHOOK_BASE_URL;
  if (configured && configured.trim().length > 0) {
    return configured.trim().replace(/\/$/, '');
  }

  // Fallback to request-derived base URL (works in dev with ngrok if Plivo hits ngrok URL).
  const proto = req.protocol;
  const host = req.get('host');
  return `${proto}://${host}`;
}

function firstString(...values: Array<unknown>): string | null {
  for (const v of values) {
    const s = asString(v);
    if (s) return s;
  }
  return null;
}

/**
 * Maps Plivo's HangupCause to a human-readable call status.
 * Ref: https://www.plivo.com/docs/voice/concepts/call-states/#hangup-causes
 */
function mapHangupCauseToStatus(hangupCause: string | null, wasAnswered: boolean): string {
  if (!hangupCause) {
    return wasAnswered ? 'completed' : 'failed';
  }

  const cause = hangupCause.toUpperCase();

  // Call was successfully completed
  if (cause === 'NORMAL_CLEARING' || cause === 'NORMAL_CALL_CLEARING') {
    return wasAnswered ? 'completed' : 'not_answered';
  }

  // User busy statuses
  if (cause === 'USER_BUSY' || cause === 'BUSY') {
    return 'busy';
  }

  // No answer / timeout statuses
  if (cause === 'NO_ANSWER' || cause === 'NO_USER_RESPONSE' || 
      cause === 'RECOVERY_ON_TIMER_EXPIRE' || cause === 'ORIGINATOR_CANCEL') {
    return 'no_answer';
  }

  // Call rejected / declined
  if (cause === 'CALL_REJECTED' || cause === 'USER_DECLINE') {
    return 'rejected';
  }

  // Network / carrier issues
  if (cause === 'NETWORK_OUT_OF_ORDER' || cause === 'TEMPORARY_FAILURE' || 
      cause === 'SERVICE_UNAVAILABLE' || cause === 'BEARERCAPABILITY_NOTAVAIL') {
    return 'network_error';
  }

  // Invalid number / destination
  if (cause === 'INVALID_NUMBER_FORMAT' || cause === 'UNALLOCATED_NUMBER' || 
      cause === 'NO_ROUTE_DESTINATION' || cause === 'DESTINATION_OUT_OF_ORDER') {
    return 'invalid_number';
  }

  // Other failures
  return 'failed';
}

export class PlivoWebhookController {
  /**
   * Plivo XML Application Answer URL.
   * Reads destination from X-PH-CallLogId (preferred) or X-PH-Dest.
   */
  static async answer(req: Request, res: Response): Promise<void> {
    try {
      const cfg = PlivoDialerService.getConfig();

      const callUuid = asString((req.body as any)?.CallUUID) || asString((req.body as any)?.call_uuid);
      const callLogId = asString((req.body as any)?.['X-PH-CallLogId']) || asString((req.query as any)?.callLogId);
      const destFromHeader = asString((req.body as any)?.['X-PH-Dest']);

      let toPhoneNumber: string | null = destFromHeader;
      let callerId: string | null = asString((req.body as any)?.['X-PH-From']);

      if (callLogId) {
        const row = await pool.query(
          `SELECT id, to_phone_number, from_phone_number
           FROM plivo_calls
           WHERE id = $1`,
          [callLogId]
        );

        if (row.rows.length > 0) {
          toPhoneNumber = asString(row.rows[0].to_phone_number) || toPhoneNumber;
          callerId = asString(row.rows[0].from_phone_number) || callerId;

          if (callUuid) {
            // Best-effort: bind CallUUID to the call log for later hangup correlation
            await pool.query(
              `UPDATE plivo_calls
               SET plivo_call_uuid = COALESCE(plivo_call_uuid, $1)
               WHERE id = $2`,
              [callUuid, callLogId]
            );
          }
        }
      }

      // Fallback: Plivo sends the dialed Plivo number in To
      const fallbackTo = asString((req.body as any)?.To);
      if (!toPhoneNumber && fallbackTo) {
        toPhoneNumber = fallbackTo;
      }

      if (!callerId) {
        callerId = cfg.plivoNumber;
      }

      if (!toPhoneNumber) {
        res.status(200).type('text/xml').send(
          `<?xml version="1.0" encoding="UTF-8"?>\n<Response><Hangup reason="invalid"/></Response>`
        );
        return;
      }

      const normalizedCaller = safeDigits(callerId);
      const normalizedTo = safeDigits(toPhoneNumber);

      // Guard: avoid self-dial loops
      if (normalizedTo === safeDigits(cfg.plivoNumber)) {
        res.status(200).type('text/xml').send(
          `<?xml version="1.0" encoding="UTF-8"?>\n<Response><Hangup reason="self-dial"/></Response>`
        );
        return;
      }

      // Recording is ON by default in Phase-2. Plivo will POST recording details to this action URL.
      const baseUrl = getPublicBaseUrl(req);
      const recordActionUrl = callLogId
        ? `${baseUrl}/api/webhooks/plivo/recording?callLogId=${encodeURIComponent(callLogId)}`
        : `${baseUrl}/api/webhooks/plivo/recording`;

      const xml = PlivoDialerService.buildAnswerXml(normalizedTo, normalizedCaller, {
        recordActionUrl,
        recordFileFormat: 'mp3',
        maxLengthSeconds: 3600,
      });
      res.status(200).type('text/xml').send(xml);
    } catch (error) {
      console.error('Plivo answer webhook error:', error);
      res.status(200).type('text/xml').send(
        `<?xml version="1.0" encoding="UTF-8"?>\n<Response><Hangup reason="error"/></Response>`
      );
    }
  }

  /**
   * Plivo XML Application Hangup URL.
   * Best-effort persists final state and call UUID correlation.
   */
  static async hangup(req: Request, res: Response): Promise<void> {
    try {
      const callUuid = asString((req.body as any)?.CallUUID) || asString((req.body as any)?.call_uuid);
      const callLogId = asString((req.body as any)?.['X-PH-CallLogId']) || asString((req.query as any)?.callLogId);

      const hangupCause = asString((req.body as any)?.HangupCause) || asString((req.body as any)?.hangup_cause);
      const hangupBy = asString((req.body as any)?.HangupSource) || asString((req.body as any)?.hangup_by);
      
      // Check if call was answered - Plivo sends these fields
      const answerTime = asString((req.body as any)?.AnswerTime);
      // Use Duration (actual call time) instead of BillDuration (rounded for billing)
      const actualDuration = asString((req.body as any)?.Duration) || asString((req.body as any)?.BillDuration);
      const durationSeconds = actualDuration ? parseInt(actualDuration, 10) : 0;
      
      // Call was answered if: AnswerTime exists OR Duration > 0
      const wasAnswered = Boolean(answerTime) || durationSeconds > 0;
      
      // Map Plivo's HangupCause to a user-friendly status
      const callStatus = mapHangupCauseToStatus(hangupCause, wasAnswered);

      const now = new Date();

      let resolvedCallLogId: string | null = null;

      if (callLogId) {
        await pool.query(
          `UPDATE plivo_calls
           SET
             status = $1,
             status_updated_at = $2,
             ended_at = COALESCE(ended_at, $2),
             answered_at = CASE WHEN $3 THEN COALESCE(answered_at, $2) ELSE answered_at END,
             duration_seconds = COALESCE(duration_seconds, $4),
             hangup_by = COALESCE(hangup_by, $5),
             hangup_reason = COALESCE(hangup_reason, $6),
             raw_hangup_payload = $7,
             plivo_call_uuid = COALESCE(plivo_call_uuid, $8)
           WHERE id = $9`,
          [callStatus, now, wasAnswered, durationSeconds, hangupBy, hangupCause, req.body || null, callUuid, callLogId]
        );

        resolvedCallLogId = callLogId;
      } else if (callUuid) {
        await pool.query(
          `UPDATE plivo_calls
           SET
             status = $1,
             status_updated_at = $2,
             ended_at = COALESCE(ended_at, $2),
             answered_at = CASE WHEN $3 THEN COALESCE(answered_at, $2) ELSE answered_at END,
             duration_seconds = COALESCE(duration_seconds, $4),
             hangup_by = COALESCE(hangup_by, $5),
             hangup_reason = COALESCE(hangup_reason, $6),
             raw_hangup_payload = $7
           WHERE plivo_call_uuid = $8`,
          [callStatus, now, wasAnswered, durationSeconds, hangupBy, hangupCause, req.body || null, callUuid]
        );

        const idRes = await pool.query(
          `SELECT id FROM plivo_calls WHERE plivo_call_uuid = $1 LIMIT 1`,
          [callUuid]
        );
        resolvedCallLogId = (idRes.rows[0]?.id as string | undefined) || null;
      }

      // Post-call pipeline: ONLY run if call was answered (has recording + conversation)
      if (resolvedCallLogId && wasAnswered) {
        setImmediate(() => {
          (async () => {
            try {
              console.info('[Plivo][PostCall] Pipeline scheduled', {
                callLogId: resolvedCallLogId,
                callStatus,
                wasAnswered,
                durationSeconds,
                delayBeforeWhisperMs: 5000,
                delayBeforeLeadExtractionMs: 10000,
              });

              await sleep(5000);
              await PlivoTranscriptionService.transcribeCallLog(resolvedCallLogId);

              await sleep(10000);
              await PlivoDialerLeadIntelligenceService.extractForCallLog(resolvedCallLogId);
            } catch (err: any) {
              console.error('[Plivo][PostCall] Pipeline failed', {
                callLogId: resolvedCallLogId,
                error: err?.message || String(err),
              });
            }
          })();
        });
      } else if (resolvedCallLogId && !wasAnswered) {
        console.info('[Plivo][PostCall] Pipeline skip (call not answered)', {
          callLogId: resolvedCallLogId,
          callStatus,
          hangupCause,
          wasAnswered,
          durationSeconds,
        });
      } else {
        console.info('[Plivo][PostCall] Pipeline skip (no callLogId resolved)', {
          callUuid: callUuid || null,
        });
      }

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Plivo hangup webhook error:', error);
      res.status(200).json({ success: true });
    }
  }

  /**
   * Plivo Record XML action URL.
   * Persists recording metadata for later playback and transcription.
   */
  static async recording(req: Request, res: Response): Promise<void> {
    try {
      // Plivo usually sends these as form fields.
      const callUuid = firstString((req.body as any)?.CallUUID, (req.body as any)?.call_uuid);
      const callLogId = firstString((req.query as any)?.callLogId, (req.body as any)?.callLogId, (req.body as any)?.['X-PH-CallLogId']);

      const recordingUrl = firstString(
        (req.body as any)?.RecordingUrl,
        (req.body as any)?.recording_url,
        (req.body as any)?.RecordUrl,
        (req.body as any)?.record_url
      );

      const recordingId = firstString(
        (req.body as any)?.RecordingID,
        (req.body as any)?.recording_id,
        (req.body as any)?.RecordingId
      );

      const fileFormat = firstString((req.body as any)?.FileFormat, (req.body as any)?.file_format, (req.body as any)?.fileFormat);
      const durationRaw = firstString((req.body as any)?.RecordingDuration, (req.body as any)?.recording_duration);
      const durationSeconds = durationRaw && !Number.isNaN(Number(durationRaw)) ? Math.max(0, Math.floor(Number(durationRaw))) : null;

      const now = new Date();

      let updatedCallLogId: string | null = null;

      if (callLogId) {
        await pool.query(
          `UPDATE plivo_calls
           SET
             recording_id = COALESCE($1, recording_id),
             recording_url = COALESCE($2, recording_url),
             recording_format = COALESCE($3, recording_format),
             recording_duration_seconds = COALESCE($4, recording_duration_seconds),
             recording_status = CASE WHEN $2 IS NOT NULL THEN 'available' ELSE recording_status END,
             raw_recording_payload = $5,
             status_updated_at = COALESCE(status_updated_at, $6),
             plivo_call_uuid = COALESCE(plivo_call_uuid, $7)
           WHERE id = $8`,
          [recordingId, recordingUrl, fileFormat, durationSeconds, req.body || null, now, callUuid, callLogId]
        );

        updatedCallLogId = callLogId;
      } else if (callUuid) {
        await pool.query(
          `UPDATE plivo_calls
           SET
             recording_id = COALESCE($1, recording_id),
             recording_url = COALESCE($2, recording_url),
             recording_format = COALESCE($3, recording_format),
             recording_duration_seconds = COALESCE($4, recording_duration_seconds),
             recording_status = CASE WHEN $2 IS NOT NULL THEN 'available' ELSE recording_status END,
             raw_recording_payload = $5,
             status_updated_at = COALESCE(status_updated_at, $6)
           WHERE plivo_call_uuid = $7`,
          [recordingId, recordingUrl, fileFormat, durationSeconds, req.body || null, now, callUuid]
        );

        // Attempt to resolve callLogId for transcription.
        const idRes = await pool.query(
          `SELECT id FROM plivo_calls WHERE plivo_call_uuid = $1 LIMIT 1`,
          [callUuid]
        );
        updatedCallLogId = (idRes.rows[0]?.id as string | undefined) || null;
      }

      // Fire-and-forget transcription (do not block webhook response).
      // NOTE: Transcription/analysis runs after Hangup (post-call pipeline).
      // Recording webhook only persists recording metadata.
      console.info('[Plivo][Recording] Stored recording metadata', {
        callLogId: updatedCallLogId,
        hasRecordingUrl: Boolean(recordingUrl),
        callUuid: callUuid || null,
      });

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Plivo recording webhook error:', error);
      res.status(200).json({ success: true });
    }
  }
}
