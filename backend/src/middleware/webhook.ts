import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Simple request logging middleware for webhooks
 * Logs incoming webhook requests for debugging and monitoring
 * 
 * Design: Minimal overhead for high-throughput webhook processing
 */
export function logWebhookRequest(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req as any).requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  (req as any).requestId = requestId;
  const startTime = Date.now();

  logger.info('📥 Incoming webhook request', {
    request_id: requestId,
    path: req.path,
    method: req.method,
    user_agent: req.headers['user-agent'],
    content_type: req.headers['content-type'],
    content_length: req.headers['content-length'],
    ip: req.ip
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('✅ Webhook request completed', {
      request_id: requestId,
      path: req.path,
      status_code: res.statusCode,
      duration_ms: duration
    });
  });

  next();
}
