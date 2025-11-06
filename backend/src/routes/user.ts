import { Router } from 'express';
import UserController from '../controllers/userController';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { Response } from 'express';

const router = Router();

// User initialization (for first-time login)
router.post('/initialize', UserController.initializeUser);

// User profile management (requires authentication)
router.get('/profile', authenticateToken, (req, res) => UserController.getProfile(req as AuthenticatedRequest, res));
router.put('/profile', authenticateToken, (req, res) => UserController.updateProfile(req as AuthenticatedRequest, res));
router.patch('/profile/:field', authenticateToken, (req, res) => UserController.updateProfileField(req as AuthenticatedRequest, res));
router.get('/profile/completion', authenticateToken, (req, res) => UserController.getProfileCompletion(req as AuthenticatedRequest, res));

// User statistics
router.get('/stats', authenticateToken, (req, res) => UserController.getStats(req as AuthenticatedRequest, res));

// Credit management
router.get('/credits', authenticateToken, (req, res) => UserController.getCredits(req as AuthenticatedRequest, res));
router.post('/check-credits', authenticateToken, (req, res) => UserController.checkCredits(req as AuthenticatedRequest, res));
router.post('/estimate-credits', authenticateToken, (req, res) => UserController.estimateCredits(req as AuthenticatedRequest, res));
// router.get('/credit-notifications', authenticateToken, (req, res) => UserController.getCreditNotificationStatus(req as AuthenticatedRequest, res));

// Credit warning and status endpoints for frontend
router.get('/credit-status', authenticateToken, (req, res) => UserController.getCreditStatus(req as AuthenticatedRequest, res));
router.post('/campaign-credit-check', authenticateToken, (req, res) => UserController.campaignCreditCheck(req as AuthenticatedRequest, res));
router.get('/login-status', authenticateToken, (req, res) => UserController.getLoginStatus(req as AuthenticatedRequest, res));
router.get('/credit-alerts', authenticateToken, (req, res) => UserController.getCreditAlerts(req as AuthenticatedRequest, res));
router.post('/credit-event', authenticateToken, (req, res) => UserController.recordCreditEvent(req as AuthenticatedRequest, res));

// Password management
router.put('/password', authenticateToken, (req, res) => UserController.updatePassword(req as AuthenticatedRequest, res));

// Account management
router.delete('/account', authenticateToken, (req, res) => UserController.deleteAccount(req as AuthenticatedRequest, res));

export default router;