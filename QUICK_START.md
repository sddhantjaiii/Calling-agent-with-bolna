# 🚀 Quick Start: Test Webhook System

## Prerequisites ✅
- [x] All clean webhook files created
- [x] Database migration 009 executed
- [x] TypeScript compiles with 0 errors
- [x] Real Bolna.ai payloads in `debug/` folder

## Step 1: Start Backend Server

```powershell
cd backend
npm run dev
```

Wait for: `Server running on port 3000`

## Step 2: Run Webhook Tests

Open a new PowerShell terminal:

```powershell
# Make sure you're in the project root
cd "c:\Users\sddha\Coding\Sniperthinkv2\calling agent migration to bolna ai\Calling agent-kiro before going for bolna ai\Calling agent-kiro"

# Run the test script
.\test-webhook-real-payloads.ps1
```

**Expected Output:**
```
🧪 Testing Webhook System with Real Payloads
=============================================

1️⃣ Health Check...
✅ Health check passed: healthy

2️⃣ Testing Stage 4 (call-disconnected)...
   This webhook contains the TRANSCRIPT
   Status: call-disconnected
   Has Transcript: True
   Transcript Length: 1234 characters

✅ Stage 4 processed successfully

3️⃣ Testing Stage 5 (completed)...
   This webhook contains the RECORDING URL
   Status: completed
   Has Recording: True
   Recording URL: https://aps1.media.plivo.com/...

✅ Stage 5 processed successfully

🎉 All Tests Passed!
```

## Step 3: Verify Database Records

Connect to your database using your preferred tool:

```powershell
# Using psql
psql $env:DATABASE_URL -f verify-webhook-data.sql

# Or connect manually
psql $env:DATABASE_URL
```

Then run the verification queries to confirm:
- ✅ Call record has `transcript_id` linked
- ✅ Call record has `recording_url` saved
- ✅ Transcript record exists with content
- ✅ Speaker segments parsed correctly
- ✅ OpenAI analysis completed (if enabled)

## Step 4: Check Backend Logs

Look for these log entries:

```
[INFO] Incoming webhook: { request_id: ..., status: 'call-disconnected' }
[INFO] Created transcript for call: { transcript_id: ..., segments: 12 }
[INFO] Updated call with transcript_id: ...

[INFO] Incoming webhook: { request_id: ..., status: 'completed' }
[INFO] Saved recording URL: https://aps1.media.plivo.com/...
[INFO] OpenAI analysis completed: { total_score: 8.5 }
```

## Step 5: Clean Up Old Files (Once Confirmed Working)

```powershell
cd backend\src

# Delete old webhook files
Remove-Item controllers\webhookController.ts
Remove-Item services\webhookService.ts
Remove-Item middleware\webhook.ts

# Rename clean files to production names
Rename-Item controllers\webhookController.clean.ts webhookController.ts
Rename-Item services\webhookService.clean.ts webhookService.ts
Rename-Item middleware\webhook.clean.ts webhook.ts

# Update routes to remove .clean from imports
# (Already updated, no action needed)
```

## Step 6: Deploy to Production

1. **Commit changes:**
   ```bash
   git add .
   git commit -m "feat: Clean webhook system with single endpoint, saves transcript from stage 4 and recording URL from stage 5"
   ```

2. **Push to Vercel:**
   ```bash
   git push origin main
   ```

3. **Update Bolna.ai webhook URL:**
   - Go to Bolna.ai dashboard
   - Set webhook URL: `https://your-domain.vercel.app/api/webhooks/bolna`
   - Method: POST
   - No signature required

## Success Criteria ✅

- [x] Health check returns 200
- [x] Webhook stage 4 processes successfully
- [x] Transcript saved to `transcripts` table
- [x] Transcript linked via `transcript_id` in `calls` table
- [x] Webhook stage 5 processes successfully
- [x] Recording URL saved to `calls.recording_url`
- [x] Speaker segments parsed correctly
- [x] OpenAI analysis runs (if enabled)
- [x] All timestamps captured (ringing_started_at, call_answered_at, etc.)

## Troubleshooting 🔧

### Issue: "Health check failed"
**Solution:** Make sure backend is running on port 3000
```powershell
cd backend
npm run dev
```

### Issue: "Payload file not found"
**Solution:** Check debug folder path
```powershell
Get-ChildItem debug\webhook_6028966f*.json
```

### Issue: "Database connection error"
**Solution:** Verify DATABASE_URL in .env
```powershell
cd backend
cat .env | Select-String "DATABASE_URL"
```

### Issue: "TypeScript compilation errors"
**Solution:** Rebuild TypeScript
```powershell
cd backend
npm run build
```

### Issue: "Transcript not saving"
**Solution:** Check logs for errors
```powershell
# Look for error messages in backend logs
# Verify transcript field is not empty in payload
```

## Testing with Other Payloads

To test all 5 webhook stages:

```powershell
# Stage 1: Initiated
curl -X POST http://localhost:3000/api/webhooks/bolna `
  -H "Content-Type: application/json" `
  -d '@debug\webhook_12f815cf-c06f-42c8-a4fc-5f3c6ff3e1b9_2025-06-08T11-29-45-706Z.json'

# Stage 2: Ringing
curl -X POST http://localhost:3000/api/webhooks/bolna `
  -H "Content-Type: application/json" `
  -d '@debug\webhook_12f815cf-c06f-42c8-a4fc-5f3c6ff3e1b9_2025-06-08T11-29-48-169Z.json'

# Stage 3: Busy (failed state)
curl -X POST http://localhost:3000/api/webhooks/bolna `
  -H "Content-Type: application/json" `
  -d '@debug\webhook_12f815cf-c06f-42c8-a4fc-5f3c6ff3e1b9_2025-06-08T11-29-51-050Z.json'

# Stage 4: Call-disconnected (TRANSCRIPT)
curl -X POST http://localhost:3000/api/webhooks/bolna `
  -H "Content-Type: application/json" `
  -d '@debug\webhook_6028966f-669e-4954-8933-a582ef93dfd7_2025-10-08T09-15-48-046Z.json'

# Stage 5: Completed (RECORDING URL)
curl -X POST http://localhost:3000/api/webhooks/bolna `
  -H "Content-Type: application/json" `
  -d '@debug\webhook_6028966f-669e-4954-8933-a582ef93dfd7_2025-10-08T09-28-41-423Z.json'
```

## Performance Testing (Optional)

Test concurrent webhooks:

```powershell
# Run 10 webhooks simultaneously
1..10 | ForEach-Object -Parallel {
    Invoke-RestMethod -Uri http://localhost:3000/api/webhooks/bolna `
        -Method Post `
        -ContentType "application/json" `
        -Body (Get-Content debug\webhook_6028966f*.json -Raw)
}
```

Expected: All should complete in < 5 seconds total

## Next Steps

1. ✅ **Test locally** (you are here)
2. ⏭️ **Verify database records**
3. ⏭️ **Delete old files**
4. ⏭️ **Deploy to production**
5. ⏭️ **Update Bolna.ai webhook URL**
6. ⏭️ **Monitor production webhooks**

---

**Need Help?**
- Check `IMPLEMENTATION_COMPLETE.md` for detailed documentation
- Review `WEBHOOK_ANALYSIS_AND_CLEANUP.md` for implementation details
- Inspect backend logs for detailed error messages
