# PowerShell script to restart Docker services

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Restarting Docker Services" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Stop all services
Write-Host "Stopping services..." -ForegroundColor Yellow
docker-compose down

Write-Host ""
Write-Host "Rebuilding frontend (nginx config changed)..." -ForegroundColor Yellow
docker-compose build frontend

Write-Host ""
Write-Host "Starting all services..." -ForegroundColor Yellow
docker-compose up -d

Write-Host ""
Write-Host "Waiting for services to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

Write-Host ""
Write-Host "Service Status:" -ForegroundColor Yellow
docker-compose ps

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Testing Connections" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "1. Testing backend health..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:8000/health" -Method Get
    Write-Host "Backend Status: OK" -ForegroundColor Green
    $response | ConvertTo-Json
} catch {
    Write-Host "Backend not responding" -ForegroundColor Red
}

Write-Host ""
Write-Host "2. Testing frontend..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost/" -Method Get -UseBasicParsing
    Write-Host "Frontend Status: $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "Frontend not responding" -ForegroundColor Red
}

Write-Host ""
Write-Host "3. Testing API proxy..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost/api/health" -Method Get -UseBasicParsing
    Write-Host "API Proxy Status: $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "API Proxy not responding" -ForegroundColor Red
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Services restarted!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Access dashboard at: http://localhost" -ForegroundColor Cyan
Write-Host ""
Write-Host "View logs with: docker-compose logs -f" -ForegroundColor Yellow
Write-Host ""

# Made with Bob
