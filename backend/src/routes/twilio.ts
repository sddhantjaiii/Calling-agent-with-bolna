import express from 'express';
import { requireAuth } from '../middleware/auth';

// Twilio missed-call endpoints have been removed per migration to Bolna/Serverless.
// This router remains to provide a clear 410 Gone response if any old clients call these URLs.
const router = express.Router();

router.all('*', requireAuth, (_req, res) => {
  res.status(410).json({
    success: false,
    message: 'Twilio missed-call endpoints have been removed.'
  });
});

export default router;