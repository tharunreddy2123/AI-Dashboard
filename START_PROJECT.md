# How to Start the Project - Local Setup

Complete guide to get your OpenShift AI Assistant running locally.

## Prerequisites Check

Before starting, ensure you have:
- Python 3.9+ installed
- Node.js 18+ installed
- Google AI API key (free at https://aistudio.google.com/app/apikey)
- OpenShift token ready to configure

## Step-by-Step Startup

### 1 - Configure Backend (First Time Only)

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

See [TOKEN_UPDATE_GUIDE.md](TOKEN_UPDATE_GUIDE.md) for detailed token instructions.

### 2 - Install Python Dependencies

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

### 3 - Install Frontend Dependencies

```bash
cd project
npm install
```

### 4 - Start All Services

Open **two separate terminals**:

**Terminal 1 - Start Backend:**
```bash
cd project/backend

# Activate venv if using one:
# Windows: .\venv\Scripts\Activate.ps1
# macOS/Linux: source venv/bin/activate

python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Wait for:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

**Terminal 2 - Start Frontend:**
```bash
cd project
npm run dev
```

Wait for:
```
Local:   http://localhost:5173/
```

### 5 - Access the Dashboard

Open your browser to: **http://localhost:5173**

## Daily Usage

```bash
# Terminal 1
cd project/backend && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2
cd project && npm run dev
```

### Stopping the Project

Press `Ctrl+C` in each terminal.

## Health Checks

```bash
# Backend health (shows google_ai status)
curl http://localhost:8000/health

# Frontend
curl http://localhost:5173/
```

## Troubleshooting

1. **Backend Error:** Verify `GOOGLE_API_KEY` is set in `backend/.env`
2. **Frontend Error:** Ensure Node.js is installed and run `npm install`
3. **OpenShift Error:** Check token expiry in `backend/.env`

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for detailed solutions.
