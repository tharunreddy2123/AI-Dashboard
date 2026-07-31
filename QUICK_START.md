# Quick Start Guide - Local Setup

Get your AI-powered OpenShift assistant running locally with Google Gemini!

## Prerequisites

- **Python 3.9+** and **Node.js 18+** installed
- **Google AI API key** (free at https://aistudio.google.com/app/apikey)
- **OpenShift token** ready to configure

## Quick Start (5 minutes)

### 1. Configure Backend

```bash
cd project/backend
cp .env.example .env
# Edit .env and set OPENSHIFT_TOKEN and GOOGLE_API_KEY
```

### 2. Install Dependencies

**Backend:**
```bash
cd project/backend
pip install -r requirements.txt
```

**Frontend:**
```bash
cd project
npm install
```

### 3. Start Services

**Terminal 1 - Backend:**
```bash
cd project/backend
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd project
npm run dev
```

### 4. Open Application

Navigate to: **http://localhost:5173**

## Troubleshooting

### Backend health check
```bash
curl http://localhost:8000/health
```

### Google AI not responding
- Verify `GOOGLE_API_KEY` is set in `backend/.env`
- Ensure the key is valid at https://aistudio.google.com/app/apikey

### Frontend Issues
```bash
rm -rf node_modules package-lock.json
npm install
npm run dev
```

---

**Your AI assistant is ready!**
