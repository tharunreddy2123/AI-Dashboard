# 🤖 OpenShift AI Assistant

AI-powered DevOps dashboard for OpenShift cluster management with **Llama 3.1 8B** integration.

![Architecture](https://img.shields.io/badge/Stack-React%20%2B%20FastAPI%20%2B%20Ollama-blue)
![License](https://img.shields.io/badge/License-MIT-green)
![Python](https://img.shields.io/badge/Python-3.9%2B-blue)
![Node](https://img.shields.io/badge/Node-18%2B-green)

## ✨ Features

### 🎯 AI-Powered Assistance
- **Natural Language Queries** - Ask questions in plain English
- **Cluster Health Analysis** - AI-powered cluster diagnostics
- **Log Analysis** - Intelligent log interpretation
- **Event Explanation** - Understand OpenShift events
- **Troubleshooting Guidance** - Step-by-step problem resolution

### 📚 RAG (Retrieval Augmented Generation)
- **Runbook Integration** - Access troubleshooting guides
- **Documentation Search** - Find relevant SOPs instantly
- **Incident History** - Learn from past incidents
- **Custom Knowledge Base** - Add your own documentation

### 🔒 Security First
- **Read-Only Operations** - No destructive commands
- **Command Whitelist** - Only approved operations
- **Secure API Access** - Token-based authentication
- **Audit Logging** - Track all interactions

### 📊 Real-Time Monitoring
- **Pod Status** - Monitor all pods across namespaces
- **Node Health** - Track node conditions and resources
- **Deployments** - View deployment status
- **Events** - Real-time cluster events
- **Logs** - Access pod logs instantly

## 🚀 Quick Start

### Prerequisites

- **Python 3.9+** and **Node.js 18+**
- **16 GB RAM minimum** (for Llama 3.1 8B)
- **OpenShift cluster access**

### 1. Install Ollama & Llama 3.1 8B

**Windows:**
```powershell
cd backend
.\install_ollama.ps1
```

**Linux/macOS:**
```bash
cd backend
chmod +x install_ollama.sh
./install_ollama.sh
```

**Manual Installation:**
```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull Llama 3.1 8B
ollama pull llama3.1:8b
```

### 2. Set Up Backend

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate (Windows)
.\venv\Scripts\activate

# Activate (Linux/macOS)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start server
python main.py
```

Backend runs on: **http://localhost:8000**

### 3. Start Frontend

The frontend is already running! If not:

```bash
cd project
npm install
npm run dev
```

Frontend runs on: **http://localhost:5173**

### 4. Open Dashboard

1. Navigate to **http://localhost:5173**
2. Click the **AI Assistant button** (sparkle icon) in bottom-right
3. Start chatting!

## 💬 Example Queries

Try asking the AI assistant:

- "Show unhealthy pods"
- "Analyze cluster health"
- "Why is my pod restarting?"
- "Explain this CrashLoopBackOff error"
- "Troubleshoot Portworx migration stuck at 80%"
- "Why is Grafana not starting?"
- "Show pods in pending state"
- "What's causing high memory usage?"
- "Analyze logs for errors"
- "Explain recent warning events"

## 📁 Project Structure

```
project/
├── backend/                    # FastAPI backend
│   ├── main.py                # API endpoints
│   ├── config.py              # Configuration
│   ├── openshift_client.py    # OpenShift API client
│   ├── ollama_client.py       # Ollama LLM client
│   ├── rag_system.py          # RAG with ChromaDB
│   ├── requirements.txt       # Python dependencies
│   ├── install_ollama.ps1     # Windows installer
│   └── install_ollama.sh      # Linux/macOS installer
│
├── src/                       # React frontend
│   ├── components/
│   │   ├── AIChat.tsx        # AI chat interface
│   │   ├── Layout.tsx        # Main layout with AI button
│   │   ├── Header.tsx        # Dashboard header
│   │   └── Sidebar.tsx       # Navigation sidebar
│   ├── pages/                # Dashboard pages
│   ├── lib/
│   │   └── openshift-direct.ts  # OpenShift API client
│   └── context/
│       └── ThemeContext.tsx  # Dark/light theme
│
├── SETUP_GUIDE.md            # Detailed setup instructions
└── README.md                 # This file
```

## 🔧 Configuration

### Backend Configuration

Edit `backend/.env`:

```env
# Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b

# API Configuration
API_HOST=0.0.0.0
API_PORT=8000

# ChromaDB Configuration
CHROMA_PERSIST_DIR=./chroma_db
```

### OpenShift Configuration

Credentials are configured in:
- `backend/config.py`
- `project/vite.config.ts`
- `project/src/lib/openshift-direct.ts`

## 🌐 API Endpoints

### Chat
- `POST /api/chat` - Chat with RAG context
- `POST /api/chat/quick` - Quick chat without RAG

### OpenShift Data
- `GET /api/openshift/namespaces` - List namespaces
- `GET /api/openshift/pods` - List pods
- `GET /api/openshift/nodes` - List nodes
- `GET /api/openshift/deployments` - List deployments
- `GET /api/openshift/events` - List events
- `GET /api/openshift/cluster-health` - Cluster health + AI analysis

### Analysis
- `POST /api/analyze/logs` - Analyze pod logs with AI
- `POST /api/analyze/event` - Explain OpenShift event

### Knowledge Base
- `POST /api/knowledge/runbook` - Add runbook
- `GET /api/knowledge/search` - Search knowledge base
- `GET /api/knowledge/stats` - Knowledge base statistics

## 🎨 Screenshots

### AI Chat Interface
Beautiful, modern chat interface with:
- Real-time responses
- Conversation history
- Suggested questions
- Context-aware answers

### Dashboard
- Pod monitoring
- Node health
- Deployment status
- Event tracking
- Log viewing

## 🔐 Security Features

### Command Whitelist

Only these read-only commands are allowed:
```
oc get pods/nodes/events/deployments
oc describe pod/node
oc logs <pod>
```

All write operations are blocked:
```
❌ oc delete
❌ oc apply
❌ oc exec
❌ Arbitrary commands
```

### Best Practices

1. ✅ Read-only operations only
2. ✅ Input validation
3. ✅ Command whitelisting
4. ✅ Secure token storage
5. ✅ CORS protection

## 📊 System Requirements

### Minimum (Development)
- **CPU:** 4 cores
- **RAM:** 16 GB
- **Disk:** 20 GB
- **Network:** Stable internet

### Recommended (Production)
- **CPU:** 8+ cores
- **RAM:** 32 GB
- **Disk:** 50 GB SSD
- **GPU:** Optional (NVIDIA 8GB+ VRAM)

## 🐛 Troubleshooting

### Backend Won't Start

```bash
# Check Python dependencies
pip install -r requirements.txt

# Check Ollama is running
curl http://localhost:11434/api/tags
```

### Ollama Issues

```bash
# Reinstall model
ollama pull llama3.1:8b

# Check Ollama service
ollama serve
```

### Frontend Issues

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm run dev
```

See [SETUP_GUIDE.md](SETUP_GUIDE.md) for detailed troubleshooting.

## 📚 Documentation

- **[SETUP_GUIDE.md](SETUP_GUIDE.md)** - Complete setup instructions
- **[backend/README.md](backend/README.md)** - Backend documentation
- **[Ollama Docs](https://ollama.ai/docs)** - Ollama documentation
- **[FastAPI Docs](https://fastapi.tiangolo.com)** - FastAPI documentation

## 🚢 Production Deployment

### Docker Deployment

```dockerfile
# Backend Dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install -r requirements.txt
COPY backend/ .
EXPOSE 8000
CMD ["python", "main.py"]
```

### OpenShift Deployment

1. Containerize FastAPI backend
2. Deploy Ollama with GPU support
3. Use persistent volumes for ChromaDB
4. Deploy React frontend as static files

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- **Ollama** - Local LLM runtime
- **Meta** - Llama 3.1 model
- **FastAPI** - Modern Python web framework
- **ChromaDB** - Vector database for RAG
- **React** - Frontend framework

## 📞 Support

For issues and questions:
- Check [SETUP_GUIDE.md](SETUP_GUIDE.md)
- Review [backend/README.md](backend/README.md)
- Open an issue on GitHub

---

**Built with ❤️ for DevOps teams**

🚀 **Start chatting with your OpenShift cluster today!**