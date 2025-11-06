import express from 'express';
import * as openaiPromptController from '../controllers/openaiPromptController';
import { authenticateToken } from '../middleware/auth';
import { requireAdmin } from '../middleware/adminAuth';

const router = express.Router();

// User routes (requires authentication)
router.get(
  '/my-prompts',
  authenticateToken,
  openaiPromptController.getUserPrompts
);

router.put(
  '/my-prompts',
  authenticateToken,
  openaiPromptController.updateUserPrompts
);

router.post(
  '/validate',
  authenticateToken,
  openaiPromptController.validatePromptId
);

// Admin routes (requires admin role)
router.get(
  '/admin/users/:userId/prompts',
  authenticateToken,
  requireAdmin,
  openaiPromptController.adminGetUserPrompts
);

router.put(
  '/admin/users/:userId/prompts',
  authenticateToken,
  requireAdmin,
  openaiPromptController.adminUpdateUserPrompts
);

export default router;
