# How to Restart Backend to Load New Configuration

The backend is still using the old `OLLAMA_BASE_URL=http://ollama:11434` configuration.

## Quick Fix

**Stop the backend** (press Ctrl+C in the terminal where it's running)

**Then restart it:**

```powershell
cd C:\Users\TharunReddy\OneDrive - IBM\Documents\project\project\backend
python main.py
```

You should see output like:
```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

## Verify Configuration

After restarting, check the backend is using the correct Ollama URL:

```powershell
# Test backend health
curl http://localhost:8000/health
```

Should return:
```json
{
  "api": "healthy",
  "ollama": "healthy",
  "model": "llama3.1:8b",
  ...
}
```

If `ollama` shows "unavailable", then:

1. **Check Ollama Docker is running:**
```powershell
docker ps | findstr ollama
```

2. **If not running, start it:**
```powershell
cd C:\Users\TharunReddy\OneDrive - IBM\Documents\project\project
docker-compose up -d ollama
```

3. **Pull the model:**
```powershell
docker-compose exec ollama ollama pull llama3.1:8b
```

4. **Test Ollama directly:**
```powershell
curl http://localhost:11434
```

Should return: `Ollama is running`

## Complete Restart Sequence

If still having issues, do a complete restart:

```powershell
# 1. Stop backend (Ctrl+C)

# 2. Stop frontend (Ctrl+C)

# 3. Ensure Ollama is running
cd C:\Users\TharunReddy\OneDrive - IBM\Documents\project\project
docker-compose up -d ollama
docker-compose exec ollama ollama pull llama3.1:8b

# 4. Start backend
cd backend
python main.py

# 5. In another terminal, start frontend
cd C:\Users\TharunReddy\OneDrive - IBM\Documents\project\project
npm run dev

# 6. Open browser
# http://localhost:5173
```

## Troubleshooting

### Backend still shows "http://ollama:11434"

Check the `.env` file:
```powershell
cat backend\.env | findstr OLLAMA_BASE_URL
```

Should show:
```
OLLAMA_BASE_URL=http://localhost:11434
```

If it shows `http://ollama:11434`, edit `backend/.env` and change it to `http://localhost:11434`, then restart backend.

### Ollama not accessible

```powershell
# Check if Ollama container is running
docker ps

# Check Ollama logs
docker-compose logs ollama

# Restart Ollama
docker-compose restart ollama
```

### Port 11434 already in use

```powershell
# Find what's using port 11434
netstat -ano | findstr 11434

# Kill the process or change the port in docker-compose.yml