<<<<<<< HEAD
# OpenShift AI Assistant

AI-powered DevOps dashboard for OpenShift cluster management with **Google Gemini** integration.

![Stack](https://img.shields.io/badge/Stack-React%20%2B%20FastAPI%20%2B%20Gemini-blue)
![License](https://img.shields.io/badge/License-MIT-green)
![Python](https://img.shields.io/badge/Python-3.9%2B-blue)
![Node](https://img.shields.io/badge/Node-18%2B-green)

## Features

### AI-Powered Assistance
- **Natural Language Queries** - Ask questions in plain English
- **Cluster Health Analysis** - AI-powered cluster diagnostics via Google Gemini
- **Log Analysis** - Intelligent log interpretation
- **Event Explanation** - Understand OpenShift events
- **Troubleshooting Guidance** - Step-by-step problem resolution

### RAG (Retrieval Augmented Generation)
- **Runbook Integration** - Access troubleshooting guides
- **Documentation Search** - Find relevant SOPs instantly
- **Incident History** - Learn from past incidents
- **Custom Knowledge Base** - Add your own documentation

### Security First
- **Read-Only Operations** - No destructive commands
- **Command Whitelist** - Only approved operations
- **Secure API Access** - Token-based authentication

### Real-Time Monitoring
- **Pod Status** - Monitor all pods across namespaces
- **Node Health** - Track node conditions and resources
- **Deployments** - View deployment status
- **Events** - Real-time cluster events
- **Logs** - Access pod logs instantly

## Quick Start

### Prerequisites
- **Python 3.9+** and **Node.js 18+**
- **Google AI API key** (free at https://aistudio.google.com/app/apikey)
- **OpenShift cluster access**

### Get Running in 5 Minutes

1. **Configure backend:**
   ```bash
   cd project/backend
   cp .env.example .env
   # Edit .env: set OPENSHIFT_TOKEN and GOOGLE_API_KEY
   ```

2. **Install dependencies:**
   ```bash
   cd project/backend && pip install -r requirements.txt
   cd project && npm install
   ```

3. **Start services (2 terminals):**
   ```bash
   # Terminal 1
   cd project/backend && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

   # Terminal 2
   cd project && npm run dev
   ```

4. **Open:** http://localhost:5173

## Example Queries

Try asking the AI assistant:

- "Show unhealthy pods"
- "Analyze cluster health"
- "Why is my pod restarting?"
- "Explain this CrashLoopBackOff error"
- "Show pods in pending state"
- "What is causing high memory usage?"
- "Analyze logs for errors"
- "Explain recent warning events"

## Project Structure

```
project/
+-- backend/                    # FastAPI backend
|   +-- main.py                # API endpoints
|   +-- config.py              # Configuration
|   +-- openshift_client.py    # OpenShift API client
|   +-- google_ai_client.py    # Google Gemini AI client
|   +-- rag_system.py          # RAG with ChromaDB
|   +-- requirements.txt       # Python dependencies
|
+-- src/                       # React frontend
|   +-- components/
|   |   +-- AIChat.tsx        # AI chat interface
|   |   +-- Layout.tsx        # Main layout
|   |   +-- Header.tsx        # Dashboard header
|   |   +-- Sidebar.tsx       # Navigation sidebar
|   +-- pages/                # Dashboard pages
|   +-- lib/
|       +-- api-client.ts     # Backend API client
+-- README.md
```

## Configuration

### Backend (`backend/.env`)

```env
# OpenShift
OPENSHIFT_API_URL=https://your-cluster:6443
OPENSHIFT_TOKEN=your_token

# Google AI
GOOGLE_API_KEY=your_google_api_key
GEMINI_MODEL=gemini-1.5-flash

# API
API_HOST=0.0.0.0
API_PORT=8000
```

## API Endpoints

### Chat
- `POST /api/chat` - Chat with RAG context
- `POST /api/chat/quick` - Quick chat without RAG

### OpenShift Data
- `GET /api/openshift/namespaces`
- `GET /api/openshift/pods`
- `GET /api/openshift/nodes`
- `GET /api/openshift/deployments`
- `GET /api/openshift/events`
- `GET /api/openshift/cluster-health`

### Analysis
- `POST /api/analyze/logs`
- `POST /api/analyze/event`

### Knowledge Base
- `POST /api/knowledge/runbook`
- `GET /api/knowledge/search`
- `GET /api/knowledge/stats`

## Troubleshooting

### Backend Won't Start
```bash
pip install -r requirements.txt

# Verify Google AI key is set
cat backend/.env | grep GOOGLE_API_KEY
```

### Frontend Issues
```bash
rm -rf node_modules package-lock.json
npm install
npm run dev
```

See [SETUP_GUIDE.md](SETUP_GUIDE.md) for detailed troubleshooting.

## Documentation

- **[SETUP_GUIDE.md](SETUP_GUIDE.md)** - Complete setup instructions
- **[backend/README.md](backend/README.md)** - Backend documentation
- **[FastAPI Docs](https://fastapi.tiangolo.com)** - FastAPI documentation
- **[Google AI Docs](https://ai.google.dev/docs)** - Gemini API documentation

## Deployment

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for production setup.

## License

MIT License

---

**Built with love for DevOps teams**

Start chatting with your OpenShift cluster today!
=======
# AI-Dashboard
>>>>>>> f1c1b3fe3116b5a821a586c5a0eeddbdfd6e52b1
