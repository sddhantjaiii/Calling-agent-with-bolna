import { pool } from '../config/database';

export type DirectQueueStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface DirectCallQueueItem {
  id: string;
  user_id: string;
  agent_id: string;
  contact_id?: string | null;
  phone_number: string;
  status: DirectQueueStatus;
  priority: number;
  position: number;
  scheduled_for: string;
  started_at?: string | null;
  completed_at?: string | null;
  call_id?: string | null;
  failure_reason?: string | null;
  metadata: any;
  created_at: string;
  updated_at: string;
}

export class DirectCallQueueModel {
  static async enqueue(data: {
    user_id: string;
    agent_id: string;
    contact_id?: string;
    phone_number: string;
    priority?: number; // default 100
    scheduled_for?: Date;
    metadata?: any;
  }): Promise<DirectCallQueueItem> {
    const result = await pool.query(
      `INSERT INTO direct_call_queue (
        user_id, agent_id, contact_id, phone_number, priority, scheduled_for, metadata
      ) VALUES ($1, $2, $3, $4, COALESCE($5, 100), COALESCE($6, CURRENT_TIMESTAMP), COALESCE($7, '{}'::jsonb))
      RETURNING *`,
      [
        data.user_id,
        data.agent_id,
        data.contact_id || null,
        data.phone_number,
        data.priority ?? null,
        data.scheduled_for ?? null,
        data.metadata ? JSON.stringify(data.metadata) : null
      ]
    );
    return result.rows[0];
  }

  static async getNextQueued(userId: string): Promise<DirectCallQueueItem | null> {
    const result = await pool.query(
      `SELECT * FROM direct_call_queue
       WHERE user_id = $1 AND status = 'queued' AND scheduled_for <= NOW()
       ORDER BY priority DESC, position ASC, created_at ASC
       LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  static async markProcessing(id: string, userId: string, callId: string): Promise<DirectCallQueueItem | null> {
    const result = await pool.query(
      `UPDATE direct_call_queue
       SET status = 'processing', started_at = CURRENT_TIMESTAMP, call_id = $3
       WHERE id = $1 AND user_id = $2 AND status = 'queued'
       RETURNING *`,
      [id, userId, callId]
    );
    return result.rows[0] || null;
  }

  static async markCompleted(id: string, userId: string): Promise<DirectCallQueueItem | null> {
    const result = await pool.query(
      `UPDATE direct_call_queue
       SET status = 'completed', completed_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );
    return result.rows[0] || null;
  }

  static async markFailed(id: string, userId: string, reason: string): Promise<DirectCallQueueItem | null> {
    const result = await pool.query(
      `UPDATE direct_call_queue
       SET status = 'failed', completed_at = CURRENT_TIMESTAMP, failure_reason = $3
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId, reason]
    );
    return result.rows[0] || null;
  }
}

export default DirectCallQueueModel;
