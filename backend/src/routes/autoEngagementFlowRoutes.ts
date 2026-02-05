import { Router, Request, Response } from 'express';
import { autoEngagementFlowController } from '../controllers/autoEngagementFlowController';
import { authenticateToken, requireAuth, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Apply authentication to all auto engagement flow routes
router.use(authenticateToken, requireAuth);

/**
 * Flow Management Routes
 */

// Get all flows for user
router.get('/flows', (req: Request, res: Response) => 
  autoEngagementFlowController.getFlows(req as AuthenticatedRequest, res)
);

// Create a new flow
router.post('/flows', (req: Request, res: Response) => 
  autoEngagementFlowController.createFlow(req as AuthenticatedRequest, res)
);

// Bulk update priorities
router.post('/flows/priorities/bulk-update', (req: Request, res: Response) => 
  autoEngagementFlowController.bulkUpdatePriorities(req as AuthenticatedRequest, res)
);

// Get single flow by ID with details
router.get('/flows/:id', (req: Request, res: Response) => 
  autoEngagementFlowController.getFlowById(req as AuthenticatedRequest, res)
);

// Update a flow
router.patch('/flows/:id', (req: Request, res: Response) => 
  autoEngagementFlowController.updateFlow(req as AuthenticatedRequest, res)
);

// Delete a flow
router.delete('/flows/:id', (req: Request, res: Response) => 
  autoEngagementFlowController.deleteFlow(req as AuthenticatedRequest, res)
);

// Toggle flow enabled status
router.patch('/flows/:id/toggle', (req: Request, res: Response) => 
  autoEngagementFlowController.toggleFlow(req as AuthenticatedRequest, res)
);

// Update trigger conditions
router.put('/flows/:id/conditions', (req: Request, res: Response) => 
  autoEngagementFlowController.updateTriggerConditions(req as AuthenticatedRequest, res)
);

// Update actions
router.put('/flows/:id/actions', (req: Request, res: Response) => 
  autoEngagementFlowController.updateActions(req as AuthenticatedRequest, res)
);

// Get flow executions
router.get('/flows/:id/executions', (req: Request, res: Response) => 
  autoEngagementFlowController.getFlowExecutions(req as AuthenticatedRequest, res)
);

// Get flow statistics
router.get('/flows/:id/statistics', (req: Request, res: Response) => 
  autoEngagementFlowController.getFlowStatistics(req as AuthenticatedRequest, res)
);

// Test flow execution (simulation mode)
router.post('/flows/:id/test', (req: Request, res: Response) => 
  autoEngagementFlowController.testFlowExecution(req as AuthenticatedRequest, res)
);

/**
 * Execution Routes
 */

// Get all executions for user
router.get('/executions', (req: Request, res: Response) => 
  autoEngagementFlowController.getAllExecutions(req as AuthenticatedRequest, res)
);

// Get execution details with action logs
router.get('/executions/:id', (req: Request, res: Response) => 
  autoEngagementFlowController.getExecutionDetails(req as AuthenticatedRequest, res)
);

// Cancel a running execution
router.post('/executions/:id/cancel', (req: Request, res: Response) => 
  autoEngagementFlowController.cancelExecution(req as AuthenticatedRequest, res)
);

/**
 * Analytics Routes
 */

// Get analytics for all flows
router.get('/analytics', (req: Request, res: Response) => 
  autoEngagementFlowController.getAnalytics(req as AuthenticatedRequest, res)
);

export default router;
