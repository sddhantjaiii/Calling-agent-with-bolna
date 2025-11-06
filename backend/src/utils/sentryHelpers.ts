import crypto from 'crypto';

const HASH_SALT = process.env.SENTRY_HASH_SALT || 'change-this-in-production-abc123xyz';

/**
 * Hash user ID for privacy-safe Sentry reporting
 * Allows grouping by user without exposing actual user ID
 */
export function hashUserId(userId: string): string {
  return crypto
    .createHash('sha256')
    .update(userId + HASH_SALT)
    .digest('hex')
    .slice(0, 16); // First 16 chars for shorter tags
}

/**
 * Hash phone number for privacy-safe Sentry reporting
 * Allows tracking call issues without exposing actual phone numbers
 */
export function hashPhoneNumber(phoneNumber: string): string {
  return crypto
    .createHash('sha256')
    .update(phoneNumber + HASH_SALT)
    .digest('hex')
    .slice(0, 12); // First 12 chars
}

/**
 * Sanitize SQL query preview before sending to Sentry
 * Redacts sensitive data from query strings
 */
export function sanitizeQuery(query: string): string {
  return query
    // Redact password fields
    .replace(/password\s*=\s*'[^']*'/gi, "password='[REDACTED]'")
    .replace(/password\s*=\s*"[^"]*"/gi, 'password="[REDACTED]"')
    // Redact API keys
    .replace(/api_key\s*=\s*'[^']*'/gi, "api_key='[REDACTED]'")
    .replace(/api_key\s*=\s*"[^"]*"/gi, 'api_key="[REDACTED]"')
    // Redact tokens
    .replace(/token\s*=\s*'[^']*'/gi, "token='[REDACTED]'")
    .replace(/token\s*=\s*"[^"]*"/gi, 'token="[REDACTED]"')
    // Redact secrets
    .replace(/secret\s*=\s*'[^']*'/gi, "secret='[REDACTED]'")
    .replace(/secret\s*=\s*"[^"]*"/gi, 'secret="[REDACTED]"')
    // Redact email addresses
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
    // Limit length
    .substring(0, 200);
}

/**
 * Check if error should be filtered out (business logic, not bugs)
 * Returns true if error should NOT be sent to Sentry
 */
export function shouldFilterError(error: Error, statusCode?: number): boolean {
  const message = error.message.toLowerCase();
  
  // Only filter 404 errors (user requested non-existent resource)
  // These are expected when user navigates to wrong URL or requests deleted resource
  if (statusCode === 404) {
    return (
      message.includes('not found') ||
      message.includes('does not exist')
    );
  }
  
  // Filter validation errors (client-side issues, not bugs)
  if (
    message.includes('validation failed') || 
    message.includes('invalid input') ||
    message.includes('missing required field') ||
    message.includes('invalid format')
  ) {
    return true;
  }
  
  // Filter rate limit errors (expected behavior)
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return true;
  }
  
  // Filter concurrency limit (expected business logic)
  if (message.includes('concurrency limit')) {
    return true;
  }
  
  // DON'T filter anything else - it's likely a bug!
  return false;
}

/**
 * Sanitize metadata object for Sentry
 * Removes PII and sensitive data from metadata
 */
export function sanitizeMetadata(metadata: any): any {
  if (!metadata) return {};
  
  const sanitized = { ...metadata };
  
  // Remove sensitive fields
  const sensitiveFields = [
    'password', 'token', 'api_key', 'apiKey', 'secret',
    'credit_card', 'ssn', 'phone', 'phoneNumber', 'email',
    'address', 'user_data', 'customer_data'
  ];
  
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  return sanitized;
}
