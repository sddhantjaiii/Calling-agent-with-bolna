// Import Sentry before anything else
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { shouldFilterError, sanitizeQuery } from './utils/sentryHelpers';

// Initialize Sentry as early as possible
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  
  // Environment
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
  
  // CRITICAL: Only send errors from production
  enabled: process.env.NODE_ENV === 'production',
  
  // Integrations
  integrations: [
    nodeProfilingIntegration(),
  ],

  // Send structured logs to Sentry
  enableLogs: process.env.SENTRY_ENABLE_LOGS === 'true',
  
  // Tracing - environment-specific sample rates
  tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '1.0'),
  
  // Profiling - environment-specific sample rates
  profileSessionSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '1.0'),
  
  // Trace lifecycle automatically enables profiling during active traces
  profileLifecycle: 'trace',
  
  // PII (Personally Identifiable Information)
  // Set to false by default for privacy compliance
  sendDefaultPii: process.env.SENTRY_SEND_DEFAULT_PII === 'true',
  
  // Release tracking (useful for source maps later)
  release: process.env.SENTRY_RELEASE || `calling-agent-backend@${process.env.npm_package_version || '1.0.0'}`,
  
  // Additional context
  beforeSend(event, hint) {
    // Filter out development/test environments
    if (process.env.NODE_ENV !== 'production') {
      return null;
    }

    // Filter out 4xx client errors (not bugs)
    if (event.contexts?.response?.status_code && event.contexts.response.status_code < 500) {
      return null;
    }

    // Use smart filtering - only filter expected business errors
    const error = hint.originalException;
    if (error instanceof Error) {
      const statusCode = (hint.originalException as any)?.statusCode;
      
      // This will only filter:
      // - 404 errors (user requested non-existent resource)
      // - Validation errors (client-side issues)
      // - Rate limit errors (expected behavior)
      // - Concurrency limit errors (expected behavior)
      if (shouldFilterError(error, statusCode)) {
        return null;
      }
    }

    // Remove sensitive data from request body
    if (event.request?.data) {
      const data = typeof event.request.data === 'string' 
        ? JSON.parse(event.request.data) 
        : event.request.data;
      
      // Remove all potentially sensitive fields
      const sensitiveFields = [
        'password', 'token', 'api_key', 'apiKey', 'secret',
        'credit_card', 'creditCard', 'ssn', 'phone', 'phoneNumber', 
        'email', 'address', 'oauth_token', 'refresh_token'
      ];
      
      sensitiveFields.forEach(field => {
        if (data[field]) {
          data[field] = '[REDACTED]';
        }
      });
      
      event.request.data = data;
    }

    // Remove sensitive headers
    if (event.request?.headers) {
      const sensitiveHeaders = [
        'authorization', 'cookie', 'x-api-key', 'x-auth-token',
        'x-access-token', 'x-refresh-token'
      ];
      
      sensitiveHeaders.forEach(header => {
        if (event.request?.headers?.[header]) {
          event.request.headers[header] = '[Filtered]';
        }
      });
    }

    // Sanitize database queries in contexts
    if (event.contexts?.database_query?.query_preview && 
        typeof event.contexts.database_query.query_preview === 'string') {
      event.contexts.database_query.query_preview = 
        sanitizeQuery(event.contexts.database_query.query_preview);
    }

    return event;
  },
});

console.log('🔍 Sentry initialized:', {
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE,
  profilesSampleRate: process.env.SENTRY_PROFILES_SAMPLE_RATE,
  dsn: process.env.SENTRY_DSN ? '***configured***' : '❌ MISSING',
});

export default Sentry;
