# System Concurrency Management Strategy

**Question:** Should we manage system-level concurrency limits from ENV variables or the database?

**Date:** October 9, 2025  
**Status:** Recommendation Document

---

## 🎯 TL;DR - Recommended Approach

**Hybrid Approach (Best of Both Worlds):**
- ✅ **Default system limit** in ENV (e.g., `SYSTEM_CONCURRENT_CALLS_LIMIT=10`)
- ✅ **Per-user limits** in database (`users.concurrent_calls_limit`)
- ✅ **System-wide enforcement** using database query + ENV fallback
- ✅ **Admin override** capability via database updates

---

## 📊 Comparison: ENV vs Database vs Hybrid

| Aspect | ENV Variable | Database | Hybrid (Recommended) |
|--------|-------------|----------|---------------------|
| **Change Speed** | Requires restart | Instant | Instant with fallback |
| **Per-User Customization** | ❌ No | ✅ Yes | ✅ Yes |
| **Admin UI Control** | ❌ No | ✅ Yes | ✅ Yes |
| **Scalability** | ⚠️ All servers must sync | ✅ Single source of truth | ✅ Single source of truth |
| **Rollback** | ⚠️ Redeploy required | ✅ Instant revert | ✅ Instant revert |
| **Performance** | ✅ Fast (cached) | ⚠️ DB query needed | ✅ Fast with caching |
| **Monitoring** | ⚠️ Hard to track changes | ✅ Audit log possible | ✅ Audit log possible |
| **Disaster Recovery** | ✅ In version control | ⚠️ Needs backup | ✅ Both available |

---

## 🏗️ Current Implementation (Database-First)

The migration has already implemented **database storage**:

```sql
-- In users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS concurrent_calls_limit INTEGER NOT NULL DEFAULT 2;

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS system_concurrent_calls_limit INTEGER NOT NULL DEFAULT 10;
```

### What This Means:
- **Per-user limit:** `users.concurrent_calls_limit` (default: 2)
- **System limit per user:** `users.system_concurrent_calls_limit` (default: 10)

**Current Behavior:**
- Each user has their own `system_concurrent_calls_limit` column
- But this is **not truly system-wide** - it's per-user configuration

---

## 🚨 Problem with Current Design

### Issue 1: Not Truly System-Wide

```sql
-- Current: Each user has their own system limit
User A: system_concurrent_calls_limit = 10
User B: system_concurrent_calls_limit = 10
User C: system_concurrent_calls_limit = 10

-- Problem: Total system could have 30 concurrent calls (10+10+10)
-- Not a true "system-wide limit"
```

### Issue 2: Confusing Column Name

The column `users.system_concurrent_calls_limit` suggests it's system-wide, but it's actually per-user.

---

## ✅ Recommended Solution: Hybrid Approach

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Concurrency Limits                   │
├─────────────────────────────────────────────────────┤
│                                                      │
│  1. ENV Variable (System-Wide Default)              │
│     SYSTEM_CONCURRENT_CALLS_LIMIT=10                │
│     ↓                                                │
│                                                      │
│  2. Database (Per-User Limits)                      │
│     users.concurrent_calls_limit = 2                │
│     ↓                                                │
│                                                      │
│  3. Runtime Check (Queue Processor)                 │
│     - Count system-wide active calls                │
│     - Count user's active calls                     │
│     - Respect both limits                           │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Implementation Plan

#### Step 1: Add ENV Variable

```bash
# .env
# System-wide concurrent call limit (applies to all users combined)
SYSTEM_CONCURRENT_CALLS_LIMIT=10

# Default per-user limit (can be overridden in database)
DEFAULT_USER_CONCURRENT_CALLS_LIMIT=2
```

#### Step 2: Remove Confusing Column from Users Table

```sql
-- Migration: 044_fix_concurrency_limits.sql

-- Remove the confusing column
ALTER TABLE users DROP COLUMN IF EXISTS system_concurrent_calls_limit;

-- Keep only the per-user limit
-- (concurrent_calls_limit stays - this is correct)
```

#### Step 3: Update Helper Function

```sql
-- Update the count_system_active_calls function
CREATE OR REPLACE FUNCTION count_system_active_calls() 
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM call_queue
    WHERE status = 'calling'
  );
END;
$$ LANGUAGE plpgsql;

-- This counts ALL active calls across ALL users
```

#### Step 4: Queue Processor Logic

```typescript
// backend/src/services/QueueProcessorService.ts

export class QueueProcessorService {
  private systemConcurrentLimit: number;
  private defaultUserLimit: number;

  constructor() {
    // Load from ENV with fallbacks
    this.systemConcurrentLimit = parseInt(
      process.env.SYSTEM_CONCURRENT_CALLS_LIMIT || '10'
    );
    this.defaultUserLimit = parseInt(
      process.env.DEFAULT_USER_CONCURRENT_CALLS_LIMIT || '2'
    );
  }

  async processQueue() {
    // Step 1: Check system-wide limit
    const systemActiveCallsResult = await db.query(
      'SELECT count_system_active_calls() as count'
    );
    const systemActiveCalls = systemActiveCallsResult.rows[0].count;

    if (systemActiveCalls >= this.systemConcurrentLimit) {
      console.log('System concurrent call limit reached:', systemActiveCalls);
      return; // Stop processing - system is at capacity
    }

    // Step 2: Get users with pending calls
    const usersWithPendingCalls = await this.getUsersWithPendingCalls();

    // Step 3: Round-robin allocation
    for (const user of usersWithPendingCalls) {
      // Check if we've hit system limit
      const currentSystemCalls = await this.countSystemActiveCalls();
      if (currentSystemCalls >= this.systemConcurrentLimit) {
        break; // System limit reached
      }

      // Check user's limit (from database)
      const userActiveCalls = await this.countUserActiveCalls(user.id);
      const userLimit = user.concurrent_calls_limit || this.defaultUserLimit;

      if (userActiveCalls >= userLimit) {
        continue; // User at their limit, skip to next user
      }

      // Allocate next call for this user
      await this.allocateNextCall(user.id);
    }
  }

  private async countSystemActiveCalls(): Promise<number> {
    const result = await db.query('SELECT count_system_active_calls() as count');
    return result.rows[0].count;
  }

  private async countUserActiveCalls(userId: string): Promise<number> {
    const result = await db.query(
      'SELECT count_active_calls($1) as count',
      [userId]
    );
    return result.rows[0].count;
  }
}
```

---

## 🎛️ Admin Control Panel (Future Enhancement)

### Settings Page: `/admin/settings/concurrency`

```typescript
// Admin can update system limit without restarting server

// Option 1: Update ENV and restart (requires deployment)
// Option 2: Store in settings table (instant change)

CREATE TABLE system_settings (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO system_settings (key, value, description) VALUES
  ('system_concurrent_calls_limit', '10', 'Maximum concurrent calls across all users'),
  ('default_user_concurrent_calls_limit', '2', 'Default per-user concurrent call limit');
```

### Priority Order:
```
1. Database system_settings table (if exists) - HIGHEST PRIORITY
2. ENV variable (SYSTEM_CONCURRENT_CALLS_LIMIT)
3. Hard-coded default (10) - FALLBACK
```

---

## 📈 Scalability Considerations

### Scenario: 1000+ Users

**Problem with ENV only:**
- All 1000 servers need to restart when limit changes
- Inconsistent state during rolling restart
- No per-customer customization

**Solution with Database:**
- Change takes effect immediately
- All servers query same source of truth
- Can offer different limits to premium customers

### Enterprise Features

```typescript
// Premium users get higher limits
const userTier = await getUserTier(userId);

const userLimit = {
  'free': 2,
  'pro': 5,
  'enterprise': 20
}[userTier];

// Store in database
await db.query(
  'UPDATE users SET concurrent_calls_limit = $1 WHERE id = $2',
  [userLimit, userId]
);
```

---

## 🔄 Migration Path (If Current Design is Wrong)

### Current State:
```sql
users.concurrent_calls_limit = 2 ✅ (Correct - per-user)
users.system_concurrent_calls_limit = 10 ❌ (Confusing - not truly system-wide)
```

### Recommended Changes:

#### Migration 044: Fix Concurrency Limits

```sql
-- Migration: 044_fix_concurrency_limits.sql

-- Remove the confusing column
ALTER TABLE users DROP COLUMN system_concurrent_calls_limit;

-- Add comment for clarity
COMMENT ON COLUMN users.concurrent_calls_limit IS 
  'Maximum concurrent calls for this specific user. System-wide limit is managed via ENV or settings table.';
```

#### Add to .env:

```bash
# System-wide concurrent call limit (all users combined)
SYSTEM_CONCURRENT_CALLS_LIMIT=10

# Default per-user limit (used when user.concurrent_calls_limit is NULL)
DEFAULT_USER_CONCURRENT_CALLS_LIMIT=2
```

---

## 🎯 Final Recommendation

### ✅ Use Hybrid Approach

**For System-Wide Limit:**
- Primary: ENV variable (`SYSTEM_CONCURRENT_CALLS_LIMIT`)
- Optional: `system_settings` table (for admin UI control)
- Fallback: Hard-coded default

**For Per-User Limit:**
- Primary: Database (`users.concurrent_calls_limit`)
- Fallback: ENV variable (`DEFAULT_USER_CONCURRENT_CALLS_LIMIT`)
- Last resort: Hard-coded default

### Benefits:
1. ✅ **Fast changes** - Update ENV or database, no code deploy
2. ✅ **Per-user customization** - Premium users get more capacity
3. ✅ **True system-wide enforcement** - Single source of truth
4. ✅ **Admin control** - Can be managed via UI
5. ✅ **Scalable** - Works with multiple servers
6. ✅ **Fallback safety** - Always has a default value

### Code Example:

```typescript
class ConcurrencyManager {
  async getSystemLimit(): Promise<number> {
    // Priority 1: Database settings table (if exists)
    const setting = await this.getSettingFromDB('system_concurrent_calls_limit');
    if (setting) return parseInt(setting);

    // Priority 2: ENV variable
    if (process.env.SYSTEM_CONCURRENT_CALLS_LIMIT) {
      return parseInt(process.env.SYSTEM_CONCURRENT_CALLS_LIMIT);
    }

    // Priority 3: Hard-coded fallback
    return 10;
  }

  async getUserLimit(userId: string): Promise<number> {
    // Priority 1: User's database value
    const user = await User.findById(userId);
    if (user.concurrent_calls_limit) {
      return user.concurrent_calls_limit;
    }

    // Priority 2: Default from ENV
    if (process.env.DEFAULT_USER_CONCURRENT_CALLS_LIMIT) {
      return parseInt(process.env.DEFAULT_USER_CONCURRENT_CALLS_LIMIT);
    }

    // Priority 3: Hard-coded fallback
    return 2;
  }
}
```

---

## 📋 Action Items

### Immediate (Must Do):
1. ✅ Decide on approach (Hybrid recommended)
2. [ ] Add ENV variables to `.env` and `.env.example`
3. [ ] Remove `users.system_concurrent_calls_limit` column (optional migration)
4. [ ] Implement `ConcurrencyManager` class
5. [ ] Update Queue Processor to use hybrid approach

### Future (Nice to Have):
1. [ ] Create `system_settings` table for admin UI control
2. [ ] Build admin settings page
3. [ ] Add concurrency monitoring dashboard
4. [ ] Implement per-tier limits (free/pro/enterprise)

---

## 🧪 Testing Scenarios

### Test 1: System Limit Enforcement
```
Users: A, B, C (each has user_limit=5)
System Limit: 10

Active Calls:
- User A: 5 calls ✅
- User B: 5 calls ✅
- User C: 0 calls ❌ (system limit reached)

Expected: User C cannot start calls until A or B finish
```

### Test 2: User Limit Enforcement
```
Users: A (user_limit=2)
System Limit: 10

Active Calls:
- User A: 2 calls ✅

Expected: User A cannot start 3rd call (user limit reached)
```

### Test 3: Round-Robin Allocation
```
Users: A (pending: 100), B (pending: 100), C (pending: 100)
System Limit: 10
User Limit: 5 each

Expected Allocation:
1. User A: 1 call
2. User B: 1 call
3. User C: 1 call
4. User A: 1 call (round-robin back to A)
... continue until system limit reached
```

---

**Decision:** Implement Hybrid Approach ✅  
**Next Step:** Update `.env` files and create `ConcurrencyManager` class

