# Test Webhook System with Real Bolna.ai Payloads
# This script tests the complete webhook flow using actual production payloads

param(
    [string]$BaseUrl = "http://localhost:3000/api/webhooks/bolna",
    [string]$DebugFolder = "..\debug"
)

Write-Host "🧪 Testing Webhook System with Real Payloads" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Test execution ID (from real production call)
$executionId = "6028966f-669e-4954-8933-a582ef93dfd7"

Write-Host "📋 Test Plan:" -ForegroundColor Yellow
Write-Host "  - Execution ID: $executionId"
Write-Host '  - Testing Stage 4 (status call-disconnected with TRANSCRIPT)'
Write-Host '  - Testing Stage 5 (status completed with RECORDING URL)'
Write-Host ""

# Test 1: Health Check
Write-Host "1️⃣ Health Check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3000/api/webhooks/health" -Method Get
    Write-Host "✅ Health check passed: $($health.status)" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "❌ Health check failed: $_" -ForegroundColor Red
    Write-Host "Make sure backend is running: npm run dev" -ForegroundColor Yellow
    exit 1
}

# Test 2: Webhook Stage 4 - TRANSCRIPT IS HERE
Write-Host '2️⃣ Testing Stage 4...' -ForegroundColor Yellow
Write-Host '   This webhook contains the TRANSCRIPT' -ForegroundColor White

$payload4Path = Join-Path $DebugFolder "webhook_${executionId}_2025-10-08T09-15-48-046Z.json"

if (-not (Test-Path $payload4Path)) {
    Write-Host "❌ Payload file not found: $payload4Path" -ForegroundColor Red
    exit 1
}

try {
    $payload4 = Get-Content $payload4Path | ConvertFrom-Json
    
    Write-Host "   Status: $($payload4.status)" -ForegroundColor Cyan
    Write-Host "   Has Transcript: $($payload4.transcript -ne $null)" -ForegroundColor Cyan
    Write-Host "   Transcript Length: $($payload4.transcript.Length) characters" -ForegroundColor Cyan
    Write-Host ""
    
    $response4 = Invoke-RestMethod -Uri $BaseUrl `
        -Method Post `
        -ContentType "application/json" `
        -Body ($payload4 | ConvertTo-Json -Depth 10)
    
    Write-Host "✅ Stage 4 processed successfully" -ForegroundColor Green
    Write-Host "   Response: $($response4.message)" -ForegroundColor White
    Write-Host "   Processing Time: $($response4.processing_time_ms)ms" -ForegroundColor White
    Write-Host ""
} catch {
    Write-Host "❌ Stage 4 failed: $_" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Start-Sleep -Seconds 2

# Test 3: Webhook Stage 5 - RECORDING URL IS HERE
Write-Host '3️⃣ Testing Stage 5...' -ForegroundColor Yellow
Write-Host '   This webhook contains the RECORDING URL' -ForegroundColor White

$payload5Path = Join-Path $DebugFolder "webhook_${executionId}_2025-10-08T09-28-41-423Z.json"

if (-not (Test-Path $payload5Path)) {
    Write-Host "❌ Payload file not found: $payload5Path" -ForegroundColor Red
    exit 1
}

try {
    $payload5 = Get-Content $payload5Path | ConvertFrom-Json
    
    Write-Host "   Status: $($payload5.status)" -ForegroundColor Cyan
    Write-Host "   Has Recording: $($payload5.telephony_data.recording_url -ne $null)" -ForegroundColor Cyan
    Write-Host "   Recording URL: $($payload5.telephony_data.recording_url)" -ForegroundColor Cyan
    Write-Host ""
    
    $response5 = Invoke-RestMethod -Uri $BaseUrl `
        -Method Post `
        -ContentType "application/json" `
        -Body ($payload5 | ConvertTo-Json -Depth 10)
    
    Write-Host "✅ Stage 5 processed successfully" -ForegroundColor Green
    Write-Host "   Response: $($response5.message)" -ForegroundColor White
    Write-Host "   Processing Time: $($response5.processing_time_ms)ms" -ForegroundColor White
    Write-Host ""
} catch {
    Write-Host "❌ Stage 5 failed: $_" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# Summary
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "🎉 All Tests Passed!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Verify database records" -ForegroundColor White
Write-Host "  2. Check transcript was saved to transcripts table" -ForegroundColor White
Write-Host "  3. Check recording URL was saved to calls table" -ForegroundColor White
Write-Host ""

# Database verification queries
Write-Host "💾 Database Verification Queries:" -ForegroundColor Cyan
Write-Host ""
Write-Host "-- Check call record" -ForegroundColor DarkGray
Write-Host @"
SELECT 
  id,
  bolna_execution_id,
  call_lifecycle_status,
  transcript_id,
  recording_url IS NOT NULL as has_recording,
  duration_seconds,
  hangup_by,
  hangup_reason,
  ringing_started_at,
  call_answered_at,
  call_disconnected_at,
  completed_at
FROM calls
WHERE bolna_execution_id = '$executionId';
"@ -ForegroundColor White

Write-Host ""
Write-Host "-- Check transcript record" -ForegroundColor DarkGray
Write-Host @"
SELECT 
  t.id as transcript_id,
  t.call_id,
  LENGTH(t.content) as transcript_length,
  jsonb_array_length(t.speaker_segments) as segments_count,
  c.bolna_execution_id,
  c.transcript_id as call_transcript_link
FROM transcripts t
JOIN calls c ON t.call_id = c.id
WHERE c.bolna_execution_id = '$executionId';
"@ -ForegroundColor White

Write-Host ""
Write-Host "-- Check OpenAI analysis" -ForegroundColor DarkGray
Write-Host @"
SELECT 
  la.id,
  la.call_id,
  la.analysis_type,
  la.total_score,
  la.lead_status_tag,
  c.bolna_execution_id
FROM lead_analytics la
JOIN calls c ON la.call_id = c.id
WHERE c.bolna_execution_id = '$executionId';
"@ -ForegroundColor White

Write-Host ""
Write-Host "✅ Test script completed successfully!" -ForegroundColor Green
