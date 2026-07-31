# OpenShift AI Assistant - Setup Guide (Local)

Complete guide to set up your AI-powered OpenShift DevOps dashboard running locally.

## Architecture Overview

```
+---------------------+
| React Frontend      |
| (Port 5173)         |
| Vite Dev Server     |
+----------+----------+
           |
           v
+----------+----------+
| FastAPI Backend     |
| (Port 8000)         |
| Python + uvicorn    |
+----------+----------+
           |
           v
+----------+----------+
| Google Gemini API   |
| (gemini-1.5-flash)  |
| via google-         |
| generativeai SDK    |
+----------+----------+
           |
           v
+----------+----------+
| OpenShift API       |
| ChromaDB (RAG)      |
| Local Storage       |
+---------------------+
```

## Prerequisites

- **Python 3.9+** installed
- **Node.js 18+** installed
- **Google AI API key** (free at https://aistudio.google.com/app/apikey)
- **OpenShift cluster access** (API URL and token)

---

## Step 1: Get Google AI API Key

1. Visit **https://aistudio.google.com/app/apikey**
2. Sign in with your Google account
3. Click **Create API key**
4. Copy the key — you will add it to `backend/.env`

---

## Step 2: Configure the Backend

```bash
cd project/backend
cp .env.example .env
```

Edit `backend/.env`:
```env
OPENSHIFT_API_URL=https://api.rm3.7wse.p1.openshiftapps.com:6443
OPENSHIFT_TOKEN=sha256~YOUR_TOKEN_HERE
GOOGLE_API_KEY=your_google_api_key_here
GEMINI_MODEL=gemini-1.5-flash
```

Get your OpenShift token from [TOKEN_UPDATE_GUIDE.md](TOKEN_UPDATE_GUIDE.md).

---

## Step 3: Install Python Dependencies

**Windows:**
```powershell
cd project/backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

**macOS/Linux:**
```bash
cd project/backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

---

## Step 4: Install Frontend Dependencies

```bash
cd project
npm install
```

---

## Step 5: Start Services

### 5.1 Start Backend API

**Windows:**
```powershell
cd project/backend
# If using venv: .\venv\Scripts\Activate.ps1
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**macOS/Linux:**
```bash
cd project/backend
# If using venv: source venv/bin/activate
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 5.2 Start Frontend Development Server

Open another terminal:

```bash
cd project
npm run dev
```

### 5.3 Verify Services are Running

- **Backend:** http://localhost:8000/health
- **Frontend:** http://localhost:5173

---

## Step 6: Test the Application

1. Open **http://localhost:5173** in your browser
2. Click the **AI Assistant button** (sparkle icon) in the bottom-right
3. Ask "Show me unhealthy pods" and verify a response

---

## Troubleshooting

### Google AI API Error
```bash
# Verify key is set
cat backend/.env | grep GOOGLE_API_KEY

# Check health endpoint
curl http://localhost:8000/health
# Should show: "google_ai": "healthy"
```

### Backend Connection Error
```bash
curl http://localhost:8000

# Check Python installation
python --version

# Verify dependencies
pip list | grep -E "fastapi|uvicorn|google-generativeai"
```

### Frontend Not Loading
```bash
cd project
npm cache clean --force
npm install
npm run dev
```

---

## Daily Startup

```bash
# Terminal 1
cd project/backend && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2
cd project && npm run dev
```

Access at **http://localhost:5173**.

---

## Production Deployment

For deploying to production, see [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md).

---

**Your AI-powered OpenShift assistant is ready!**
