import { Router } from 'express';
import teamMemberController from '../controllers/teamMemberController';
import { authenticateToken, requireOwner } from '../middleware/auth';

const router = Router();

// ============================================================================
// PUBLIC ENDPOINTS (no auth required)
// ============================================================================

// Set password using invite token
router.post('/set-password', teamMemberController.setPassword);

// Validate invite token
router.get('/validate-token/:token', teamMemberController.validateInviteToken);

// Get role descriptions (public for sign-up context)
router.get('/roles', teamMemberController.getRoleDescriptions);

// ============================================================================
// PROTECTED ENDPOINTS (owner only)
// ============================================================================

// Get all team members
router.get('/', authenticateToken, requireOwner, teamMemberController.getTeamMembers);

// Get team stats
router.get('/stats', authenticateToken, requireOwner, teamMemberController.getTeamStats);

// Invite a new team member
router.post('/invite', authenticateToken, requireOwner, teamMemberController.inviteTeamMember);

// Update a team member
router.patch('/:id', authenticateToken, requireOwner, teamMemberController.updateTeamMember);

// Deactivate a team member
router.delete('/:id', authenticateToken, requireOwner, teamMemberController.deactivateTeamMember);

// Resend invite email
router.post('/:id/resend-invite', authenticateToken, requireOwner, teamMemberController.resendInvite);

// ============================================================================
// ANALYTICS ENDPOINTS (authenticated users)
// ============================================================================

// Get analytics for all team members (salespersons)
router.get('/analytics', authenticateToken, teamMemberController.getTeamMemberAnalytics);

// Get analytics for a specific team member
router.get('/:id/analytics', authenticateToken, teamMemberController.getTeamMemberAnalyticsById);

// Get activity log for a specific team member
router.get('/:id/activity-log', authenticateToken, teamMemberController.getTeamMemberActivityLog);

// Get follow-ups for a specific team member
router.get('/:id/follow-ups', authenticateToken, teamMemberController.getTeamMemberFollowUps);

export default router;
