# Docker Connection Guide - Ollama to OpenShift Cluster & Dashboard

This guide explains how the Ollama Docker container connects to your OpenShift cluster and dashboard AI chatbot.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Docker Network (app-network)             │
│                                                              │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────┐  │
│  │   Frontend   │─────▶│    Nginx     │─────▶│ Backend  │  │
│  │  (React)     │      │   (Port 80)  │      │(Port 8000)│ │
│  │              │      │              │      │          │  │
│  └──────────────┘      └──────────────┘      └────┬─────┘  │
│                                                    │         │
│                                                    ▼         │
│                                            ┌──────────────┐  │
│                                            │   Ollama     │  │
│                                            │ (Port 11434) │  │
│                                            │ llama3.1:8b  │  │
│                                            └──────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                        ┌────────────────────────┐
                        │  OpenShift Cluster     │
                        │  (External API)        │
                        └────────────────────────┘
```

## Connection Flow

### 1. Frontend → Backend (via Nginx)
- **Frontend URL**: `http://localhost` (port 80)
- **Backend API**: `/api` (proxied by Nginx to `backend:8000`)
- **Configuration**: [`project/.env`](project/.env:12)
  ```env
  VITE_BACKEND_API_URL=/api
  ```

### 2. Backend → Ollama (Docker Network)
- **Ollama URL**: `http://ollama:11434` (Docker service name)
- **Model**: `llama3.1:8b`
- **Configuration**: [`project/backend/.env`](project/backend/.env:12)
  ```env
  OLLAMA_BASE_URL=http://ollama:11434
  OLLAMA_MODEL=llama3.1:8b
  ```

### 3. Backend → OpenShift Cluster (External)
- **API URL**: `https://api.rm3.7wse.p1.openshiftapps.com:6443`
- **Authentication**: Bearer token
- **Configuration**: [`project/backend/.env`](project/backend/.env:3-4)
  ```env
  OPENSHIFT_API_URL=https://api.rm3.7wse.p1.openshiftapps.com:6443
  OPENSHIFT_TOKEN=sha256~YOUR_TOKEN_HERE
  ```

## Setup Instructions

### Step 1: Configure Environment Files

Both `.env` files are already configured for Docker deployment:

**Frontend** ([`project/.env`](project/.env)):
```env
VITE_OPENSHIFT_API_URL=https://api.rm3.7wse.p1.openshiftapps.com:6443
VITE_OPENSHIFT_TOKEN=sha256~YOUR_TOKEN_HERE
VITE_BACKEND_API_URL=/api
```

**Backend** ([`project/backend/.env`](project/backend/.env)):
```env
OPENSHIFT_API_URL=https://api.rm3.7wse.p1.openshiftapps.com:6443
OPENSHIFT_TOKEN=sha256~YOUR_TOKEN_HERE
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=llama3.1:8b
CORS_ORIGINS=http://localhost:5173,http://localhost:3000,http://localhost
```

### Step 2: Start Docker Services

```bash
cd project

# Start all services
docker-compose up -d

# Check status
docker-compose ps
```

Expected output:
```
NAME                              STATUS    PORTS
openshift-assistant-backend       Up        0.0.0.0:8000->8000/tcp
openshift-assistant-frontend      Up        0.0.0.0:80->80/tcp
openshift-assistant-ollama        Up        0.0.0.0:11434->11434/tcp
```

### Step 3: Pull Ollama Model

```bash
# Pull the Llama 3.1 8B model into the container
docker-compose exec ollama ollama pull llama3.1:8b

# Verify model is installed
docker-compose exec ollama ollama list
```

### Step 4: Verify Connections

#### Test Backend → Ollama Connection
```bash
# From your host machine
docker-compose exec backend curl http://ollama:11434/api/tags

# Should return JSON with available models
```

#### Test Backend → OpenShift Connection
```bash
# Check backend health (includes OpenShift connectivity)
curl http://localhost:8000/health

# Expected response:
# {
#   "status": "healthy",
#   "ollama": "available",
#   "openshift": "connected"
# }
```

#### Test Frontend → Backend Connection
```bash
# Access the dashboard
curl http://localhost/

# Should return HTML
```

### Step 5: Test AI Chatbot

1. Open browser: **http://localhost**
2. Click the **sparkle icon** (AI button) in bottom-right corner
3. Try these test queries:
   - "Show me unhealthy pods"
   - "What's the cluster status?"
   - "Analyze recent errors"
   - "List all namespaces"

## Troubleshooting

### Backend Can't Connect to Ollama

**Symptom**: AI chatbot shows "Error communicating with Ollama"

**Solution**:
```bash
# 1. Check Ollama container is running
docker-compose ps ollama

# 2. Check Ollama logs
docker-compose logs ollama

# 3. Test connectivity from backend
docker-compose exec backend curl http://ollama:11434

# 4. Restart Ollama
docker-compose restart ollama

# 5. Verify OLLAMA_BASE_URL in backend/.env
# Should be: http://ollama:11434 (NOT localhost)
```

### Backend Can't Connect to OpenShift

**Symptom**: Dashboard shows "Failed to fetch cluster data"

**Solution**:
```bash
# 1. Verify token in backend/.env
cat backend/.env | grep OPENSHIFT_TOKEN

# 2. Test OpenShift API from backend container
docker-compose exec backend curl -k -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.rm3.7wse.p1.openshiftapps.com:6443/api/v1/namespaces

# 3. Check backend logs
docker-compose logs backend

# 4. Restart backend
docker-compose restart backend
```

### Frontend Can't Connect to Backend

**Symptom**: Dashboard shows network errors or blank pages

**Solution**:
```bash
# 1. Check nginx configuration
docker-compose exec frontend cat /etc/nginx/nginx.conf

# 2. Check backend is accessible
curl http://localhost:8000/health

# 3. Check CORS settings in backend/.env
# Should include: http://localhost

# 4. Restart all services
docker-compose restart
```

### Model Not Found

**Symptom**: "Model llama3.1:8b not found"

**Solution**:
```bash
# 1. List available models
docker-compose exec ollama ollama list

# 2. Pull the model
docker-compose exec ollama ollama pull llama3.1:8b

# 3. Wait for download to complete (4.7 GB)

# 4. Restart backend
docker-compose restart backend
```

## Network Configuration

### Docker Network Details

All services run on the same Docker network (`app-network`):

```bash
# Inspect network
docker network inspect project_app-network

# View connected containers
docker network inspect project_app-network | grep Name
```

### Service Discovery

Docker Compose provides automatic DNS resolution:
- `backend` resolves to backend container IP
- `ollama` resolves to ollama container IP
- `frontend` resolves to frontend container IP

### Port Mappings

| Service  | Internal Port | External Port | Access URL                    |
|----------|---------------|---------------|-------------------------------|
| Frontend | 80            | 80            | http://localhost              |
| Backend  | 8000          | 8000          | http://localhost:8000         |
| Ollama   | 11434         | 11434         | http://localhost:11434        |

## Environment Variables Reference

### Backend Environment Variables

| Variable              | Value                                          | Purpose                          |
|-----------------------|------------------------------------------------|----------------------------------|
| `OPENSHIFT_API_URL`   | `https://api.rm3.7wse.p1.openshiftapps.com:6443` | OpenShift cluster API endpoint |
| `OPENSHIFT_TOKEN`     | `sha256~...`                                   | Authentication token             |
| `OLLAMA_BASE_URL`     | `http://ollama:11434`                          | Ollama service URL (Docker)      |
| `OLLAMA_MODEL`        | `llama3.1:8b`                                  | LLM model to use                 |
| `CORS_ORIGINS`        | `http://localhost:5173,http://localhost:3000,http://localhost` | Allowed origins |
| `ENVIRONMENT`         | `production`                                   | Runtime environment              |

### Frontend Environment Variables

| Variable                    | Value                                          | Purpose                     |
|-----------------------------|------------------------------------------------|-----------------------------|
| `VITE_OPENSHIFT_API_URL`    | `https://api.rm3.7wse.p1.openshiftapps.com:6443` | OpenShift API (direct)   |
| `VITE_OPENSHIFT_TOKEN`      | `sha256~...`                                   | Token for direct API calls  |
| `VITE_BACKEND_API_URL`      | `/api`                                         | Backend API (via nginx)     |
| `VITE_ENV`                  | `production`                                   | Build environment           |

## Testing the Complete Flow

### End-to-End Test

```bash
# 1. Start services
docker-compose up -d

# 2. Wait for services to be healthy
sleep 30

# 3. Pull model (if not already done)
docker-compose exec ollama ollama pull llama3.1:8b

# 4. Test backend health
curl http://localhost:8000/health

# 5. Test AI chat endpoint
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, test message"}'

# 6. Open dashboard
# Visit: http://localhost
# Click AI button and ask: "Show cluster status"
```

### Monitoring Logs

```bash
# Watch all logs in real-time
docker-compose logs -f

# Watch specific service
docker-compose logs -f backend
docker-compose logs -f ollama

# View last 100 lines
docker-compose logs --tail=100 backend
```

## Performance Optimization

### Ollama Performance

```bash
# Check Ollama resource usage
docker stats openshift-assistant-ollama

# For GPU support, uncomment in docker-compose.yml:
# deploy:
#   resources:
#     reservations:
#       devices:
#         - driver: nvidia
#           count: 1
#           capabilities: [gpu]
```

### Backend Performance

```bash
# Check backend resource usage
docker stats openshift-assistant-backend

# Adjust workers in Dockerfile.backend if needed
# CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

## Security Considerations

1. **OpenShift Token**: Store securely, rotate regularly
2. **CORS Origins**: Restrict to known domains in production
3. **Network Isolation**: Services communicate only within Docker network
4. **HTTPS**: Use reverse proxy with SSL in production

## Quick Reference Commands

```bash
# Start everything
docker-compose up -d

# Stop everything
docker-compose down

# Restart backend only
docker-compose restart backend

# View logs
docker-compose logs -f backend

# Execute command in container
docker-compose exec backend python --version

# Pull Ollama model
docker-compose exec ollama ollama pull llama3.1:8b

# Test Ollama
docker-compose exec ollama ollama run llama3.1:8b "test"

# Clean restart
docker-compose down -v && docker-compose up -d
```

---

**Your Ollama Docker container is now connected to your OpenShift cluster and dashboard! 🚀**

For more information:
- [`QUICK_START.md`](project/QUICK_START.md) - Quick setup guide
- [`SETUP_GUIDE.md`](project/SETUP_GUIDE.md) - Detailed setup
- [`TROUBLESHOOTING.md`](project/TROUBLESHOOTING.md) - Common issues