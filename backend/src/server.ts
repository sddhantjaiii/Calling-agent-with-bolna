// CRITICAL: Load environment variables FIRST
import dotenv from 'dotenv';
dotenv.config();

// CRITICAL: Import instrument.ts AFTER dotenv, before everything else
import './instrument';

// Now import Sentry for middleware
import * as Sentry from '@sentry/node';

// All other imports below
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes';
import database from './config/database';
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
import { performanceMonitoring, addPerformanceEndpoints } from './middleware/performanceMonitoring';
import { scheduledTaskService } from './services/scheduledTaskService';
import { webhookRetryService } from './services/webhookRetryService';
import { QueueProcessorService } from './services/QueueProcessorService';
import { configService } from './services/configService';
import MigrationRunner from './utils/migrationRunner';

// Environment variables already loaded at the top of this file

// Set timezone for the Node.js process - critical for Vercel deployment
// This ensures all Date operations use UTC for consistent storage
// NOTE: This is the SERVER default timezone. User-specific timezones are cached and used per-request.
process.env.TZ = 'UTC'; // Always force UTC for consistent behavior
logger.info('Server process timezone set to: UTC (user-specific timezones are cached per-request)');
console.log('🌍 Server process timezone: UTC (users can have their own timezones)');

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL;

// Parse multiple frontend URLs from environment variable
const FRONTEND_URLS = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
  : [];

// Setup global error handlers
setupGlobalErrorHandlers();

// Initialize database connection
async function initializeDatabase() {
  try {
    await database.initialize();
    logger.info('Database connection established');
    console.log('✅ Database connection established');
  } catch (error) {
    logger.error('Failed to initialize database', { error: error instanceof Error ? error.message : error });
    console.error('❌ Failed to initialize database:', error);
    process.exit(1);
  }
}

// Run database migrations
async function runMigrations() {
  try {
    console.log('🔄 Running database migrations on server startup...');
    const migrationRunner = new MigrationRunner();
    await migrationRunner.runMigrations();
    logger.info('Database migrations completed successfully');
    console.log('✅ Database migrations completed');
  } catch (error) {
    logger.error('Failed to run database migrations', { error: error instanceof Error ? error.message : error });
    console.error('❌ Failed to run database migrations:', error);
    process.exit(1);
  }
}

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Security middleware - order matters!
app.use(helmet({
  contentSecurityPolicy: false, // We'll use our custom CSP
  crossOriginEmbedderPolicy: false // Allow embedding for development
}));

// Content Security Policy
app.use(contentSecurityPolicy);

// Request size limiting
app.use(requestSizeLimit('10mb'));

// Rate limiting will be applied within routes after authentication
// This allows user-based rate limiting for authenticated requests

// Enhanced CORS configuration for frontend integration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    // Parse allowed origins from environment variables
    const corsOrigins = process.env.CORS_ORIGIN 
      ? process.env.CORS_ORIGIN.split(',').map(url => url.trim())
      : [];

    // In dev, optionally allow common localhost origins if DEV_ALLOW_LOCALHOST=true
    const devLocalhost = (process.env.NODE_ENV !== 'production' && process.env.DEV_ALLOW_LOCALHOST === 'true')
      ? ['http://localhost:8080','http://localhost:3000','http://127.0.0.1:8080','http://127.0.0.1:3000']
      : [];

    const allowedOrigins = [
      ...FRONTEND_URLS,
      ...corsOrigins,
      ...devLocalhost
    ];

    // Remove duplicates from allowed origins
    const uniqueAllowedOrigins = [...new Set(allowedOrigins)];
    
    if (uniqueAllowedOrigins.includes(origin)) {
      console.log(`✅ CORS allowed origin: ${origin}`);
      callback(null, true);
    } else {
      console.warn(`❌ CORS blocked origin: ${origin}`);
      console.log(`📝 Allowed origins: ${uniqueAllowedOrigins.join(', ')}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Cache-Control',
    'X-File-Name'
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset'
  ],
  maxAge: 86400 // 24 hours
}));

// Body parsing middleware
// Special handling for Stripe webhooks - they need raw body for signature verification
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));

// Skip JSON parsing entirely for upload routes
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';

  // Debug logging for upload routes
  if (req.path.includes('/upload')) {
    console.log('🔄 Server middleware - Upload route detected:', {
      path: req.path,
      method: req.method,
      contentType: contentType,
      contentLength: req.headers['content-length'],
      skipJsonParsing: true
    });
    return next(); // Skip all JSON processing for uploads
  }

  // Skip JSON parsing for multipart form data
  if (contentType.includes('multipart/form-data') ||
    contentType.includes('application/octet-stream')) {
    console.log('🔄 Server middleware - Multipart detected, skipping JSON parsing');
    return next();
  }

  // Only apply JSON parsing for actual JSON content
  if (contentType.includes('application/json') || contentType === '') {
    express.json({
      limit: '10mb',
      verify: (req, res, buf) => {
        // Allow empty bodies for POST requests
        if (buf.length === 0) {
          return;
        }
        try {
          JSON.parse(buf.toString());
        } catch (e) {
          (res as express.Response).status(400).json({
            error: {
              code: 'INVALID_JSON',
              message: 'Invalid JSON in request body',
              timestamp: new Date().toISOString()
            }
          });
          return;
        }
      }
    })(req, res, next);
  } else {
    next();
  }
});

app.use(express.urlencoded({
  extended: true,
  limit: '10mb',
  parameterLimit: 100 // Limit number of parameters
}));

// Input sanitization middleware (applied after body parsing)
app.use(sanitizeRequest);

// Input validation and sanitization for security
app.use(inputSanitization());

// Timezone detection middleware (detects from IP/browser)
import { timezoneDetectionMiddleware } from './middleware/timezoneDetection';
app.use(timezoneDetectionMiddleware);

// Request logging middleware
app.use(requestLogger);

// Real-time monitoring middleware (tracks response times, errors, connections)
import { monitoringService } from './services/monitoringService';
app.use(monitoringService.trackRequest);

// Track user activity for connection pool optimization
import { trackUserActivity } from './middleware/trackUserActivity';
app.use(trackUserActivity);

// Performance monitoring middleware (after request logging)
app.use(performanceMonitoring);

// Add performance data to health endpoints
app.use(addPerformanceEndpoints);

// Sentry middleware will be automatically set up via setupExpressErrorHandler

// Health check endpoint with enhanced monitoring
app.get('/health', (_req, res) => {
  const memoryUsage = process.memoryUsage();
  const memoryInMB = {
    rss: Math.round(memoryUsage.rss / 1024 / 1024),
    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    external: Math.round(memoryUsage.external / 1024 / 1024)
  };

  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: Math.round(process.uptime()),
    memory: memoryUsage,
    memoryMB: memoryInMB,
    pid: process.pid,
    sentry: {
      enabled: process.env.NODE_ENV === 'production',
      environment: process.env.SENTRY_ENVIRONMENT,
      configured: !!process.env.SENTRY_DSN
    }
  });
});

// Development-only rate limit reset endpoint
if (process.env.NODE_ENV === 'development') {
  app.post('/dev/reset-rate-limits', (req, res) => {
    // Clear the rate limit store
    const { clearRateLimitStore } = require('./middleware/rateLimit');
    if (clearRateLimitStore) {
      clearRateLimitStore();
    }
    res.json({
      message: 'Rate limits cleared',
      clientIp: req.ip,
      timestamp: new Date().toISOString()
    });
  });
}

// API routes
app.use('/api', routes);

// Sentry error handler - must be AFTER routes, BEFORE custom error handlers
Sentry.setupExpressErrorHandler(app);

// Custom error handling middleware (existing - keep this)
app.use(errorHandler);

// 404 handler
app.use('*', notFoundHandler);

// Start server after database initialization
async function startServer() {
  await initializeDatabase();

  // Run database migrations before starting the server
  await runMigrations();

  // Clear rate limits on server startup to unblock any previously blocked IPs
  const { clearRateLimitStore } = require('./middleware/rateLimit');
  if (clearRateLimitStore) {
    clearRateLimitStore();
    console.log('🔓 Rate limits cleared on server startup');
  }

  const server = app.listen(PORT, async () => {
    const startupInfo = {
      port: PORT,
      frontendUrl: FRONTEND_URL,
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      pid: process.pid
    };

    logger.info('Server started successfully', startupInfo);
    console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Frontend URL: ${FRONTEND_URL || '(not set)'}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    const printedCorsOrigins = [
      ...FRONTEND_URLS,
      ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(url => url.trim()) : []),
      ...((process.env.NODE_ENV !== 'production' && process.env.DEV_ALLOW_LOCALHOST === 'true') ? ['http://localhost:8080','http://localhost:8081','http://localhost:8082','http://localhost:5173'] : [])
    ];
    
    // Initialize system configuration from database
    try {
      await configService.initialize();
      console.log('🔧 System configuration initialized successfully');
    } catch (error) {
      console.error('⚠️ Failed to initialize system configuration:', error);
    }

    // Start session cleanup service
    const { authService } = await import('./services/authService');
    authService.startSessionCleanup();
    console.log('🔄 Session cleanup service started');
    console.log(`🔒 CORS Origins: ${[...new Set(printedCorsOrigins)].join(', ')}`);

    // Start scheduled tasks with per-task flags; if ENABLE_SCHEDULED_TASKS is explicitly false, skip
    try {
      const gate = process.env.ENABLE_SCHEDULED_TASKS;
      if (gate && gate !== 'true') {
        logger.info('Scheduled tasks are disabled by configuration', {
          reason: 'ENABLE_SCHEDULED_TASKS=false'
        });
      } else {
        // When gate is true or unset, defer to per-task env flags inside the service
        scheduledTaskService.startScheduledTasks();
        logger.info('Scheduled tasks initialized (per-task flags will decide actual scheduling)');
      }
    } catch (error) {
      logger.error('Failed to start scheduled tasks', { error });
    }

    // Start webhook retry processor
    try {
      webhookRetryService.startRetryProcessor();
      logger.info('Webhook retry processor started');
    } catch (error) {
      logger.error('Failed to start webhook retry processor', { error });
    }

    // Start in-memory campaign scheduler (REPLACES polling queue processor)
    // This scheduler wakes database only when campaigns need processing
    // Reduces Neon compute hours by 60-70%
    const enableScheduler = process.env.ENABLE_IN_MEMORY_SCHEDULER !== 'false';
    
    if (enableScheduler) {
      try {
        const { campaignScheduler } = await import('./services/InMemoryCampaignScheduler');
        await campaignScheduler.initialize();
        logger.info('In-Memory Campaign Scheduler started');
        console.log('📅 In-Memory Campaign Scheduler started (smart database wake-up)');
        console.log('💤 Database will sleep when no campaigns are active');
      } catch (error) {
        logger.error('Failed to start campaign scheduler', { error });
        console.error('❌ Failed to start campaign scheduler:', error);
        
        // Fallback to old polling if scheduler fails
        console.log('⚠️ Falling back to polling queue processor');
        const queueProcessor = new QueueProcessorService();
        queueProcessor.start();
      }
    } else {
      logger.info('In-Memory Campaign Scheduler disabled by configuration');
      console.log('⚠️ Using legacy polling queue processor (ENABLE_IN_MEMORY_SCHEDULER=false)');
      const queueProcessor = new QueueProcessorService();
      queueProcessor.start();
    }

    // Start database notification listener for cache invalidation
    // TEMPORARILY DISABLED - potential memory leak/connection issue
    // try {
    //   await databaseNotificationListener.startListening();
    //   logger.info('Database notification listener started');
    // } catch (error) {
    //   logger.error('Failed to start database notification listener', { error });
    // }
  });

  // Handle server errors
  server.on('error', (error: any) => {
    logger.error('Server error', { error: error.message, code: error.code });
    console.error('Server error:', error);
  });

  return server;
}

// Handle graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully`);
  console.log(`${signal} received, shutting down gracefully`);

  try {
    // Flush Sentry events before shutdown (wait up to 2 seconds for events to send)
    await Sentry.close(2000);
    logger.info('Sentry events flushed');

    // Stop campaign scheduler
    const { campaignScheduler } = await import('./services/InMemoryCampaignScheduler');
    campaignScheduler.stop();
    logger.info('Campaign scheduler stopped');

    // Stop scheduled tasks
    scheduledTaskService.stopScheduledTasks();
    logger.info('Scheduled tasks stopped');

    // Stop session cleanup service
    const { authService } = await import('./services/authService');
    authService.stopSessionCleanup();
    logger.info('Session cleanup service stopped');

    // Stop webhook retry processor
    webhookRetryService.stopRetryProcessor();
    logger.info('Webhook retry processor stopped');

    // Stop database notification listener
    // TEMPORARILY DISABLED - potential memory leak/connection issue
    // await databaseNotificationListener.stopListening();
    // logger.info('Database notification listener stopped');

    // Close database connection
    await database.close();
    logger.info('Database connection closed');

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', { error });
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer().catch((error) => {
  logger.error('Failed to start server', { error: error.message, stack: error.stack });
  console.error('Failed to start server:', error);
  process.exit(1);
});

export default app;