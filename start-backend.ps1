# OpenShift AI Assistant - Backend Startup
# Usage: .\start-backend.ps1

$PY     = "C:\Users\TharunReddy\AppData\Local\Python\bin\python.exe"
$BDIR   = Join-Path $PSScriptRoot "backend"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  OpenShift AI Assistant - Backend      " -ForegroundColor Cyan
Write-Host "  Port  : 8001                          " -ForegroundColor Green
Write-Host "  Model : meta-llama/llama-3-3-70b       " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  http://localhost:8001/health           " -ForegroundColor Yellow
Write-Host "  Press Ctrl+C to stop                  " -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $BDIR
& $PY -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
