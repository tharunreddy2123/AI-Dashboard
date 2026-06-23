# OpenShift AI Assistant - Setup Guide (Docker)

Complete guide to set up your AI-powered OpenShift DevOps dashboard with Docker and Llama 3.1 8B.

## Architecture Overview

```
┌─────────────────────┐
│ React Dashboard     │
│ (Port 80)           │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Nginx Reverse Proxy │
│ (Port 80)           │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ FastAPI Backend     │
│ (Port 8000)         │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Ollama Container    │
│ Llama 3.1 8B        │
│ (Port 11434)        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ OpenShift API       │
│ ChromaDB (RAG)      │
└─────────────────────┘
```

## Prerequisites

- **Docker** 20.10+ installed
- **Docker Compose** 1.29+ installed
- **16 GB RAM minimum** (for Llama 3.1 8B)
- **20 GB free disk space** (for Docker images and models)
- **OpenShift cluster access** (API URL and token)

---

## Step 1: Clone and Configure

### 1.1 Navigate to Project Directory

```bash
cd project
```

### 1.2 Configure Environment Variables

Copy the example environment files:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

### 1.3 Update OpenShift Credentials

Edit `project/.env`:
```env
VITE_OPENSHIFT_API_URL=https://api.rm3.7wse.p1.openshiftapps.com:6443
VITE_OPENSHIFT_TOKEN=sha256~YOUR_TOKEN_HERE
```

Edit `project/backend/.env`:
```env
OPENSHIFT_API_URL=https://api.rm3.7wse.p1.openshiftapps.com:6443
OPENSHIFT_TOKEN=sha256~YOUR_TOKEN_HERE
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=llama3.1:8b
```

---

## Step 2: Start Services with Docker Compose

### 2.1 Start All Containers

```bash
docker-compose up -d
```

This command will:
1. Pull the Ollama image
2. Build the backend container
3. Build the frontend container
4. Create Docker networks and volumes
5. Start all services

### 2.2 Verify Containers are Running

```bash
docker-compose ps
```

Expected output:
```
NAME                              STATUS    PORTS
openshift-assistant-backend       Up        0.0.0.0:8000->8000/tcp
openshift-assistant-frontend      Up        0.0.0.0:80->80/tcp
openshift-assistant-ollama        Up        0.0.0.0:11434->11434/tcp
```

### 2.3 View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
```

---

## Step 3: Download Ollama Model

### 3.1 Pull Llama 3.1 8B Model

```bash
docker-compose exec ollama ollama pull llama3.1:8b
```

This downloads ~4.7 GB and may take 5-15 minutes.

### 3.2 Verify Model Installation

```bash
docker-compose exec ollama ollama list
```

Expected output:
```
NAME              ID              SIZE      MODIFIED
llama3.1:8b       <id>            4.7 GB    <date>
```

### 3.3 Test Ollama

```bash
docker-compose exec ollama ollama run llama3.1:8b "Hello, test message"
```

---

## Step 4: Access the Dashboard

### 4.1 Open Browser

Navigate to: **http://localhost**

### 4.2 Test Backend API

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "ollama": "available",
  "openshift": "connected"
}
```

### 4.3 Test AI Chat

1. Click the sparkle icon (AI button) in bottom-right
2. Ask: "Show me unhealthy pods"
3. The AI should respond with cluster information

---

## Step 5: Daily Operations

### Starting the Project

```bash
cd project
docker-compose up -d
```

### Stopping the Project

```bash
docker-compose down
```

### Restarting After Code Changes

```bash
# Rebuild and restart
docker-compose up -d --build

# Or rebuild specific service
docker-compose build backend
docker-compose up -d backend
```

### Viewing Logs

```bash
# All logs
docker-compose logs -f

# Backend only
docker-compose logs -f backend

# Last 100 lines
docker-compose logs --tail=100
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check Docker daemon
docker ps

# Check logs for errors
docker-compose logs backend

# Restart specific service
docker-compose restart backend
```

### Port Already in Use

Edit `docker-compose.yml` to change port mappings:

```yaml
services:
  frontend:
    ports:
      - "8080:80"  # Change from 80 to 8080
```

### Ollama Not Responding

```bash
# Check Ollama container
docker-compose ps ollama

# Restart Ollama
docker-compose restart ollama

# Check Ollama logs
docker-compose logs ollama

# Test connectivity from backend
docker-compose exec backend curl http://ollama:11434
```

### Model Not Found

```bash
# List models
docker-compose exec ollama ollama list

# Re-pull model
docker-compose exec ollama ollama pull llama3.1:8b
```

### Backend Can't Connect to OpenShift

1. Verify token in `backend/.env`
2. Test connection:
```bash
docker-compose exec backend curl -k -H "Authorization: Bearer YOUR_TOKEN" https://api.rm3.7wse.p1.openshiftapps.com:6443/api/v1/namespaces
```

### Clean Restart

```bash
# Stop and remove all containers and volumes
docker-compose down -v

# Remove images (optional)
docker-compose down --rmi all

# Start fresh
docker-compose up -d
docker-compose exec ollama ollama pull llama3.1:8b
```

---

## Advanced Configuration

### GPU Support (Optional)

If you have NVIDIA GPU, uncomment in `docker-compose.yml`:

```yaml
ollama:
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]
```

### Custom Ollama Model

Edit `backend/.env`:
```env
OLLAMA_MODEL=llama3.1:70b  # Use larger model
```

Then pull the model:
```bash
docker-compose exec ollama ollama pull llama3.1:70b
```

### Resource Limits

Edit `docker-compose.yml` to add resource limits:

```yaml
backend:
  deploy:
    resources:
      limits:
        cpus: '2'
        memory: 4G
```

---

## Monitoring

### Container Stats

```bash
docker stats
```

### Health Checks

```bash
# Backend health
curl http://localhost:8000/health

# Ollama health
curl http://localhost:11434

# Frontend
curl http://localhost/
```

### Disk Usage

```bash
# Docker disk usage
docker system df

# Clean up unused resources
docker system prune -a
```

---

## Production Deployment

For production deployment, see:
- `DEPLOYMENT_GUIDE.md` - Production setup
- `PRODUCTION_CHECKLIST.md` - Pre-deployment checklist

---

## Additional Resources

- **Docker Compose Reference**: https://docs.docker.com/compose/
- **Ollama Documentation**: https://ollama.ai/docs
- **OpenShift API**: https://docs.openshift.com/

---

**Your AI-powered OpenShift assistant is ready! 🚀**