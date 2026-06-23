# Debug script to check all connections

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Docker Connection Debug" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "1. Checking Docker containers..." -ForegroundColor Yellow
docker-compose ps

Write-Host ""
Write-Host "2. Testing backend directly (port 8000)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:8000/health" -Method Get
    Write-Host "✓ Backend is running!" -ForegroundColor Green
    $response | ConvertTo-Json
} catch {
    Write-Host "✗ Backend not accessible on port 8000" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""
Write-Host "3. Testing backend API endpoint directly..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/openshift/cluster-health" -Method Get
    Write-Host "✓ Backend API endpoint works!" -ForegroundColor Green
    Write-Host "Response type: $($response.GetType().Name)" -ForegroundColor Cyan
} catch {
    Write-Host "✗ Backend API endpoint failed" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""
Write-Host "4. Testing nginx proxy (port 80)..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost/" -Method Get -UseBasicParsing
    Write-Host "✓ Nginx is running! Status: $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "✗ Nginx not accessible" -ForegroundColor Red
}

Write-Host ""
Write-Host "5. Testing API through nginx proxy..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost/api/health" -Method Get -UseBasicParsing
    Write-Host "✓ API proxy works! Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Content-Type: $($response.Headers['Content-Type'])" -ForegroundColor Cyan
    Write-Host "Response: $($response.Content)" -ForegroundColor Cyan
} catch {
    Write-Host "✗ API proxy failed" -ForegroundColor Red
    Write-Host "Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""
Write-Host "6. Testing cluster health through nginx..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost/api/openshift/cluster-health" -Method Get -UseBasicParsing
    Write-Host "✓ Cluster health endpoint works!" -ForegroundColor Green
    Write-Host "Content-Type: $($response.Headers['Content-Type'])" -ForegroundColor Cyan
    Write-Host "Response length: $($response.Content.Length) bytes" -ForegroundColor Cyan
} catch {
    Write-Host "✗ Cluster health endpoint failed" -ForegroundColor Red
    Write-Host "Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    
    # Try to read the response body
    try {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response body:" -ForegroundColor Yellow
        Write-Host $responseBody.Substring(0, [Math]::Min(500, $responseBody.Length)) -ForegroundColor Red
    } catch {
        Write-Host "Could not read response body" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "7. Checking backend logs..." -ForegroundColor Yellow
Write-Host "Last 20 lines of backend logs:" -ForegroundColor Cyan
docker-compose logs --tail=20 backend

Write-Host ""
Write-Host "8. Checking nginx logs..." -ForegroundColor Yellow
Write-Host "Last 10 lines of nginx error logs:" -ForegroundColor Cyan
docker-compose logs --tail=10 frontend

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Debug Complete" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Made with Bob
