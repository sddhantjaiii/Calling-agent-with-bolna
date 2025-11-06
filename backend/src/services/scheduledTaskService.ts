import { userService } from './userService';

type TaskToggle = {
  enabled: boolean;
  runOnStartup: boolean;
};

type ScheduledTaskOptions = {
  lowCredits?: TaskToggle;
  emailVerificationReminder?: TaskToggle;
};

class ScheduledTaskService {
  private lowCreditsNotificationInterval: any | null = null;
  private emailVerificationReminderInterval: NodeJS.Timeout | null = null;
  private readonly LOW_CREDITS_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly LOW_CREDITS_THRESHOLD = 5;
  private readonly EMAIL_VERIFICATION_REMINDER_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
  private readonly EMAIL_VERIFICATION_REMINDER_THRESHOLD = 24; // 24 hours
  
  private parseBool(val?: string, defaultVal: boolean = false): boolean {
    if (typeof val !== 'string' || val.trim() === '') return defaultVal;
    return val === 'true' || val === '1' || val.toLowerCase() === 'yes';
  }

  /**
   * Start all scheduled tasks
   */
  startScheduledTasks(options?: ScheduledTaskOptions): void {
    console.log('Starting scheduled tasks...');

    const serverless = process.env.SERVERLESS === 'true';
    // Resolve toggles from env with sensible defaults
    const lowCreditsEnabled = this.parseBool(
      process.env.LOW_CREDITS_NOTIFICATIONS_ENABLED,
      serverless ? false : true
    );
    const lowCreditsRunOnStartup = this.parseBool(
      process.env.LOW_CREDITS_NOTIFICATIONS_RUN_ON_STARTUP,
      false
    );

    const verifyEnabled = this.parseBool(
      process.env.EMAIL_VERIFICATION_REMINDER_ENABLED,
      serverless ? false : true
    );
    const verifyRunOnStartup = this.parseBool(
      process.env.EMAIL_VERIFICATION_REMINDER_RUN_ON_STARTUP,
      false
    );

    const resolved: Required<ScheduledTaskOptions> = {
      lowCredits: {
        enabled: options?.lowCredits?.enabled ?? lowCreditsEnabled,
        runOnStartup: options?.lowCredits?.runOnStartup ?? lowCreditsRunOnStartup,
      },
      emailVerificationReminder: {
        enabled: options?.emailVerificationReminder?.enabled ?? verifyEnabled,
        runOnStartup: options?.emailVerificationReminder?.runOnStartup ?? verifyRunOnStartup,
      },
    } as Required<ScheduledTaskOptions>;

    // Start low credits notification task (if enabled)
    if (resolved.lowCredits.enabled) {
      this.startLowCreditsNotifications(resolved.lowCredits.runOnStartup);
    } else {
      console.log('Low credits notifications are disabled by configuration');
    }

    // Start email verification reminder task (if enabled)
    if (resolved.emailVerificationReminder.enabled) {
      this.startEmailVerificationReminders(resolved.emailVerificationReminder.runOnStartup);
    } else {
      console.log('Email verification reminders are disabled by configuration');
    }

    console.log('Scheduled tasks started successfully');
  }

  /**
   * Stop all scheduled tasks
   */
  stopScheduledTasks(): void {
    console.log('Stopping scheduled tasks...');
    
    if (this.lowCreditsNotificationInterval) {
      clearInterval(this.lowCreditsNotificationInterval);
      this.lowCreditsNotificationInterval = null;
    }
    
    if (this.emailVerificationReminderInterval) {
      clearInterval(this.emailVerificationReminderInterval);
      this.emailVerificationReminderInterval = null;
    }
    
    console.log('Scheduled tasks stopped');
  }

  /**
   * Start low credits notification task
   */
  private startLowCreditsNotifications(runOnStartup: boolean): void {
    if (runOnStartup) {
      // Run immediately on startup
      this.runLowCreditsNotificationTask();
    }

    // Then run every 24 hours
    this.lowCreditsNotificationInterval = setInterval(() => {
      this.runLowCreditsNotificationTask();
    }, this.LOW_CREDITS_CHECK_INTERVAL);

    console.log(`Low credits notification task scheduled to run every ${this.LOW_CREDITS_CHECK_INTERVAL / (60 * 60 * 1000)} hours`);
  }

  /**
   * Run low credits notification task
   */
  private async runLowCreditsNotificationTask(): Promise<void> {
    try {
      console.log('Running low credits notification task...');
      
      const notificationsSent = await userService.sendLowCreditsNotifications(
        this.LOW_CREDITS_THRESHOLD
      );
      
      console.log(`Low credits notification task completed. Sent ${notificationsSent} notifications.`);
    } catch (error) {
      console.error('Error running low credits notification task:', error);
    }
  }

  /**
   * Start email verification reminder task
   */
  private startEmailVerificationReminders(runOnStartup: boolean): void {
    if (runOnStartup) {
      // Run immediately on startup
      this.runEmailVerificationReminderTask();
    }

    // Then run every 6 hours
    this.emailVerificationReminderInterval = setInterval(() => {
      this.runEmailVerificationReminderTask();
    }, this.EMAIL_VERIFICATION_REMINDER_INTERVAL);

    console.log(`Email verification reminder task scheduled to run every ${this.EMAIL_VERIFICATION_REMINDER_INTERVAL / (60 * 60 * 1000)} hours`);
  }

  /**
   * Run email verification reminder task
   */
  private async runEmailVerificationReminderTask(): Promise<void> {
    try {
      console.log('Running email verification reminder task...');
      
      const remindersSent = await userService.sendVerificationReminders(
        this.EMAIL_VERIFICATION_REMINDER_THRESHOLD
      );
      
      console.log(`Email verification reminder task completed. Sent ${remindersSent} reminders.`);
    } catch (error) {
      console.error('Error running email verification reminder task:', error);
    }
  }

  /**
   * Manually trigger low credits notifications (for admin use)
   */
  async triggerLowCreditsNotifications(): Promise<number> {
    console.log('Manually triggering low credits notifications...');
    return await userService.sendLowCreditsNotifications(this.LOW_CREDITS_THRESHOLD);
  }

  /**
   * Manually trigger email verification reminders (for admin use)
   */
  async triggerEmailVerificationReminders(): Promise<number> {
    console.log('Manually triggering email verification reminders...');
    return await userService.sendVerificationReminders(this.EMAIL_VERIFICATION_REMINDER_THRESHOLD);
  }

  /**
   * Get task status
   */
  getTaskStatus(): {
    lowCreditsNotifications: {
      running: boolean;
      interval: number;
      threshold: number;
    };
    emailVerificationReminders: {
      running: boolean;
      interval: number;
      threshold: number;
    };
  } {
    return {
      lowCreditsNotifications: {
        running: this.lowCreditsNotificationInterval !== null,
        interval: this.LOW_CREDITS_CHECK_INTERVAL,
        threshold: this.LOW_CREDITS_THRESHOLD,
      },
      emailVerificationReminders: {
        running: this.emailVerificationReminderInterval !== null,
        interval: this.EMAIL_VERIFICATION_REMINDER_INTERVAL,
        threshold: this.EMAIL_VERIFICATION_REMINDER_THRESHOLD,
      },
    };
  }
}

export const scheduledTaskService = new ScheduledTaskService();

// Handle graceful shutdown
process.on('SIGTERM', () => {
  scheduledTaskService.stopScheduledTasks();
});

process.on('SIGINT', () => {
  scheduledTaskService.stopScheduledTasks();
});
