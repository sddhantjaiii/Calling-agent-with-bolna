# Simple Webhook Test Script
# Tests the clean webhook system with real Bolna.ai payloads

Write-Host "===========================================================================" -ForegroundColor Cyan
Write-Host "Testing Webhook System with Real Payloads" -ForegroundColor Cyan
Write-Host "===========================================================================" -ForegroundColor Cyan
Write-Host ""

$executionId = "6028966f-669e-4954-8933-a582ef93dfd7"
$baseUrl = "http://localhost:3000/api/webhooks/bolna"

Write-Host "Test Execution ID: $executionId" -ForegroundColor Yellow
Write-Host ""

# Test 1: Health Check
Write-Host "TEST 1: Health Check" -ForegroundColor Yellow
Write-Host "--------------------" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3000/api/webhooks/health" -Method Get
    Write-Host "SUCCESS - Health check passed" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "FAILED - Health check failed: $_" -ForegroundColor Red
    Write-Host "Make sure backend is running with: npm run dev" -ForegroundColor Yellow
    exit 1
}

# Test 2: Stage 4 (transcript)
Write-Host "TEST 2: Stage 4 - Saving Transcript" -ForegroundColor Yellow
Write-Host "------------------------------------" -ForegroundColor Yellow

$payload4File = ".\debug\webhook_${executionId}_2025-10-08T09-15-48-046Z.json"

if (-not (Test-Path $payload4File)) {
    Write-Host "FAILED - Payload file not found: $payload4File" -ForegroundColor Red
    exit 1
}

try {
    $payload4 = Get-Content $payload4File -Raw | ConvertFrom-Json
    
    Write-Host "Payload Status: $($payload4.status)" -ForegroundColor Cyan
    if ($payload4.transcript) {
        Write-Host "Transcript Length: $($payload4.transcript.Length) characters" -ForegroundColor Cyan
    } else {
        Write-Host "WARNING: No transcript in payload!" -ForegroundColor Yellow
    }
    
    $response4 = Invoke-RestMethod -Uri $baseUrl `
        -Method Post `
        -ContentType "application/json" `
        -Body ($payload4 | ConvertTo-Json -Depth 10 -Compress)
    
    Write-Host "SUCCESS - Stage 4 processed" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "FAILED - Stage 4 error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Start-Sleep -Seconds 2

# Test 3: Stage 5 (recording URL)
Write-Host "TEST 3: Stage 5 - Saving Recording URL" -ForegroundColor Yellow
Write-Host "---------------------------------------" -ForegroundColor Yellow

$payload5File = ".\debug\webhook_${executionId}_2025-10-08T09-28-41-423Z.json"

if (-not (Test-Path $payload5File)) {
    Write-Host "FAILED - Payload file not found: $payload5File" -ForegroundColor Red
    exit 1
}

try {
    $payload5 = Get-Content $payload5File -Raw | ConvertFrom-Json
    
    Write-Host "Payload Status: $($payload5.status)" -ForegroundColor Cyan
    if ($payload5.telephony_data.recording_url) {
        Write-Host "Recording URL Found: YES" -ForegroundColor Cyan
    } else {
        Write-Host "WARNING: No recording URL in payload!" -ForegroundColor Yellow
    }
    
    $response5 = Invoke-RestMethod -Uri $baseUrl `
        -Method Post `
        -ContentType "application/json" `
        -Body ($payload5 | ConvertTo-Json -Depth 10 -Compress)
    
    Write-Host "SUCCESS - Stage 5 processed" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "FAILED - Stage 5 error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Summary
Write-Host "===========================================================================" -ForegroundColor Cyan
Write-Host "ALL TESTS PASSED!" -ForegroundColor Green
Write-Host "===========================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Verify database records using the SQL queries below" -ForegroundColor White
Write-Host "2. Check transcript was saved to transcripts table" -ForegroundColor White
Write-Host "3. Check recording URL was saved to calls table" -ForegroundColor White
Write-Host ""
Write-Host "Database Verification:" -ForegroundColor Cyan
Write-Host @"

-- Check call record
SELECT 
  bolna_execution_id,
  transcript_id IS NOT NULL as has_transcript_link,
  recording_url IS NOT NULL as has_recording_url,
  call_lifecycle_status,
  hangup_by
FROM calls
WHERE bolna_execution_id = '$executionId';

-- Check transcript
SELECT 
  LENGTH(content) as transcript_length,
  jsonb_array_length(speaker_segments) as segment_count
FROM transcripts t
JOIN calls c ON t.call_id = c.id
WHERE c.bolna_execution_id = '$executionId';

"@ -ForegroundColor White

Write-Host "Test completed successfully!" -ForegroundColor Green
