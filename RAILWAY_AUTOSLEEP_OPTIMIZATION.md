# 🚂 Railway Auto-Sleep Optimization Strategy

## 🎯 Railway's "Serverless" Feature Explained

Railway's **auto-sleep** (often called "serverless mode") works like this:

```
┌─────────────────────────────────────────────────────────┐
│  Railway monitors your server for activity              │
│                                                          │
│  If NO HTTP requests for X minutes → Server SLEEPS 💤  │
│  When HTTP request arrives → Server WAKES UP ⚡         │
│                                                          │
│  Sleep = No compute charges                             │
│  Awake = Pay per minute of activity                     │
└─────────────────────────────────────────────────────────┘
```

## ❌ Current Problem with Your Setup

**Your queue processor prevents Railway from sleeping!**

```typescript
// This keeps your server AWAKE 24/7:
setInterval(() => {
  queueProcessor.processQueue(); // Runs every 10 seconds
}, 10000);

// Railway sees: "Server is busy, don't sleep"
// Result: Server NEVER sleeps → Full charges 💸
```

Even though the queue is empty, the `setInterval` creates constant activity that prevents Railway from detecting idle time.

---

## ✅ Solution: External Triggers + Smart Processing

Replace internal polling with external HTTP triggers that let Railway sleep between requests.

### Architecture:

```
┌───────────────────────────────────────────────────────┐
│  External Scheduler (GitHub Actions / Cron-Job.org)  │
│                                                       │
│  Every 15 minutes:                                    │
│  → HTTP POST to Railway URL                          │
└────────────────┬──────────────────────────────────────┘
                 │
                 ↓ HTTP Request
┌───────────────────────────────────────────────────────┐
│  Railway Server (Auto-Sleep Enabled)                  │
│                                                       │
│  Status: SLEEPING 💤                                 │
│    ↓ HTTP request arrives                            │
│  Status: WAKING UP ⚡ (cold start ~1-3s)            │
│    ↓ Processes request                               │
│  Status: PROCESSING 🔄                               │
│    ↓ Returns response                                │
│  Status: IDLE (waiting for sleep timeout)            │
│    ↓ No requests for 5 minutes                       │
│  Status: SLEEPING 💤                                 │
└────────────────┬──────────────────────────────────────┘
                 │
                 ↓ (Only when processing needed)
┌───────────────────────────────────────────────────────┐
│  Neon Postgres (Auto-scales to zero)                 │
│                                                       │
│  Wakes up only when queried                           │
│  Sleeps when idle                                     │
└───────────────────────────────────────────────────────┘

RESULT: Both Railway AND Neon sleep when idle! ✅
```

---

## 🛠️ Implementation for Railway Auto-Sleep

### Step 1: Remove Internal Polling from server.ts

**BEFORE (Prevents Sleep):**
```typescript
// backend/src/server.ts

// ❌ This keeps server awake 24/7
const queueProcessor = new QueueProcessorService();
queueProcessor.start(); // setInterval inside

// ❌ This also prevents sleep
scheduledTaskService.startScheduledTasks();
```

**AFTER (Allows Sleep):**
```typescript
// backend/src/server.ts

// ✅ NO automatic polling - server can sleep
// Queue processing happens via HTTP endpoints only

// Only start scheduled tasks if explicitly enabled
// (and these should run infrequently - once per day)
if (process.env.ENABLE_SCHEDULED_TASKS === 'true') {
  scheduledTaskService.startScheduledTasks({
    enableLowCredits: true,
    enableEmailReminders: true,
    runLowCreditsOnStartup: false,
    runEmailRemindersOnStartup: false
  });
}

console.log('✅ Server ready (auto-sleep enabled)');
```

### Step 2: Create Smart Queue Endpoint

This endpoint will be called by external scheduler:

```typescript
// backend/src/routes/queueProcessing.ts

import { Router } from 'express';
import { smartQueueProcessor } from '../services/SmartQueueProcessor';
import { CampaignScheduleCache } from '../services/CampaignScheduleCache';
import { logger } from '../middleware';

const router = Router();

/**
 * Smart queue processing endpoint for external schedulers
 * Optimized for Railway auto-sleep
 * 
 * - Quick early exit if no work (allows server to sleep)
 * - Only processes queue when campaigns are active
 * - Returns fast to minimize wake time
 */
router.post('/process', async (req, res) => {
  const startTime = Date.now();

  try {
    // STEP 1: Verify webhook signature (optional but recommended)
    const authToken = req.headers['x-webhook-token'];
    if (authToken !== process.env.QUEUE_WEBHOOK_TOKEN) {
      logger.warn('Unauthorized queue processing attempt', {
        ip: req.ip,
        headers: req.headers
      });
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // STEP 2: Quick check - should we process?
    const shouldProcess = await CampaignScheduleCache.shouldProcessQueue();

    if (!shouldProcess) {
      const executionTime = Date.now() - startTime;
      logger.info('⚡ Queue check: No work needed', {
        executionTime,
        reason: 'Outside campaign window or no queued calls'
      });

      // Return quickly - let Railway go back to sleep
      return res.json({
        success: true,
        processed: false,
        reason: 'No campaigns active at this time',
        executionTime,
        dbQueried: false,
        serverCanSleep: true
      });
    }

    // STEP 3: Process queue
    logger.info('🚀 Queue processing started');
    
    await smartQueueProcessor.processQueueImmediate();

    const executionTime = Date.now() - startTime;
    
    logger.info('✅ Queue processing completed', {
      executionTime
    });

    return res.json({
      success: true,
      processed: true,
      executionTime,
      dbQueried: true,
      serverCanSleep: true // Important: Signal that processing is done
    });

  } catch (error) {
    const executionTime = Date.now() - startTime;
    logger.error('❌ Queue processing error', { error, executionTime });
    
    return res.status(500).json({
      success: false,
      error: 'Queue processing failed',
      executionTime
    });
  }
});

/**
 * Immediate processing for user actions
 * Called when user creates campaign or initiates direct call
 */
router.post('/process/immediate', async (req, res) => {
  try {
    const { userId } = req.body;
    
    logger.info('🔥 Immediate queue processing triggered', { userId });

    // Process in background, return immediately
    smartQueueProcessor.processQueueImmediate(userId).catch((error) => {
      logger.error('Background queue processing failed', { error, userId });
    });

    // Return quickly so user doesn't wait
    return res.json({
      success: true,
      message: 'Queue processing initiated',
      userId: userId || 'all'
    });

  } catch (error) {
    logger.error('Immediate queue processing error', { error });
    return res.status(500).json({
      success: false,
      error: 'Failed to initiate queue processing'
    });
  }
});

/**
 * Health check endpoint for external monitors
 * Returns fast to avoid keeping server awake
 */
router.get('/health', async (req, res) => {
  const startTime = Date.now();

  try {
    const stats = CampaignScheduleCache.getCacheStats();
    const executionTime = Date.now() - startTime;

    return res.json({
      success: true,
      status: 'healthy',
      nextWakeTime: stats.nextWakeTime,
      campaignCount: stats.campaignCount,
      executionTime
    });

  } catch (error) {
    logger.error('Health check error', { error });
    return res.status(500).json({
      success: false,
      status: 'unhealthy'
    });
  }
});

export default router;
```

### Step 3: Update server.ts

```typescript
// backend/src/server.ts

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import routes from './routes';
import database from './config/database';
import queueProcessingRoutes from './routes/queueProcessing';
import { CampaignScheduleCache } from './services/CampaignScheduleCache';
import {
  errorHandler,
  notFoundHandler,
  inputSanitization,
  contentSecurityPolicy,
  requestSizeLimit,
  sanitizeRequest,
  requestLogger,
  setupGlobalErrorHandlers,
  logger
} from './middleware';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Setup global error handlers
setupGlobalErrorHandlers();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Routes
app.use('/api', routes);
app.use('/api/queue', queueProcessingRoutes);

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize database and start server
async function initializeDatabase() {
  try {
    await database.initialize();
    logger.info('Database connected successfully');
  } catch (error) {
    logger.error('Database connection failed', { error });
    process.exit(1);
  }
}

const server = app.listen(PORT, async () => {
  try {
    await initializeDatabase();
    
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Initialize campaign schedule cache (quick, no blocking)
    CampaignScheduleCache.forceRefresh().catch((error) => {
      logger.error('Failed to initialize campaign cache', { error });
    });
    
    console.log('📅 Campaign schedule cache initialized');
    
    // ✅ NO setInterval or background polling
    // ✅ Server can sleep when idle
    // ✅ Wakes up only for HTTP requests
    
    console.log('💤 Auto-sleep mode: ENABLED');
    console.log('⚡ Server will sleep when idle');

    // Optional: Scheduled tasks (INFREQUENT only)
    // Only enable if absolutely necessary
    if (process.env.ENABLE_SCHEDULED_TASKS === 'true') {
      const { scheduledTaskService } = await import('./services/scheduledTaskService');
      scheduledTaskService.startScheduledTasks({
        enableLowCredits: true,      // Runs once per 24 hours
        enableEmailReminders: true,  // Runs once per 6 hours
        runLowCreditsOnStartup: false,
        runEmailRemindersOnStartup: false
      });
      console.log('⏰ Scheduled tasks enabled (infrequent)');
    } else {
      console.log('⏰ Scheduled tasks disabled (recommended for auto-sleep)');
    }

  } catch (error) {
    logger.error('Server startup error', { error });
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
```

### Step 4: Update Environment Variables

```bash
# backend/.env

# Railway Auto-Sleep Configuration
ENABLE_POLLING_QUEUE=false         # ✅ Must be false for auto-sleep
ENABLE_SCHEDULED_TASKS=false       # ✅ Disable to allow sleep
RAILWAY_AUTOSLEEP_ENABLED=true     # Railway-specific flag

# Queue Webhook Security
QUEUE_WEBHOOK_TOKEN=your-secret-token-here

# Campaign Schedule Cache
CAMPAIGN_CACHE_TTL=600000          # 10 minutes

# Neon Connection Pool (optimized for auto-sleep)
DATABASE_POOL_MIN=0                # Allow scaling to zero
DATABASE_POOL_MAX=5                # Lower max for less overhead
DATABASE_IDLE_TIMEOUT=10000        # Close connections quickly (10s)

# Timezone
APP_TIMEZONE=Asia/Kolkata
TZ=Asia/Kolkata
```

---

## 🌐 External Scheduler Options

Since Railway will sleep, you need an external service to wake it up. Here are the best options:

### Option 1: GitHub Actions (FREE, RECOMMENDED)

Create a workflow that triggers your Railway endpoint:

```yaml
# .github/workflows/queue-processor.yml

name: Queue Processor

on:
  schedule:
    - cron: '*/15 * * * *'  # Every 15 minutes
  workflow_dispatch:  # Manual trigger option

jobs:
  trigger-queue:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Railway Queue Processing
        run: |
          curl -X POST https://your-app.railway.app/api/queue/process \
            -H "Content-Type: application/json" \
            -H "x-webhook-token: ${{ secrets.QUEUE_WEBHOOK_TOKEN }}" \
            -w "\nHTTP Status: %{http_code}\n" \
            -o response.json
          
          cat response.json
          
      - name: Check Response
        run: |
          success=$(jq -r '.success' response.json)
          if [ "$success" != "true" ]; then
            echo "Queue processing failed"
            exit 1
          fi
```

**Setup:**
1. Add `QUEUE_WEBHOOK_TOKEN` to GitHub repository secrets
2. Commit the workflow file
3. GitHub will automatically trigger it every 15 minutes
4. FREE forever (GitHub Actions free tier is generous)

### Option 2: Cron-Job.org (FREE)

1. Go to https://cron-job.org
2. Create free account
3. Add new cron job:
   - URL: `https://your-app.railway.app/api/queue/process`
   - Method: `POST`
   - Headers: `x-webhook-token: your-secret-token`
   - Schedule: Every 15 minutes
4. Enable notification on failure

**Pros:**
- ✅ Dead simple setup
- ✅ Free forever
- ✅ Email alerts on failure

### Option 3: Uptime Robot (FREE + Monitoring)

1. Go to https://uptimerobot.com
2. Create free account
3. Add monitor:
   - Type: HTTP(s)
   - URL: `https://your-app.railway.app/api/queue/process`
   - Method: POST
   - Headers: `x-webhook-token: your-secret-token`
   - Interval: 15 minutes

**Pros:**
- ✅ Free tier: 50 monitors
- ✅ Also monitors server health
- ✅ Email/SMS alerts on downtime

### Option 4: EasyCron (FREE)

1. Go to https://www.easycron.com
2. Create free account
3. Add cron job with webhook URL

**Pros:**
- ✅ Simple interface
- ✅ Free tier available

---

## 📊 Railway Auto-Sleep Behavior

### How Railway Decides to Sleep:

```
Railway monitors:
├─ HTTP requests (keeps awake)
├─ Active connections (keeps awake)
├─ CPU usage (keeps awake)
└─ Memory usage (keeps awake)

If ALL are idle for 5 minutes → Server SLEEPS
```

### What Keeps Railway Awake (AVOID):

❌ `setInterval()` - Creates constant activity
❌ `setTimeout()` - If recursive
❌ Open WebSocket connections
❌ Active database connection pools (if min > 0)
❌ Background workers
❌ Cron jobs running inside server

### What Allows Railway to Sleep (DO):

✅ HTTP endpoints only
✅ Request-response pattern
✅ Database pool with `min: 0`
✅ Quick responses (< 30s)
✅ External schedulers triggering HTTP

---

## 🔄 Complete Flow Example

### Scenario: Campaign with 100 calls, 9 AM - 5 PM

```
Day 1 - User Creates Campaign (9:00 PM):
├─ User: POST /api/campaigns/create
├─ Railway: Wakes up (was sleeping)
├─ Server: Creates campaign, queues 100 calls
├─ Cache: next_wake = 9:00 AM tomorrow
├─ Response: Campaign created ✅
├─ Railway: Idle for 5 min → SLEEPS 💤
└─ Cost: ~1 minute of compute

Night (9:00 PM - 9:00 AM):
├─ 9:15 PM: GitHub Actions triggers /api/queue/process
│   ├─ Railway: Wakes up (cold start ~2s)
│   ├─ Server: Checks cache → "next_wake: 9 AM"
│   ├─ Response: "No work" (50ms)
│   ├─ Railway: Idle for 5 min → SLEEPS 💤
│   └─ Cost: ~10 seconds of compute
│
├─ 9:30 PM: Repeat above
├─ 9:45 PM: Repeat above
│   ... (Server wakes, checks, sleeps - all night)
│
└─ Total overnight cost: ~40 wake-ups × 10s = 400s = $0.07

Day 2 - Campaign Starts (9:00 AM):
├─ 9:00 AM: GitHub Actions triggers /api/queue/process
│   ├─ Railway: Wakes up
│   ├─ Server: "Time to process!"
│   ├─ Neon: Wakes up
│   ├─ Processing: Initiates 2 concurrent calls
│   ├─ Response: "Processed" (3s)
│   ├─ Railway: Stays awake (has active calls)
│   └─ Cost: Continuous from 9 AM - 5 PM
│
├─ 9:00 AM - 5:00 PM: Server stays awake processing calls
│   └─ Cost: 8 hours × 60 min = 480 minutes
│
├─ 5:00 PM: Last call completes
│   ├─ Calls left: 20 (will resume tomorrow)
│   ├─ Cache: next_wake = 9:00 AM tomorrow
│   ├─ Railway: Idle for 5 min → SLEEPS 💤
│
└─ 5:15 PM onwards: Back to sleep cycle (like night)

Day 3 - Campaign Resumes (9:00 AM):
├─ Repeat Day 2 process
└─ Completes remaining 20 calls
```

### Daily Cost Breakdown:

```
Day 1 (Campaign Created at Night):
├─ Campaign creation: 1 min
├─ Overnight checks: 7 min (42 × 10s wake-ups)
└─ Total: 8 minutes = $0.03

Day 2 (Campaign Active):
├─ Active processing: 480 min (8 hours)
├─ Overnight checks: 7 min
└─ Total: 487 minutes = $2.00

Day 3 (Campaign Completes):
├─ Active processing: 60 min (1 hour for 20 calls)
├─ Overnight checks: 7 min
└─ Total: 67 minutes = $0.27

Campaign Total: $2.30 for 100 calls
Monthly with 10 campaigns: ~$23
```

Compare to 24/7 running:
- 24/7: 30 days × 24 hours = 720 hours = $29.50
- Auto-sleep: ~23 hours active = $9.50
- **Savings: 68%** 🎉

---

## ⚡ Optimization Tips for Maximum Sleep Time

### 1. Fast Response Times
```typescript
// ✅ GOOD: Quick check, return immediately
if (!shouldProcess) {
  return res.json({ success: true, processed: false });
}

// ❌ BAD: Slow operations in every request
await heavyAnalytics(); // Don't do this
await sendEmails(); // Do async in background
```

### 2. Lazy Database Connections
```typescript
// ✅ GOOD: Connection pool with min: 0
const pool = new Pool({
  min: 0,  // No minimum connections
  max: 5,  // Lower max
  idleTimeoutMillis: 10000  // Close quickly
});

// ❌ BAD: Keeps connections alive
const pool = new Pool({
  min: 2,  // Always keeps 2 connections open
  max: 20
});
```

### 3. Disable Unnecessary Background Tasks
```typescript
// ✅ GOOD: No background tasks
// Let external scheduler handle everything

// ❌ BAD: Background tasks prevent sleep
setInterval(() => checkHealth(), 60000);
setInterval(() => cleanupOldData(), 300000);
```

### 4. Cache Wisely
```typescript
// ✅ GOOD: Quick in-memory check
const cached = memoryCache.get('next_wake');
if (cached) return cached;

// ✅ ALSO GOOD: Use Redis for persistence
const cached = await redis.get('next_wake');

// ❌ BAD: Always query database
const result = await db.query('SELECT ...');
```

---

## 🔧 Railway Configuration

### railway.toml (Optional but Recommended)

```toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "npm run start"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3

# Health check (Railway will ping this to check if server is up)
healthcheckPath = "/api/queue/health"
healthcheckTimeout = 30

# Auto-sleep configuration
# Note: Railway auto-detects idle state, no explicit config needed
# Just ensure no background processes running
```

### Environment Variables in Railway Dashboard:

```
ENABLE_POLLING_QUEUE=false
ENABLE_SCHEDULED_TASKS=false
RAILWAY_AUTOSLEEP_ENABLED=true
QUEUE_WEBHOOK_TOKEN=<generate-secure-token>
DATABASE_URL=<your-neon-postgres-url>
DATABASE_POOL_MIN=0
DATABASE_POOL_MAX=5
NODE_ENV=production
```

---

## 📊 Monitoring Auto-Sleep Effectiveness

### Check Railway Metrics:

1. **Deployment Metrics** in Railway dashboard
   - Look at "Active Time" vs "Total Time"
   - Should see gaps (sleep periods)

2. **Custom Logging:**
```typescript
// Add to your queue endpoint
logger.info('Queue processing stats', {
  executionTime: Date.now() - startTime,
  processed: result.processed,
  dbQueried: result.dbQueried,
  timestamp: new Date().toISOString()
});
```

3. **Cost Analysis:**
```sql
-- Query to see campaign processing patterns
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as calls_processed,
  AVG(duration_seconds) as avg_duration
FROM calls
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY hour
ORDER BY hour;
```

This shows when your system is actually busy vs idle.

---

## ✅ Implementation Checklist for Railway Auto-Sleep

- [ ] Remove `setInterval` from `QueueProcessorService`
- [ ] Update `server.ts` to disable automatic polling
- [ ] Set `ENABLE_POLLING_QUEUE=false` in Railway
- [ ] Set `ENABLE_SCHEDULED_TASKS=false` in Railway
- [ ] Create `/api/queue/process` endpoint with smart checking
- [ ] Implement `CampaignScheduleCache` service
- [ ] Implement `SmartQueueProcessor` service
- [ ] Set `DATABASE_POOL_MIN=0` in environment
- [ ] Set up external scheduler (GitHub Actions recommended)
- [ ] Generate and configure `QUEUE_WEBHOOK_TOKEN`
- [ ] Test: Create campaign, verify overnight sleep
- [ ] Test: Campaign resumption next day
- [ ] Monitor Railway metrics for sleep effectiveness
- [ ] Verify Neon compute hours reduction

---

## 🎯 Expected Results

### Before (Polling):
```
Railway uptime: 100% (720 hours/month)
Railway cost: $29.50/month
Neon compute: 720 hours/month ($43-86)
Total: $72.50-$115.50/month
```

### After (Auto-Sleep):
```
Railway uptime: 30-40% (220-290 hours/month)
Railway cost: $9-12/month
Neon compute: 240 hours/month ($14-29)
Total: $23-41/month

Savings: $49-74/month (67-73% reduction!) 💰
```

---

## 🚀 Ready to Implement?

The beauty of this approach:
- ✅ Simple deployment on Railway (no Vercel migration)
- ✅ Leverages Railway's built-in auto-sleep
- ✅ Free external scheduler (GitHub Actions)
- ✅ Both Railway AND Neon sleep when idle
- ✅ Automatic campaign resumption still works
- ✅ Immediate processing for user actions
- ✅ 67-73% cost savings

**Want me to implement this in your codebase?** I can:
1. Update `server.ts` to disable polling
2. Create the smart queue processing services
3. Set up the GitHub Actions workflow
4. Configure environment variables
5. Test the auto-sleep behavior

Let me know and I'll start the implementation! 🎉
