# How to Restart Backend

Quick guide to restart the backend API after configuration changes.

## Stop Backend

Press `Ctrl+C` in the terminal where the backend is running.

## Restart Backend

**Windows (PowerShell):**
```powershell
cd project/backend

# Activate virtual environment if you created one:
.\venv\Scripts\Activate.ps1

python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**macOS/Linux:**
```bash
cd project/backend

# Activate virtual environment if you created one:
source venv/bin/activate

python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Verify Backend is Running

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

Test the backend:

```powershell
# Windows
Invoke-WebRequest -Uri "http://localhost:8000/health" | Select-Object -ExpandProperty Content
```
```bash
# macOS/Linux
curl http://localhost:8000/health
```

## Configuration Changes

After restarting, the backend will load new configuration from `backend/.env`. Common changes:

- **Google AI key:** `GOOGLE_API_KEY=your_key`
- **Gemini model:** `GEMINI_MODEL=gemini-1.5-flash`
- **OpenShift token:** `OPENSHIFT_TOKEN=sha256~YOUR_TOKEN`
- **CORS origins:** `CORS_ORIGINS=http://localhost:5173`

## Troubleshooting

### Backend won't start

1. **Check Python version:**
   ```bash
   python --version  # Should be 3.9+
   ```

2. **Check dependencies installed:**
   ```bash
   pip list | findstr fastapi           # Windows
   pip list | grep fastapi              # macOS/Linux
   pip list | grep google-generativeai  # Verify AI SDK
   ```

3. **Check port 8000 is available:**
   ```bash
   # Windows
   netstat -ano | findstr 8000

   # macOS/Linux
   lsof -i :8000
   ```

### Google AI connection error

Ensure `GOOGLE_API_KEY` is set in `backend/.env` and is valid:
```bash
cat backend/.env | grep GOOGLE_API_KEY
```

Get a key at https://aistudio.google.com/app/apikey
