import { Router } from 'express';
import { webhookController } from '../controllers/webhookController';
import { logWebhookRequest } from '../middleware/webhook';

const router = Router();

// Apply minimal logging middleware only (no rate limiting, no signature validation)
router.use(logWebhookRequest);

/**
 * SINGLE UNIFIED WEBHOOK ENDPOINT
 * 
 * Bolna.ai sends ALL webhook events to this single endpoint
 * Differentiated by "status" field in payload:
 * - "initiated" (Stage 1)
 * - "ringing" (Stage 2)
 * - "in-progress" (Stage 3)
 * - "call-disconnected" (Stage 4) - TRANSCRIPT AVAILABLE
 * - "completed" (Stage 5) - RECORDING URL AVAILABLE
 * - "busy" / "no-answer" - Failed call states
 * 
 * Design optimized for high throughput (many webhooks per second)
 * No signature validation required per user request
 */
router.post('/bolna', 
  webhookController.handleWebhook.bind(webhookController)
);

// Health check endpoint
router.get('/health', webhookController.handleHealthCheck.bind(webhookController));

export default router;
