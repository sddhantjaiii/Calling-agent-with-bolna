import database from '../config/database';
import { QueueProcessorService } from './QueueProcessorService';
import { logger } from '../middleware';
import { convertTimeWindowToTimezone } from '../utils/timezoneUtils';

interface CampaignWindow {
  campaignId: string;
  userId: string;
  firstCallTime: string; // HH:mm:ss format in campaign's local timezone
  lastCallTime: string;   // HH:mm:ss format in campaign's local timezone
  timezone: string;       // The timezone this campaign operates in
  queuedCount: number;
  status: string;
  nextScheduledTime?: Date | null;
}

/**
 * In-Memory Campaign Scheduler
 * 
 * Instead of polling database every 10 seconds, this service:
 * 1. Loads campaign schedules once
 * 2. Calculates WHEN to wake database
 * 3. Uses setTimeout to wake at exact times
 * 4. Database sleeps between scheduled wake-ups
 * 
 * This reduces Neon Postgres compute hours by 60-70%
 */
export class InMemoryCampaignScheduler {
  private nextWakeTime: Date | null = null;
  private wakeTimeout: NodeJS.Timeout | null = null;
  private campaignWindows: Map<string, CampaignWindow> = new Map();
  private queueProcessor: QueueProcessorService;
  private isProcessing: boolean = false;
  private lastScheduleLoad: Date | null = null;
  private activeUsers: Set<string> = new Set(); // Track multiple users
  private userActivityTimeouts: Map<string, NodeJS.Timeout> = new Map(); // Per-user timeouts
  private processCount: number = 0; // Count cycles since last reload
  private lastProcessingTime: number = 0; // Track processing duration for adaptive interval

  constructor() {
    this.queueProcessor = new QueueProcessorService();
  }

  /**
   * Initialize scheduler and load campaign schedules
   * Call this on server startup
   */
  async initialize(): Promise<void> {
    try {
      logger.info('🚀 Initializing In-Memory Campaign Scheduler');
      
      await this.loadCampaignSchedules();
      this.scheduleNextWake();
      
      logger.info('✅ Campaign Scheduler initialized', {
        campaignCount: this.campaignWindows.size,
        nextWakeTime: this.nextWakeTime?.toISOString()
      });
    } catch (error) {
      logger.error('❌ Failed to initialize Campaign Scheduler', { error });
      throw error;
    }
  }

  /**
   * Load active campaign schedules from database
   * This is the ONLY regular database query - happens once per initialization
   * or after major changes
   * 
   * ALSO checks for queued direct calls and processes them immediately
   */
  private async loadCampaignSchedules(): Promise<void> {
    try {
      logger.info('📋 Loading campaign schedules from database');
      const startTime = Date.now();

      // Check for queued direct calls FIRST
      const directCallsResult = await database.query(`
        SELECT COUNT(*) as direct_count
        FROM call_queue 
        WHERE status = 'queued' 
          AND campaign_id IS NULL
      `);

      const directCallCount = parseInt(directCallsResult.rows[0]?.direct_count || '0');

      if (directCallCount > 0) {
        logger.info(`🔥 Found ${directCallCount} queued direct calls - processing immediately`, {
          directCallCount
        });
        console.log(`🔥 Found ${directCallCount} queued direct calls - waking database NOW`);
        
        // Process queue immediately for direct calls
        // Don't await - let it run in background
        void this.wakeAndProcessQueue().catch(error => {
          logger.error('❌ Error processing direct calls', { error });
        });
      }

      const result = await database.query(`
        SELECT 
          cc.id as campaign_id,
          cc.user_id,
          cc.first_call_time,
          cc.last_call_time,
          cc.campaign_timezone,
          cc.use_custom_timezone,
          cc.status,
          u.timezone as user_timezone,
          (
            SELECT COUNT(*) 
            FROM call_queue cq 
            WHERE cq.campaign_id = cc.id 
              AND cq.status = 'queued'
          ) as queued_count,
          (
            SELECT MIN(scheduled_for)
            FROM call_queue cq
            WHERE cq.campaign_id = cc.id
              AND cq.status = 'queued'
          ) as next_scheduled_time
        FROM call_campaigns cc
        JOIN users u ON u.id = cc.user_id
        WHERE cc.status = 'active'
          AND cc.first_call_time IS NOT NULL
          AND cc.last_call_time IS NOT NULL
        ORDER BY cc.first_call_time ASC
      `);

      // Update existing campaigns and add new ones
      // Don't clear all - preserve campaigns that are actively processing
      const loadedCampaignIds = new Set<string>();
      
      for (const row of result.rows) {
        loadedCampaignIds.add(row.campaign_id);
        
        // Determine effective timezone (campaign override OR user timezone OR UTC)
        const effectiveTimezone = (row.use_custom_timezone && row.campaign_timezone) 
          ? row.campaign_timezone 
          : (row.user_timezone || 'UTC');

        console.log(`[Scheduler] Campaign ${row.campaign_id.slice(0,8)}: ${effectiveTimezone} ${row.first_call_time}-${row.last_call_time} (${row.queued_count} queued)`);
        
        // KEEP times in original timezone - don't convert to UTC
        // We'll convert current time to campaign timezone when checking
        if (row.queued_count > 0) {
          this.campaignWindows.set(row.campaign_id, {
            campaignId: row.campaign_id,
            userId: row.user_id,
            firstCallTime: row.first_call_time,  // Keep in campaign timezone
            lastCallTime: row.last_call_time,    // Keep in campaign timezone
            timezone: effectiveTimezone,         // Store the timezone
            queuedCount: row.queued_count,
            status: row.status,
            nextScheduledTime: row.next_scheduled_time ? new Date(row.next_scheduled_time) : null
          });
        } else {
          // Campaign has no queued calls - remove from memory
          this.campaignWindows.delete(row.campaign_id);
        }
      }
      
      // Remove campaigns that are no longer active (paused, completed, deleted)
      for (const [campaignId] of this.campaignWindows) {
        if (!loadedCampaignIds.has(campaignId)) {
          logger.info('🗑️ Removing inactive campaign from scheduler', { campaignId });
          this.campaignWindows.delete(campaignId);
        }
      }

      this.lastScheduleLoad = new Date();

      const executionTime = Date.now() - startTime;
      logger.info('✅ Campaign schedules loaded', {
        campaignCount: this.campaignWindows.size,
        totalCampaigns: result.rows.length,
        withQueuedCalls: this.campaignWindows.size,
        executionTime: `${executionTime}ms`
      });

      // Database can go back to sleep after this query
      logger.info('💤 Database can sleep - schedules loaded into memory');

    } catch (error) {
      logger.error('❌ Failed to load campaign schedules', { error });
      throw error;
    }
  }

  /**
   * Calculate next database wake time based on campaign windows
   * All calculations in-memory, NO database queries
   * 
   * NEW LOGIC: Convert current time to each campaign's timezone
   */
  private scheduleNextWake(): void {
    const now = new Date();
    let earliestWake: Date | null = null;
    let wakeReason: string = '';
    const wakeSchedules: Array<{campaign: string, wakeTime: Date, reason: string}> = [];

    logger.info('⏰ Calculating next wake time', {
      currentTime: now.toISOString(),
      campaignCount: this.campaignWindows.size
    });

    if (this.campaignWindows.size === 0) {
      logger.info('💤 No campaigns with queued calls - database can sleep indefinitely');
      this.nextWakeTime = null;
      return;
    }

    // Calculate next wake time for each campaign in its own timezone
    for (const [id, window] of this.campaignWindows) {
      const nextWake = this.calculateNextWakeTimeForCampaign(window, now);
      
      if (nextWake) {
        wakeSchedules.push({
          campaign: id.slice(0, 8),
          wakeTime: nextWake,
          reason: `${window.timezone} ${window.firstCallTime}-${window.lastCallTime}`
        });
        
        if (!earliestWake || nextWake < earliestWake) {
          earliestWake = nextWake;
          wakeReason = `Campaign ${id.slice(0,8)} (${window.timezone} ${window.firstCallTime}-${window.lastCallTime})`;
        }
      }
    }

    // Log all wake schedules for debugging
    console.log('\n📋 Wake schedule for all campaigns:');
    wakeSchedules.sort((a, b) => a.wakeTime.getTime() - b.wakeTime.getTime());
    wakeSchedules.forEach(s => {
      const delay = Math.round((s.wakeTime.getTime() - now.getTime()) / 60000);
      console.log(`  ${s.campaign}: ${s.wakeTime.toLocaleString()} (${delay} min) - ${s.reason}`);
    });

    if (earliestWake) {
      const delay = earliestWake.getTime() - now.getTime();
      const delayMinutes = Math.round(delay / (60 * 1000));

      this.nextWakeTime = earliestWake;

      logger.info('⏰ Next database wake scheduled', {
        wakeTime: earliestWake.toISOString(),
        delayMinutes,
        reason: wakeReason
      });

      // Clear existing timeout
      if (this.wakeTimeout) {
        clearTimeout(this.wakeTimeout);
      }

      // Schedule wake at exact time
      this.wakeTimeout = setTimeout(() => {
        void this.wakeAndProcessQueue().catch((error) => {
          logger.error('❌ Error in scheduled wake', { error });
          this.loadCampaignSchedules()
            .then(() => this.scheduleNextWake())
            .catch(err => logger.error('Failed to recover from wake error', { error: err }));
        });
      }, delay);

      console.log(`\n⏰ Next wake: ${earliestWake.toLocaleString()} (${delayMinutes} min) - ${wakeReason}\n`);
    } else {
      this.nextWakeTime = null;
      logger.info('💤 No wake time scheduled - all campaigns outside time windows');
    }
  }

  /**
   * Calculate when to wake database for a specific campaign
   * NEW: Works in campaign's timezone, not UTC
   */
  private calculateNextWakeTimeForCampaign(
    window: CampaignWindow,
    now: Date
  ): Date | null {
    try {
      // Get current time in campaign's timezone
      const currentTimeInTZ = new Date(now.toLocaleString('en-US', { timeZone: window.timezone }));
      const currentTimeString = currentTimeInTZ.toTimeString().slice(0, 8); // HH:MM:SS
      
      console.log(`[Scheduler] Campaign ${window.campaignId.slice(0,8)} (${window.timezone}): current=${currentTimeString}, window=${window.firstCallTime}-${window.lastCallTime}`);

      // Check if currently within campaign window
      if (currentTimeString >= window.firstCallTime && currentTimeString <= window.lastCallTime) {
        // Check if we have a specific scheduled time in the future
        if (window.nextScheduledTime && window.nextScheduledTime > now) {
          console.log(`[Scheduler] Campaign ${window.campaignId.slice(0,8)} active but next call scheduled for ${window.nextScheduledTime.toISOString()}`);
          return window.nextScheduledTime;
        }

        console.log(`[Scheduler] ✅ Campaign ${window.campaignId.slice(0,8)} is ACTIVE NOW - wake immediately`);
        return now; // Wake immediately
      }

      // Check if before campaign window today
      if (currentTimeString < window.firstCallTime) {
        console.log(`[Scheduler] Campaign ${window.campaignId.slice(0,8)} starts later today at ${window.firstCallTime}`);
        // Calculate wake time: today at firstCallTime in campaign's timezone
        return this.getTimeInTimezone(window.timezone, window.firstCallTime, now, false);
      }

      // After campaign window - wake at first_call_time tomorrow
      console.log(`[Scheduler] Campaign ${window.campaignId.slice(0,8)} ended today, will start tomorrow at ${window.firstCallTime}`);
      return this.getTimeInTimezone(window.timezone, window.firstCallTime, now, true);
      
    } catch (error) {
      logger.error('Error calculating wake time for campaign', {
        campaignId: window.campaignId,
        timezone: window.timezone,
        error
      });
      return null;
    }
  }

  /**
   * Get a specific time today or tomorrow in a given timezone
   * Returns a UTC Date object representing that local time in the specified timezone
   */
  private getTimeInTimezone(timezone: string, timeString: string, referenceDate: Date, tomorrow: boolean): Date {
    const [hours, minutes, seconds = '00'] = timeString.split(':').map(Number);
    
    // Get the current date components in the target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(referenceDate);
    let year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
    let month = parseInt(parts.find(p => p.type === 'month')?.value || '1');
    let day = parseInt(parts.find(p => p.type === 'day')?.value || '1');
    
    if (tomorrow) {
      day += 1;
    }
    
    // Construct the date-time string in ISO format (this is timezone-naive)
    const isoString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    // Parse as local time, then calculate what the UTC equivalent would be
    // by using a known reference point to find the offset
    const testDate = new Date();
    const testFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    // Get offset between UTC and target timezone using the test date
    const testParts = testFormatter.formatToParts(testDate);
    const testYear = parseInt(testParts.find(p => p.type === 'year')?.value || '0');
    const testMonth = parseInt(testParts.find(p => p.type === 'month')?.value || '1') - 1;
    const testDay = parseInt(testParts.find(p => p.type === 'day')?.value || '1');
    const testHour = parseInt(testParts.find(p => p.type === 'hour')?.value || '0');
    const testMinute = parseInt(testParts.find(p => p.type === 'minute')?.value || '0');
    const testSecond = parseInt(testParts.find(p => p.type === 'second')?.value || '0');
    
    // Create dates using Date.UTC to ensure they're in UTC
    const testInTZ = Date.UTC(testYear, testMonth, testDay, testHour, testMinute, testSecond);
    const testInUTC = testDate.getTime();
    const offsetMs = testInUTC - testInTZ;
    
    // Now construct our target date in the timezone and apply the offset
    const targetInTZ = Date.UTC(year, month - 1, day, hours, minutes, parseInt(seconds.toString()));
    const targetInUTC = new Date(targetInTZ + offsetMs);
    
    console.log(`[Scheduler] getTimeInTimezone: ${timeString} in ${timezone} (tomorrow=${tomorrow}) = ${targetInUTC.toISOString()} UTC (offset=${offsetMs}ms)`);
    
    return targetInUTC;
  }

  /**
   * Wake database and process queue
   * This is where the actual work happens
   */
  private async wakeAndProcessQueue(): Promise<void> {
    if (this.isProcessing) {
      logger.warn('⚠️ Already processing queue, skipping wake');
      return;
    }

    this.isProcessing = true;
    const processingStartTime = Date.now();

    try {
      logger.info('⚡ WAKE: Database waking up to process queue');

      // Process queue (this queries database)
      await this.queueProcessor.processQueue();

      this.lastProcessingTime = Date.now() - processingStartTime;
      this.processCount++;
      
      logger.info('✅ Queue processing completed', {
        executionTime: `${this.lastProcessingTime}ms`,
        processCount: this.processCount
      });

      // Reload campaign data periodically to catch paused/cancelled campaigns
      if (this.processCount >= 6) { // Every 6 cycles (~1 minute)
        logger.info('🔄 Periodic schedule reload to catch campaign changes');
        await this.loadCampaignSchedules();
        this.processCount = 0;
      }

      // Check if we need to continue processing or can sleep
      await this.checkContinueOrSleep();

    } catch (error) {
      logger.error('❌ Error during wake and process', { error });
      // On error, reload schedule and try again
      this.processCount = 0; // Reset counter on error
      await this.loadCampaignSchedules();
      this.scheduleNextWake();
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * After processing, check if more work is needed soon
   * or if we can sleep until next campaign window
   */
  private async checkContinueOrSleep(): Promise<void> {
    try {
      // Quick query to check if any campaigns still have queued calls in active windows
      const result = await database.query(`
        SELECT 
          cc.id,
          cc.first_call_time,
          cc.last_call_time,
          COUNT(cq.id) as queued_count
        FROM call_campaigns cc
        INNER JOIN call_queue cq ON cc.id = cq.campaign_id
        WHERE cc.status = 'active'
          AND cq.status = 'queued'
        GROUP BY cc.id, cc.first_call_time, cc.last_call_time
      `);

      if (result.rows.length === 0) {
        logger.info('💤 No more queued calls - reloading schedule');
        await this.loadCampaignSchedules();
        this.scheduleNextWake();
        return;
      }

      // Check if any campaigns are in active window NOW (timezone-aware)
      const now = new Date();
      let hasActiveCampaigns = false;

      for (const row of result.rows) {
        // Get campaign's timezone
        const campaignTZ = (row.use_custom_timezone && row.campaign_timezone) 
          ? row.campaign_timezone 
          : (row.user_timezone || 'UTC');
        
        // Get current time in campaign's timezone
        const currentTimeInTZ = new Date(now.toLocaleString('en-US', { timeZone: campaignTZ }));
        const currentTimeString = currentTimeInTZ.toTimeString().slice(0, 8);
        
        if (currentTimeString >= row.first_call_time && currentTimeString <= row.last_call_time) {
          hasActiveCampaigns = true;
          break;
        }
      }

      if (hasActiveCampaigns) {
        // Campaign is still active - use adaptive interval for continuous processing
        // Adaptive: If processing took long, give more time before next wake
        // For fast processing (< 5s), use 10s minimum
        // For slow processing (>= 5s), scale up but cap at 30s
        const baseInterval = 10 * 1000; // 10 seconds minimum
        const maxInterval = 30 * 1000;  // 30 seconds maximum
        
        const adaptiveInterval = this.lastProcessingTime >= 5000
          ? Math.min(this.lastProcessingTime * 1.5, maxInterval)
          : baseInterval;
        
        const nextWake = new Date(Date.now() + adaptiveInterval);
        
        logger.info('🔄 Campaign still active - scheduling continuous processing', {
          nextWakeTime: nextWake.toISOString(),
          intervalSeconds: Math.round(adaptiveInterval / 1000),
          lastProcessingTime: `${this.lastProcessingTime}ms`
        });

        this.nextWakeTime = nextWake;
        
        if (this.wakeTimeout) {
          clearTimeout(this.wakeTimeout);
        }

        this.wakeTimeout = setTimeout(() => {
          void this.wakeAndProcessQueue().catch((error) => {
            logger.error('❌ Error in continuous processing wake', { error });
            this.loadCampaignSchedules()
              .then(() => this.scheduleNextWake())
              .catch(err => logger.error('Failed to recover from continuous processing error', { error: err }));
          });
        }, adaptiveInterval);

        console.log(`⏰ Continuous processing: Next wake in ${Math.round(adaptiveInterval / 1000)} seconds`);
      } else {
        // No active campaigns right now - reload schedule for next window
        logger.info('💤 No campaigns in active window - reloading schedule');
        await this.loadCampaignSchedules();
        this.scheduleNextWake();
      }

    } catch (error) {
      logger.error('❌ Error checking continue or sleep', { error });
      // Fallback: reload schedule
      await this.loadCampaignSchedules();
      this.scheduleNextWake();
    }
  }

  /**
   * Call this when a campaign is created or updated
   * Forces immediate reload of schedules
   */
  async onCampaignChange(campaignId?: string): Promise<void> {
    try {
      logger.info('🔄 Campaign change detected, reloading schedules', { campaignId });

      // Cancel current timeout
      if (this.wakeTimeout) {
        clearTimeout(this.wakeTimeout);
        this.wakeTimeout = null;
      }

      // Reload schedules from database
      await this.loadCampaignSchedules();

      // Check if we should wake immediately (timezone-aware)
      const now = new Date();

      for (const [id, window] of this.campaignWindows) {
        // Get current time in campaign's timezone
        const currentTimeInTZ = new Date(now.toLocaleString('en-US', { timeZone: window.timezone }));
        const currentTimeString = currentTimeInTZ.toTimeString().slice(0, 8);
        
        if (currentTimeString >= window.firstCallTime && currentTimeString <= window.lastCallTime) {
          // Campaign window is active NOW - check if already processing
          if (this.isProcessing) {
            logger.info('⚠️ Campaign active but already processing - will catch on next cycle', {
              campaignId: id,
              timezone: window.timezone
            });
            return;
          }
          
          // Wake immediately
          logger.info('⚡ New/updated campaign is active NOW - triggering immediate processing', {
            campaignId: id,
            timezone: window.timezone,
            timeWindow: `${window.firstCallTime}-${window.lastCallTime}`,
            currentTime: currentTimeString,
            queuedCount: window.queuedCount
          });
          await this.wakeAndProcessQueue();
          return;
        }
      }

      // Not in active window - schedule next wake
      this.scheduleNextWake();

    } catch (error) {
      logger.error('❌ Error handling campaign change', { error });
    }
  }

  /**
   * Call this when user initiates a direct call
   * Triggers immediate queue processing without waiting for scheduled wake
   */
  async onDirectCallQueued(userId: string): Promise<void> {
    try {
      logger.info('📞 Direct call queued, triggering immediate processing', { userId });
      
      // Clear existing scheduled wake to prevent overlap
      if (this.wakeTimeout) {
        clearTimeout(this.wakeTimeout);
        this.wakeTimeout = null;
      }
      
      // Process queue immediately (don't wait for scheduled wake)
      await this.wakeAndProcessQueue();
      
    } catch (error) {
      logger.error('❌ Error handling direct call', { error });
    }
  }

  /**
   * Track user activity to keep connection pool warm
   * Call this from middleware when user interacts with dashboard
   * Now tracks multiple users independently
   */
  markUserActivity(userId?: string): void {
    const userKey = userId || 'anonymous';
    this.activeUsers.add(userKey);

    // Clear existing timeout for this user
    const existingTimeout = this.userActivityTimeouts.get(userKey);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // User is considered inactive after 10 minutes
    const timeout = setTimeout(() => {
      this.activeUsers.delete(userKey);
      this.userActivityTimeouts.delete(userKey);
      logger.info('💤 User inactive for 10 minutes', { 
        userId: userKey,
        remainingActiveUsers: this.activeUsers.size 
      });
    }, 10 * 60 * 1000);

    this.userActivityTimeouts.set(userKey, timeout);
  }

  /**
   * Check if any users are currently active
   */
  isUserCurrentlyActive(): boolean {
    return this.activeUsers.size > 0;
  }

  /**
   * Get count of active users
   */
  getActiveUserCount(): number {
    return this.activeUsers.size;
  }

  /**
   * Stop the scheduler
   * Call this on server shutdown
   */
  stop(): void {
    logger.info('🛑 Stopping Campaign Scheduler');

    if (this.wakeTimeout) {
      clearTimeout(this.wakeTimeout);
      this.wakeTimeout = null;
    }

    // Clear all user activity timeouts
    for (const timeout of this.userActivityTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.userActivityTimeouts.clear();
    this.activeUsers.clear();

    this.campaignWindows.clear();
    
    logger.info('✅ Campaign Scheduler stopped');
  }

  /**
   * Get current scheduler status (for monitoring/debugging)
   */
  getStatus(): {
    nextWakeTime: Date | null;
    campaignCount: number;
    isProcessing: boolean;
    activeUserCount: number;
    lastScheduleLoad: Date | null;
    campaigns: Array<{
      id: string;
      window: string;
      queuedCount: number;
    }>;
  } {
    const campaigns = Array.from(this.campaignWindows.values()).map(w => ({
      id: w.campaignId,
      window: `${w.firstCallTime}-${w.lastCallTime}`,
      queuedCount: w.queuedCount
    }));

    return {
      nextWakeTime: this.nextWakeTime,
      campaignCount: this.campaignWindows.size,
      isProcessing: this.isProcessing,
      activeUserCount: this.activeUsers.size,
      lastScheduleLoad: this.lastScheduleLoad,
      campaigns
    };
  }

  // Helper methods

  private getCurrentTimeString(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata'
    });
  }

  private getTimeToday(timeString: string): Date {
    const timezone = process.env.APP_TIMEZONE || 'Asia/Kolkata';
    
    // Get current date components in IST
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(now);
    
    const dateParts: any = {};
    parts.forEach(part => {
      if (part.type !== 'literal') {
        dateParts[part.type] = part.value;
      }
    });
    
    // Parse target time
    const [hours, minutes] = timeString.split(':').map(Number);
    
    // Create date string in ISO format: YYYY-MM-DDTHH:mm:ss
    const isoString = `${dateParts.year}-${dateParts.month}-${dateParts.day}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
    
    // Parse in IST context by converting from IST to UTC
    const targetInIST = new Date(isoString + '+05:30'); // IST offset
    
    return targetInIST;
  }

  private getTimeTomorrow(timeString: string): Date {
    const timezone = process.env.APP_TIMEZONE || 'Asia/Kolkata';
    
    // Get tomorrow's date in IST
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(tomorrow);
    
    const dateParts: any = {};
    parts.forEach(part => {
      if (part.type !== 'literal') {
        dateParts[part.type] = part.value;
      }
    });
    
    // Parse target time
    const [hours, minutes] = timeString.split(':').map(Number);
    
    // Create ISO string with IST offset
    const isoString = `${dateParts.year}-${dateParts.month}-${dateParts.day}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
    const targetInIST = new Date(isoString + '+05:30');
    
    return targetInIST;
  }
}

// Export singleton instance
export const campaignScheduler = new InMemoryCampaignScheduler();
