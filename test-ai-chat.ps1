# Test script for AI chatbot functionality
Write-Host "Testing OpenShift AI Assistant..." -ForegroundColor Cyan

# Test 1: Backend Health
Write-Host "`n1. Testing backend health..." -ForegroundColor Yellow
try {
    $health = Invoke-WebRequest -Uri http://localhost:8000/health -UseBasicParsing | ConvertFrom-Json
    Write-Host "   ✓ Backend: $($health.api)" -ForegroundColor Green
    Write-Host "   ✓ Ollama: $($health.ollama)" -ForegroundColor Green
    Write-Host "   ✓ Model: $($health.model)" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Backend health check failed: $_" -ForegroundColor Red
    exit 1
}

# Test 2: Simple Chat
Write-Host "`n2. Testing simple chat..." -ForegroundColor Yellow
try {
    $body = @{
        message = "Hello"
        include_context = $true
    } | ConvertTo-Json
    
    $response = Invoke-WebRequest -Uri http://localhost:8000/api/chat -Method POST -ContentType "application/json" -Body $body -UseBasicParsing -TimeoutSec 120 | ConvertFrom-Json
    
    if ($response.response) {
        Write-Host "   ✓ Chat response received ($(($response.response).Length) characters)" -ForegroundColor Green
        Write-Host "   Response preview: $($response.response.Substring(0, [Math]::Min(100, $response.response.Length)))..." -ForegroundColor Gray
    }
} catch {
    Write-Host "   ✗ Chat test failed: $_" -ForegroundColor Red
    exit 1
}

# Test 3: Cluster Health (if OpenShift is configured)
Write-Host "`n3. Testing cluster health endpoint..." -ForegroundColor Yellow
try {
    $clusterHealth = Invoke-WebRequest -Uri http://localhost:8000/api/openshift/cluster-health -UseBasicParsing -TimeoutSec 120 | ConvertFrom-Json
    Write-Host "   ✓ Cluster health endpoint working" -ForegroundColor Green
    if ($clusterHealth.ai_analysis) {
        Write-Host "   ✓ AI analysis included" -ForegroundColor Green
    }
} catch {
    Write-Host "   ⚠ Cluster health test failed (this is OK if OpenShift is not configured): $_" -ForegroundColor Yellow
}

Write-Host "`n✓ All tests passed! AI chatbot is working." -ForegroundColor Green
Write-Host "`nNote: First chat request may take 20-30 seconds as the model loads." -ForegroundColor Cyan

# Made with Bob
