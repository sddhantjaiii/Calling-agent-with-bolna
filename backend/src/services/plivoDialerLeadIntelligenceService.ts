import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { openaiExtractionService, IndividualAnalysis, CompleteAnalysis } from './openaiExtractionService';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PlivoDialerLeadIntelligenceService {
  static async extractForCallLog(callLogId: string): Promise<void> {
    logger.info('[Plivo][LeadExtraction] Start', { callLogId });

    // Lock the row into processing state if eligible.
    const mark = await pool.query(
      `UPDATE plivo_calls
       SET lead_extraction_status = 'processing',
           lead_extraction_error = NULL,
           lead_extraction_updated_at = NOW(),
           lead_extraction_started_at = COALESCE(lead_extraction_started_at, NOW())
       WHERE id = $1
         AND transcript_status = 'completed'
         AND transcript_text IS NOT NULL
         AND (lead_extraction_status IS NULL OR lead_extraction_status IN ('none','failed'))
       RETURNING id`,
      [callLogId]
    );

    if (mark.rows.length === 0) {
      logger.info('[Plivo][LeadExtraction] Skip (not eligible)', { callLogId });
      return;
    }

    try {
      const rowRes = await pool.query(
        `SELECT user_id, to_phone_number, transcript_text
         FROM plivo_calls
         WHERE id = $1`,
        [callLogId]
      );

      const row = rowRes.rows[0] as
        | { user_id: string; to_phone_number: string; transcript_text: string }
        | undefined;

      if (!row?.transcript_text) {
        throw new Error('Missing transcript_text');
      }

      const userId = row.user_id;
      const phoneNumber = row.to_phone_number;
      const transcript = row.transcript_text;

      const userPromptRes = await pool.query(
        `SELECT openai_individual_prompt_id, openai_complete_prompt_id
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [userId]
      );
      const userPrompts = userPromptRes.rows[0] as
        | { openai_individual_prompt_id: string | null; openai_complete_prompt_id: string | null }
        | undefined;
      const individualPromptId = userPrompts?.openai_individual_prompt_id ?? null;
      const completePromptId = userPrompts?.openai_complete_prompt_id ?? null;

      // Give the system a tiny breather to avoid back-to-back OpenAI calls competing
      // with the Whisper upload/download.
      await sleep(250);

      const individual = await openaiExtractionService.extractIndividualCallData(
        transcript,
        callLogId,
        phoneNumber,
        individualPromptId
      );

      // Build complete analysis using previous dialer transcripts + stored individual analyses.
      const previousTranscriptsRes = await pool.query(
        `SELECT transcript_text
         FROM plivo_calls
         WHERE user_id = $1
           AND to_phone_number = $2
           AND id <> $3
           AND transcript_status = 'completed'
           AND transcript_text IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 5`,
        [userId, phoneNumber, callLogId]
      );

      const previousTranscripts = previousTranscriptsRes.rows
        .map((r: any) => r.transcript_text as string)
        .filter((t: string) => typeof t === 'string' && t.trim().length > 0);

      const previousAnalysesRes = await pool.query(
        `SELECT lead_individual_analysis
         FROM plivo_calls
         WHERE user_id = $1
           AND to_phone_number = $2
           AND id <> $3
           AND lead_extraction_status = 'completed'
           AND lead_individual_analysis IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 5`,
        [userId, phoneNumber, callLogId]
      );

      const previousAnalyses: IndividualAnalysis[] = previousAnalysesRes.rows
        .map((r: any) => r.lead_individual_analysis as IndividualAnalysis)
        .filter((a: IndividualAnalysis) => Boolean(a) && typeof a === 'object');

      let complete: CompleteAnalysis;
      const previousCallsCount = previousTranscripts.length;

      if (previousCallsCount === 0) {
        logger.info('[Plivo][LeadExtraction] No previous dialer calls; reusing individual as complete', {
          callLogId,
          userId,
          phoneNumber,
        });

        complete = {
          ...individual,
          extraction: {
            ...individual.extraction,
            smartnotification: null,
          },
        };
      } else {
        complete = await openaiExtractionService.extractCompleteAnalysis(
          transcript,
          previousTranscripts,
          previousAnalyses,
          userId,
          phoneNumber,
          completePromptId
        );

        if (complete.extraction) {
          complete.extraction.smartnotification = null;
        }
      }

      await pool.query(
        `UPDATE plivo_calls
         SET lead_extraction_status = 'completed',
             lead_extraction_error = NULL,
             lead_extraction_completed_at = NOW(),
             lead_extraction_updated_at = NOW(),
             lead_individual_analysis = $1,
             lead_complete_analysis = $2
         WHERE id = $3`,
        [individual, complete, callLogId]
      );

      logger.info('[Plivo][LeadExtraction] Completed', {
        callLogId,
        userId,
        phoneNumber,
        totalScore: individual.total_score,
        leadStatusTag: individual.lead_status_tag,
      });
    } catch (err: any) {
      logger.error('[Plivo][LeadExtraction] Failed', {
        callLogId,
        error: err?.message || String(err),
      });

      await pool.query(
        `UPDATE plivo_calls
         SET lead_extraction_status = 'failed',
             lead_extraction_error = $1,
             lead_extraction_updated_at = NOW()
         WHERE id = $2`,
        [err?.message || 'Lead extraction failed', callLogId]
      );
    }
  }
}
