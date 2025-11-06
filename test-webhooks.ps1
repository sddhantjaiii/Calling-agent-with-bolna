# Webhook Testing Script
# Save as: test-webhooks.sh (Linux/Mac) or test-webhooks.ps1 (Windows)

$BASE_URL = "http://localhost:3000"
$EXECUTION_ID = "test_$(Get-Date -Format 'yyyyMMddHHmmss')"
$AGENT_ID = "your_bolna_agent_id_here"  # UPDATE THIS
$PHONE_NUMBER = "+1 234-567-8900"

Write-Host "🧪 Webhook Testing Script" -ForegroundColor Cyan
Write-Host "=========================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Base URL: $BASE_URL" -ForegroundColor Yellow
Write-Host "Execution ID: $EXECUTION_ID" -ForegroundColor Yellow
Write-Host ""

# Test 1: Health Check
Write-Host "Test 1: Health Check" -ForegroundColor Green
Write-Host "--------------------" -ForegroundColor Green
$response = Invoke-RestMethod -Uri "$BASE_URL/api/webhooks/health" -Method Get
Write-Host "Response:" -ForegroundColor White
$response | ConvertTo-Json
Write-Host ""
Start-Sleep -Seconds 1

# Test 2: Lifecycle - Initiated
Write-Host "Test 2: Lifecycle Event - Initiated" -ForegroundColor Green
Write-Host "-----------------------------------" -ForegroundColor Green
$body = @{
    event = "initiated"
    execution_id = $EXECUTION_ID
    agent_id = $AGENT_ID
    phone_number = $PHONE_NUMBER
    timestamp = (Get-Date).ToString("o")
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/webhooks/bolna/lifecycle" `
        -Method Post `
        -ContentType "application/json" `
        -Body $body
    Write-Host "✅ Success" -ForegroundColor Green
    $response | ConvertTo-Json
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""
Start-Sleep -Seconds 1

# Test 3: Lifecycle - Ringing
Write-Host "Test 3: Lifecycle Event - Ringing" -ForegroundColor Green
Write-Host "---------------------------------" -ForegroundColor Green
$body = @{
    event = "ringing"
    execution_id = $EXECUTION_ID
    agent_id = $AGENT_ID
    phone_number = $PHONE_NUMBER
    timestamp = (Get-Date).ToString("o")
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/webhooks/bolna/lifecycle" `
        -Method Post `
        -ContentType "application/json" `
        -Body $body
    Write-Host "✅ Success" -ForegroundColor Green
    $response | ConvertTo-Json
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""
Start-Sleep -Seconds 1

# Test 4: Lifecycle - In Progress
Write-Host "Test 4: Lifecycle Event - In Progress" -ForegroundColor Green
Write-Host "-------------------------------------" -ForegroundColor Green
$body = @{
    event = "in-progress"
    execution_id = $EXECUTION_ID
    agent_id = $AGENT_ID
    phone_number = $PHONE_NUMBER
    timestamp = (Get-Date).ToString("o")
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/webhooks/bolna/lifecycle" `
        -Method Post `
        -ContentType "application/json" `
        -Body $body
    Write-Host "✅ Success" -ForegroundColor Green
    $response | ConvertTo-Json
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""
Start-Sleep -Seconds 2

# Test 5: Lifecycle - Call Disconnected
Write-Host "Test 5: Lifecycle Event - Call Disconnected" -ForegroundColor Green
Write-Host "------------------------------------------" -ForegroundColor Green
$body = @{
    event = "call-disconnected"
    execution_id = $EXECUTION_ID
    agent_id = $AGENT_ID
    phone_number = $PHONE_NUMBER
    hangup_by = "user"
    hangup_reason = "call_completed"
    timestamp = (Get-Date).ToString("o")
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/webhooks/bolna/lifecycle" `
        -Method Post `
        -ContentType "application/json" `
        -Body $body
    Write-Host "✅ Success" -ForegroundColor Green
    $response | ConvertTo-Json
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""
Start-Sleep -Seconds 1

# Test 6: Completed Call with Transcript
Write-Host "Test 6: Completed Call with Transcript" -ForegroundColor Green
Write-Host "--------------------------------------" -ForegroundColor Green
$body = @{
    execution_id = $EXECUTION_ID
    agent_id = $AGENT_ID
    phone_number = $PHONE_NUMBER
    duration_seconds = 120
    status = "done"
    timestamp = (Get-Date).ToString("o")
    transcript = @(
        @{
            role = "agent"
            message = "Hello! Thanks for calling. How can I help you today?"
            timestamp = (Get-Date).AddSeconds(-110).ToString("o")
        },
        @{
            role = "user"
            message = "Hi, I'm interested in your product. Can you tell me about pricing?"
            timestamp = (Get-Date).AddSeconds(-105).ToString("o")
        },
        @{
            role = "agent"
            message = "Absolutely! Our pricing starts at $99 per month. What's your email so I can send you more details?"
            timestamp = (Get-Date).AddSeconds(-95).ToString("o")
        },
        @{
            role = "user"
            message = "Sure, it's john.doe@example.com"
            timestamp = (Get-Date).AddSeconds(-85).ToString("o")
        },
        @{
            role = "agent"
            message = "Great! I'll send that right over. Is there anything else I can help you with?"
            timestamp = (Get-Date).AddSeconds(-75).ToString("o")
        },
        @{
            role = "user"
            message = "No, that's all for now. Thank you!"
            timestamp = (Get-Date).AddSeconds(-60).ToString("o")
        }
    )
    metadata = @{
        call_duration_secs = 120
        phone_call = @{
            external_number = $PHONE_NUMBER
        }
    }
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/webhooks/bolna" `
        -Method Post `
        -ContentType "application/json" `
        -Body $body
    Write-Host "✅ Success" -ForegroundColor Green
    $response | ConvertTo-Json
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Error Details:" -ForegroundColor Red
    $_.Exception | Format-List -Force
}
Write-Host ""

# Summary
Write-Host "=========================" -ForegroundColor Cyan
Write-Host "🎉 Testing Complete!" -ForegroundColor Cyan
Write-Host "=========================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Check backend logs for processing details" -ForegroundColor White
Write-Host "2. Verify database records:" -ForegroundColor White
Write-Host "   SELECT * FROM calls WHERE bolna_execution_id = '$EXECUTION_ID';" -ForegroundColor Gray
Write-Host "   SELECT * FROM lead_analytics WHERE phone_number = '$PHONE_NUMBER';" -ForegroundColor Gray
Write-Host "3. Check OpenAI API calls in logs" -ForegroundColor White
Write-Host ""
