# 🔒 Sentry Implementation - Security Audit & Bug Analysis

## Date: November 5, 2025
## Status: CRITICAL ISSUES FOUND ⚠️

---

## 🚨 CRITICAL VULNERABILITIES FOUND

### 1. ❌ **SECURITY ISSUE: Filter Logic Bug in instrument.ts**

**Location**: `backend/src/instrument.ts` - Line 48-73

**Problem**: The `beforeSend` filter is **TOO AGGRESSIVE** and filtering out REAL bugs!

```typescript
// ❌ WRONG: This filters "agent not found" completely
if (message.includes('agent not found')) {
  return null;  // This is actually a BUG - agent should exist!
}
```

**Why This Is Wrong**:
- "Agent not found" when user tries to make a call = **REAL BUG** (deleted agent, data inconsistency)
- "Contact not found" during campaign = **REAL BUG** (orphaned contact reference)
- "Campaign not found" in queue = **REAL BUG** (data integrity issue)

**Impact**: 
- 🔴 Missing critical bugs in production
- 🔴 Data corruption issues won't be reported
- 🔴 User-facing errors won't be monitored

**Current Filter Logic**:
```typescript
// These should NOT all be filtered!
if (message.includes('agent not found')) return null;      // ❌ TOO BROAD
if (message.includes('contact not found')) return null;    // ❌ TOO BROAD  
if (message.includes('campaign not found')) return null;   // ❌ TOO BROAD
```

---

### 2. ❌ **SECURITY ISSUE: Phone Numbers in Sentry Events**

**Location**: Multiple files - `callService.ts`, `QueueProcessorService.ts`

**Problem**: Phone numbers are truncated BUT still potentially identifiable as PII

```typescript
// Current implementation
phoneNumber: callRequest.phoneNumber.slice(-4)  // Last 4 digits

// Sentry event will show:
{
  phoneNumber: "5678"  // ⚠️ Still PII if combined with user_id
}
```

**GDPR/Privacy Risk**:
- Last 4 digits + user ID = can re-identify users
- Violates "data minimization" principle
- Potential compliance issue (GDPR, CCPA, HIPAA)

**Better Approach**:
```typescript
// Option 1: Hash the phone number
phoneNumber: crypto.createHash('sha256')
  .update(callRequest.phoneNumber)
  .digest('hex')
  .slice(0, 8)  // First 8 chars of hash

// Option 2: Just indicate if present
hasPhoneNumber: !!callRequest.phoneNumber

// Option 3: Remove completely
// Don't send phone number to Sentry at all
```

---

### 3. ⚠️ **LOGICAL BUG: Missing Error Context in Credit Operations**

**Location**: `backend/src/services/userService.ts` - Lines 345-425

**Problem**: Credit operations don't capture the **current balance** before/after

```typescript
// Current implementation
Sentry.captureException(error, {
  contexts: {
    credit_operation: {
      operation: 'deduct',
      user_id: userId,
      amount: amount,  // ✅ Good
      // ❌ MISSING: current_balance before operation
      // ❌ MISSING: expected_balance after operation
      // ❌ MISSING: transaction_id
    }
  }
});
```

**Impact**:
- Can't debug credit bugs (did user have enough credits?)
- Can't trace negative balance issues
- Can't audit credit transactions

**Better Context**:
```typescript
const user = await UserModel.findById(userId);
const currentBalance = user.credits;

Sentry.captureException(error, {
  contexts: {
    credit_operation: {
      operation: 'deduct',
      user_id: userId,
      amount_to_deduct: amount,
      balance_before: currentBalance,
      balance_after: currentBalance - amount,
      would_go_negative: (currentBalance - amount) < 0,
      timestamp: new Date().toISOString()
    }
  }
});
```

---

### 4. ⚠️ **LOGICAL BUG: Database Query Preview May Leak Sensitive Data**

**Location**: `backend/src/services/connectionPoolService.ts` - Line 320

**Problem**: SQL query preview sent to Sentry may contain sensitive data

```typescript
// Current implementation
Sentry.captureException(error, {
  contexts: {
    database_query: {
      query_preview: text.substring(0, 200),  // ⚠️ May contain passwords!
      // Example: "UPDATE users SET password='secret123' WHERE..."
    }
  }
});
```

**Risk**:
- Passwords in UPDATE queries
- API keys in INSERT queries
- Sensitive user data in WHERE clauses

**Better Approach**:
```typescript
// Redact sensitive patterns from query preview
function sanitizeQuery(query: string): string {
  return query
    .replace(/password\s*=\s*'[^']*'/gi, "password='[REDACTED]'")
    .replace(/api_key\s*=\s*'[^']*'/gi, "api_key='[REDACTED]'")
    .replace(/token\s*=\s*'[^']*'/gi, "token='[REDACTED]'")
    .substring(0, 200);
}

Sentry.captureException(error, {
  contexts: {
    database_query: {
      query_preview: sanitizeQuery(text),  // ✅ Safe
    }
  }
});
```

---

### 5. ⚠️ **PERFORMANCE ISSUE: Sentry Spans May Impact Performance**

**Location**: Multiple files - `callService.ts`, `bolnaService.ts`, `QueueProcessorService.ts`

**Problem**: Creating Sentry spans for EVERY operation adds overhead

```typescript
// Current implementation - creates span for every call
return await Sentry.startSpan({ ... }, async () => {
  // Call logic
});
```

**Impact**:
- Adds 1-5ms latency per operation
- Memory overhead for span storage
- Can slow down high-throughput endpoints

**Recommendation**:
- Use spans only for critical operations
- Consider sample rate for spans (e.g., 10% of calls)
- Use breadcrumbs for high-frequency operations

```typescript
// Better approach for high-frequency operations
if (Math.random() < 0.1) {  // 10% sample rate
  return await Sentry.startSpan({ ... }, async () => { ... });
} else {
  // Just use breadcrumbs (lower overhead)
  Sentry.addBreadcrumb({ ... });
  // Execute normally
}
```

---

### 6. ⚠️ **MISSING: Webhook Payload Sanitization**

**Location**: `backend/src/controllers/webhookController.ts`

**Problem**: Entire webhook payload sent to Sentry context

```typescript
Sentry.setContext('webhook_details', {
  status,
  execution_id: executionId,
  agent_id: agentId,
  // ⚠️ What about payload.user_data?
  // ⚠️ What about payload.metadata?
});
```

**Risk**:
- Webhook may contain PII in `user_data` field
- Metadata may contain sensitive info
- Full transcript may be in payload

**Better Approach**:
```typescript
// Sanitize webhook context
Sentry.setContext('webhook_details', {
  status,
  execution_id: executionId,
  agent_id: agentId,
  has_transcript: !!payload.transcript,
  has_recording: !!payload.recording_url,
  has_user_data: !!payload.user_data,
  // DON'T send actual user_data, transcript, or metadata
});
```

---

### 7. ⚠️ **MISSING: User ID Hashing for Privacy**

**Location**: Multiple files - All Sentry `user_id` tags

**Problem**: Raw user IDs sent to Sentry (can re-identify users)

```typescript
// Current implementation
Sentry.captureException(error, {
  tags: {
    user_id: userId  // ⚠️ Raw UUID
  }
});
```

**Privacy Risk**:
- User ID can be cross-referenced with other systems
- GDPR "right to be forgotten" is harder
- Compliance issues

**Better Approach**:
```typescript
// Hash user IDs before sending to Sentry
function hashUserId(userId: string): string {
  return crypto.createHash('sha256')
    .update(userId + process.env.SENTRY_HASH_SALT)
    .digest('hex')
    .slice(0, 16);  // First 16 chars
}

Sentry.captureException(error, {
  tags: {
    user_id_hash: hashUserId(userId)  // ✅ Privacy-safe
  }
});
```

---

## 📋 RECOMMENDATIONS BY PRIORITY

### 🔴 CRITICAL (Fix Immediately)

#### 1. Fix Filter Logic in instrument.ts
```typescript
// BEFORE (Wrong):
if (message.includes('agent not found')) return null;

// AFTER (Correct):
// Only filter "agent not found" in specific expected cases
if (message.includes('agent not found') && 
    hint.originalException?.statusCode === 404) {
  // Only filter if it's a 404 response (user requested non-existent agent)
  return null;
}
// If agent not found during call initiation = REAL BUG, send to Sentry!
```

#### 2. Remove Phone Numbers from Sentry
```typescript
// Instead of:
phoneNumber: callRequest.phoneNumber.slice(-4)

// Use:
hasPhoneNumber: !!callRequest.phoneNumber
// OR
phoneNumberHash: hashPhoneNumber(callRequest.phoneNumber)
```

#### 3. Sanitize Database Query Previews
```typescript
// Add sanitizeQuery() function
// Redact passwords, API keys, tokens before sending to Sentry
```

---

### 🟡 HIGH (Fix This Week)

#### 4. Add Balance Context to Credit Operations
```typescript
// Fetch user balance before operation
// Include balance_before, balance_after in Sentry context
```

#### 5. Sanitize Webhook Payloads
```typescript
// Don't send user_data, transcript, metadata to Sentry
// Only send has_user_data: true/false flags
```

#### 6. Hash User IDs
```typescript
// Create hashUserId() utility function
// Use in all Sentry events
```

---

### 🟢 MEDIUM (Improve Later)

#### 7. Optimize Span Usage
```typescript
// Sample spans at 10% for high-frequency operations
// Use breadcrumbs instead where possible
```

#### 8. Add Sentry Scrubbing in instrument.ts
```typescript
beforeSend(event) {
  // Add more comprehensive PII scrubbing
  // - Email addresses
  // - IP addresses  
  // - Credit card numbers (if ever present)
}
```

---

## 🛠️ IMPLEMENTATION GUIDE

### Step 1: Create Utility Functions

```typescript
// backend/src/utils/sentryHelpers.ts

import crypto from 'crypto';

const HASH_SALT = process.env.SENTRY_HASH_SALT || 'default-salt-change-in-production';

/**
 * Hash user ID for privacy
 */
export function hashUserId(userId: string): string {
  return crypto
    .createHash('sha256')
    .update(userId + HASH_SALT)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Hash phone number for privacy
 */
export function hashPhoneNumber(phoneNumber: string): string {
  return crypto
    .createHash('sha256')
    .update(phoneNumber + HASH_SALT)
    .digest('hex')
    .slice(0, 12);
}

/**
 * Sanitize SQL query preview
 */
export function sanitizeQuery(query: string): string {
  return query
    .replace(/password\s*=\s*'[^']*'/gi, "password='[REDACTED]'")
    .replace(/api_key\s*=\s*'[^']*'/gi, "api_key='[REDACTED]'")
    .replace(/token\s*=\s*'[^']*'/gi, "token='[REDACTED]'")
    .replace(/secret\s*=\s*'[^']*'/gi, "secret='[REDACTED]'")
    .substring(0, 200);
}

/**
 * Check if error should be filtered (business logic, not bugs)
 */
export function shouldFilterError(error: Error, statusCode?: number): boolean {
  const message = error.message.toLowerCase();
  
  // Only filter 404 errors (user requested non-existent resource)
  if (statusCode === 404) {
    return (
      message.includes('not found') ||
      message.includes('does not exist')
    );
  }
  
  // Filter validation errors (client-side issues)
  if (message.includes('validation failed') || 
      message.includes('invalid input') ||
      message.includes('missing required field')) {
    return true;
  }
  
  // Don't filter anything else - it's a bug!
  return false;
}
```

### Step 2: Update instrument.ts

```typescript
// backend/src/instrument.ts

import { shouldFilterError, sanitizeQuery } from './utils/sentryHelpers';

Sentry.init({
  // ... existing config
  
  beforeSend(event, hint) {
    // Filter out development/test environments
    if (process.env.NODE_ENV !== 'production') {
      return null;
    }

    // Use smart filtering
    const error = hint.originalException;
    if (error instanceof Error) {
      const statusCode = (hint.originalException as any)?.statusCode;
      if (shouldFilterError(error, statusCode)) {
        return null;
      }
    }

    // Remove sensitive data from request body
    if (event.request?.data) {
      const data = typeof event.request.data === 'string' 
        ? JSON.parse(event.request.data) 
        : event.request.data;
      
      // Remove all sensitive fields
      const sensitiveFields = [
        'password', 'token', 'api_key', 'apiKey', 'secret',
        'credit_card', 'ssn', 'phone', 'phoneNumber', 'email'
      ];
      
      sensitiveFields.forEach(field => {
        if (data[field]) data[field] = '[REDACTED]';
      });
      
      event.request.data = data;
    }

    // Sanitize database queries in contexts
    if (event.contexts?.database_query?.query_preview) {
      event.contexts.database_query.query_preview = 
        sanitizeQuery(event.contexts.database_query.query_preview);
    }

    return event;
  },
});
```

### Step 3: Update All Sentry Calls

```typescript
// Example: callService.ts

import { hashUserId, hashPhoneNumber } from '../utils/sentryHelpers';

Sentry.captureException(error, {
  tags: {
    error_type: 'bolna_api_failure',
    user_id_hash: hashUserId(callRequest.userId),  // ✅ Hashed
    severity: 'critical'
  },
  contexts: {
    call_details: {
      userId_hash: hashUserId(callRequest.userId),  // ✅ Hashed
      agentId: callRequest.agentId,
      phoneNumber_hash: hashPhoneNumber(callRequest.phoneNumber),  // ✅ Hashed
      callId: preReservedCallId
    }
  }
});
```

---

## 📊 RISK MATRIX

| Issue | Severity | Privacy Risk | Compliance Risk | Business Impact |
|-------|----------|--------------|-----------------|-----------------|
| Filter logic bug | 🔴 Critical | Low | Low | High - Missing bugs |
| Phone numbers in Sentry | 🔴 Critical | High | High (GDPR) | Medium - Privacy breach |
| Missing credit context | 🟡 High | Low | Low | High - Can't debug revenue |
| Query preview leaks | 🟡 High | High | Medium | Medium - Data exposure |
| Performance overhead | 🟢 Medium | Low | Low | Low - Slight slowdown |
| Webhook PII | 🟡 High | High | High (GDPR) | Low - Privacy breach |
| Raw user IDs | 🟡 High | Medium | Medium (GDPR) | Low - Privacy breach |

---

## ✅ VERIFICATION CHECKLIST

After implementing fixes:

- [ ] Filter logic only filters 404 errors (not all "not found")
- [ ] No phone numbers sent to Sentry (use hashes or flags)
- [ ] Database queries are sanitized (passwords redacted)
- [ ] Credit operations include balance context
- [ ] Webhook payloads are sanitized (no PII)
- [ ] User IDs are hashed (not raw UUIDs)
- [ ] Test in development with NODE_ENV=production
- [ ] Review Sentry dashboard for PII leaks
- [ ] Add SENTRY_HASH_SALT to .env files

---

## 🎯 SUMMARY

### Bugs Found: 7
### Critical: 3 🔴
### High: 3 🟡  
### Medium: 1 🟢

### Most Critical Issue:
**Filter Logic Bug** - Currently filtering out REAL bugs (agent not found during call = data corruption)

### Biggest Privacy Risk:
**Phone Numbers** - Last 4 digits + user ID = re-identifiable PII

### Immediate Actions Required:
1. Fix filter logic in instrument.ts
2. Remove/hash phone numbers
3. Sanitize database query previews

---

**Audit Date**: November 5, 2025  
**Auditor**: AI Security Review  
**Status**: CRITICAL FIXES REQUIRED ⚠️
