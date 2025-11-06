# Sentry Security Fixes - Quick Action Checklist

## ✅ Session 1 - COMPLETE

- [x] Created `sentryHelpers.ts` utility file with 5 helper functions
- [x] Fixed critical filter logic bug in `instrument.ts`
- [x] Implemented phone number hashing (3/3 locations in `callService.ts`)
- [x] Implemented user ID hashing (13/40 locations across all files)
- [x] Added SQL query sanitization in `beforeSend()`
- [x] Build passed with zero errors
- [x] Documentation created (3 new markdown files)

**Files Modified:** 3 files (instrument.ts, callService.ts, sentryHelpers.ts)  
**Lines Changed:** ~45 lines  
**Security Impact:** Critical filter bug fixed, GDPR compliance improved in critical paths

---

## ⏳ Session 2 - TODO (Next Steps)

### High Priority (Revenue-Critical):

#### 1. QueueProcessorService.ts (Campaign Calls)
**Estimated Time:** 15 minutes  
**Locations:** 10 total
- [ ] Add import: `import { hashPhoneNumber, hashUserId } from '../utils/sentryHelpers';`
- [ ] Line 244: `user_id: queueItem.user_id` → `user_id_hash: hashUserId(queueItem.user_id)`
- [ ] Line 256: `user_id: queueItem.user_id` → `user_id_hash: hashUserId(queueItem.user_id)`
- [ ] Line 269: `user_id: queueItem.user_id` → `user_id_hash: hashUserId(queueItem.user_id)`
- [ ] Line 270: `phone_number: queueItem.phone_number?.slice(-4)` → `phone_number_hash: hashPhoneNumber(queueItem.phone_number || '')`
- [ ] Line 289: `user_id: queueItem.user_id` → `user_id_hash: hashUserId(queueItem.user_id)`
- [ ] Line 309: `user_id: queueItem.user_id` → `user_id_hash: hashUserId(queueItem.user_id)`
- [ ] Line 389: `user_id: queueItem.user_id` → `user_id_hash: hashUserId(queueItem.user_id)`
- [ ] Line 396: `user_id: queueItem.user_id` → `user_id_hash: hashUserId(queueItem.user_id)`
- [ ] Line 399: `phone_number: queueItem.phone_number?.slice(-4)` → `phone_number_hash: hashPhoneNumber(queueItem.phone_number || '')`

#### 2. userService.ts (Credit Operations)
**Estimated Time:** 20 minutes  
**Critical for Revenue Debugging**
- [ ] Add import: `import { hashUserId } from '../utils/sentryHelpers';`
- [ ] In `deductCredits()`:
  - [ ] Fetch user before deduction: `const user = await UserModel.findById(userId);`
  - [ ] Calculate `balanceBefore = user.credits`
  - [ ] Calculate `balanceAfter = balanceBefore - amount`
  - [ ] Add to Sentry context:
    ```typescript
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    would_go_negative: (balanceAfter < 0)
    ```
  - [ ] Hash user ID: `user_id_hash: hashUserId(userId)`
- [ ] In `addCredits()`:
  - [ ] Fetch user before addition
  - [ ] Add same balance context
  - [ ] Hash user ID

### Medium Priority:

#### 3. webhookController.ts
**Estimated Time:** 15 minutes
- [ ] Add import: `import { hashUserId, sanitizeMetadata } from '../utils/sentryHelpers';`
- [ ] Find all `Sentry.captureException()` calls
- [ ] Replace `userId` with `hashUserId(userId)`
- [ ] Wrap webhook payloads: `payload: sanitizeMetadata(webhook.data)`

#### 4. bolnaService.ts
**Estimated Time:** 10 minutes
- [ ] Add import: `import { hashUserId } from '../utils/sentryHelpers';`
- [ ] Find all Sentry calls with user context
- [ ] Replace `userId` with `hashUserId(userId)`

#### 5. connectionPoolService.ts
**Estimated Time:** 5 minutes
- [ ] Add import: `import { sanitizeQuery } from '../utils/sentryHelpers';`
- [ ] Find `query_preview: text.substring(0, 200)`
- [ ] Replace with: `query_preview: sanitizeQuery(text)`

---

## 🔧 Environment Setup

### Critical (Must Do Before Production):
- [ ] Generate secure random salt (32+ chars):
  ```bash
  # PowerShell:
  [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  
  # Or Node.js:
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- [ ] Add to `.env`:
  ```env
  SENTRY_HASH_SALT=your-generated-salt-here
  ```
- [ ] Add to `.env.example`:
  ```env
  SENTRY_HASH_SALT=change-this-to-random-salt
  ```
- [ ] **NEVER commit real salt to git!**

---

## 🧪 Testing Checklist

### Build & Compile:
- [ ] Run `npm run build` (should pass with zero errors)
- [ ] Fix any TypeScript errors

### Runtime Testing:
- [ ] Set `NODE_ENV=production` in `.env`
- [ ] Run `npm run dev`
- [ ] Trigger test errors:
  - [ ] Invalid agent ID call
  - [ ] Unauthorized agent access
  - [ ] Low credit balance
  - [ ] Campaign call with invalid contact

### Sentry Dashboard Verification:
- [ ] Open Sentry dashboard
- [ ] Check error details:
  - [ ] User IDs are hashed (16 chars, e.g., `7f3a8b9c2d1e5f6`)
  - [ ] Phone numbers are hashed (12 chars, e.g., `a3b5c7d9e2f1`)
  - [ ] SQL queries show `[REDACTED]` for sensitive fields
  - [ ] Credit operations show `balance_before`/`balance_after`
  - [ ] "Agent not found" errors are visible (not filtered)
  - [ ] No raw UUIDs visible
  - [ ] No last 4 digits of phone numbers visible

---

## 📊 Progress Tracking

### Overall Completion:
- **Session 1:** ✅ 40% (critical paths done)
- **Session 2:** ⏳ 60% (remaining files + testing)

### Files Remaining:
- [ ] QueueProcessorService.ts (10 locations)
- [ ] userService.ts (4 locations + balance context)
- [ ] webhookController.ts (5-8 locations)
- [ ] bolnaService.ts (3-5 locations)
- [ ] connectionPoolService.ts (1-2 locations)

**Total Remaining:** ~25-30 locations across 5 files

---

## 🚀 Quick Commands

### Build:
```bash
cd backend
npm run build
```

### Run in Production Mode:
```bash
cd backend
# Set environment
$env:NODE_ENV="production"
npm run dev
```

### Generate Random Salt:
```bash
# PowerShell (32 bytes = 44 chars base64):
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))

# Node.js (32 bytes = 64 chars hex):
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 📚 Documentation Reference

- **Full Audit:** `SENTRY_SECURITY_AUDIT.md` (7 vulnerabilities identified)
- **Detailed Progress:** `SENTRY_SECURITY_FIXES_PROGRESS.md` (what's done, what's pending)
- **Session 1 Summary:** `SENTRY_SECURITY_FIXES_SESSION1_COMPLETE.md` (this session's work)
- **Utility Functions:** `backend/src/utils/sentryHelpers.ts` (helper code)
- **Quick Reference:** `SENTRY_QUICK_REFERENCE.md` (how to use Sentry)

---

## ⚠️ Important Notes

1. **Don't Skip Credit Balance Context** - Critical for revenue debugging
2. **Use Secure Salt** - Never commit to git, generate random 32+ chars
3. **Test in Production Mode** - `NODE_ENV=production` to verify filtering
4. **Check Sentry Dashboard** - Manually verify no PII visible
5. **QueueProcessorService First** - Campaign calls are revenue-critical

---

## 🎯 Recommended Execution Order

### Today (High Priority):
1. ✅ **DONE:** Filter logic + critical paths in callService.ts
2. ⏳ **NEXT:** QueueProcessorService.ts (15 min)
3. ⏳ userService.ts credit context (20 min)
4. ⏳ Generate SENTRY_HASH_SALT (2 min)

### Tomorrow (Medium Priority):
5. ⏳ webhookController.ts (15 min)
6. ⏳ bolnaService.ts (10 min)
7. ⏳ connectionPoolService.ts (5 min)
8. ⏳ Full testing + Sentry verification (30 min)

**Total Remaining Time:** ~1.5 hours

---

## ✨ Key Wins So Far

1. ✅ Fixed critical bug hiding production errors
2. ✅ GDPR-compliant hashing implemented in critical paths
3. ✅ SQL password leaks prevented
4. ✅ Reusable utilities created for consistency
5. ✅ Zero build errors
6. ✅ Comprehensive documentation

**Status:** 40% complete, critical security issues resolved in primary call flow

---

**Last Updated:** 2025-01-XX  
**Next Action:** Complete QueueProcessorService.ts (campaign calls)
