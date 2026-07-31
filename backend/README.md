# OpenShift AI Assistant Backend

FastAPI backend with Google Gemini AI integration for AI-powered OpenShift cluster management.

## Quick Start

### 1. Install Dependencies

```bash
# Create virtual environment
python -m venv venv

# Activate (Windows)
.\venv\Scripts\activate

# Activate (Linux/macOS)
source venv/bin/activate

# Install packages
pip install -r requirements.txt
```

### 2. Configure Google AI API Key

Get a free API key at **https://aistudio.google.com/app/apikey**, then edit `backend/.env`:

```env
GOOGLE_API_KEY=your_google_api_key_here
GEMINI_MODEL=gemini-1.5-flash
```

### 3. Start Server

```bash
python main.py
```

Server runs on: http://localhost:8000

### 4. Test Health

```bash
curl http://localhost:8000/health
```

## Features

OK **AI Chat** - Natural language queries with RAG powered by Google Gemini
OK **OpenShift Integration** - Real-time cluster data
OK **Log Analysis** - AI-powered log interpretation
OK **RAG System** - Runbook and documentation search
OK **Security** - Whitelisted read-only commands
OK **Event Explanation** - AI explains OpenShift events

## API Endpoints

### Chat
- `POST /api/chat` - Chat with RAG context
- `POST /api/chat/quick` - Quick chat without RAG

### OpenShift Data
- `GET /api/openshift/namespaces`
- `GET /api/openshift/pods?namespace=<ns>`
- `GET /api/openshift/nodes`
- `GET /api/openshift/deployments`
- `GET /api/openshift/events`
- `GET /api/openshift/cluster-health`

### Analysis
- `POST /api/analyze/logs` - Analyze pod logs
- `POST /api/analyze/event` - Explain event

### Knowledge Base
- `POST /api/knowledge/runbook` - Add runbook
- `GET /api/knowledge/search?query=<q>`
- `GET /api/knowledge/stats`

## Configuration

Edit `.env` file:

```env
GOOGLE_API_KEY=your_google_api_key_here
GEMINI_MODEL=gemini-1.5-flash
API_HOST=0.0.0.0
API_PORT=8000
CHROMA_PERSIST_DIR=./chroma_db
```

## Architecture

```
main.py                  # FastAPI application
+-- config.py            # Configuration settings
+-- openshift_client.py  # OpenShift API client
+-- google_ai_client.py  # Google Gemini AI client
+-- rag_system.py        # RAG with ChromaDB
```

## Security

### Command Whitelist

Only these commands are allowed:
- `oc get pods/nodes/events/deployments`
- `oc describe pod/node`
- `oc logs <pod>`

All other commands are blocked.

### Best Practices

1. Never allow write operations
2. Validate all inputs
3. Use read-only service accounts
4. Implement rate limiting in production
5. Add authentication for production

## Troubleshooting

### Google AI API Error

```bash
# Verify your API key is set
cat .env | grep GOOGLE_API_KEY

# Test the health endpoint
curl http://localhost:8000/health
```

### Import Errors

```bash
# Reinstall dependencies
pip install -r requirements.txt --force-reinstall
```

### ChromaDB Issues

```bash
# Delete and recreate
rm -rf chroma_db
python main.py  # Will reinitialize
```

## Development

### Add New Runbook

Edit `rag_system.py` and add to `initialize_sample_data()`:

```python
self.add_runbook(
    title="My Runbook",
    content="Step-by-step guide...",
    category="troubleshooting",
    tags=["custom"]
)
```

## Production Deployment

### Environment Variables

Set these in production:
- `OPENSHIFT_API_URL`
- `OPENSHIFT_TOKEN`
- `GOOGLE_API_KEY`
- `GEMINI_MODEL`
- `API_HOST=0.0.0.0`
- `API_PORT=8000`

## License

MIT
