import { EventEmitter } from 'events';
import { userService } from './userService';
import { logger } from '../utils/logger';

export interface CreditEvent {
  type: 'credit_deducted' | 'credit_added' | 'credit_warning' | 'credit_depleted' | 'credit_restored';
  userId: string;
  previousCredits: number;
  currentCredits: number;
  amount: number;
  source: 'call_completion' | 'admin_adjustment' | 'purchase' | 'refund';
  metadata?: any;
  timestamp: Date;
}

export interface CreditAlert {
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  actionRequired: boolean;
  action?: {
    label: string;
    url: string;
  };
  duration?: number; // in milliseconds, 0 means no auto-hide
}

/**
 * Real-time credit monitoring and alert service
 * Provides live credit updates and smart notifications for the frontend
 */
export class CreditMonitoringService extends EventEmitter {
  private static instance: CreditMonitoringService;
  private userCreditCache = new Map<string, number>();
  private lastAlertTime = new Map<string, Date>();

  private constructor() {
    super();
    this.setupEventHandlers();
  }

  public static getInstance(): CreditMonitoringService {
    if (!CreditMonitoringService.instance) {
      CreditMonitoringService.instance = new CreditMonitoringService();
    }
    return CreditMonitoringService.instance;
  }

  /**
   * Record a credit event and trigger appropriate alerts
   */
  async recordCreditEvent(event: CreditEvent): Promise<void> {
    try {
      logger.info('[CreditMonitoring] Recording credit event', {
        userId: event.userId,
        type: event.type,
        previousCredits: event.previousCredits,
        currentCredits: event.currentCredits,
        amount: event.amount,
        source: event.source
      });

      // Update cache
      this.userCreditCache.set(event.userId, event.currentCredits);

      // Emit the event for any listeners
      this.emit('creditEvent', event);

      // Generate appropriate alerts
      const alerts = await this.generateAlertsForEvent(event);
      
      for (const alert of alerts) {
        this.emit('creditAlert', event.userId, alert);
        logger.info('[CreditMonitoring] Generated alert', {
          userId: event.userId,
          alertType: alert.type,
          alertTitle: alert.title
        });
      }

    } catch (error) {
      logger.error('[CreditMonitoring] Error recording credit event', {
        error: error instanceof Error ? error.message : String(error),
        event
      });
    }
  }

  /**
   * Get current credit status for a user
   */
  async getCreditStatus(userId: string): Promise<{
    current: number;
    status: 'healthy' | 'warning' | 'critical' | 'depleted';
    color: 'green' | 'yellow' | 'orange' | 'red';
    canInitiateCalls: boolean;
  }> {
    const credits = await userService.getUserCredits(userId);
    const current = credits || 0;

    let status: 'healthy' | 'warning' | 'critical' | 'depleted';
    let color: 'green' | 'yellow' | 'orange' | 'red';
    let canInitiateCalls: boolean;

    if (current > 15) {
      status = 'healthy';
      color = 'green';
      canInitiateCalls = true;
    } else if (current > 5) {
      status = 'warning';
      color = 'yellow';
      canInitiateCalls = true;
    } else if (current > 0) {
      status = 'critical';
      color = 'orange';
      canInitiateCalls = true;
    } else {
      status = 'depleted';
      color = 'red';
      canInitiateCalls = false;
    }

    return { current, status, color, canInitiateCalls };
  }

  /**
   * Generate appropriate alerts based on credit event
   */
  private async generateAlertsForEvent(event: CreditEvent): Promise<CreditAlert[]> {
    const alerts: CreditAlert[] = [];
    const { type, currentCredits, previousCredits, amount, source } = event;

    // Avoid spam - don't send same type of alert within 5 minutes
    const lastAlert = this.lastAlertTime.get(`${event.userId}_${type}`);
    if (lastAlert && Date.now() - lastAlert.getTime() < 5 * 60 * 1000) {
      return alerts;
    }

    switch (type) {
      case 'credit_deducted':
        if (currentCredits <= 0 && previousCredits > 0) {
          // Credits just went to zero or negative
          alerts.push({
            type: 'error',
            title: 'Credits Depleted',
            message: currentCredits === 0 
              ? 'Your credit balance is now zero. Purchase more credits to continue making calls.'
              : `Your credit balance is now negative (${currentCredits}). Please purchase more credits immediately.`,
            actionRequired: true,
            action: {
              label: 'Purchase Credits',
              url: '/billing/purchase'
            },
            duration: 0 // Don't auto-hide
          });
        } else if (currentCredits <= 5 && previousCredits > 5) {
          // Credits dropped to critical level
          alerts.push({
            type: 'warning',
            title: 'Low Credit Warning',
            message: `Your credit balance is low (${currentCredits} remaining). Consider topping up soon.`,
            actionRequired: true,
            action: {
              label: 'Purchase Credits',
              url: '/billing/purchase'
            },
            duration: 10000
          });
        } else if (currentCredits <= 15 && previousCredits > 15) {
          // Credits dropped to warning level
          alerts.push({
            type: 'info',
            title: 'Credit Update',
            message: `Call completed. ${currentCredits} credits remaining.`,
            actionRequired: false,
            duration: 5000
          });
        }
        break;

      case 'credit_added':
        if (previousCredits <= 0 && currentCredits > 0) {
          // Credits restored from zero/negative
          alerts.push({
            type: 'success',
            title: 'Credits Restored',
            message: `Great! Your credit balance has been restored to ${currentCredits}. You can now make calls again.`,
            actionRequired: false,
            duration: 8000
          });
        } else if (amount > 0) {
          alerts.push({
            type: 'success',
            title: 'Credits Added',
            message: `${amount} credits added to your account. New balance: ${currentCredits}`,
            actionRequired: false,
            duration: 6000
          });
        }
        break;

      case 'credit_warning':
        alerts.push({
          type: 'warning',
          title: 'Credit Warning',
          message: `You have ${currentCredits} credits remaining. Consider purchasing more soon.`,
          actionRequired: true,
          action: {
            label: 'Purchase Credits',
            url: '/billing/purchase'
          },
          duration: 8000
        });
        break;

      case 'credit_depleted':
        alerts.push({
          type: 'error',
          title: 'Credits Depleted',
          message: 'Your credit balance has reached zero. All active campaigns have been paused.',
          actionRequired: true,
          action: {
            label: 'Purchase Credits',
            url: '/billing/purchase'
          },
          duration: 0
        });
        break;

      case 'credit_restored':
        alerts.push({
          type: 'success',
          title: 'Credits Restored',
          message: 'Your credit balance has been restored. You can now resume your campaigns and make calls.',
          actionRequired: false,
          duration: 8000
        });
        break;
    }

    // Record alert time to prevent spam
    if (alerts.length > 0) {
      this.lastAlertTime.set(`${event.userId}_${type}`, new Date());
    }

    return alerts;
  }

  /**
   * Check if user needs immediate credit attention (for login/dashboard)
   */
  async checkForImmediateAttention(userId: string): Promise<{
    needsAttention: boolean;
    severity: 'info' | 'warning' | 'critical';
    message: string;
    action?: { label: string; url: string };
  }> {
    const credits = await userService.getUserCredits(userId);
    const current = credits || 0;

    if (current <= 0) {
      return {
        needsAttention: true,
        severity: 'critical',
        message: current === 0 
          ? 'Your credit balance is zero. Purchase credits to start making calls.'
          : `Your credit balance is negative (${current}). Please purchase credits immediately.`,
        action: {
          label: 'Purchase Credits',
          url: '/billing/purchase'
        }
      };
    } else if (current <= 5) {
      return {
        needsAttention: true,
        severity: 'warning',
        message: `You have ${current} credits remaining. Consider topping up soon.`,
        action: {
          label: 'Purchase Credits',
          url: '/billing/purchase'
        }
      };
    } else if (current <= 15) {
      return {
        needsAttention: true,
        severity: 'info',
        message: `You have ${current} credits remaining.`
      };
    }

    return {
      needsAttention: false,
      severity: 'info',
      message: `You have ${current} credits.`
    };
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Listen for credit events from other parts of the system
    this.on('creditEvent', (event: CreditEvent) => {
      logger.debug('[CreditMonitoring] Processing credit event', {
        userId: event.userId,
        type: event.type,
        currentCredits: event.currentCredits
      });
    });

    this.on('creditAlert', (userId: string, alert: CreditAlert) => {
      logger.info('[CreditMonitoring] Credit alert generated', {
        userId,
        alertType: alert.type,
        title: alert.title,
        actionRequired: alert.actionRequired
      });
    });
  }

  /**
   * Cleanup old cache entries and alert timestamps
   */
  cleanup(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    for (const [key, timestamp] of this.lastAlertTime.entries()) {
      if (timestamp < oneHourAgo) {
        this.lastAlertTime.delete(key);
      }
    }

    logger.debug('[CreditMonitoring] Cleanup completed', {
      remainingAlerts: this.lastAlertTime.size,
      cachedUsers: this.userCreditCache.size
    });
  }
}

// Export singleton instance
export const creditMonitoringService = CreditMonitoringService.getInstance();

// Schedule cleanup every hour
setInterval(() => {
  creditMonitoringService.cleanup();
}, 60 * 60 * 1000);