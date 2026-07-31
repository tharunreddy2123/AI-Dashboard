# Test script for AI chatbot functionality
Write-Host "Testing OpenShift AI Assistant..." -ForegroundColor Cyan

# Test 1: Backend Health
Write-Host "`n1. Testing backend health..." -ForegroundColor Yellow
try {
    $health = Invoke-WebRequest -Uri http://localhost:8000/health -UseBasicParsing | ConvertFrom-Json
    Write-Host "   OK Backend: $($health.api)" -ForegroundColor Green
    Write-Host "   OK Google AI: $($health.google_ai)" -ForegroundColor Green
    Write-Host "   OK Model: $($health.model)" -ForegroundColor Green
} catch {
    Write-Host "   FAIL Backend health check failed: $_" -ForegroundColor Red
    exit 1
}

# Test 2: Simple Chat
Write-Host "`n2. Testing simple chat..." -ForegroundColor Yellow
try {
    $body = @{
        message = "Hello"
        include_context = $true
    } | ConvertTo-Json

    $response = Invoke-WebRequest -Uri http://localhost:8000/api/chat -Method POST -ContentType "application/json" -Body $body -UseBasicParsing -TimeoutSec 30 | ConvertFrom-Json

    if ($response.response) {
        Write-Host "   OK Chat response received ($(($response.response).Length) characters)" -ForegroundColor Green
        Write-Host "   Response preview: $($response.response.Substring(0, [Math]::Min(100, $response.response.Length)))..." -ForegroundColor Gray
    }
} catch {
    Write-Host "   FAIL Chat test failed: $_" -ForegroundColor Red
    exit 1
}

# Test 3: Cluster Health (if OpenShift is configured)
Write-Host "`n3. Testing cluster health endpoint..." -ForegroundColor Yellow
try {
    $clusterHealth = Invoke-WebRequest -Uri http://localhost:8000/api/openshift/cluster-health -UseBasicParsing -TimeoutSec 30 | ConvertFrom-Json
    Write-Host "   OK Cluster health endpoint working" -ForegroundColor Green
    if ($clusterHealth.ai_analysis) {
        Write-Host "   OK AI analysis included" -ForegroundColor Green
    }
} catch {
    Write-Host "   WARN Cluster health test failed (OK if OpenShift is not configured): $_" -ForegroundColor Yellow
}

Write-Host "`nAll tests passed! AI chatbot is working." -ForegroundColor Green

# Made with Bob
