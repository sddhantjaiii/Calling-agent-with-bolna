import { Router } from 'express';
import { AdminController } from '../controllers/adminController';
import { authenticateToken } from '../middleware/auth';
import { requireAdmin, requireSuperAdmin, logAdminAction } from '../middleware/adminAuth';
import phoneNumberRoutes from './phoneNumbers';
import failureLogsRoutes from './admin/failureLogsRoutes';
import manualTriggersRoutes from './admin/manualTriggersRoutes';

const router = Router();

// Apply authentication middleware to all admin routes
router.use(authenticateToken);

// User management routes (admin access required)
router.get(
  '/users',
  requireAdmin,
  logAdminAction('LIST_USERS', 'user'),
  AdminController.getUsers
);

router.get(
  '/users/:userId',
  requireAdmin,
  logAdminAction('VIEW_USER', 'user'),
  AdminController.getUser
);

router.put(
  '/users/:userId',
  requireAdmin,
  logAdminAction('UPDATE_USER', 'user'),
  AdminController.updateUser
);

router.patch(
  '/users/:userId/status',
  requireAdmin,
  logAdminAction('TOGGLE_USER_STATUS', 'user'),
  AdminController.toggleUserStatus
);

router.post(
  '/users/:userId/credits',
  requireAdmin,
  logAdminAction('ADJUST_CREDITS', 'user'),
  AdminController.adjustCredits
);

// User concurrency management
router.get(
  '/users/:userId/concurrency',
  requireAdmin,
  logAdminAction('VIEW_USER_CONCURRENCY', 'user'),
  AdminController.getUserConcurrency
);

router.put(
  '/users/:userId/concurrency',
  requireAdmin,
  logAdminAction('UPDATE_USER_CONCURRENCY', 'user'),
  AdminController.updateUserConcurrency
);

// System statistics (admin access required)
router.get(
  '/stats/system',
  requireAdmin,
  logAdminAction('VIEW_SYSTEM_STATS', 'system'),
  AdminController.getSystemStats
);

// Dashboard endpoint (alias for system stats)
router.get(
  '/dashboard',
  requireAdmin,
  logAdminAction('VIEW_ADMIN_DASHBOARD', 'system'),
  AdminController.getSystemStats
);

// Dashboard metrics endpoint (optimized for dashboard display)
router.get(
  '/dashboard/metrics',
  requireAdmin,
  logAdminAction('VIEW_DASHBOARD_METRICS', 'system'),
  AdminController.getDashboardMetrics
);

// Audit logs (admin access required)
router.get(
  '/audit',
  requireAdmin,
  logAdminAction('VIEW_AUDIT_LOGS', 'audit'),
  AdminController.getAuditLogs
);

router.get(
  '/audit/logs',
  requireAdmin,
  logAdminAction('VIEW_AUDIT_LOGS', 'audit'),
  AdminController.getAuditLogs
);

router.get(
  '/audit/stats',
  requireAdmin,
  logAdminAction('VIEW_AUDIT_STATS', 'audit'),
  AdminController.getAuditStats
);

// System configuration (super admin access required)
router.get(
  '/config',
  requireSuperAdmin,
  logAdminAction('VIEW_SYSTEM_CONFIG', 'config'),
  AdminController.getSystemConfig
);

router.put(
  '/config',
  requireSuperAdmin,
  logAdminAction('UPDATE_SYSTEM_CONFIG', 'config'),
  AdminController.updateSystemConfig
);

// System configuration endpoints (super admin access required)
router.get(
  '/config/system',
  requireSuperAdmin,
  logAdminAction('VIEW_SYSTEM_CONFIG', 'config'),
  AdminController.getSystemConfig
);

router.put(
  '/config/system',
  requireSuperAdmin,
  logAdminAction('UPDATE_SYSTEM_CONFIG', 'config'),
  AdminController.updateSystemConfig
);

// Get webhook URL configuration (admin access required)
router.get(
  '/config/webhook-url',
  requireAdmin,
  AdminController.getWebhookUrl
);

// Admin validation and profile routes
router.get(
  '/validate',
  requireAdmin,
  AdminController.validateAdminAccess
);

router.get(
  '/profile',
  requireAdmin,
  AdminController.getAdminProfile
);

// Agent management routes (admin access required)
router.get(
  '/agents',
  requireAdmin,
  logAdminAction('LIST_ALL_AGENTS', 'agent'),
  AdminController.getAllAgents
);

router.post(
  '/agents',
  requireAdmin,
  logAdminAction('CREATE_AGENT', 'agent'),
  AdminController.createAgent
);

// Fetch Bolna agent details by ID (for step 1 of registration)
router.get(
  '/agents/bolna/:bolnaAgentId',
  requireAdmin,
  logAdminAction('FETCH_BOLNA_AGENT', 'agent'),
  AdminController.fetchBolnaAgent
);

// Update agent (system prompt, dynamic info) - for Manage Agents
router.put(
  '/agents/:agentId',
  requireAdmin,
  logAdminAction('UPDATE_AGENT', 'agent'),
  AdminController.updateAgentDetails
);

// Delete agent - for Manage Agents
router.delete(
  '/agents/:agentId',
  requireAdmin,
  logAdminAction('DELETE_AGENT', 'agent'),
  AdminController.deleteAgent
);

router.post(
  '/agents/:agentId/assign',
  requireAdmin,
  logAdminAction('ASSIGN_AGENT', 'agent'),
  AdminController.assignAgent
);

router.get(
  '/agents/voices',
  requireAdmin,
  logAdminAction('LIST_VOICES', 'agent'),
  AdminController.getVoices
);

router.get(
  '/agents/stats',
  requireAdmin,
  logAdminAction('VIEW_AGENT_STATS', 'agent'),
  AdminController.getAgentStats
);

router.get(
  '/agents/monitor',
  requireAdmin,
  logAdminAction('MONITOR_AGENTS', 'agent'),
  AdminController.monitorAgents
);

router.get(
  '/agents/monitoring',
  requireAdmin,
  logAdminAction('MONITOR_AGENTS', 'agent'),
  AdminController.monitorAgents
);

router.get(
  '/users/:userId/agents/:agentId',
  requireAdmin,
  logAdminAction('VIEW_USER_AGENT', 'agent'),
  AdminController.getAnyUserAgent
);

router.put(
  '/users/:userId/agents/:agentId',
  requireAdmin,
  logAdminAction('UPDATE_USER_AGENT', 'agent'),
  AdminController.updateAnyUserAgent
);

router.delete(
  '/users/:userId/agents/:agentId',
  requireAdmin,
  logAdminAction('DELETE_USER_AGENT', 'agent'),
  AdminController.deleteAnyUserAgent
);

// Bulk agent operations (admin access required)
router.post(
  '/agents/bulk-status',
  requireAdmin,
  logAdminAction('BULK_UPDATE_AGENT_STATUS', 'agent'),
  AdminController.bulkUpdateAgentStatus
);

// Agent health check (admin access required)
router.get(
  '/agents/health',
  requireAdmin,
  logAdminAction('AGENT_HEALTH_CHECK', 'agent'),
  AdminController.getAgentHealthCheck
);

// Analytics endpoints (admin access required)
router.get(
  '/analytics/system',
  requireAdmin,
  logAdminAction('VIEW_SYSTEM_ANALYTICS', 'analytics'),
  AdminController.getSystemStats
);

router.get(
  '/analytics/realtime',
  requireAdmin,
  logAdminAction('VIEW_REALTIME_ANALYTICS', 'analytics'),
  AdminController.getRealtimeMetrics
);

router.get(
  '/analytics/usage',
  requireAdmin,
  logAdminAction('VIEW_USAGE_ANALYTICS', 'analytics'),
  AdminController.getSystemStats
);

// System health monitoring endpoint
router.get(
  '/health/system',
  requireAdmin,
  logAdminAction('VIEW_SYSTEM_HEALTH', 'system'),
  AdminController.getSystemHealth
);

// Phone number management routes (admin access required)
router.use('/phone-numbers', requireAdmin, phoneNumberRoutes);

// Client Panel Routes (admin access required)
router.get(
  '/client-panel/users',
  requireAdmin,
  logAdminAction('VIEW_CLIENT_PANEL_USERS', 'client_panel'),
  AdminController.getClientPanelUsers
);

router.get(
  '/client-panel/metrics',
  requireAdmin,
  logAdminAction('VIEW_CLIENT_PANEL_METRICS', 'client_panel'),
  AdminController.getClientPanelMetrics
);

router.get(
  '/client-panel/overview',
  requireAdmin,
  logAdminAction('VIEW_CLIENT_PANEL_OVERVIEW', 'client_panel'),
  AdminController.getClientPanelOverview
);

router.get(
  '/client-panel/agents',
  requireAdmin,
  logAdminAction('VIEW_CLIENT_PANEL_AGENTS', 'client_panel'),
  AdminController.getClientPanelAgents
);

router.get(
  '/client-panel/calls',
  requireAdmin,
  logAdminAction('VIEW_CLIENT_PANEL_CALLS', 'client_panel'),
  AdminController.getClientPanelCalls
);

router.get(
  '/client-panel/contacts',
  requireAdmin,
  logAdminAction('VIEW_CLIENT_PANEL_CONTACTS', 'client_panel'),
  AdminController.getClientPanelContacts
);

router.get(
  '/client-panel/campaigns',
  requireAdmin,
  logAdminAction('VIEW_CLIENT_PANEL_CAMPAIGNS', 'client_panel'),
  AdminController.getClientPanelCampaigns
);

router.get(
  '/client-panel/customers',
  requireAdmin,
  logAdminAction('VIEW_CLIENT_PANEL_CUSTOMERS', 'client_panel'),
  AdminController.getClientPanelCustomers
);

router.get(
  '/client-panel/lead-intelligence',
  requireAdmin,
  logAdminAction('VIEW_CLIENT_PANEL_LEAD_INTELLIGENCE', 'client_panel'),
  AdminController.getClientPanelLeadIntelligence
);

// User impersonation route
router.post(
  '/impersonate/:userId',
  requireAdmin,
  logAdminAction('IMPERSONATE_USER', 'user'),
  AdminController.impersonateUser
);

// User email settings management (admin access required)
router.get(
  '/users/:userId/email-settings',
  requireAdmin,
  logAdminAction('VIEW_USER_EMAIL_SETTINGS', 'email_settings'),
  AdminController.getUserEmailSettings
);

router.put(
  '/users/:userId/email-settings',
  requireAdmin,
  logAdminAction('UPDATE_USER_EMAIL_SETTINGS', 'email_settings'),
  AdminController.updateUserEmailSettings
);

router.put(
  '/users/:userId/followup-prompt',
  requireAdmin,
  logAdminAction('SET_USER_FOLLOWUP_PROMPT', 'email_settings'),
  AdminController.setUserFollowupPrompt
);

// Get all users email settings summary (admin access required)
router.get(
  '/email-settings',
  requireAdmin,
  logAdminAction('LIST_ALL_EMAIL_SETTINGS', 'email_settings'),
  AdminController.getAllUsersEmailSettings
);

// Security endpoints (admin access required)
router.get(
  '/security/csrf-token',
  requireAdmin,
  AdminController.getCSRFToken
);

// Failure logs routes
router.use('/failure-logs', failureLogsRoutes);

// Manual triggers routes (webhook simulation, analysis trigger)
router.use('/manual-triggers', manualTriggersRoutes);

export default router;