# Local Setup Guide

Complete guide to run the OpenShift AI Assistant locally using Google Gemini AI, Python, and Node.js.

## Prerequisites

- **Python 3.9+** ([Download](https://www.python.org/downloads/))
- **Node.js 18+** ([Download](https://nodejs.org/))
- **Google AI API key** (free at https://aistudio.google.com/app/apikey)
- **OpenShift cluster access** (API URL and token)

### Check Prerequisites

```bash
# Check Python
python --version   # Should be 3.9+

# Check Node
node --version     # Should be 18+
```

## Architecture

```
+---------------------+
| React Frontend      |
| (Port 5173)         |
+----------+----------+
           |
           v
+----------+----------+
| FastAPI Backend     |
| (Port 8000)         |
+----------+----------+
           |
           v
+----------+----------+
| Google Gemini API   |
| (cloud-based)       |
+----------+----------+
           |
           v
+----------+----------+
| OpenShift API       |
| ChromaDB (RAG)      |
+---------------------+
```

---

## Step 1: Get Google AI API Key

1. Go to **https://aistudio.google.com/app/apikey**
2. Sign in with your Google account
3. Click **Create API key**
4. Copy the key for use in the next step

---

## Step 2: Configure Backend

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

---

## Step 3: Set Up Python Virtual Environment

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

**Terminal 1 - Backend:**
```bash
cd project/backend

# Activate venv first:
# Windows: .\venv\Scripts\Activate.ps1
# macOS/Linux: source venv/bin/activate

python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

**Terminal 2 - Frontend:**
```bash
cd project
npm run dev
```

You should see:
```
Local:   http://localhost:5173/
```

---

## Step 6: Access the Dashboard

1. Open **http://localhost:5173** in your browser
2. Click the **AI Assistant button** (sparkle icon) in the bottom-right
3. Start chatting!

---

## Daily Startup

```bash
# Terminal 1
cd project/backend && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2
cd project && npm run dev
```

---

## Troubleshooting

### Google AI Connection Error

```bash
# Check health endpoint
curl http://localhost:8000/health
# Should show: "google_ai": "healthy"
```

Verify your key in `backend/.env`:
```env
GOOGLE_API_KEY=AIzaSy...
```

### Backend Connection Error

```bash
# Check backend is running
curl http://localhost:8000

# Verify dependencies
pip list | grep google-generativeai
```

### Frontend Not Loading

```bash
cd project
npm cache clean --force
npm install
npm run dev
```

---

## Additional Resources

- [TOKEN_UPDATE_GUIDE.md](TOKEN_UPDATE_GUIDE.md) - Updating OpenShift token
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues
- [Google AI Docs](https://ai.google.dev/docs) - Gemini API documentation
