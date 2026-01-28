import { Router } from 'express';
import { webhookController } from '../controllers/webhookController';
import { n8nWebhookController } from '../controllers/n8nWebhookController';
import { PlivoWebhookController } from '../controllers/plivoWebhookController';
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

/**
 * N8N LEAD CAPTURE & CALL WEBHOOK
 * 
 * External lead capture endpoint for n8n, Zapier, and other automation tools.
 * Creates/updates contact and initiates a call in one request.
 * 
 * Authentication: Uses agent_id existence in database (agent must be active)
 * 
 * Expected Payload:
 * {
 *   "agent_id": "uuid",                    // Required: Our agent ID
 *   "lead_name": "John Doe",               // Required: Lead's name
 *   "recipient_phone_number": "+919876543210", // Required: Phone with ISD
 *   "email": "john@example.com",           // Optional
 *   "Source": "TradeIndia",                // Optional: Lead source
 *   "Notes": "Interested in...",           // Optional
 *   "company": "ABC Corp",                 // Optional
 *   "city": "Mumbai",                      // Optional
 *   "country": "India"                     // Optional
 * }
 * 
 * Response (201):
 * {
 *   "success": true,
 *   "message": "Lead captured and call initiated",
 *   "data": {
 *     "contact_id": "uuid",
 *     "contact_created": true/false,
 *     "call_id": "uuid",
 *     "execution_id": "bolna-execution-id",
 *     "status": "initiated"
 *   }
 * }
 */
router.post('/n8n/lead-call',
  n8nWebhookController.handleLeadCaptureAndCall.bind(n8nWebhookController)
);

/**
 * PLIVO XML APPLICATION WEBHOOKS (Phase-1 Dialer)
 *
 * These endpoints must be publicly reachable and are called by Plivo's Voice XML application.
 */
router.all('/plivo/answer', PlivoWebhookController.answer);
router.all('/plivo/hangup', PlivoWebhookController.hangup);
router.all('/plivo/recording', PlivoWebhookController.recording);

// Health check endpoints
router.get('/health', webhookController.handleHealthCheck.bind(webhookController));
router.get('/n8n/health', n8nWebhookController.healthCheck.bind(n8nWebhookController));

export default router;
