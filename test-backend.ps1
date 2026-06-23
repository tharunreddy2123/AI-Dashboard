# Test backend connectivity

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Backend Connection Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "1. Testing backend health endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:8000/health" -Method Get -TimeoutSec 5
    Write-Host "Success: Backend is responding!" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Cyan
    $response | ConvertTo-Json -Depth 3
} catch {
    Write-Host "Failed: Backend health check failed" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Is the backend running? Start it with:" -ForegroundColor Yellow
    Write-Host "  cd backend" -ForegroundColor White
    Write-Host "  python main.py" -ForegroundColor White
    exit 1
}

Write-Host ""
Write-Host "2. Testing simple chat endpoint (without cluster data)..." -ForegroundColor Yellow
try {
    $body = @{
        message = "Hello"
        include_context = $false
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/chat" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10
    Write-Host "Success: Chat endpoint works!" -ForegroundColor Green
    Write-Host "Response: $($response.response.Substring(0, [Math]::Min(100, $response.response.Length)))..." -ForegroundColor Cyan
} catch {
    Write-Host "Failed: Chat endpoint failed" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""
Write-Host "3. Testing cluster health endpoint (may be slow)..." -ForegroundColor Yellow
Write-Host "This may take 30-60 seconds..." -ForegroundColor Yellow
try {
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/openshift/cluster-health" -Method Get -TimeoutSec 60
    $stopwatch.Stop()
    
    Write-Host "Success: Cluster health endpoint works!" -ForegroundColor Green
    Write-Host "Time taken: $($stopwatch.Elapsed.TotalSeconds) seconds" -ForegroundColor Cyan
    Write-Host "Response keys: $($response.PSObject.Properties.Name -join ', ')" -ForegroundColor Cyan
} catch {
    Write-Host "Failed: Cluster health endpoint failed or timed out" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Possible issues:" -ForegroundColor Yellow
    Write-Host "  - Ollama not running in Docker (start with: docker-compose up -d ollama)" -ForegroundColor White
    Write-Host "  - OpenShift token expired or invalid" -ForegroundColor White
    Write-Host "  - Network connectivity issues" -ForegroundColor White
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test Complete" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Made with Bob
