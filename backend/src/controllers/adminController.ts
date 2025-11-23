import { Request, Response } from 'express';
import { UserModel } from '../models/User';
import { CreditTransactionModel } from '../models/CreditTransaction';
import AdminAuditLogModel from '../models/AdminAuditLog';
import { adminService } from '../services/adminService';
import { logAdminActionManual } from '../middleware/adminAuth';
import { logger } from '../utils/logger';
import { AgentModel } from '../models/Agent';
import { systemMetricsService } from '../services/systemMetricsService';
import { databaseAnalyticsService } from '../services/databaseAnalyticsService';
import { monitoringService } from '../services/monitoringService';
import { configService } from '../services/configService';

// Admin controller - handles admin panel functionality
export class AdminController {
  /**
   * Get all users with pagination and filtering
   */
  static async getUsers(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 50,
        search,
        role,
        isActive,
        sortBy = 'created_at',
        sortOrder = 'DESC'
      } = req.query;

      // Map frontend column names to database column names
      const columnMapping: Record<string, string> = {
        'registrationDate': 'created_at',
        'lastLogin': 'last_login',
        'email': 'email',
        'name': 'name',
        'role': 'role',
        'isActive': 'is_active'
      };

      const mappedSortBy = columnMapping[sortBy as string] || 'created_at';

      const userModel = new UserModel();
      const result = await userModel.getAllUsersForAdmin({
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        search: search as string,
        role: role as string,
        isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
        sortBy: mappedSortBy,
        sortOrder: sortOrder as 'ASC' | 'DESC'
      });

      res.json({
        success: true,
        data: result,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Get users error:', error);
      res.status(500).json({
        error: {
          code: 'GET_USERS_ERROR',
          message: 'Failed to retrieve users',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get a specific user by ID
   */
  static async getUser(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const userModel = new UserModel();

      const user = await userModel.findById(userId);

      if (!user) {
        res.status(404).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Get user statistics
      const userStats = await userModel.getUserStats(userId);

      res.json({
        success: true,
        data: {
          user,
          stats: userStats
        },
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Get user error:', error);
      res.status(500).json({
        error: {
          code: 'GET_USER_ERROR',
          message: 'Failed to retrieve user',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Update user information
   */
  static async updateUser(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { name, email, role, is_active, isActive } = req.body;

      const userModel = new UserModel();
      const existingUser = await userModel.findById(userId);

      if (!existingUser) {
        res.status(404).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Prevent non-super-admins from modifying super admin accounts
      if (existingUser.role === 'super_admin' && !req.isSuperAdmin) {
        res.status(403).json({
          error: {
            code: 'INSUFFICIENT_PRIVILEGES',
            message: 'Super admin privileges required to modify super admin accounts',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Prevent non-super-admins from creating super admin accounts
      if (role === 'super_admin' && !req.isSuperAdmin) {
        res.status(403).json({
          error: {
            code: 'INSUFFICIENT_PRIVILEGES',
            message: 'Super admin privileges required to create super admin accounts',
            timestamp: new Date(),
          },
        });
        return;
      }

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (email !== undefined) updateData.email = email;
      if (role !== undefined) updateData.role = role;
      // Accept both is_active and isActive for backward compatibility
      if (is_active !== undefined) updateData.is_active = is_active;
      if (isActive !== undefined) updateData.is_active = isActive;

      const updatedUser = await userModel.update(userId, updateData);

      if (!updatedUser) {
        res.status(500).json({
          error: {
            code: 'UPDATE_FAILED',
            message: 'Failed to update user',
            timestamp: new Date(),
          },
        });
        return;
      }

      res.json({
        success: true,
        data: updatedUser,
        message: 'User updated successfully',
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Update user error:', error);
      res.status(500).json({
        error: {
          code: 'UPDATE_USER_ERROR',
          message: 'Failed to update user',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Suspend or activate user account
   */
  static async toggleUserStatus(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { is_active, isActive } = req.body;
      
      // Accept both formats for backward compatibility
      const activeStatus = is_active !== undefined ? is_active : isActive;

      const userModel = new UserModel();
      const existingUser = await userModel.findById(userId);

      if (!existingUser) {
        res.status(404).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Prevent non-super-admins from suspending admin accounts
      if (userModel.isAdmin(existingUser) && !req.isSuperAdmin) {
        res.status(403).json({
          error: {
            code: 'INSUFFICIENT_PRIVILEGES',
            message: 'Super admin privileges required to suspend admin accounts',
            timestamp: new Date(),
          },
        });
        return;
      }

      const updatedUser = await userModel.setUserStatus(userId, activeStatus);

      if (!updatedUser) {
        res.status(500).json({
          error: {
            code: 'STATUS_UPDATE_FAILED',
            message: 'Failed to update user status',
            timestamp: new Date(),
          },
        });
        return;
      }

      res.json({
        success: true,
        data: updatedUser,
        message: `User ${activeStatus ? 'activated' : 'suspended'} successfully`,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Toggle user status error:', error);
      res.status(500).json({
        error: {
          code: 'TOGGLE_STATUS_ERROR',
          message: 'Failed to toggle user status',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Adjust user credit balance
   */
  static async adjustCredits(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { amount, description, reason, type } = req.body;

      console.log('Credit adjustment request:', { userId, amount, description, reason, type });
      console.log('Admin user:', req.adminUser?.id);

      // Accept both 'description' and 'reason' for backward compatibility
      const adjustmentReason = description || reason;

      if (!amount || !adjustmentReason) {
        res.status(400).json({
          error: {
            code: 'MISSING_REQUIRED_FIELDS',
            message: 'Amount and description are required',
            timestamp: new Date(),
          },
        });
        return;
      }

      const userModel = new UserModel();
      const creditTransactionModel = new CreditTransactionModel();

      const user = await userModel.findById(userId);

      if (!user) {
        res.status(404).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Calculate new balance based on type
      let adjustmentAmount = parseFloat(amount);
      if (type === 'subtract') {
        adjustmentAmount = -adjustmentAmount;
      }
      
      const newBalance = user.credits + adjustmentAmount;

      if (newBalance < 0) {
        res.status(400).json({
          error: {
            code: 'INSUFFICIENT_CREDITS',
            message: 'Credit adjustment would result in negative balance',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Update user credits
      const updatedUser = await userModel.updateCredits(userId, newBalance);

      if (!updatedUser) {
        res.status(500).json({
          error: {
            code: 'CREDIT_UPDATE_FAILED',
            message: 'Failed to update user credits',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Create credit transaction record
      console.log('Creating credit transaction with adminUser:', req.adminUser?.id);
      await creditTransactionModel.create({
        user_id: userId,
        type: 'admin_adjustment',
        amount: adjustmentAmount,
        balance_after: newBalance,
        description: adjustmentReason,
        created_by: req.adminUser?.id || null
      });

      res.json({
        success: true,
        data: {
          newBalance: newBalance,
          user: updatedUser,
          adjustment: {
            amount: adjustmentAmount,
            description: adjustmentReason,
            previous_balance: user.credits,
            new_balance: newBalance
          }
        },
        message: 'Credits adjusted successfully',
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Adjust credits error:', error);
      res.status(500).json({
        error: {
          code: 'ADJUST_CREDITS_ERROR',
          message: 'Failed to adjust user credits',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get user concurrency settings
   */
  static async getUserConcurrency(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const userModel = new UserModel();

      const user = await userModel.findById(userId);

      if (!user) {
        res.status(404).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Get active calls count for this user
      const activeCallsQuery = `
        SELECT COUNT(*) as active_calls
        FROM calls
        WHERE user_id = $1 
        AND status IN ('active', 'ringing', 'in_progress')
      `;
      const activeCallsResult = await userModel.query(activeCallsQuery, [userId]);
      const activeCalls = parseInt(activeCallsResult.rows[0]?.active_calls || '0');

      // Get user's concurrent call limit (default to system max or 5)
      const userLimit = user.concurrent_calls_limit || configService.get('max_concurrent_calls') || 5;
      const availableSlots = Math.max(0, userLimit - activeCalls);

      res.json({
        success: true,
        settings: {
          user_concurrent_calls_limit: userLimit,
          user_active_calls: activeCalls,
          user_available_slots: availableSlots
        },
        timestamp: new Date()
      });
    } catch (error: any) {
      logger.error('Get user concurrency error:', error);
      res.status(500).json({
        error: {
          code: 'GET_USER_CONCURRENCY_ERROR',
          message: 'Failed to retrieve user concurrency settings',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Update user concurrency limit
   */
  static async updateUserConcurrency(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { user_limit } = req.body;

      if (!user_limit || user_limit < 1 || user_limit > 10) {
        res.status(400).json({
          error: {
            code: 'INVALID_LIMIT',
            message: 'Concurrency limit must be between 1 and 10',
            timestamp: new Date(),
          },
        });
        return;
      }

      const userModel = new UserModel();
      const user = await userModel.findById(userId);

      if (!user) {
        res.status(404).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Update user's concurrent calls limit
      const updateQuery = `
        UPDATE users 
        SET concurrent_calls_limit = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;
      const result = await userModel.query(updateQuery, [user_limit, userId]);
      const updatedUser = result.rows[0];

      res.json({
        success: true,
        data: {
          userId: updatedUser.id,
          concurrent_calls_limit: updatedUser.concurrent_calls_limit
        },
        message: 'User concurrency limit updated successfully',
        timestamp: new Date()
      });
    } catch (error: any) {
      logger.error('Update user concurrency error:', error);
      res.status(500).json({
        error: {
          code: 'UPDATE_USER_CONCURRENCY_ERROR',
          message: 'Failed to update user concurrency limit',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get dashboard metrics (optimized for admin dashboard display)
   */
  static async getDashboardMetrics(req: Request, res: Response): Promise<void> {
    try {
      const userModel = new UserModel();

      // Get essential metrics from database and system
      const [userStats, agentStats, analyticsData, systemHealth] = await Promise.all([
        userModel.getSystemStats(),
        adminService.getAgentStats(),
        databaseAnalyticsService.getAnalyticsSummary(7), // Last 7 days for dashboard
        systemMetricsService.getSystemHealthScore()
      ]);

      // Calculate key performance indicators
      const totalRevenue = Math.round(userStats.totalCreditsUsed * 0.01); // $0.01 per credit
      const userGrowthRate = userStats.totalUsers > 0 ?
        Math.round(((userStats.newUsersThisWeek / Math.max(userStats.totalUsers - userStats.newUsersThisWeek, 1)) * 100)) : 0;
      const agentHealthPercentage = agentStats.totalAgents > 0 ?
        Math.round((agentStats.activeAgents / agentStats.totalAgents) * 100) : 100;

      const dashboardMetrics = {
        // Key Performance Indicators
        kpis: {
          totalRevenue: {
            value: totalRevenue,
            change: userGrowthRate, // Use user growth as proxy for revenue growth
            trend: userGrowthRate > 0 ? 'up' : 'down'
          },
          totalUsers: {
            value: userStats.totalUsers,
            change: userGrowthRate,
            trend: userGrowthRate > 0 ? 'up' : 'down'
          },
          activeAgents: {
            value: agentStats.activeAgents,
            change: agentHealthPercentage - 95, // Compare to 95% target
            trend: agentHealthPercentage >= 95 ? 'up' : 'down'
          },
          systemHealth: {
            value: systemHealth,
            change: systemHealth - 95, // Compare to 95% target
            trend: systemHealth >= 95 ? 'up' : 'down'
          }
        },

        // Quick Stats for Cards
        quickStats: {
          newUsersToday: userStats.newUsersToday,
          newUsersThisWeek: userStats.newUsersThisWeek,
          totalCreditsUsed: userStats.totalCreditsUsed,
          totalCreditsRemaining: userStats.totalCreditsInSystem - userStats.totalCreditsUsed,
          agentUtilization: agentHealthPercentage,
          recentAgents: agentStats.recentlyCreated,
          activeUsers: analyticsData.activeUsers
        },

        // Chart Data (REAL data from database)
        charts: {
          userGrowth: analyticsData.userGrowth.slice(-7), // Last 7 days
          agentActivity: analyticsData.hourlyUsage,
          creditUsage: analyticsData.creditTrends.slice(-7) // Last 7 days
        }
      };

      res.json({
        success: true,
        data: dashboardMetrics,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Get dashboard metrics error:', error);
      res.status(500).json({
        error: {
          code: 'DASHBOARD_METRICS_ERROR',
          message: 'Failed to retrieve dashboard metrics',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get comprehensive system-wide statistics
   */
  static async getSystemStats(req: Request, res: Response): Promise<void> {
    try {
      const userModel = new UserModel();

      // Get comprehensive statistics from all services (REAL DATA)
      const [userStats, agentStats, callMonitoring, analyticsData, systemMetrics] = await Promise.all([
        userModel.getSystemStats(),
        adminService.getAgentStats(),
        adminService.monitorAgents('30d'), // Get 30-day call statistics
        databaseAnalyticsService.getAnalyticsSummary(30), // Last 30 days
        systemMetricsService.getSystemMetrics() // Real Railway server metrics
      ]);

      // Get real system uptime from Railway server
      const uptimePercentage = systemMetricsService.getUptimePercentage();

      // Calculate financial metrics
      const totalCreditsInSystem = userStats.totalCreditsInSystem;
      const totalCreditsUsed = userStats.totalCreditsUsed;
      const creditUtilizationRate = totalCreditsInSystem > 0 ?
        Math.round((totalCreditsUsed / totalCreditsInSystem) * 100) : 0;

      // Calculate agent health percentage
      const agentHealthPercentage = agentStats.totalAgents > 0 ?
        Math.round((agentStats.activeAgents / agentStats.totalAgents) * 100) : 100;

      // Calculate call success rate
      const callSuccessRate = callMonitoring.totalCalls > 0 ?
        Math.round((callMonitoring.successfulCalls / callMonitoring.totalCalls) * 100) : 0;

      // Estimate monthly costs (simplified calculation)
      const estimatedMonthlyCost = Math.round(totalCreditsUsed * 0.01); // $0.01 per credit used

      // Comprehensive system statistics
      const stats = {
        // User Statistics
        users: {
          total: userStats.totalUsers,
          active: userStats.activeUsers,
          newToday: userStats.newUsersToday,
          newThisWeek: userStats.newUsersThisWeek,
          newThisMonth: userStats.newUsersThisWeek * 4, // Approximation
          byRole: userStats.usersByRole,
          byProvider: userStats.usersByProvider,
          growthRate: userStats.newUsersThisWeek > 0 ?
            Math.round(((userStats.newUsersThisWeek / Math.max(userStats.totalUsers - userStats.newUsersThisWeek, 1)) * 100)) : 0
        },

        // Agent Statistics
        agents: {
          total: agentStats.totalAgents,
          active: agentStats.activeAgents,
          inactive: agentStats.inactiveAgents,
          byType: agentStats.agentsByType,
          healthyPercentage: agentHealthPercentage,
          recentlyCreated: agentStats.recentlyCreated,
          averagePerUser: agentStats.averageAgentsPerUser,
          topUsers: agentStats.agentsByUser.slice(0, 5) // Top 5 users by agent count
        },

        // Call Statistics
        calls: {
          totalThisMonth: callMonitoring.totalCalls,
          successfulCalls: callMonitoring.successfulCalls,
          failedCalls: callMonitoring.failedCalls,
          successRate: callSuccessRate,
          averageDuration: Math.round(callMonitoring.averageCallDuration || 0),
          totalDuration: Math.round((callMonitoring.totalCalls * callMonitoring.averageCallDuration) / 60), // in minutes
          costThisMonth: estimatedMonthlyCost,
          topPerformingAgents: callMonitoring.topPerformingAgents?.slice(0, 5) || []
        },

        // Financial Statistics
        credits: {
          totalInSystem: totalCreditsInSystem,
          totalUsed: totalCreditsUsed,
          totalRemaining: totalCreditsInSystem - totalCreditsUsed,
          utilizationRate: creditUtilizationRate,
          averagePerUser: userStats.totalUsers > 0 ?
            Math.round(totalCreditsInSystem / userStats.totalUsers) : 0,
          estimatedMonthlyRevenue: estimatedMonthlyCost
        },

        // System Health Metrics (REAL from Railway server)
        system: {
          uptime: uptimePercentage,
          uptimeHours: systemMetrics.uptime.processUptimeHours,
          responseTime: 0, // Could be tracked with middleware in future
          errorRate: 0, // Could be tracked with error middleware
          activeConnections: 0, // Could be tracked with connection counter
          memoryUsage: {
            used: systemMetrics.performance.memory.processHeapUsed,
            total: systemMetrics.performance.memory.processHeapTotal,
            percentage: systemMetrics.performance.memory.processHeapPercentage
          },
          cpuUsage: systemMetrics.performance.cpu.usage,
          diskUsage: systemMetrics.performance.disk.percentage,
          databaseConnections: 0, // Could track from pool stats
          cacheHitRate: 0, // Not implemented yet
          loadAverage: systemMetrics.performance.cpu.loadAverage,
          platform: systemMetrics.system.platform,
          hostname: systemMetrics.system.hostname
        },

        // Performance Metrics (placeholder - could add middleware tracking)
        performance: {
          requestsPerMinute: 0, // Add request counter middleware
          averageResponseTime: 0, // Add timing middleware
          p95ResponseTime: 0, // Add timing middleware
          throughput: 0, // Calculated from request counter
          errorCount: 0, // Track from error handler
          warningCount: 0 // Track from logger
        },

        // Summary Metrics for Dashboard Cards
        summary: {
          totalRevenue: estimatedMonthlyCost,
          totalUsers: userStats.totalUsers,
          totalAgents: agentStats.totalAgents,
          totalCalls: callMonitoring.totalCalls,
          systemHealth: Math.round((uptimePercentage + agentHealthPercentage + callSuccessRate) / 3),
          growthRate: userStats.newUsersThisWeek > 0 ?
            Math.round(((userStats.newUsersThisWeek / Math.max(userStats.totalUsers - userStats.newUsersThisWeek, 1)) * 100)) : 0
        },

        // Usage Patterns (REAL data from database)
        usage: analyticsData.userGrowth.map(ug => ({
          date: ug.date,
          users: ug.newUsers,
          calls: analyticsData.callVolume.find(cv => cv.date === ug.date)?.totalCalls || 0,
          agents: agentStats.totalAgents, // Static for now, could track daily creation
          revenue: Math.round((analyticsData.callVolume.find(cv => cv.date === ug.date)?.totalCalls || 0) * 0.1) // Estimate
        })),

        // User Tiers Distribution (REAL from database)
        userTiers: analyticsData.userTiers,

        // Agent Types Distribution (REAL from database)
        agentTypes: analyticsData.agentTypes,

        // Hourly Usage Patterns (REAL from database - last 24 hours)
        hourlyUsage: analyticsData.hourlyUsage,

        // System Alerts (if any)
        alerts: []
      };

      res.json({
        success: true,
        data: stats,
        timestamp: new Date(),
        generatedAt: new Date().toISOString(),
        dataFreshness: {
          users: 'real-time from database',
          agents: 'real-time from database',
          calls: '30-day period from database',
          system: 'real-time from Railway server',
          analytics: 'real-time from database queries'
        }
      });
    } catch (error: any) {
      console.error('Get system stats error:', error);
      res.status(500).json({
        error: {
          code: 'SYSTEM_STATS_ERROR',
          message: 'Failed to retrieve system statistics',
          timestamp: new Date(),
          details: error instanceof Error ? error.message : 'Unknown error'
        },
      });
    }
  }

  /**
   * Validate admin session for security monitoring
   */
  static async validateAdminSession(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      
      if (!user) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'No valid session found',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Get session information
      const sessionInfo = {
        sessionId: user.sessionId || 'unknown',
        userId: user.id,
        role: user.role,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
        isValid: true
      };

      res.json({
        success: true,
        data: sessionInfo,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Session validation error:', error);
      res.status(500).json({
        error: {
          code: 'SESSION_VALIDATION_ERROR',
          message: 'Failed to validate session',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Secure admin logout
   */
  static async secureLogout(req: Request, res: Response): Promise<void> {
    try {
      // Log the logout action
      const adminUserId = (req as any).adminUser?.id || (req as any).user?.id;
      if (adminUserId) {
        await logAdminActionManual(adminUserId, 'SECURE_LOGOUT', 'session', {
          ip_address: req.ip,
          user_agent: req.get('User-Agent')
        });
      }

      res.json({
        success: true,
        message: 'Logged out successfully',
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Secure logout error:', error);
      res.status(500).json({
        error: {
          code: 'LOGOUT_ERROR',
          message: 'Failed to logout securely',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get CSRF token for admin operations
   */
  static async getCSRFToken(req: Request, res: Response): Promise<void> {
    try {
      // Generate a simple CSRF token
      const token = require('crypto').randomBytes(32).toString('hex');
      const expiresIn = 60 * 60; // 1 hour

      res.json({
        success: true,
        data: {
          token,
          expiresIn
        },
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('CSRF token generation error:', error);
      res.status(500).json({
        error: {
          code: 'CSRF_TOKEN_ERROR',
          message: 'Failed to generate CSRF token',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Validate admin access
   */
  static async validateAdminAccess(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      
      if (!user) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'No valid session found',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Check if user has admin role
      const isAdmin = user.role === 'admin' || user.role === 'super_admin';
      
      res.json({
        success: true,
        data: {
          hasAccess: isAdmin,  // Frontend expects this property
          isAdmin,
          role: user.role,
          userId: user.id,
          email: user.email
        },
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Admin validation error:', error);
      res.status(500).json({
        error: {
          code: 'ADMIN_VALIDATION_ERROR',
          message: 'Failed to validate admin access',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get webhook URL configuration from environment
   */
  static async getWebhookUrl(req: Request, res: Response): Promise<void> {
    try {
      const webhookUrl = process.env.BOLNA_WEBHOOK_URL || '';
      
      res.json({
        success: true,
        webhookUrl,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Get webhook URL error:', error);
      res.status(500).json({
        error: {
          code: 'GET_WEBHOOK_URL_ERROR',
          message: 'Failed to retrieve webhook URL',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get admin profile information
   */
  static async getAdminProfile(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      
      if (!user) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'No valid session found',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Return admin profile data
      res.json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          createdAt: user.created_at,
          lastLogin: user.last_login,
          isActive: user.is_active
        },
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Get admin profile error:', error);
      res.status(500).json({
        error: {
          code: 'GET_ADMIN_PROFILE_ERROR',
          message: 'Failed to retrieve admin profile',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get audit logs
   */
  static async getAuditLogs(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 50,
        adminUserId,
        targetUserId,
        action,
        resourceType
      } = req.query;

      let logs;

      if (adminUserId) {
        logs = await AdminAuditLogModel.getLogsByAdmin(
          adminUserId as string,
          parseInt(limit as string)
        );
      } else if (targetUserId) {
        logs = await AdminAuditLogModel.getLogsByTargetUser(
          targetUserId as string,
          parseInt(limit as string)
        );
      } else if (action) {
        logs = await AdminAuditLogModel.getLogsByAction(
          action as string,
          parseInt(limit as string)
        );
      } else if (resourceType) {
        logs = await AdminAuditLogModel.getLogsByResourceType(
          resourceType as string,
          parseInt(limit as string)
        );
      } else {
        logs = await AdminAuditLogModel.getRecentActions(
          parseInt(limit as string)
        );
      }

      res.json({
        success: true,
        data: {
          logs,
          page: parseInt(page as string),
          limit: parseInt(limit as string)
        },
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Get audit logs error:', error);
      res.status(500).json({
        error: {
          code: 'AUDIT_LOGS_ERROR',
          message: 'Failed to retrieve audit logs',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get audit statistics
   */
  static async getAuditStats(req: Request, res: Response): Promise<void> {
    try {
      const { days = 30 } = req.query;

      const stats = await AdminAuditLogModel.getAuditStats(parseInt(days as string));

      res.json({
        success: true,
        data: stats,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Get audit stats error:', error);
      res.status(500).json({
        error: {
          code: 'AUDIT_STATS_ERROR',
          message: 'Failed to retrieve audit statistics',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get system configuration
   */
  static async getSystemConfig(req: Request, res: Response): Promise<void> {
    try {
      // Return all configuration values from database
      const config = {
        // Legacy Billing Configuration
        credits_per_minute: configService.get('credits_per_minute'),
        max_contacts_per_upload: configService.get('max_contacts_per_upload'),
        new_user_bonus_credits: configService.get('new_user_bonus_credits'),
        minimum_credit_purchase: configService.get('minimum_credit_purchase'),
        
        // Legacy Authentication & Security
        session_duration_hours: configService.get('session_duration_hours'),
        max_login_attempts: configService.get('max_login_attempts'),
        lockout_duration_minutes: configService.get('lockout_duration_minutes'),
        password_min_length: configService.get('password_min_length'),
        require_email_verification: configService.get('require_email_verification'),
        password_reset_token_expiry_hours: configService.get('password_reset_token_expiry_hours'),
        
        // Legacy System Operations
        kpi_refresh_interval_minutes: configService.get('kpi_refresh_interval_minutes'),
        
        // New Billing Configuration
        stripe_webhook_secret: configService.get('stripe_webhook_secret'),
        stripe_secret_key: configService.get('stripe_secret_key'),
        stripe_public_key: configService.get('stripe_public_key'),
        monthly_call_limit: configService.get('monthly_call_limit'),
        
        // New Authentication Settings
        jwt_secret: configService.get('jwt_secret'),
        jwt_expiration: configService.get('jwt_expiration'),
        session_timeout: configService.get('session_timeout'),
        
        // New System Operations
        max_concurrent_calls: configService.get('max_concurrent_calls'),
        default_voice_settings: configService.get('default_voice_settings'),
        call_recording_enabled: configService.get('call_recording_enabled'),
        system_timezone: configService.get('system_timezone')
      };

      res.json({
        success: true,
        data: config,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Get system config error:', error);
      res.status(500).json({
        error: {
          code: 'SYSTEM_CONFIG_ERROR',
          message: 'Failed to retrieve system configuration',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Update system configuration
   */
  static async updateSystemConfig(req: Request, res: Response): Promise<void> {
    try {
      const config = req.body;

      if (!config || Object.keys(config).length === 0) {
        res.status(400).json({
          error: {
            code: 'MISSING_CONFIG',
            message: 'Configuration data is required',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Update system configuration in database and refresh cache
      await configService.updateConfig(config);

      // Return updated configuration
      const updatedConfig = {
        // Billing Configuration
        stripe_webhook_secret: configService.get('stripe_webhook_secret'),
        stripe_secret_key: configService.get('stripe_secret_key'),
        stripe_public_key: configService.get('stripe_public_key'),
        monthly_call_limit: configService.get('monthly_call_limit'),
        
        // Authentication Settings
        jwt_secret: configService.get('jwt_secret'),
        jwt_expiration: configService.get('jwt_expiration'),
        session_timeout: configService.get('session_timeout'),
        
        // System Operations
        max_concurrent_calls: configService.get('max_concurrent_calls'),
        default_voice_settings: configService.get('default_voice_settings'),
        call_recording_enabled: configService.get('call_recording_enabled'),
        system_timezone: configService.get('system_timezone')
      };

      res.json({
        success: true,
        data: updatedConfig,
        message: 'System configuration updated successfully',
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Update system config error:', error);
      res.status(500).json({
        error: {
          code: 'UPDATE_CONFIG_ERROR',
          message: 'Failed to update system configuration',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get all agents across all users (admin only)
   */
  static async getAllAgents(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 50,
        search,
        userId,
        isActive,
        agentType,
        sortBy = 'created_at',
        sortOrder = 'DESC'
      } = req.query;

      const result = await adminService.getAllAgents({
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        search: search as string,
        userId: userId as string,
        isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
        agentType: agentType as string,
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'ASC' | 'DESC'
      });

      res.json({
        success: true,
        data: result,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Get all agents error:', error);
      res.status(500).json({
        error: {
          code: 'GET_ALL_AGENTS_ERROR',
          message: 'Failed to retrieve all agents',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get agent details for any user (admin only)
   */
  static async getAnyUserAgent(req: Request, res: Response): Promise<void> {
    try {
      const { userId, agentId } = req.params;

      const agent = await adminService.getAgentWithStatus(userId, agentId);

      if (!agent) {
        res.status(404).json({
          error: {
            code: 'AGENT_NOT_FOUND',
            message: 'Agent not found',
            timestamp: new Date(),
          },
        });
        return;
      }

      res.json({
        success: true,
        data: agent,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Get any user agent error:', error);
      res.status(500).json({
        error: {
          code: 'GET_AGENT_ERROR',
          message: 'Failed to retrieve agent',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Update agent configuration for any user (admin only)
   */
  static async updateAnyUserAgent(req: Request, res: Response): Promise<void> {
    try {
      const { userId, agentId } = req.params;
      const updateData = req.body;

      // Import agentService here to avoid circular dependencies
      const { agentService } = await import('../services/agentService');

      const updatedAgent = await agentService.updateAgent(userId, agentId, updateData);

      res.json({
        success: true,
        data: updatedAgent,
        message: 'Agent updated successfully',
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Update any user agent error:', error);

      if (error instanceof Error && error.message === 'Agent not found') {
        res.status(404).json({
          error: {
            code: 'AGENT_NOT_FOUND',
            message: 'Agent not found',
            timestamp: new Date(),
          },
        });
        return;
      }

      res.status(500).json({
        error: {
          code: 'UPDATE_AGENT_ERROR',
          message: 'Failed to update agent',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Delete agent for any user (admin only)
   */
  static async deleteAnyUserAgent(req: Request, res: Response): Promise<void> {
    try {
      const { userId, agentId } = req.params;

      // Import agentService here to avoid circular dependencies
      const { agentService } = await import('../services/agentService');

      await agentService.deleteAgent(userId, agentId);

      res.json({
        success: true,
        message: 'Agent deleted successfully',
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Delete any user agent error:', error);

      if (error instanceof Error && error.message === 'Agent not found') {
        res.status(404).json({
          error: {
            code: 'AGENT_NOT_FOUND',
            message: 'Agent not found',
            timestamp: new Date(),
          },
        });
        return;
      }

      res.status(500).json({
        error: {
          code: 'DELETE_AGENT_ERROR',
          message: 'Failed to delete agent',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get system-wide agent statistics (admin only)
   */
  static async getAgentStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await adminService.getAgentStats();

      res.json({
        success: true,
        data: stats,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Get agent stats error:', error);
      res.status(500).json({
        error: {
          code: 'AGENT_STATS_ERROR',
          message: 'Failed to retrieve agent statistics',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Monitor agent performance across all users (admin only)
   */
  static async monitorAgents(req: Request, res: Response): Promise<void> {
    try {
      const { timeframe = '24h' } = req.query;

      const monitoring = await adminService.monitorAgents(timeframe as string);

      res.json({
        success: true,
        data: monitoring,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Monitor agents error:', error);
      res.status(500).json({
        error: {
          code: 'MONITOR_AGENTS_ERROR',
          message: 'Failed to retrieve agent monitoring data',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Bulk update agent status (admin only)
   */
  static async bulkUpdateAgentStatus(req: Request, res: Response): Promise<void> {
    try {
      const { agentIds, isActive } = req.body;

      if (!Array.isArray(agentIds) || agentIds.length === 0) {
        res.status(400).json({
          error: {
            code: 'INVALID_AGENT_IDS',
            message: 'Agent IDs must be a non-empty array',
            timestamp: new Date(),
          },
        });
        return;
      }

      if (typeof isActive !== 'boolean') {
        res.status(400).json({
          error: {
            code: 'INVALID_STATUS',
            message: 'isActive must be a boolean value',
            timestamp: new Date(),
          },
        });
        return;
      }

      const result = await adminService.bulkUpdateAgentStatus(
        agentIds,
        isActive,
        req.adminUser.id
      );

      res.json({
        success: true,
        data: result,
        message: `Bulk update completed: ${result.updated} agents updated, ${result.failed.length} failed`,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Bulk update agent status error:', error);
      res.status(500).json({
        error: {
          code: 'BULK_UPDATE_ERROR',
          message: 'Failed to bulk update agent status',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get agent health check (admin only)
   */
  static async getAgentHealthCheck(req: Request, res: Response): Promise<void> {
    try {
      const healthCheck = await adminService.getAgentHealthCheck();

      res.json({
        success: true,
        data: healthCheck,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Get agent health check error:', error);
      res.status(500).json({
        error: {
          code: 'HEALTH_CHECK_ERROR',
          message: 'Failed to perform agent health check',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Create an agent (admin only)
   */
  static async createAgent(req: Request, res: Response): Promise<void> {
    try {
      const { assignToUserId, ...agentData } = req.body;
      const adminUserId = (req as any).adminUser?.id || req.userId;

      // Debug logging to check what admin controller receives
      if (agentData.data_collection?.default?.description) {
        const adminReceivedLength = agentData.data_collection.default.description.length;
        logger.info(`[AdminController] Received data_collection description with ${adminReceivedLength} characters from admin frontend`);
        logger.info(`[AdminController] First 200 chars: ${agentData.data_collection.default.description.substring(0, 200)}...`);
        logger.info(`[AdminController] Last 200 chars: ...${agentData.data_collection.default.description.substring(Math.max(0, adminReceivedLength - 200))}`);
      }

      const agent = await adminService.createAgent(agentData, assignToUserId, adminUserId);

      res.status(201).json({
        success: true,
        data: agent,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Admin create agent error:', error);
      res.status(500).json({
        error: {
          code: 'CREATE_AGENT_ERROR',
          message: error.message || 'Failed to create agent',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Fetch Bolna agent details by ID (Step 1 of registration)
   */
  static async fetchBolnaAgent(req: Request, res: Response): Promise<void> {
    try {
      const { bolnaAgentId } = req.params;

      logger.info(`Fetching Bolna agent details for ID: ${bolnaAgentId}`);

      const { bolnaService } = await import('../services/bolnaService');
      const bolnaAgent = await bolnaService.getAgent(bolnaAgentId);

      if (!bolnaAgent) {
        res.status(404).json({
          error: {
            code: 'AGENT_NOT_FOUND',
            message: 'Agent not found in Bolna',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Extract relevant details
      const agentDetails = {
        bolna_agent_id: bolnaAgent.agent_id,
        name: bolnaAgent.agent_config?.agent_name || '',
        system_prompt: bolnaAgent.agent_prompts?.task_1?.system_prompt || '',
        status: bolnaAgent.status,
      };

      res.json({
        success: true,
        data: agentDetails,
        timestamp: new Date()
      });
    } catch (error: any) {
      logger.error('Fetch Bolna agent error:', error);
      res.status(500).json({
        error: {
          code: 'FETCH_BOLNA_AGENT_ERROR',
          message: error.message || 'Failed to fetch Bolna agent',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Update agent details (system prompt, dynamic info) - for Manage Agents
   */
  static async updateAgentDetails(req: Request, res: Response): Promise<void> {
    try {
      const { agentId } = req.params;
      const { name, description, system_prompt, dynamic_information, user_id } = req.body;

      logger.info(`Updating agent ${agentId}`, { hasSystemPrompt: !!system_prompt, hasDynamicInfo: !!dynamic_information });

      const agentModel = new AgentModel();
      const agent = await agentModel.findById(agentId);
      if (!agent) {
        res.status(404).json({
          error: {
            code: 'AGENT_NOT_FOUND',
            message: 'Agent not found',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Update database
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (system_prompt !== undefined) updateData.system_prompt = system_prompt;
      if (dynamic_information !== undefined) updateData.dynamic_information = dynamic_information;
      if (user_id !== undefined) updateData.user_id = user_id;

      await agentModel.update(agentId, updateData);

      // If agent has Bolna ID, update Bolna as well
      if (agent.bolna_agent_id) {
        const { bolnaService } = await import('../services/bolnaService');
        
        // Combine system_prompt with dynamic_information for Bolna
        const finalSystemPrompt = dynamic_information
          ? `${system_prompt || agent.system_prompt}\n\n${dynamic_information}`
          : (system_prompt || agent.system_prompt);

        if (finalSystemPrompt) {
          await bolnaService.patchAgentSystemPrompt(agent.bolna_agent_id, finalSystemPrompt);
          logger.info(`Updated Bolna agent ${agent.bolna_agent_id} system prompt`);
        }
      }

      res.json({
        success: true,
        message: 'Agent updated successfully',
        timestamp: new Date()
      });
    } catch (error: any) {
      logger.error('Update agent details error:', error);
      res.status(500).json({
        error: {
          code: 'UPDATE_AGENT_ERROR',
          message: error.message || 'Failed to update agent',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Delete agent - removes from database only, not from Bolna
   * DELETE /api/admin/agents/:agentId
   */
  static async deleteAgent(req: Request, res: Response): Promise<void> {
    try {
      const { agentId } = req.params;

      if (!agentId) {
        res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Agent ID is required',
            timestamp: new Date(),
          },
        });
        return;
      }

      const agentModel = new AgentModel();
      const agent = await agentModel.findById(agentId);

      if (!agent) {
        res.status(404).json({
          error: {
            code: 'AGENT_NOT_FOUND',
            message: 'Agent not found',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Delete from database
      await agentModel.deleteAgent(agentId);

      logger.info(`Agent ${agentId} (${agent.name}) deleted from database. Bolna agent ${agent.bolna_agent_id} remains in Bolna.`);

      res.json({
        success: true,
        message: 'Agent deleted successfully',
        timestamp: new Date()
      });
    } catch (error: any) {
      logger.error('Delete agent error:', error);
      res.status(500).json({
        error: {
          code: 'DELETE_AGENT_ERROR',
          message: error.message || 'Failed to delete agent',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Assign an agent to a user (admin only)
   */
  static async assignAgent(req: Request, res: Response): Promise<void> {
    try {
      const { agentId } = req.params;
      const { userId } = req.body;

      if (!userId) {
        res.status(400).json({
          error: {
            code: 'MISSING_USER_ID',
            message: 'User ID is required',
            timestamp: new Date(),
          },
        });
        return;
      }

      const success = await adminService.assignAgent(agentId, userId);

      res.json({
        success: true,
        data: { assigned: success },
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Admin assign agent error:', error);
      res.status(500).json({
        error: {
          code: 'ASSIGN_AGENT_ERROR',
          message: error.message || 'Failed to assign agent',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get available voices from Bolna.ai (admin only)
   */
  static async getVoices(req: Request, res: Response): Promise<void> {
    try {
      const voices = await adminService.getVoices();

      res.json({
        success: true,
        data: voices,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Admin get voices error:', error);
      res.status(500).json({
        error: {
          code: 'GET_VOICES_ERROR',
          message: error.message || 'Failed to get voices',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get all users for agent assignment (admin only)
   */
  static async getAllUsers(req: Request, res: Response): Promise<void> {
    try {
      const users = await adminService.getAllUsers();

      res.json({
        success: true,
        data: users,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Admin get all users error:', error);
      res.status(500).json({
        error: {
          code: 'GET_ALL_USERS_ERROR',
          message: error.message || 'Failed to get users',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get real-time system health metrics
   * Tracks API response time, error rate, uptime, and active connections
   */
  static async getSystemHealth(req: Request, res: Response): Promise<void> {
    try {
      // Get real-time monitoring metrics
      const healthStatus = monitoringService.getHealthStatus();
      
      res.json({
        success: true,
        data: healthStatus,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Get system health error:', error);
      res.status(500).json({
        error: {
          code: 'SYSTEM_HEALTH_ERROR',
          message: 'Failed to retrieve system health metrics',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get detailed real-time metrics
   */
  static async getRealtimeMetrics(req: Request, res: Response): Promise<void> {
    try {
      const metrics = monitoringService.getRealTimeMetrics();
      
      res.json({
        success: true,
        data: metrics,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('Get realtime metrics error:', error);
      res.status(500).json({
        error: {
          code: 'REALTIME_METRICS_ERROR',
          message: 'Failed to retrieve realtime metrics',
          timestamp: new Date(),
        },
      });
    }
  }

  // ============================================
  // CLIENT PANEL ENDPOINTS
  // ============================================

  /**
   * Get list of users for client panel dropdown
   */
  static async getClientPanelUsers(req: Request, res: Response): Promise<void> {
    try {
      const userModel = new UserModel();
      const { search } = req.query;

      const query = `
        SELECT 
          id, 
          name, 
          email, 
          company,
          role,
          is_active,
          created_at
        FROM users
        ${search ? 'WHERE name ILIKE $1 OR email ILIKE $1 OR company ILIKE $1' : ''}
        ORDER BY name ASC
      `;

      const params = search ? [`%${search}%`] : [];
      const result = await userModel.query(query, params);

      res.json({
        success: true,
        data: result.rows,
        timestamp: new Date()
      });
    } catch (error: any) {
      logger.error('Get client panel users error:', error);
      res.status(500).json({
        error: {
          code: 'CLIENT_PANEL_USERS_ERROR',
          message: 'Failed to retrieve users',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get aggregate metrics for client panel (all users or specific user)
   */
  static async getClientPanelMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.query;
      const userModel = new UserModel();

      // Optimized parallel queries instead of expensive JOINs
      const userFilter = userId ? 'WHERE user_id = $1' : '';
      const params = userId ? [userId] : [];

      const [
        userCount,
        agentCount,
        callStats,
        contactStats,
        campaignCount
      ] = await Promise.all([
        // User count
        userModel.query(
          userId 
            ? `SELECT 1 as total_users WHERE EXISTS (SELECT 1 FROM users WHERE id = $1)`
            : `SELECT COUNT(*) as total_users FROM users`,
          params
        ),
        // Agent count
        userModel.query(
          `SELECT COUNT(*) as total_agents FROM agents ${userFilter}`,
          params
        ),
        // Call statistics (combined to reduce queries)
        userModel.query(
          `SELECT 
            COUNT(*) as total_calls,
            COALESCE(SUM(duration_minutes), 0) as total_call_minutes,
            COALESCE(SUM(credits_used), 0) as total_credits_used,
            COUNT(*) FILTER (WHERE status = 'completed') as completed_calls,
            COUNT(*) FILTER (WHERE status = 'failed') as failed_calls
          FROM calls ${userFilter}`,
          params
        ),
        // Contact statistics
        userModel.query(
          `SELECT 
            COUNT(*) as total_contacts,
            COUNT(*) FILTER (WHERE is_customer = true) as total_customers
          FROM contacts ${userFilter}`,
          params
        ),
        // Campaign count
        userModel.query(
          `SELECT COUNT(*) as total_campaigns FROM call_campaigns ${userFilter}`,
          params
        )
      ]);

      const calls = callStats.rows[0];
      const contacts = contactStats.rows[0];
      const metrics = {
        total_users: userId ? (userCount.rows[0]?.total_users || 0) : parseInt(userCount.rows[0]?.total_users || '0'),
        total_agents: parseInt(agentCount.rows[0]?.total_agents || '0'),
        total_calls: parseInt(calls?.total_calls || '0'),
        total_contacts: parseInt(contacts?.total_contacts || '0'),
        total_campaigns: parseInt(campaignCount.rows[0]?.total_campaigns || '0'),
        total_customers: parseInt(contacts?.total_customers || '0'),
        total_call_minutes: parseFloat(calls?.total_call_minutes || '0'),
        total_credits_used: parseFloat(calls?.total_credits_used || '0'),
        completed_calls: parseInt(calls?.completed_calls || '0'),
        failed_calls: parseInt(calls?.failed_calls || '0')
      };

      res.json({
        success: true,
        data: {
          totalUsers: metrics.total_users || 0,
          totalAgents: metrics.total_agents || 0,
          totalCalls: metrics.total_calls || 0,
          totalContacts: metrics.total_contacts || 0,
          totalCampaigns: metrics.total_campaigns || 0,
          totalCustomers: metrics.total_customers || 0,
          totalCallMinutes: metrics.total_call_minutes || 0,
          totalCreditsUsed: metrics.total_credits_used || 0,
          completedCalls: metrics.completed_calls || 0,
          failedCalls: metrics.failed_calls || 0,
          successRate: metrics.total_calls > 0 
            ? Math.round((metrics.completed_calls / metrics.total_calls) * 100) 
            : 0
        },
        timestamp: new Date()
      });
    } catch (error: any) {
      logger.error('Get client panel metrics error:', error);
      res.status(500).json({
        error: {
          code: 'CLIENT_PANEL_METRICS_ERROR',
          message: 'Failed to retrieve metrics',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get overview data for client panel
   */
  static async getClientPanelOverview(req: Request, res: Response): Promise<void> {
    try {
      const { userId, startDate, endDate } = req.query;
      const userModel = new UserModel();

      // Build date filter
      let dateFilter = '';
      const params: any[] = [];
      let paramIndex = 1;

      if (userId) {
        params.push(userId);
        dateFilter += ` AND users.id = $${paramIndex}`;
        paramIndex++;
      }

      if (startDate) {
        params.push(startDate);
        dateFilter += ` AND calls.created_at >= $${paramIndex}`;
        paramIndex++;
      }

      if (endDate) {
        params.push(endDate);
        dateFilter += ` AND calls.created_at <= $${paramIndex}`;
        paramIndex++;
      }

      // Get call statistics with trends
      const callStatsQuery = `
        SELECT 
          DATE(calls.created_at) as date,
          COUNT(calls.id) as total_calls,
          COUNT(CASE WHEN calls.status = 'completed' THEN 1 END) as completed_calls,
          COUNT(CASE WHEN calls.status = 'failed' THEN 1 END) as failed_calls,
          SUM(calls.duration_minutes) as total_duration,
          SUM(calls.credits_used) as credits_used
        FROM calls
        JOIN users ON users.id = calls.user_id
        WHERE 1=1 ${dateFilter}
        GROUP BY DATE(calls.created_at)
        ORDER BY date DESC
        LIMIT 30
      `;

      const callStats = await userModel.query(callStatsQuery, params);

      res.json({
        success: true,
        data: {
          callTrends: callStats.rows,
        },
        timestamp: new Date()
      });
    } catch (error: any) {
      logger.error('Get client panel overview error:', error);
      res.status(500).json({
        error: {
          code: 'CLIENT_PANEL_OVERVIEW_ERROR',
          message: 'Failed to retrieve overview data',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get agents data for client panel
   */
  static async getClientPanelAgents(req: Request, res: Response): Promise<void> {
    try {
      const { userId, page = 1, limit = 50 } = req.query;
      const userModel = new UserModel();
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

      const query = `
        SELECT 
          agents.*,
          users.name as user_name,
          users.email as user_email,
          COUNT(calls.id) as total_calls
        FROM agents
        JOIN users ON users.id = agents.user_id
        LEFT JOIN calls ON calls.agent_id = agents.id
        ${userId ? 'WHERE agents.user_id = $1' : ''}
        GROUP BY agents.id, users.id
        ORDER BY agents.created_at DESC
        LIMIT $${userId ? 2 : 1} OFFSET $${userId ? 3 : 2}
      `;

      const countQuery = `
        SELECT COUNT(DISTINCT agents.id) as total
        FROM agents
        ${userId ? 'WHERE agents.user_id = $1' : ''}
      `;

      const params = userId ? [userId, limit, offset] : [limit, offset];
      const countParams = userId ? [userId] : [];

      const [agentsResult, countResult] = await Promise.all([
        userModel.query(query, params),
        userModel.query(countQuery, countParams)
      ]);

      res.json({
        success: true,
        data: {
          agents: agentsResult.rows,
          total: parseInt(countResult.rows[0].total),
          page: parseInt(page as string),
          limit: parseInt(limit as string),
        },
        timestamp: new Date()
      });
    } catch (error: any) {
      logger.error('Get client panel agents error:', error);
      res.status(500).json({
        error: {
          code: 'CLIENT_PANEL_AGENTS_ERROR',
          message: 'Failed to retrieve agents',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get calls data for client panel (unified call logs)
   */
  static async getClientPanelCalls(req: Request, res: Response): Promise<void> {
    try {
      const { userId, page = 1, limit = 50, status, startDate, endDate } = req.query;
      const userModel = new UserModel();
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

      let filters = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (userId) {
        filters.push(`calls.user_id = $${paramIndex}`);
        params.push(userId);
        paramIndex++;
      }

      if (status) {
        filters.push(`calls.status = $${paramIndex}`);
        params.push(status);
        paramIndex++;
      }

      if (startDate) {
        filters.push(`calls.created_at >= $${paramIndex}`);
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        filters.push(`calls.created_at <= $${paramIndex}`);
        params.push(endDate);
        paramIndex++;
      }

      const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

      const query = `
        SELECT 
          calls.*,
          agents.name as agent_name,
          users.name as user_name,
          users.email as user_email,
          contacts.name as contact_name
        FROM calls
        JOIN users ON users.id = calls.user_id
        LEFT JOIN agents ON agents.id = calls.agent_id
        LEFT JOIN contacts ON contacts.id = calls.contact_id
        ${whereClause}
        ORDER BY calls.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limit, offset);

      const countQuery = `
        SELECT COUNT(*) as total
        FROM calls
        ${whereClause}
      `;

      const countParams = params.slice(0, -2);

      const [callsResult, countResult] = await Promise.all([
        userModel.query(query, params),
        userModel.query(countQuery, countParams)
      ]);

      res.json({
        success: true,
        data: {
          calls: callsResult.rows,
          total: parseInt(countResult.rows[0].total),
          page: parseInt(page as string),
          limit: parseInt(limit as string),
        },
        timestamp: new Date()
      });
    } catch (error: any) {
      logger.error('Get client panel calls error:', error);
      res.status(500).json({
        error: {
          code: 'CLIENT_PANEL_CALLS_ERROR',
          message: 'Failed to retrieve calls',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get contacts data for client panel
   */
  static async getClientPanelContacts(req: Request, res: Response): Promise<void> {
    try {
      const { userId, page = 1, limit = 50, search } = req.query;
      const userModel = new UserModel();
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

      let filters = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (userId) {
        filters.push(`contacts.user_id = $${paramIndex}`);
        params.push(userId);
        paramIndex++;
      }

      if (search) {
        filters.push(`(contacts.name ILIKE $${paramIndex} OR contacts.phone_number ILIKE $${paramIndex} OR contacts.email ILIKE $${paramIndex})`);
        params.push(`%${search}%`);
        paramIndex++;
      }

      const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

      const query = `
        SELECT 
          contacts.*,
          users.name as user_name,
          users.email as user_email,
          COUNT(calls.id) as total_calls
        FROM contacts
        JOIN users ON users.id = contacts.user_id
        LEFT JOIN calls ON calls.contact_id = contacts.id
        ${whereClause}
        GROUP BY contacts.id, users.id
        ORDER BY contacts.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limit, offset);

      const countQuery = `
        SELECT COUNT(DISTINCT contacts.id) as total
        FROM contacts
        ${whereClause}
      `;

      const countParams = params.slice(0, -2);

      const [contactsResult, countResult] = await Promise.all([
        userModel.query(query, params),
        userModel.query(countQuery, countParams)
      ]);

      res.json({
        success: true,
        data: {
          contacts: contactsResult.rows,
          total: parseInt(countResult.rows[0].total),
          page: parseInt(page as string),
          limit: parseInt(limit as string),
        },
        timestamp: new Date()
      });
    } catch (error: any) {
      logger.error('Get client panel contacts error:', error);
      res.status(500).json({
        error: {
          code: 'CLIENT_PANEL_CONTACTS_ERROR',
          message: 'Failed to retrieve contacts',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get campaigns data for client panel
   */
  static async getClientPanelCampaigns(req: Request, res: Response): Promise<void> {
    try {
      const { userId, page = 1, limit = 50, status } = req.query;
      const userModel = new UserModel();
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

      let filters = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (userId) {
        filters.push(`call_campaigns.user_id = $${paramIndex}`);
        params.push(userId);
        paramIndex++;
      }

      if (status) {
        filters.push(`call_campaigns.status = $${paramIndex}`);
        params.push(status);
        paramIndex++;
      }

      const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

      const query = `
        SELECT 
          call_campaigns.*,
          users.name as user_name,
          users.email as user_email,
          agents.name as agent_name,
          COUNT(DISTINCT cq.id) as total_calls
        FROM call_campaigns
        JOIN users ON users.id = call_campaigns.user_id
        LEFT JOIN agents ON agents.id = call_campaigns.agent_id
        LEFT JOIN call_queue cq ON cq.campaign_id = call_campaigns.id
        ${whereClause}
        GROUP BY call_campaigns.id, users.id, agents.id
        ORDER BY call_campaigns.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limit, offset);

      const countQuery = `
        SELECT COUNT(DISTINCT call_campaigns.id) as total
        FROM call_campaigns
        ${whereClause}
      `;

      const countParams = params.slice(0, -2);

      const [campaignsResult, countResult] = await Promise.all([
        userModel.query(query, params),
        userModel.query(countQuery, countParams)
      ]);

      res.json({
        success: true,
        data: {
          campaigns: campaignsResult.rows,
          total: parseInt(countResult.rows[0].total),
          page: parseInt(page as string),
          limit: parseInt(limit as string),
        },
        timestamp: new Date()
      });
    } catch (error: any) {
      logger.error('Get client panel campaigns error:', error);
      res.status(500).json({
        error: {
          code: 'CLIENT_PANEL_CAMPAIGNS_ERROR',
          message: 'Failed to retrieve campaigns',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get customers data for client panel
   */
  static async getClientPanelCustomers(req: Request, res: Response): Promise<void> {
    try {
      const { userId, page = 1, limit = 50, search } = req.query;
      const userModel = new UserModel();
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

      let filters = ['contacts.is_customer = true'];
      const params: any[] = [];
      let paramIndex = 1;

      if (userId) {
        filters.push(`contacts.user_id = $${paramIndex}`);
        params.push(userId);
        paramIndex++;
      }

      if (search) {
        filters.push(`(contacts.name ILIKE $${paramIndex} OR contacts.company ILIKE $${paramIndex})`);
        params.push(`%${search}%`);
        paramIndex++;
      }

      const whereClause = `WHERE ${filters.join(' AND ')}`;

      const query = `
        SELECT 
          contacts.*,
          users.name as user_name,
          users.email as user_email,
          COUNT(DISTINCT calls.id) as total_calls,
          MAX(calls.created_at) as last_contact_date
        FROM contacts
        JOIN users ON users.id = contacts.user_id
        LEFT JOIN calls ON calls.contact_id = contacts.id
        ${whereClause}
        GROUP BY contacts.id, users.id
        ORDER BY contacts.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limit, offset);

      const countQuery = `
        SELECT COUNT(DISTINCT contacts.id) as total
        FROM contacts
        ${whereClause}
      `;

      const countParams = params.slice(0, -2);

      const [customersResult, countResult] = await Promise.all([
        userModel.query(query, params),
        userModel.query(countQuery, countParams)
      ]);

      res.json({
        success: true,
        data: {
          customers: customersResult.rows,
          total: parseInt(countResult.rows[0].total),
          page: parseInt(page as string),
          limit: parseInt(limit as string),
        },
        timestamp: new Date()
      });
    } catch (error: any) {
      logger.error('Get client panel customers error:', error);
      res.status(500).json({
        error: {
          code: 'CLIENT_PANEL_CUSTOMERS_ERROR',
          message: 'Failed to retrieve customers',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get lead intelligence data for client panel (grouped leads like user dashboard)
   */
  static async getClientPanelLeadIntelligence(req: Request, res: Response): Promise<void> {
    try {
      const { userId, page = 1, limit = 50 } = req.query;
      const userModel = new UserModel();
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

      let userFilter = userId ? `AND c.user_id = $1` : '';
      const params: any[] = userId ? [userId] : [];
      const limitParam = params.length + 1;
      const offsetParam = params.length + 2;

      // Grouped leads query matching user dashboard structure
      const query = `
        WITH phone_leads_base AS (
          SELECT 
            c.phone_number::text as group_key,
            'phone'::text as group_type,
            c.phone_number::text as phone,
            c.user_id,
            users.name as user_name,
            users.email as user_email,
            FIRST_VALUE(COALESCE(co.email, la.extracted_email)) OVER (PARTITION BY c.phone_number, c.user_id ORDER BY c.created_at DESC)::text as email,
            FIRST_VALUE(COALESCE(co.name, la.extracted_name, 'Anonymous')) OVER (PARTITION BY c.phone_number, c.user_id ORDER BY c.created_at DESC)::text as name,
            FIRST_VALUE(COALESCE(co.company, la.company_name)) OVER (PARTITION BY c.phone_number, c.user_id ORDER BY c.created_at DESC)::text as company,
            FIRST_VALUE(c.lead_type) OVER (PARTITION BY c.phone_number, c.user_id ORDER BY c.created_at DESC)::text as lead_type,
            FIRST_VALUE(
              CASE 
                WHEN la.lead_status_tag IS NOT NULL THEN la.lead_status_tag
                WHEN c.status = 'failed' AND c.call_lifecycle_status IS NOT NULL THEN c.call_lifecycle_status
                ELSE 'Cold'
              END
            ) OVER (PARTITION BY c.phone_number, c.user_id ORDER BY c.created_at DESC)::text as recent_lead_tag,
            FIRST_VALUE(la.engagement_health) OVER (PARTITION BY c.phone_number, c.user_id ORDER BY c.created_at DESC)::text as recent_engagement_level,
            FIRST_VALUE(la.intent_level) OVER (PARTITION BY c.phone_number, c.user_id ORDER BY c.created_at DESC)::text as recent_intent_level,
            FIRST_VALUE(la.budget_constraint) OVER (PARTITION BY c.phone_number, c.user_id ORDER BY c.created_at DESC)::text as recent_budget_constraint,
            FIRST_VALUE(la.urgency_level) OVER (PARTITION BY c.phone_number, c.user_id ORDER BY c.created_at DESC)::text as recent_timeline_urgency,
            FIRST_VALUE(la.fit_alignment) OVER (PARTITION BY c.phone_number, c.user_id ORDER BY c.created_at DESC)::text as recent_fit_alignment,
            FIRST_VALUE(COALESCE(la.cta_escalated_to_human, false)) OVER (PARTITION BY c.phone_number, c.user_id ORDER BY c.created_at DESC) as escalated_to_human,
            FIRST_VALUE(c.created_at) OVER (PARTITION BY c.phone_number, c.user_id ORDER BY c.created_at DESC) as last_contact,
            FIRST_VALUE(la.demo_book_datetime) OVER (PARTITION BY c.phone_number, c.user_id ORDER BY c.created_at DESC) as demo_scheduled,
            COUNT(*) OVER (PARTITION BY c.phone_number, c.user_id)::bigint as interactions,
            ROW_NUMBER() OVER (PARTITION BY c.phone_number, c.user_id ORDER BY c.created_at DESC)::bigint as rn
          FROM calls c
          JOIN users ON users.id = c.user_id
          LEFT JOIN lead_analytics la ON c.id = la.call_id
          LEFT JOIN contacts co ON c.contact_id = co.id
          WHERE c.phone_number IS NOT NULL 
            AND c.phone_number != ''
            AND (co.is_customer IS NULL OR co.is_customer = false)
            ${userFilter}
        ),
        phone_leads AS (
          SELECT 
            plb.*,
            COALESCE((SELECT STRING_AGG(DISTINCT a.name, ', ') 
             FROM calls c2 
             LEFT JOIN agents a ON c2.agent_id = a.id 
             WHERE c2.phone_number = plb.phone AND c2.user_id = plb.user_id), '')::text as interacted_agents
          FROM phone_leads_base plb
          WHERE plb.rn = 1
        ),
        all_leads AS (
          SELECT * FROM phone_leads
        )
        SELECT 
          al.*,
          fu.follow_up_date as follow_up_scheduled,
          fu.follow_up_status
        FROM all_leads al
        LEFT JOIN (
          SELECT DISTINCT ON (lead_phone, user_id)
            lead_phone,
            user_id,
            follow_up_date,
            follow_up_status
          FROM follow_ups 
          WHERE follow_up_status != 'cancelled'
          ORDER BY lead_phone, user_id, follow_up_date DESC
        ) fu ON al.phone = fu.lead_phone AND al.user_id = fu.user_id
        ORDER BY al.last_contact DESC
        LIMIT $${limitParam} OFFSET $${offsetParam}
      `;

      params.push(parseInt(limit as string), offset);

      const countQuery = `
        SELECT COUNT(*) as total
        FROM (
          SELECT DISTINCT c.phone_number, c.user_id
          FROM calls c
          LEFT JOIN contacts co ON c.contact_id = co.id
          WHERE c.phone_number IS NOT NULL 
            AND c.phone_number != ''
            AND (co.is_customer IS NULL OR co.is_customer = false)
            ${userFilter}
        ) as distinct_leads
      `;

      const countParams = userId ? [userId] : [];

      const [intelligenceResult, countResult] = await Promise.all([
        userModel.query(query, params),
        userModel.query(countQuery, countParams)
      ]);

      res.json({
        success: true,
        data: {
          intelligence: intelligenceResult.rows,
          total: parseInt(countResult.rows[0].total),
          page: parseInt(page as string),
          limit: parseInt(limit as string),
        },
        timestamp: new Date()
      });
    } catch (error: any) {
      logger.error('Get client panel lead intelligence error:', {
        error: error.message,
        stack: error.stack,
        query: error.query,
        userId: req.query.userId,
        page: req.query.page,
        limit: req.query.limit
      });
      res.status(500).json({
        error: {
          code: 'CLIENT_PANEL_LEAD_INTELLIGENCE_ERROR',
          message: 'Failed to retrieve lead intelligence data',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Impersonate a user (admin-only feature)
   * Generates a temporary token for the specified user
   */
  static async impersonateUser(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const userModel = new UserModel();

      // Fetch the target user with all necessary fields
      const userQuery = `
        SELECT id, email, name, role, is_active, email_verified, credits,
               auth_provider, created_at, updated_at
        FROM users 
        WHERE id = $1
      `;
      const userResult = await userModel.query(userQuery, [userId]);

      if (userResult.rows.length === 0) {
        res.status(404).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            timestamp: new Date(),
          },
        });
        return;
      }

      const userData = userResult.rows[0];

      if (!userData.is_active) {
        res.status(400).json({
          error: {
            code: 'USER_INACTIVE',
            message: 'Cannot impersonate inactive user',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Create user object matching authService User interface
      const user = {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        credits: userData.credits,
        isActive: userData.is_active,
        emailVerified: userData.email_verified,
        role: userData.role,
        authProvider: userData.auth_provider,
        createdAt: userData.created_at,
        updatedAt: userData.updated_at,
      };

      // Import authService
      const { authService } = await import('../services/authService');

      // Generate proper tokens using authService (same as login)
      const token = authService.generateToken(user);
      const refreshToken = authService.generateRefreshToken(user);

      // Create session in database so it can be validated
      await authService.createSession(user.id, token, req.ip, req.get('User-Agent'), refreshToken);

      logger.info(`Admin ${(req.user as any)?.id} impersonating user ${userId}`);

      res.json({
        success: true,
        data: {
          token,
          refreshToken,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
        },
        timestamp: new Date(),
      });
    } catch (error: any) {
      logger.error('Impersonate user error:', error);
      res.status(500).json({
        error: {
          code: 'IMPERSONATION_ERROR',
          message: 'Failed to impersonate user',
          timestamp: new Date(),
        },
      });
    }
  }
}