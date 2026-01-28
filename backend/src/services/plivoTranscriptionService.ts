import { pool } from '../config/database';
import { OpenAIWhisperService } from './openaiWhisperService';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryRecordingDownload(err: any): boolean {
  const msg = (err?.message || '').toString();

  // Our OpenAIWhisperService wraps download failures as:
  // "Recording download failed (status 403)... Body=...Recording not found..."
  if (!msg.includes('Recording download failed')) return false;
  if (msg.includes('Recording not found')) return true;

  // Some Plivo regions can return 404/403 transiently.
  if (msg.includes('status 404') || msg.includes('status 403')) return true;
  return false;
}

export class PlivoTranscriptionService {
  static async transcribeCallLog(callLogId: string): Promise<void> {
    const apiKey = process.env.OPENAI_API_KEY || '';

    console.info('[Plivo][Transcription] Start', { callLogId });

    // Lock the row into processing state if it is eligible.
    const mark = await pool.query(
      `UPDATE plivo_calls
       SET transcript_status = 'processing',
           transcript_error = NULL,
           transcript_updated_at = NOW()
       WHERE id = $1
         AND (transcript_status IS NULL OR transcript_status IN ('none','failed'))
       RETURNING id`,
      [callLogId]
    );

    if (mark.rows.length === 0) {
      console.info('[Plivo][Transcription] Skip (not eligible)', { callLogId });
      return;
    }

    const row = await pool.query(
      `SELECT recording_url
       FROM plivo_calls
       WHERE id = $1`,
      [callLogId]
    );

    let recordingUrl = row.rows[0]?.recording_url as string | undefined;

    // When triggered from Hangup, the recording webhook can arrive slightly later.
    // Wait/poll briefly for recording_url before failing.
    if (!recordingUrl) {
      const maxWaitMs = 60_000;
      const pollIntervalMs = 2000;
      const startedAt = Date.now();

      console.info('[Plivo][Transcription] recording_url not set yet; waiting', {
        callLogId,
        maxWaitMs,
        pollIntervalMs,
      });

      while (!recordingUrl && Date.now() - startedAt < maxWaitMs) {
        await sleep(pollIntervalMs);
        const retryRow = await pool.query(
          `SELECT recording_url
           FROM plivo_calls
           WHERE id = $1`,
          [callLogId]
        );
        recordingUrl = retryRow.rows[0]?.recording_url as string | undefined;
      }
    }

    if (!recordingUrl) {
      console.warn('[Plivo][Transcription] Missing recording_url after wait', { callLogId });
      await pool.query(
        `UPDATE plivo_calls
         SET transcript_status = 'failed',
             transcript_error = 'Missing recording_url (recording webhook not received yet)',
             transcript_updated_at = NOW()
         WHERE id = $1`,
        [callLogId]
      );
      return;
    }

    try {
      console.info('[Plivo][Transcription] Calling Whisper', { callLogId });
      const maxAttempts = 6;
      let attempt = 0;
      let lastErr: any = null;
      let text: string | null = null;

      while (attempt < maxAttempts) {
        attempt += 1;
        try {
          if (attempt > 1) {
            console.info('[Plivo][Transcription] Retry attempt', { callLogId, attempt });
          }
          text = await OpenAIWhisperService.transcribeFromUrl({
            audioUrl: recordingUrl,
            apiKey,
          });
          break;
        } catch (err: any) {
          lastErr = err;
          if (!shouldRetryRecordingDownload(err) || attempt >= maxAttempts) {
            throw err;
          }

          const delayMs = Math.min(20_000, 2000 * Math.pow(2, attempt - 1));
          console.warn('[Plivo][Transcription] Recording not ready yet; backing off', {
            callLogId,
            attempt,
            delayMs,
            error: err?.message || String(err),
          });
          await sleep(delayMs);
        }
      }

      if (!text) {
        throw lastErr || new Error('Transcription failed');
      }

      console.info('[Plivo][Transcription] Whisper completed', {
        callLogId,
        transcriptChars: text.length,
      });

      await pool.query(
        `UPDATE plivo_calls
         SET transcript_text = $1,
             transcript_status = 'completed',
             transcript_error = NULL,
             transcript_created_at = COALESCE(transcript_created_at, NOW()),
             transcript_updated_at = NOW()
         WHERE id = $2`,
        [text, callLogId]
      );
    } catch (err: any) {
      console.error('[Plivo][Transcription] Whisper failed', {
        callLogId,
        error: err?.message || String(err),
      });
      await pool.query(
        `UPDATE plivo_calls
         SET transcript_status = 'failed',
             transcript_error = $1,
             transcript_updated_at = NOW()
         WHERE id = $2`,
        [err?.message || 'Transcription failed', callLogId]
      );
    }
  }
}
