# 🎯 Sentry Integration - Quick Reference Guide

## Overview
Sentry error monitoring is now fully integrated into 3 critical areas:
1. **Call Initiation** (`callService.ts`)
2. **Webhook Processing** (`webhookController.ts`)
3. **Campaign Calls** (`QueueProcessorService.ts`)

---

## 🚀 Quick Start

### 1. Check Sentry is Working
```bash
# View logs
npm run dev

# Look for this line:
# "Sentry initialized: enabled: true, dsn: '***configured***'"
```

### 2. Access Sentry Dashboard
**URL**: https://sniperthink-up.sentry.io/  
**Project**: node-express

---

## 📊 What Gets Tracked

### ✅ Errors Captured
- Bolna.ai API failures (critical)
- Agent not found errors
- Webhook processing failures
- Campaign call queue failures
- Database errors
- Unauthorized access attempts

### ❌ Errors NOT Captured (Filtered)
- 4xx client errors (validation)
- Expected business errors
- Development environment errors
- Concurrency limit warnings (logged at warning level)

---

## 🔍 Error Types Reference

| Error Type | Severity | Where | What It Means |
|------------|----------|-------|---------------|
| `bolna_api_failure` | Critical | callService | Bolna.ai API is down or failing |
| `agent_not_found` | High | callService | Agent deleted or ID invalid |
| `unauthorized_agent_access` | High | callService | Security issue - user accessing wrong agent |
| `webhook_processing_failed` | High | webhookController | Webhook can't be processed |
| `campaign_call_queue_failure` | High | QueueProcessor | Campaign call failed to initiate |
| `missing_execution_id` | Medium | webhookController | Invalid webhook payload |
| `concurrency_limit` | Warning | callService | Expected - user hit call limit |

---

## 🎯 Sentry Dashboard Features

### View Errors
1. Go to https://sniperthink-up.sentry.io/
2. Click "Issues"
3. Filter by:
   - `error_type:bolna_api_failure`
   - `user_id:YOUR_USER_ID`
   - `environment:production`

### View Performance
1. Click "Performance"
2. See transaction traces:
   - `call.initiate` - Call initiation time
   - `webhook.process` - Webhook processing time
   - `queue.initiate_call` - Queue processing time

### View Breadcrumbs (Debug Trail)
1. Click on any error
2. Scroll to "Breadcrumbs" section
3. See step-by-step what happened before the error

Example breadcrumb trail:
```
1. Starting call initiation
2. Using pre-reserved call slot (callId: abc-123)
3. Agent validated successfully
4. Calling Bolna.ai API
❌ ERROR: Bolna.ai API failure
```

---

## 🔧 Configuration

### Environment Variables
```env
# Required
NODE_ENV=production                    # Must be 'production' to enable Sentry
SENTRY_DSN=https://1cd37eba...         # Your Sentry project DSN

# Optional (with defaults)
SENTRY_ENVIRONMENT=production          # development or production
SENTRY_TRACES_SAMPLE_RATE=0.2         # 20% of transactions (0.0 to 1.0)
SENTRY_PROFILES_SAMPLE_RATE=0.1       # 10% of profiles (0.0 to 1.0)
SENTRY_ENABLE_LOGS=true
SENTRY_SEND_DEFAULT_PII=false         # Never send passwords/tokens
```

### Sample Rates Explained
- `1.0` = 100% (capture all transactions) - **Use in development**
- `0.2` = 20% (1 in 5 transactions) - **Recommended for production**
- `0.1` = 10% (1 in 10 transactions) - **Use if quota is low**

---

## 📈 Quota Management

### Free Plan Limits
- **5,000 errors per month** (resets monthly, NOT rolling)
- **30-day retention**
- **1 user only**

### How to Stay Under Quota
1. **Smart filtering** (already configured):
   - 4xx errors filtered
   - Business errors filtered
   - Development errors not sent

2. **Lower sample rate**:
   ```env
   SENTRY_TRACES_SAMPLE_RATE=0.1  # 10% instead of 20%
   ```

3. **Add more filters** in `instrument.ts::beforeSend()`:
   ```typescript
   // Add more error messages to ignore
   if (errorMessage.includes('timeout')) return null;
   ```

---

## 🧪 Testing Sentry

### Test 1: Trigger Error in Dev
```bash
# Start server
npm run dev

# Make API call with invalid agent
curl -X POST http://localhost:3000/api/calls \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"agentId": "invalid-id", "phoneNumber": "+1234567890"}'
```

**Note**: Error won't appear in Sentry (development mode filtered)

### Test 2: Trigger Error in Production Mode
```bash
# Temporarily enable production mode
$env:NODE_ENV="production"; npm run dev

# Make same API call as above
# Now error WILL appear in Sentry dashboard
```

---

## 🚨 Common Issues & Solutions

### Issue: No Errors in Sentry Dashboard
**Check**:
1. `NODE_ENV=production` (Sentry disabled in development)
2. `SENTRY_DSN` is set correctly
3. Server logs show "Sentry initialized: enabled: true"

### Issue: Too Many Errors (Quota Full)
**Solutions**:
1. Lower sample rate: `SENTRY_TRACES_SAMPLE_RATE=0.1`
2. Add more filters in `instrument.ts`
3. Upgrade Sentry plan

### Issue: Sensitive Data in Errors
**Check**:
1. `SENTRY_SEND_DEFAULT_PII=false`
2. `instrument.ts::beforeSend()` filters passwords/tokens
3. Phone numbers are truncated (last 4 digits only)

---

## 📝 Best Practices

### 1. Check Sentry Daily (First Week)
- Look for unexpected errors
- Verify error context is helpful
- Adjust filters if too noisy

### 2. Set Up Alerts
1. Go to Sentry > Alerts > Create Alert
2. Condition: `error_type:bolna_api_failure`
3. Action: Email/Slack notification

### 3. Use Tags for Filtering
```typescript
// In Sentry dashboard, filter by:
- error_type
- user_id
- campaign_id
- severity
- environment
```

### 4. Review Performance Weekly
- Check `call.initiate` p95 latency
- Monitor `webhook.process` duration
- Identify slow operations

---

## 🎁 Bonus: Advanced Features

### 1. Source Maps (See Exact TypeScript Line)
Already configured! Sentry shows exact TypeScript file and line number.

### 2. Release Tracking
Tag errors by deployment version:
```bash
export SENTRY_RELEASE=$(git rev-parse HEAD)
npm run build
```

### 3. Custom Dashboards
Create custom dashboard with:
- Error rate by type
- p95 latency trends
- User error distribution

---

## 📚 Key Files

| File | Purpose |
|------|---------|
| `instrument.ts` | Sentry initialization and filtering |
| `callService.ts` | Call initiation monitoring |
| `webhookController.ts` | Webhook processing monitoring |
| `QueueProcessorService.ts` | Campaign call monitoring |
| `server.ts` | Sentry middleware integration |

---

## 🔗 Useful Links

- **Sentry Dashboard**: https://sniperthink-up.sentry.io/
- **Sentry Docs**: https://docs.sentry.io/platforms/node/
- **Node.js SDK Guide**: https://docs.sentry.io/platforms/node/guides/express/

---

## ✅ Deployment Checklist

Before deploying to Railway:

- [ ] Set `NODE_ENV=production` in Railway environment
- [ ] Set all 6 Sentry environment variables
- [ ] Lower sample rate to 0.2 (20%)
- [ ] Test locally with `NODE_ENV=production` first
- [ ] Verify error appears in Sentry dashboard
- [ ] Remove any test/debug endpoints
- [ ] Set up Sentry alerts for critical errors

---

## 💡 Quick Tips

1. **Filter by severity**: Use `severity:critical` in Sentry dashboard
2. **Group similar errors**: Sentry auto-groups by error message
3. **Check breadcrumbs first**: Often reveals root cause immediately
4. **Use "Mark as Resolved"**: Track when bugs are fixed
5. **Ignore known issues**: Right-click > "Ignore" for temporary issues

---

**Need Help?**
- Phase 1 docs: `SENTRY_PHASE1_COMPLETE.md`
- Phase 2 docs: `SENTRY_PHASE2_COMPLETE.md`
- Full roadmap: `sentryintegration.md`

🎯 **You're all set! Sentry is monitoring your critical systems 24/7.** 🚀
