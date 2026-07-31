# Troubleshooting Guide

Common issues and solutions for the OpenShift AI Assistant.

## "Backend server is not running on http://localhost:8000"

### Solution 1: Install Dependencies

```bash
cd project/backend
pip install -r requirements.txt
```

### Solution 2: Start the Backend Server

**Windows (PowerShell):**
```powershell
cd project/backend
# .\venv\Scripts\Activate.ps1  (if using venv)
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**macOS/Linux:**
```bash
cd project/backend
# source venv/bin/activate  (if using venv)
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### Solution 3: Verify Backend is Running

```powershell
# Windows
Invoke-WebRequest -Uri "http://localhost:8000" | Select-Object -ExpandProperty Content
```
```bash
# macOS/Linux
curl http://localhost:8000
```

---

## "ModuleNotFoundError: No module named 'google.generativeai'"

**Cause:** google-generativeai package not installed.

**Solution:**
```bash
cd project/backend
pip install -r requirements.txt
```

## "ModuleNotFoundError: No module named 'chromadb'"

**Cause:** Python dependencies not installed.

**Solution:**
```bash
cd project/backend
pip install -r requirements.txt
```

---

## Google AI / Gemini Errors

### "GOOGLE_API_KEY not configured"

Ensure `GOOGLE_API_KEY` is set in `backend/.env`:
```env
GOOGLE_API_KEY=AIzaSy...your_key_here
GEMINI_MODEL=gemini-1.5-flash
```

Get a free key at **https://aistudio.google.com/app/apikey**

### Check health endpoint

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "api": "healthy",
  "google_ai": "healthy",
  "model": "gemini-1.5-flash"
}
```

---

## "Unauthorized" or "401" errors from OpenShift

**Cause:** OpenShift token expired or invalid.

**Solution:**

1. Get a new token from OpenShift Console:
   - Login to OpenShift
   - Click username -> "Copy login command"
   - Click "Display Token"
   - Copy the token (starts with `sha256~`)

2. Update `project/backend/.env`:
   ```env
   OPENSHIFT_TOKEN=sha256~YOUR_NEW_TOKEN
   ```

3. Restart backend

See [TOKEN_UPDATE_GUIDE.md](TOKEN_UPDATE_GUIDE.md) for details.

---

## "Port 8000 is already in use"

**Windows:**
```powershell
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

**Linux/macOS:**
```bash
lsof -ti:8000 | xargs kill -9
```

---

## Frontend shows blank page

```bash
# Clear cache and reinstall
cd project
rm -rf node_modules package-lock.json
npm install
npm run dev
```

---

## Python version issues

**Check Python version:**
```bash
python --version  # Required: 3.9+
```

Download from: https://www.python.org/downloads/

## Node.js version issues

**Check Node version:**
```bash
node --version  # Required: 18+
```

Download from: https://nodejs.org/

---

## Debugging Steps

### 1. Check All Services

```bash
# Backend health (also shows google_ai status)
curl http://localhost:8000/health

# Frontend
curl http://localhost:5173
```

### 2. Check Logs

**Backend logs:** Check the terminal where uvicorn is running.

**Frontend logs:** Open browser console (F12) -> Console tab.

---

## Complete Startup Checklist

- [ ] Python 3.9+ installed (`python --version`)
- [ ] Node.js 18+ installed (`node --version`)
- [ ] `GOOGLE_API_KEY` set in `project/backend/.env`
- [ ] `OPENSHIFT_TOKEN` set in `project/backend/.env`
- [ ] Backend dependencies installed (`pip install -r project/backend/requirements.txt`)
- [ ] Frontend dependencies installed (`npm install`)
- [ ] Backend running on http://localhost:8000
- [ ] Frontend running on http://localhost:5173
- [ ] Backend health check passes: `curl http://localhost:8000/health`

---

## Pro Tips

1. **Use separate terminals** for backend and frontend
2. **Keep terminals open** to see logs and errors
3. **Restart services** after changing `.env` files
4. **Update tokens regularly** (OpenShift tokens expire)
5. **Google AI quota** is generous on the free tier but monitor usage

---

**Need more help?** Check [README.md](README.md) or [SETUP_GUIDE.md](SETUP_GUIDE.md).
