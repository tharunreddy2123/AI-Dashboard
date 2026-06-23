# 🚀 How to Start the Project - Docker

Complete guide to get your OpenShift AI Assistant running with Docker.

## Prerequisites Check

Before starting, ensure you have:
- ✅ **Docker** installed (`docker --version`)
- ✅ **Docker Compose** installed (`docker-compose --version`)
- ✅ **16 GB RAM minimum** (for Llama 3.1 8B)
- ✅ **OpenShift token** ready to configure

## Step-by-Step Startup

### 1️⃣ Configure OpenShift Token (First Time Only)

Update your OpenShift token in **TWO** `.env` files:

**Frontend:** Edit `project/.env`
```env
VITE_OPENSHIFT_API_URL=https://api.rm3.7wse.p1.openshiftapps.com:6443
VITE_OPENSHIFT_TOKEN=sha256~YOUR_TOKEN_HERE
```

**Backend:** Edit `project/backend/.env`
```env
OPENSHIFT_API_URL=https://api.rm3.7wse.p1.openshiftapps.com:6443
OPENSHIFT_TOKEN=sha256~YOUR_TOKEN_HERE
```

📖 See `TOKEN_UPDATE_GUIDE.md` for detailed token instructions.

### 2️⃣ Start All Services with Docker Compose

```bash
# Navigate to project directory
cd project

# Start all services (backend, frontend, ollama)
docker-compose up -d
```

This will:
- Pull and start Ollama container
- Build and start backend API (port 8000)
- Build and start frontend (port 80)
- Create necessary networks and volumes

### 3️⃣ Pull Ollama Model (First Time Only)

```bash
# Pull the Llama 3.1 8B model (~4.7 GB)
docker-compose exec ollama ollama pull llama3.1:8b
```

Wait for the download to complete (5-15 minutes depending on internet speed).

### 4️⃣ Verify Services are Running

```bash
# Check all containers are running
docker-compose ps

# Should show:
# - openshift-assistant-backend (port 8000)
# - openshift-assistant-frontend (port 80)
# - openshift-assistant-ollama (port 11434)
```

### 5️⃣ Access the Dashboard

Open your browser to: **http://localhost**

## Daily Usage

### Starting the Project

```bash
cd project
docker-compose up -d
```

### Stopping the Project

```bash
docker-compose down
```

### Viewing Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f ollama
```

### Restarting After Code Changes

```bash
# Rebuild and restart
docker-compose up -d --build

# Or restart specific service
docker-compose restart backend
```

## Troubleshooting

### Services won't start
```bash
# Check Docker is running
docker ps

# Check for port conflicts
netstat -ano | findstr "80 8000 11434"

# View detailed logs
docker-compose logs
```

### Ollama model not found
```bash
# List models in container
docker-compose exec ollama ollama list

# Pull model again
docker-compose exec ollama ollama pull llama3.1:8b
```

### Backend can't connect to Ollama
```bash
# Test connectivity
docker-compose exec backend curl http://ollama:11434

# Restart services
docker-compose restart
```

### Clean restart (removes all data)
```bash
# Stop and remove everything
docker-compose down -v

# Start fresh
docker-compose up -d
docker-compose exec ollama ollama pull llama3.1:8b
```

## Health Checks

```bash
# Backend health
curl http://localhost:8000/health

# Frontend
curl http://localhost/

# Ollama
curl http://localhost:11434
```

## Useful Commands

```bash
# View running containers
docker-compose ps

# Stop all services
docker-compose down

# Start in foreground (see logs)
docker-compose up

# Rebuild specific service
docker-compose build backend

# Execute command in container
docker-compose exec backend python --version

# View resource usage
docker stats
```

---

**Your AI-powered OpenShift assistant is ready! 🎉**

For more details, see:
- `QUICK_START.md` - Quick reference
- `DEPLOYMENT_GUIDE.md` - Production deployment
- `TROUBLESHOOTING.md` - Common issues