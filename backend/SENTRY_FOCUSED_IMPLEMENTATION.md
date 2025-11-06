# 🎯 Focused Sentry Implementation - Critical Areas Only

## Overview
This is a **lean, focused Sentry implementation** that tracks only the most critical errors in your calling agent system. This approach maximizes value while staying well within the **5,000 error/month free plan limit**.

---

## 🎯 Critical Areas to Monitor (Your Requirements)

### 1. **Call Initiation Errors** 🔴
**What**: Errors when starting a call (direct or campaign)
**Why Critical**: If calls fail to start, your core business fails
**Files to Monitor**:
- `callService.ts::initiateCall()` - Main call initiation logic
- `bolnaService.ts::makeCall()` - External API call to Bolna.ai
- `callController.ts::initiateCall()` - HTTP endpoint
- `QueueProcessorService.ts::initiateCall()` - Campaign call processor

### 2. **Webhook Processing Errors** 🔴
**What**: Errors when processing webhooks from Bolna.ai
**Why Critical**: Webhooks update call status, transcripts, recordings - losing these breaks your data
**Files to Monitor**:
- `webhookController.ts::handleWebhook()` - Webhook endpoint
- `webhookService.ts::processWebhook()` - Webhook processing logic
- `webhookDataProcessor.ts` - Data transformation
- `webhookRetryService.ts` - Failed webhook retries

### 3. **Direct Call Errors** 🔴
**What**: User-initiated single calls that fail
**Why Critical**: Direct revenue impact - user expects immediate call
**Files to Monitor**:
- `callController.ts::initiateCall()` - Direct call endpoint
- `CallService.initiateCall()` - Direct call logic

### 4. **Campaign Call Errors** 🔴
**What**: Bulk campaign calls that fail
**Why Critical**: Large-scale failures affect many customers
**Files to Monitor**:
- `CallCampaignService.ts::createCampaign()` - Campaign creation
- `QueueProcessorService.ts` - Campaign call queue processing
- `InMemoryCampaignScheduler.ts` - Campaign scheduling

---

## 🎁 BONUS: Additional High-Value Areas (Recommended)

### 5. **Credit System Failures** 💰
**What**: Errors in credit deduction/validation
**Why Critical**: Revenue loss if credits not deducted, or false blocking if deducted incorrectly
**Files to Monitor**:
- `userService.ts::deductCredits()`
- `creditMonitoringService.ts`

### 6. **Database Connection Failures** 💾
**What**: Database query failures, connection pool exhaustion
**Why Critical**: Entire system breaks without database
**Files to Monitor**:
- `database.ts` - Connection pool
- Any critical queries that fail

### 7. **External API Failures** 🌐
**What**: Bolna.ai API failures, timeouts, rate limits
**Why Critical**: Third-party dependency - need visibility into their issues
**Files to Monitor**:
- `bolnaService.ts::request()` - All Bolna API calls

### 8. **Authentication Failures** 🔐
**What**: JWT validation errors, unauthorized access attempts
**Why Critical**: Security incidents need immediate attention
**Files to Monitor**:
- `authMiddleware.ts` - JWT validation

---

## 📊 Implementation Strategy

### Phase 1: Core Call & Webhook Errors (Days 1-2)
Focus on your 3 requirements:
1. ✅ Call initiation errors
2. ✅ Webhook processing errors
3. ✅ Direct/Campaign call errors

**Estimated Error Volume**: ~500-1,000 errors/month (depends on traffic)

### Phase 2: Critical Business Logic (Days 3-4)
Add high-value areas:
4. ✅ Credit system failures
5. ✅ Database connection failures

**Estimated Additional Volume**: ~200-500 errors/month

### Phase 3: External Dependencies (Days 5-6)
Monitor third-party failures:
6. ✅ Bolna.ai API failures
7. ✅ Authentication failures

**Estimated Additional Volume**: ~100-300 errors/month

### Total Estimated: 800-1,800 errors/month (well under 5,000 limit!)

---

## 🛠️ Implementation Details

### 1. Call Initiation Errors

**File**: `backend/src/services/callService.ts`

```typescript
import * as Sentry from '@sentry/node';

static async initiateCall(callRequest: CallInitiationRequest): Promise<CallInitiationResponse> {
  const span = Sentry.startSpan({ 
    name: 'call.initiation',
    op: 'function'
  });
  
  try {
    // Add context for debugging
    Sentry.setContext('call_initiation', {
      userId: callRequest.user_id,
      agentId: callRequest.agent_id,
      contactId: callRequest.contact_id,
      phoneNumber: callRequest.phone_number, // Careful with PII
      callSource: callRequest.call_source
    });

    Sentry.addBreadcrumb({
      category: 'call',
      message: 'Starting call initiation',
      level: 'info',
      data: {
        userId: callRequest.user_id,
        agentId: callRequest.agent_id
      }
    });

    // ... existing call initiation logic ...

  } catch (error) {
    // CRITICAL: Capture call initiation failures
    Sentry.captureException(error, {
      level: 'error',
      tags: {
        feature: 'call_initiation',
        call_source: callRequest.call_source,
        agent_id: callRequest.agent_id
      },
      extra: {
        userId: callRequest.user_id,
        phoneNumber: callRequest.phone_number,
        agentId: callRequest.agent_id
      }
    });

    logger.error('Call initiation failed', { error, userId: callRequest.user_id });
    throw error;
  } finally {
    span?.end();
  }
}
```

---

### 2. Webhook Processing Errors

**File**: `backend/src/controllers/webhookController.ts`

```typescript
import * as Sentry from '@sentry/node';

async handleWebhook(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const requestId = (req as any).requestId;
  const payload = req.body;

  // Start transaction for webhook processing
  const transaction = Sentry.startTransaction({
    name: 'webhook.processing',
    op: 'http.server',
    data: {
      status: payload?.status,
      execution_id: payload?.id || payload?.execution_id
    }
  });

  try {
    // Quick validation
    if (!payload) {
      const error = new Error('Empty webhook payload');
      Sentry.captureException(error, {
        level: 'warning',
        tags: {
          feature: 'webhook',
          error_type: 'validation'
        }
      });
      
      res.status(400).json({
        success: false,
        error: 'Empty payload',
        request_id: requestId
      });
      return;
    }

    const status = payload.status || 'unknown';
    const executionId = payload.id || payload.execution_id;

    // Add context
    Sentry.setContext('webhook', {
      status,
      execution_id: executionId,
      agent_id: payload.agent_id,
      has_transcript: !!payload.transcript,
      has_recording: !!payload.telephony_data?.recording_url
    });

    // Validate required fields
    if (!executionId) {
      const error = new Error('Missing execution_id in webhook');
      Sentry.captureException(error, {
        level: 'error',
        tags: {
          feature: 'webhook',
          error_type: 'validation',
          status: status
        },
        extra: { payload }
      });

      res.status(400).json({
        success: false,
        error: 'Missing execution_id or id field',
        request_id: requestId
      });
      return;
    }

    // Process webhook
    await webhookService.processWebhook(payload, status);

    const processingTime = Date.now() - startTime;
    logger.info('✅ Webhook processed successfully', {
      request_id: requestId,
      status,
      execution_id: executionId,
      processing_time_ms: processingTime
    });

    res.status(200).json({
      success: true,
      message: `Webhook processed (${status})`,
      processing_time_ms: processingTime,
      request_id: requestId
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // CRITICAL: Capture webhook processing failures
    Sentry.captureException(error, {
      level: 'error',
      tags: {
        feature: 'webhook',
        status: payload?.status,
        error_type: 'processing_failure'
      },
      extra: {
        execution_id: payload?.id || payload?.execution_id,
        status: payload?.status,
        processing_time_ms: processingTime,
        request_id: requestId
      }
    });

    logger.error('❌ Webhook processing failed', {
      request_id: requestId,
      error: errorMessage,
      execution_id: payload?.id || payload?.execution_id,
      status: payload?.status,
      processing_time_ms: processingTime
    });

    // Return 200 to prevent retries (already captured in Sentry)
    res.status(200).json({
      success: false,
      error: errorMessage,
      processing_time_ms: processingTime,
      request_id: requestId
    });
  } finally {
    transaction?.finish();
  }
}
```

---

### 3. Campaign Call Errors

**File**: `backend/src/services/QueueProcessorService.ts`

```typescript
import * as Sentry from '@sentry/node';

private async initiateCall(queueItem: any): Promise<void> {
  const span = Sentry.startSpan({
    name: 'campaign.call.initiation',
    op: 'function'
  });

  try {
    // Add campaign context
    Sentry.setContext('campaign_call', {
      campaignId: queueItem.campaign_id,
      queueItemId: queueItem.id,
      contactId: queueItem.contact_id,
      agentId: queueItem.agent_id,
      userId: queueItem.user_id
    });

    Sentry.addBreadcrumb({
      category: 'campaign',
      message: 'Processing campaign call from queue',
      level: 'info',
      data: {
        campaignId: queueItem.campaign_id,
        queueItemId: queueItem.id
      }
    });

    // ... existing campaign call logic ...

    const callResponse = await CallService.initiateCall({
      user_id: queueItem.user_id,
      agent_id: queueItem.agent_id,
      contact_id: queueItem.contact_id,
      phone_number: queueItem.phone_number,
      call_source: 'campaign',
      campaign_id: queueItem.campaign_id
    });

    // ... rest of logic ...

  } catch (error) {
    // CRITICAL: Capture campaign call failures
    Sentry.captureException(error, {
      level: 'error',
      tags: {
        feature: 'campaign_call',
        campaign_id: queueItem.campaign_id,
        error_type: 'initiation_failure'
      },
      extra: {
        queueItemId: queueItem.id,
        contactId: queueItem.contact_id,
        userId: queueItem.user_id,
        agentId: queueItem.agent_id
      }
    });

    logger.error('Campaign call failed', {
      error,
      campaignId: queueItem.campaign_id,
      queueItemId: queueItem.id
    });

    throw error;
  } finally {
    span?.end();
  }
}
```

---

### 4. Bolna.ai API Errors

**File**: `backend/src/services/bolnaService.ts`

```typescript
import * as Sentry from '@sentry/node';

async makeCall(callData: BolnaCallRequest): Promise<BolnaCallResponse> {
  const span = Sentry.startSpan({
    name: 'bolna.api.makeCall',
    op: 'http.client'
  });

  try {
    Sentry.addBreadcrumb({
      category: 'external_api',
      message: 'Calling Bolna.ai API',
      level: 'info',
      data: {
        agentId: callData.agent_id,
        recipientPhone: callData.recipient_phone
      }
    });

    const response = await this.request(
      '/call',
      'POST',
      callData,
      'makeCall'
    );

    return response as BolnaCallResponse;

  } catch (error) {
    // CRITICAL: Capture Bolna API failures
    Sentry.captureException(error, {
      level: 'error',
      tags: {
        feature: 'external_api',
        api_provider: 'bolna',
        endpoint: '/call',
        error_type: 'api_failure'
      },
      extra: {
        agentId: callData.agent_id,
        recipientPhone: callData.recipient_phone,
        httpMethod: 'POST'
      }
    });

    logger.error('Bolna API call failed', { error, agentId: callData.agent_id });
    throw error;
  } finally {
    span?.end();
  }
}

// Generic request method - catch all API errors
private async request(/* ... params ... */): Promise<any> {
  try {
    // ... existing request logic ...
  } catch (error) {
    // Capture all Bolna API errors
    if (error.response?.status >= 500) {
      // Bolna server errors
      Sentry.captureException(error, {
        level: 'error',
        tags: {
          feature: 'external_api',
          api_provider: 'bolna',
          http_status: error.response.status,
          error_type: 'server_error'
        }
      });
    } else if (error.response?.status === 429) {
      // Rate limiting
      Sentry.captureMessage('Bolna API rate limit exceeded', {
        level: 'warning',
        tags: {
          feature: 'external_api',
          api_provider: 'bolna',
          error_type: 'rate_limit'
        }
      });
    }
    throw error;
  }
}
```

---

### 5. Credit System Errors (BONUS)

**File**: `backend/src/services/userService.ts`

```typescript
import * as Sentry from '@sentry/node';

async deductCredits(userId: string, amount: number): Promise<void> {
  try {
    Sentry.addBreadcrumb({
      category: 'billing',
      message: 'Deducting credits',
      level: 'info',
      data: { userId, amount }
    });

    // ... existing credit deduction logic ...

  } catch (error) {
    // CRITICAL: Credit deduction failures = revenue loss
    Sentry.captureException(error, {
      level: 'critical', // Use 'critical' for financial errors
      tags: {
        feature: 'billing',
        error_type: 'credit_deduction_failure'
      },
      extra: {
        userId,
        amount,
        operation: 'deduct_credits'
      }
    });

    logger.error('Credit deduction failed', { error, userId, amount });
    throw error;
  }
}
```

---

## 🚫 What NOT to Monitor (Save Your Quota)

### ❌ Don't Monitor These:
1. **4xx Client Errors** (validation, not found) - user mistakes, not bugs
2. **Development/Test Environments** - filter these out completely
3. **Known/Expected Errors** - use `beforeSend` to filter
4. **Low-priority Features** - analytics dashboards, reports
5. **Successful Operations** - don't capture success messages

### Filter Configuration

**File**: `backend/src/instrument.ts`

```typescript
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
  
  // CRITICAL: Only send errors from production
  enabled: process.env.NODE_ENV === 'production',
  
  // Sample rates - adjust based on traffic
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0, // 10% in prod
  
  beforeSend(event, hint) {
    // Filter out development/test environments
    if (process.env.NODE_ENV !== 'production') {
      return null;
    }

    // Filter out 4xx client errors (not bugs)
    if (event.request?.data?.statusCode && event.request.data.statusCode < 500) {
      return null;
    }

    // Filter out known errors
    const error = hint.originalException;
    if (error instanceof Error) {
      // Filter out "user not found" - expected business logic
      if (error.message.includes('User not found')) {
        return null;
      }
      
      // Filter out validation errors
      if (error.message.includes('Validation failed')) {
        return null;
      }
      
      // Filter out "agent not found"
      if (error.message.includes('Agent not found')) {
        return null;
      }
    }

    // Remove sensitive data
    if (event.request?.data) {
      const data = event.request.data;
      if (data.password) delete data.password;
      if (data.token) delete data.token;
      if (data.api_key) delete data.api_key;
    }

    return event;
  },
});
```

---

## 📈 Monitoring Your Quota

### Check Usage Dashboard
```typescript
// Add to health check endpoint
app.get('/health', async (req, res) => {
  res.json({
    status: 'OK',
    sentry: {
      enabled: Sentry.isInitialized(),
      environment: process.env.SENTRY_ENVIRONMENT,
      // Check quota in Sentry dashboard manually
    }
  });
});
```

### Weekly Quota Check Routine
1. **Monday**: Check Sentry dashboard usage
2. **If > 3,000 errors**: Adjust sample rates or add more filters
3. **If < 1,000 errors**: Consider adding more monitoring points

---

## 🎯 Success Metrics

### Week 1 Goals:
- ✅ Catch **100% of call initiation failures**
- ✅ Catch **100% of webhook processing failures**
- ✅ Catch **100% of campaign call failures**
- ✅ Stay under **2,000 errors** (40% of quota)

### Week 2 Goals:
- ✅ Add credit system monitoring
- ✅ Add database connection monitoring
- ✅ Stay under **3,000 errors** (60% of quota)

### Month 1 Goals:
- ✅ Add external API monitoring
- ✅ Fine-tune filters
- ✅ Stay under **4,000 errors** (80% of quota - safe buffer)

---

## 🚀 Quick Start Checklist

### Day 1: Setup
- [ ] Install Sentry packages: `npm install @sentry/node @sentry/profiling-node`
- [ ] Create `instrument.ts` with DSN from `.env`
- [ ] Import `instrument.ts` in `server.ts` (FIRST import)
- [ ] Add Sentry middleware to Express

### Day 2: Core Monitoring
- [ ] Add Sentry to `callService.ts::initiateCall()`
- [ ] Add Sentry to `webhookController.ts::handleWebhook()`
- [ ] Add Sentry to `QueueProcessorService.ts::initiateCall()`
- [ ] Test with deliberate errors

### Day 3: Verify
- [ ] Check Sentry dashboard for errors
- [ ] Verify context data is correct
- [ ] Check quota usage
- [ ] Adjust filters if needed

---

## 🔧 Troubleshooting

### Issue: Too Many Errors
**Solution**: Add more aggressive filtering in `beforeSend`

### Issue: Missing Context
**Solution**: Add more `Sentry.setContext()` calls

### Issue: Quota Exceeded
**Solution**: Lower `tracesSampleRate` to 0.05 (5%)

---

## 📚 Next Steps

1. **Implement Phase 1** (Days 1-2)
2. **Monitor for 1 week** - check quota usage
3. **Adjust filters** based on error patterns
4. **Implement Phase 2** (Days 3-4) if quota allows
5. **Set up alerts** in Sentry for critical errors

---

**Document Version**: 1.0  
**Last Updated**: November 5, 2025  
**Focus**: Lean, critical-path monitoring within free plan limits
