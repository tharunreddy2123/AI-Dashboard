# OpenShift AI Assistant Backend

FastAPI backend with Ollama integration for AI-powered OpenShift cluster management.

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

### 2. Install Ollama & Model

```bash
# Install Ollama from https://ollama.ai/download

# Pull Llama 3.1 8B model
ollama pull llama3.1:8b

# Verify
ollama list
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

✅ **AI Chat** - Natural language queries with RAG
✅ **OpenShift Integration** - Real-time cluster data
✅ **Log Analysis** - AI-powered log interpretation
✅ **RAG System** - Runbook and documentation search
✅ **Security** - Whitelisted read-only commands
✅ **Event Explanation** - AI explains OpenShift events

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
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
API_HOST=0.0.0.0
API_PORT=8000
CHROMA_PERSIST_DIR=./chroma_db
```

## Architecture

```
main.py              # FastAPI application
├── config.py        # Configuration settings
├── openshift_client.py  # OpenShift API client
├── ollama_client.py     # Ollama LLM client
└── rag_system.py        # RAG with ChromaDB
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

### Ollama Not Found

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Start Ollama
ollama serve
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

### Add New Endpoint

Edit `main.py`:

```python
@app.get("/api/my-endpoint")
async def my_endpoint():
    return {"message": "Hello"}
```

## Production Deployment

### Docker

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["python", "main.py"]
```

### Environment Variables

Set these in production:
- `OPENSHIFT_API_URL`
- `OPENSHIFT_TOKEN`
- `OLLAMA_BASE_URL`
- `API_HOST=0.0.0.0`
- `API_PORT=8000`

## License

MIT