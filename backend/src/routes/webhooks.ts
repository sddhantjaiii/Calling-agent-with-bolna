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
 * N8N LEAD CAPTURE WEBHOOK (Contact Creation Only)
 * 
 * External lead capture endpoint for n8n, Zapier, and other automation tools.
 * Creates/updates contact and lets Auto Engagement Flows handle calling.
 * 
 * Authentication: Uses agent_id existence in database (agent must be active)
 * 
 * Expected Payload:
 * {
 *   "agent_id": "uuid",                    // Required: Bolna Agent ID (NOT regular agent ID!)
 *   "lead_name": "John Doe",               // Required: Lead's name
 *   "recipient_phone_number": "+919876543210", // Required: Phone with ISD
 *   "email": "john@example.com",           // Optional
 *   "Source": "TradeIndia",                // Optional: Lead source (IMPORTANT - used by Auto Engagement Flow)
 *   "Notes": "Interested in...",           // Optional
 *   "company": "ABC Corp",                 // Optional
 *   "city": "Mumbai",                      // Optional
 *   "country": "India"                     // Optional
 * }
 * 
 * Response (201):
 * {
 *   "success": true,
 *   "message": "Lead captured successfully - Auto Engagement Flow will handle follow-up",
 *   "data": {
 *     "contact_id": "uuid",
 *     "contact_created": true/false,
 *     "source": "TradeIndia",
 *     "auto_engagement_enabled": true,
 *     "note": "Contact will be processed by Auto Engagement Flow based on configured rules"
 *   }
 * }
 * 
 * After contact creation, Auto Engagement Flow automatically:
 * 1. Matches flow by Source field (auto_creation_source)
 * 2. Checks priority (lower = higher priority)
 * 3. Executes flow actions (AI call, WhatsApp, Email, etc.)
 * 4. Applies conditional logic based on outcomes
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
