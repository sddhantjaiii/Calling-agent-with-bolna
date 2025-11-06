# Cleanup Script - Remove Unused Twilio Files
# Run this script if you want to delete the unused Twilio missed calls files

Write-Host "🧹 Twilio Missed Calls Cleanup Script" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

$backendPath = "backend\src"
$filesToRemove = @(
    "$backendPath\services\twilioMissedCallsService.ts",
    "$backendPath\schedulers\missedCallsScheduler.ts",
    "$backendPath\controllers\twilioController.ts",
    "$backendPath\routes\twilio.ts",
    "$backendPath\scripts\test-twilio-integration.ts"
)

Write-Host "📋 Files to be removed:" -ForegroundColor Yellow
foreach ($file in $filesToRemove) {
    if (Test-Path $file) {
        Write-Host "  ✓ $file" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $file (not found)" -ForegroundColor Red
    }
}
Write-Host ""

$confirmation = Read-Host "Do you want to delete these files? (yes/no)"

if ($confirmation -eq "yes" -or $confirmation -eq "y") {
    Write-Host ""
    Write-Host "🗑️  Deleting files..." -ForegroundColor Yellow
    
    $deletedCount = 0
    $notFoundCount = 0
    
    foreach ($file in $filesToRemove) {
        if (Test-Path $file) {
            try {
                Remove-Item $file -Force
                Write-Host "  ✅ Deleted: $file" -ForegroundColor Green
                $deletedCount++
            } catch {
                Write-Host "  ❌ Failed to delete: $file" -ForegroundColor Red
                Write-Host "     Error: $_" -ForegroundColor Red
            }
        } else {
            Write-Host "  ⚠️  Not found: $file" -ForegroundColor Yellow
            $notFoundCount++
        }
    }
    
    Write-Host ""
    Write-Host "✅ Cleanup completed!" -ForegroundColor Green
    Write-Host "   📊 Summary:" -ForegroundColor Cyan
    Write-Host "      - Deleted: $deletedCount files" -ForegroundColor Green
    Write-Host "      - Not found: $notFoundCount files" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "🎉 All unused Twilio files have been removed!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ Cleanup cancelled. No files were deleted." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📝 Note: The files are no longer used by the application," -ForegroundColor Cyan
Write-Host "   but you can keep them if you might need them later." -ForegroundColor Cyan
