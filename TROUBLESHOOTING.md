# 🔧 Troubleshooting Guide

Common issues and solutions for the OpenShift AI Assistant.

## ❌ "Backend server is not running on http://localhost:8000"

This is the most common error. Here's how to fix it:

### Solution 1: Install Dependencies

The backend requires Python packages to be installed first.

```bash
# Navigate to project root
cd c:/Users/TharunReddy/OneDrive - IBM/Documents/project

# Install backend dependencies
pip install -r project/backend/requirements.txt
```

**This will take 5-10 minutes** as it installs:
- FastAPI
- ChromaDB
- Ollama client
- Other dependencies

### Solution 2: Start the Backend Server

After dependencies are installed:

```bash
# Start backend server
python project/backend/main.py
```

You should see:
```
INFO:     Started server process
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### Solution 3: Verify Backend is Running

Open a new terminal and test:

```bash
curl http://localhost:8000/health
```

Should return:
```json
{"status":"healthy"}
```

Or open in browser: http://localhost:8000/health

## ❌ "ModuleNotFoundError: No module named 'chromadb'"

**Cause:** Python dependencies not installed.

**Solution:**
```bash
pip install -r project/backend/requirements.txt
```

## ❌ "ModuleNotFoundError: No module named 'fastapi'"

**Cause:** Python dependencies not installed.

**Solution:**
```bash
pip install -r project/backend/requirements.txt
```

## ❌ Backend starts but crashes immediately

### Check Ollama is Running

```bash
# Test Ollama
ollama list

# Should show:
# NAME              ID              SIZE      MODIFIED
# llama3.1:8b       ...             4.7 GB    ...
```

If Ollama is not installed:

**Windows:**
```powershell
cd project/backend
.\install_ollama.ps1
```

**Linux/macOS:**
```bash
cd project/backend
chmod +x install_ollama.sh
./install_ollama.sh
```

### Check OpenShift Token

Verify token is configured in both `.env` files:

1. **Frontend:** `project/.env`
   ```env
   VITE_OPENSHIFT_TOKEN=sha256~YOUR_TOKEN_HERE
   ```

2. **Backend:** `project/backend/.env`
   ```env
   OPENSHIFT_TOKEN=sha256~YOUR_TOKEN_HERE
   ```

See [`TOKEN_UPDATE_GUIDE.md`](TOKEN_UPDATE_GUIDE.md) for details.

## ❌ "Port 8000 is already in use"

**Cause:** Another process is using port 8000.

**Solution:**

**Windows:**
```powershell
# Find process using port 8000
netstat -ano | findstr :8000

# Kill the process (replace <PID> with actual process ID)
taskkill /PID <PID> /F
```

**Linux/macOS:**
```bash
# Find and kill process
lsof -ti:8000 | xargs kill -9
```

## ❌ AI Chat responds slowly (15+ seconds)

**This is normal!** Llama 3.1 8B is a large model.

**To improve performance:**

1. **Close memory-intensive apps**
   - Close browsers with many tabs
   - Close other development tools
   - Close video/image editors

2. **Check system resources**
   ```bash
   # Windows
   taskmgr
   
   # Linux/macOS
   htop
   ```
   - Ensure 16GB+ RAM available
   - CPU usage should be high during responses

3. **Use a smaller model** (faster but less accurate)
   ```bash
   ollama pull llama3.1:7b
   ```
   
   Then update `project/backend/.env`:
   ```env
   OLLAMA_MODEL=llama3.1:7b
   ```

## ❌ "Unauthorized" or "401" errors from OpenShift

**Cause:** OpenShift token expired or invalid.

**Solution:**

1. Get a new token from OpenShift Console:
   - Login to OpenShift
   - Click username → "Copy login command"
   - Click "Display Token"
   - Copy the token (starts with `sha256~`)

2. Update both `.env` files:
   - `project/.env` → `VITE_OPENSHIFT_TOKEN`
   - `project/backend/.env` → `OPENSHIFT_TOKEN`

3. Restart both servers

See [`TOKEN_UPDATE_GUIDE.md`](TOKEN_UPDATE_GUIDE.md) for details.

## ❌ Frontend shows blank page

### Check if frontend is running

```bash
# Should be running on port 5173
curl http://localhost:5173
```

### Start frontend if not running

```bash
cd c:/Users/TharunReddy/OneDrive - IBM/Documents/project
npm run dev
```

### Clear cache and reinstall

```bash
cd c:/Users/TharunReddy/OneDrive - IBM/Documents/project
rm -rf node_modules package-lock.json
npm install
npm run dev
```

## ❌ "Cannot find module '@types/node'"

**Cause:** TypeScript types not installed.

**Solution:**
```bash
npm install --save-dev @types/node
```

## ❌ Python version issues

**Check Python version:**
```bash
python --version
```

**Required:** Python 3.9 or higher

**If version is too old:**
- Download from: https://www.python.org/downloads/
- Install Python 3.11 or 3.12 (recommended)

## ❌ Node.js version issues

**Check Node version:**
```bash
node --version
```

**Required:** Node.js 18 or higher

**If version is too old:**
- Download from: https://nodejs.org/
- Install LTS version (20.x recommended)

## 🔍 Debugging Steps

### 1. Check All Services

```bash
# Backend health
curl http://localhost:8000/health

# Frontend
curl http://localhost:5173

# Ollama
curl http://localhost:11434/api/tags
```

### 2. Check Logs

**Backend logs:**
- Look at terminal where `python project/backend/main.py` is running
- Check for error messages

**Frontend logs:**
- Open browser console (F12)
- Look for errors in Console tab
- Check Network tab for failed requests

**Ollama logs:**
```bash
# Check Ollama status
ollama list
ollama ps
```

### 3. Restart Everything

```bash
# Stop all services (Ctrl+C in each terminal)

# Restart backend
python project/backend/main.py

# Restart frontend (in new terminal)
npm run dev
```

## 📋 Complete Startup Checklist

Use this checklist to ensure everything is configured:

- [ ] Python 3.9+ installed (`python --version`)
- [ ] Node.js 18+ installed (`node --version`)
- [ ] Ollama installed (`ollama list`)
- [ ] Llama 3.1 8B downloaded (`ollama list` shows llama3.1:8b)
- [ ] Backend dependencies installed (`pip install -r project/backend/requirements.txt`)
- [ ] Frontend dependencies installed (`npm install`)
- [ ] OpenShift token in `project/.env`
- [ ] OpenShift token in `project/backend/.env`
- [ ] Backend running on http://localhost:8000
- [ ] Frontend running on http://localhost:5173
- [ ] Backend health check passes (http://localhost:8000/health)

## 🆘 Still Having Issues?

1. **Check all documentation:**
   - [`START_PROJECT.md`](START_PROJECT.md) - Startup guide
   - [`TOKEN_UPDATE_GUIDE.md`](TOKEN_UPDATE_GUIDE.md) - Token configuration
   - [`QUICK_START.md`](QUICK_START.md) - Quick start guide
   - [`README.md`](README.md) - Full documentation

2. **Verify system requirements:**
   - 16 GB RAM minimum
   - 20 GB free disk space
   - Stable internet connection

3. **Try the simplified version:**
   - See [`project/backend/START_HERE.md`](project/backend/START_HERE.md)
   - Uses `main_simple.py` without ChromaDB
   - Requires fewer dependencies

## 💡 Pro Tips

1. **Use separate terminals** for backend and frontend
2. **Keep terminals open** to see logs and errors
3. **Restart services** after changing `.env` files
4. **Check system resources** before starting (RAM, CPU)
5. **Update tokens regularly** (they expire)

---

**Need more help?** Check the detailed guides or review the error messages carefully.