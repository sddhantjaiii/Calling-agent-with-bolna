# Sentry Security Fixes - Implementation Progress

## ✅ Completed Fixes

### 1. **CRITICAL: Filter Logic Fixed** ✅
**File:** `backend/src/instrument.ts`

**Issue:** beforeSend() was filtering ALL "not found" errors, including real bugs (e.g., deleted agent during active call = data corruption)

**Fix Applied:**
- Created `shouldFilterError()` helper function in `sentryHelpers.ts`
- Updated `beforeSend()` to use smart filtering:
  - ✅ Filters: 404 errors (user requested non-existent resource)
  - ✅ Filters: Validation errors (client-side issues)
  - ✅ Filters: Rate limit errors (expected behavior)
  - ✅ Filters: Concurrency limit errors (expected behavior)
  - ❌ Does NOT filter: "agent not found" during call initiation (real bug)
  - ❌ Does NOT filter: "user not found" in auth context (security issue)

**Code:**
```typescript
// Old (WRONG - filters all "agent not found")
if (message.includes('agent not found')) {
  return null; // Filters real bugs!
}

// New (CORRECT - smart filtering)
const statusCode = (hint.originalException as any)?.statusCode;
if (shouldFilterError(error, statusCode)) {
  return null; // Only filters 404s, validation, rate limits
}
```

---

### 2. **CRITICAL: Phone Number PII Fixed** ✅
**File:** `backend/src/services/callService.ts`

**Issue:** `phoneNumber.slice(-4)` exposes last 4 digits, which combined with user_id is re-identifiable (GDPR violation)

**Fix Applied:**
- Created `hashPhoneNumber()` helper in `sentryHelpers.ts`
- Uses SHA256 hash with salt: `SHA256(phone + HASH_SALT).slice(0, 12)`
- Updated 3 locations in `callService.ts`:
  - Line 339: Sentry.startSpan() attributes
  - Line 574: Bolna API failure context
  - Line 622: Call initiation failure context

**Code:**
```typescript
// Old (WRONG - exposes PII)
phoneNumber: callRequest.phoneNumber.slice(-4) // "+1234" is re-identifiable

// New (CORRECT - privacy-safe hash)
phoneNumberHash: hashPhoneNumber(callRequest.phoneNumber) // "a3b5c7d9e2f1"
```

---

### 3. **HIGH: User ID Hashing Implemented** ✅ (Partially)
**File:** `backend/src/services/callService.ts`

**Issue:** Raw user IDs (UUIDs) sent to Sentry can re-identify users, GDPR risk

**Fix Applied:**
- Created `hashUserId()` helper in `sentryHelpers.ts`
- Uses SHA256 hash with salt: `SHA256(userId + HASH_SALT).slice(0, 16)`
- Updated in `callService.ts`:
  - Line 339: Sentry.startSpan() attributes
  - Line 565-574: Bolna API failure (tags + contexts)
  - Line 613-622: Call initiation failure (tags + contexts)

**Code:**
```typescript
// Old (WRONG - exposes UUID)
userId: callRequest.userId // "123e4567-e89b-12d3-a456-426614174000"

// New (CORRECT - privacy-safe hash)
userIdHash: hashUserId(callRequest.userId) // "7f3a8b9c2d1e5f6"
```

---

### 4. **HIGH: Database Query Sanitization** ✅
**File:** `backend/src/instrument.ts`

**Issue:** SQL query previews in contexts may contain passwords/tokens in UPDATE statements

**Fix Applied:**
- Created `sanitizeQuery()` helper in `sentryHelpers.ts`
- Redacts: passwords, API keys, tokens, emails, phone numbers, SSNs
- Limits query length to 200 characters
- Applied in `beforeSend()` to automatically sanitize all database contexts

**Code:**
```typescript
// Old (WRONG - may leak secrets)
query_preview: "UPDATE users SET password = 'secret123' WHERE id = 1"

// New (CORRECT - sanitized)
query_preview: "UPDATE users SET password = [REDACTED] WHERE id = 1"
```

---

### 5. **Utility Functions Created** ✅
**File:** `backend/src/utils/sentryHelpers.ts`

All helper functions implemented:
- ✅ `hashUserId(userId: string): string` - Privacy-safe user ID hashing
- ✅ `hashPhoneNumber(phone: string): string` - Privacy-safe phone number hashing
- ✅ `sanitizeQuery(query: string): string` - Redacts sensitive SQL data
- ✅ `shouldFilterError(error: Error, statusCode?: number): boolean` - Smart error filtering
- ✅ `sanitizeMetadata(obj: any): any` - Removes PII fields from metadata

Uses `SENTRY_HASH_SALT` environment variable for cryptographic salt.

---

## ⏳ Remaining Fixes (TO DO)

### 6. **HIGH: User ID Hashing (Complete All Files)** ⏳
**Status:** Partially complete (only `callService.ts` done)

**Remaining Files to Update:**
1. ❌ `backend/src/services/callService.ts` - **15+ more occurrences** (only 3 fixed)
   - Line 354, 394, 398, 428, 432, 450, 455, 472, 476, 502, 537, 593, 597, 667, 687
   - Need to replace all `userId: callRequest.userId` → `userIdHash: hashUserId(callRequest.userId)`
   - Need to replace all `user_id: callRequest.userId` → `user_id_hash: hashUserId(callRequest.userId)`

2. ❌ `backend/src/services/QueueProcessorService.ts` - **8 occurrences**
   - Lines: 244, 256, 269, 289, 309, 389, 396
   - Need to add import: `import { hashPhoneNumber, hashUserId } from '../utils/sentryHelpers';`
   - Replace `user_id: queueItem.user_id` → `user_id_hash: hashUserId(queueItem.user_id)`
   - Replace `phone_number: queueItem.phone_number?.slice(-4)` → `phone_number_hash: hashPhoneNumber(queueItem.phone_number)`

3. ❌ `backend/src/controllers/webhookController.ts`
   - Need to hash user IDs in webhook contexts
   - Add import and update all Sentry calls

4. ❌ `backend/src/services/userService.ts`
   - Need to hash user IDs in credit operation contexts
   - Add import and update deductCredits/addCredits

5. ❌ `backend/src/services/bolnaService.ts`
   - Need to hash user IDs in Bolna API contexts
   - Add import and update all Sentry calls

**Estimated Work:** ~30-40 more replacements across 5 files

---

### 7. **HIGH: Phone Number Hashing (Complete All Files)** ⏳
**Status:** Partially complete (only 3/5 occurrences in `callService.ts` done)

**Remaining Files to Update:**
1. ❌ `backend/src/services/QueueProcessorService.ts` - **2 occurrences**
   - Line 270, 399: `phone_number: queueItem.phone_number?.slice(-4)`
   - Replace with: `phone_number_hash: hashPhoneNumber(queueItem.phone_number || '')`

2. ❌ `backend/src/controllers/webhookController.ts`
   - Check if webhook contexts include phone numbers
   - Hash if present

**Estimated Work:** ~5-10 more replacements

---

### 8. **HIGH: Credit Balance Context** ⏳
**Status:** Not started

**File:** `backend/src/services/userService.ts`

**Issue:** Can't debug credit issues without knowing balance before/after transaction

**Fix Required:**
```typescript
// In deductCredits() method:
async deductCredits(userId: string, amount: number): Promise<void> {
  // FETCH USER FIRST to get balance_before
  const user = await UserModel.findById(userId);
  if (!user) throw new Error('User not found');
  
  const balanceBefore = user.credits;
  const balanceAfter = balanceBefore - amount;
  const wouldGoNegative = balanceAfter < 0;
  
  try {
    // Existing deduction logic...
  } catch (error) {
    Sentry.captureException(error, {
      tags: {
        error_type: 'credit_deduction_failed',
        user_id_hash: hashUserId(userId), // ← Also hash user ID
        revenue_impact: 'high',
        severity: 'critical'
      },
      contexts: {
        credit_operation: {
          operation: 'deduct',
          amount,
          balance_before: balanceBefore,     // ← ADD THIS
          balance_after: balanceAfter,       // ← ADD THIS
          would_go_negative: wouldGoNegative // ← ADD THIS
        }
      }
    });
    throw error;
  }
}

// Same fix for addCredits() method
```

**Estimated Work:** 2 method updates (deductCredits, addCredits)

---

### 9. **HIGH: Webhook Payload Sanitization** ⏳
**Status:** Not started

**File:** `backend/src/controllers/webhookController.ts`

**Issue:** Full webhook payload context may include sensitive user_data fields

**Fix Required:**
```typescript
// In webhook error handling:
import { sanitizeMetadata, hashUserId } from '../utils/sentryHelpers';

Sentry.captureException(error, {
  contexts: {
    webhook: {
      event: webhook.event,
      // Don't send full payload - sanitize first
      payload: sanitizeMetadata(webhook.data) // ← ADD sanitization
    }
  }
});
```

**Estimated Work:** 3-5 locations in webhookController.ts

---

### 10. **HIGH: Database Query Sanitization (connectionPoolService)** ⏳
**Status:** Not started

**File:** `backend/src/services/connectionPoolService.ts`

**Issue:** `query_preview: text.substring(0, 200)` may contain passwords in UPDATE statements

**Fix Required:**
```typescript
// In query() catch block:
import { sanitizeQuery } from '../utils/sentryHelpers';

Sentry.captureException(error, {
  contexts: {
    database_query: {
      query_preview: sanitizeQuery(text) // ← Use helper instead of substring
    }
  }
});
```

**Estimated Work:** 1-2 locations in connectionPoolService.ts

---

### 11. **Environment Variable Setup** ⏳
**Status:** Not started

**Files:** `.env` and `.env.example`

**Issue:** `SENTRY_HASH_SALT` not configured (currently using insecure default)

**Fix Required:**
1. Generate cryptographically secure random salt
2. Add to `.env`:
   ```env
   SENTRY_HASH_SALT=your-randomly-generated-salt-here-min-32-chars
   ```
3. Add to `.env.example`:
   ```env
   SENTRY_HASH_SALT=change-this-to-random-salt
   ```
4. **NEVER commit real salt to git!**

**How to Generate Salt:**
```bash
# Node.js:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# PowerShell:
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))

# Online (use ONLY for development):
# https://www.random.org/strings/
```

**Estimated Work:** 2 file updates + generate salt

---

### 12. **Build and Test** ⏳
**Status:** Not started

**Steps:**
1. Run `npm run build` to verify TypeScript compilation
2. Fix any type errors
3. Run `npm run dev` with `NODE_ENV=production`
4. Trigger test errors to verify Sentry dashboard shows:
   - ✅ Hashed user IDs (not raw UUIDs)
   - ✅ Hashed phone numbers (not last 4 digits)
   - ✅ Sanitized SQL queries (no passwords)
   - ✅ Credit balance contexts (balance_before/after)
   - ✅ Smart filtering (real bugs NOT filtered)

---

## 📊 Progress Summary

| Fix | Status | Files | Locations | Priority |
|-----|--------|-------|-----------|----------|
| 1. Filter Logic | ✅ Complete | 1 | 1 | CRITICAL |
| 2. Phone Hashing (partial) | ✅ Complete | 1 | 3/5 | CRITICAL |
| 3. User ID Hashing (partial) | ✅ Complete | 1 | 3/40 | HIGH |
| 4. Query Sanitization (instrument) | ✅ Complete | 1 | 1 | HIGH |
| 5. Utility Functions | ✅ Complete | 1 | 5 | - |
| 6. User ID Hashing (all files) | ⏳ In Progress | 5 | 37 remaining | HIGH |
| 7. Phone Hashing (all files) | ⏳ In Progress | 2 | 2 remaining | HIGH |
| 8. Credit Balance Context | ⏳ Not Started | 1 | 2 | HIGH |
| 9. Webhook Sanitization | ⏳ Not Started | 1 | 3-5 | HIGH |
| 10. Query Sanitization (DB) | ⏳ Not Started | 1 | 1-2 | HIGH |
| 11. Environment Setup | ⏳ Not Started | 2 | 2 | HIGH |
| 12. Build & Test | ⏳ Not Started | - | - | CRITICAL |

**Overall Progress:** ~15% complete (5/12 major tasks done)

---

## 🎯 Next Steps (Recommended Order)

### Immediate (High Impact, Low Effort):
1. ✅ **Done:** Filter logic fix in `instrument.ts`
2. ✅ **Done:** Phone number hashing in `callService.ts` (partial)
3. ✅ **Done:** User ID hashing in `callService.ts` (partial)
4. ⏳ **Next:** Complete user ID hashing in `callService.ts` (15+ more locations)
5. ⏳ **Next:** Complete user ID hashing in `QueueProcessorService.ts` (8 locations)
6. ⏳ **Next:** Complete phone number hashing in `QueueProcessorService.ts` (2 locations)

### After Core Fixes (Medium Priority):
7. ⏳ Add credit balance context in `userService.ts`
8. ⏳ Add webhook sanitization in `webhookController.ts`
9. ⏳ Add query sanitization in `connectionPoolService.ts`
10. ⏳ Hash user IDs in `bolnaService.ts`

### Final Steps:
11. ⏳ Generate and configure `SENTRY_HASH_SALT`
12. ⏳ Build and test all changes
13. ⏳ Verify in Sentry dashboard

---

## 🔐 Security Impact Assessment

### Before Fixes:
- **CRITICAL:** Filter bug hiding real production bugs (data corruption risk)
- **CRITICAL:** Phone numbers re-identifiable (GDPR violation)
- **HIGH:** User IDs exposed (GDPR compliance risk)
- **HIGH:** SQL queries leaking passwords
- **HIGH:** Credit debugging impossible (revenue impact)

### After Fixes (Current):
- ✅ **FIXED:** Filter bug resolved - real bugs now visible
- ✅ **FIXED:** Phone numbers hashed (3/5 locations)
- ✅ **PARTIAL:** User IDs hashed (3/40 locations)
- ✅ **FIXED:** SQL queries sanitized in instrument.ts
- ❌ **NOT FIXED:** Credit debugging (missing balance context)
- ❌ **NOT FIXED:** Webhook PII exposure
- ❌ **NOT FIXED:** Database queries in connectionPoolService

### After All Fixes:
- ✅ **COMPLIANT:** GDPR-compliant PII handling
- ✅ **SECURE:** No sensitive data in Sentry
- ✅ **DEBUGGABLE:** Full context without compromising privacy
- ✅ **PRODUCTION-READY:** Smart filtering shows real bugs only

---

## 📝 Implementation Notes

### Why Hash Instead of Remove?
- **Consistency:** Same user/phone generates same hash (track patterns)
- **Debugging:** Can correlate errors for same user across events
- **Privacy:** Impossible to reverse hash without salt
- **GDPR:** Hash is NOT personal data (can't identify individual)

### Why Use Salt?
- **Security:** Rainbow table attacks won't work
- **Uniqueness:** Different apps produce different hashes for same data
- **Best Practice:** Industry-standard cryptographic approach

### Why Sanitize Queries?
- **Passwords:** UPDATE statements may contain plaintext passwords
- **Tokens:** INSERT statements may include API keys
- **Emails/Phones:** WHERE clauses may filter by PII
- **Compliance:** Logs should never contain sensitive data

---

## 🚀 Deployment Checklist

Before deploying to production:

- [ ] All user IDs hashed (40+ locations)
- [ ] All phone numbers hashed (5 locations)
- [ ] All SQL queries sanitized (3 locations)
- [ ] Credit balance context added (2 methods)
- [ ] Webhook payloads sanitized (3-5 locations)
- [ ] `SENTRY_HASH_SALT` configured with random salt (32+ chars)
- [ ] `.env.example` updated with placeholder
- [ ] Build passes (`npm run build`)
- [ ] Manual testing in production mode
- [ ] Sentry dashboard verified (no PII visible)
- [ ] Security audit passed

---

## 📚 Related Documentation

- **Security Audit:** `SENTRY_SECURITY_AUDIT.md` (full vulnerability analysis)
- **Phase 1 Setup:** `SENTRY_PHASE1_COMPLETE.md` (infrastructure)
- **Phase 2 Integration:** `SENTRY_PHASE2_COMPLETE.md` (critical areas)
- **Quick Reference:** `SENTRY_QUICK_REFERENCE.md` (usage guide)
- **Database Errors:** `DATABASE_ERROR_MONITORING.md` (connection termination)

---

**Last Updated:** 2025-01-XX  
**Status:** In Progress (15% complete)  
**Next Action:** Complete user ID hashing in `callService.ts` and `QueueProcessorService.ts`
