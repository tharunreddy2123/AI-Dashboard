# 🚀 Quick Start Guide - Docker

Get your AI-powered OpenShift assistant running with Docker!

## Step 1: Configure Environment

Copy and update the environment files:

```bash
# Copy example files
cp .env.example .env
cp backend/.env.example backend/.env
```

Edit both `.env` files and add your OpenShift token:
```env
OPENSHIFT_TOKEN=sha256~YOUR_TOKEN_HERE
```

## Step 2: Start with Docker Compose

```bash
# Start all services (backend, frontend, ollama)
docker-compose up -d

# View logs
docker-compose logs -f

# Check status
docker-compose ps
```

This will:
- Start Ollama container with Llama 3.1 8B
- Start backend API on port 8000
- Start frontend on port 80

## Step 3: Pull Ollama Model (First Time Only)

```bash
# Pull the Llama 3.1 8B model into the container
docker-compose exec ollama ollama pull llama3.1:8b
```

## Step 4: Access the Dashboard

Open your browser to: **http://localhost**

## Useful Commands

```bash
# Stop all services
docker-compose down

# Restart services
docker-compose restart

# View backend logs
docker-compose logs -f backend

# View ollama logs
docker-compose logs -f ollama

# Rebuild after code changes
docker-compose up -d --build

# Remove all containers and volumes
docker-compose down -v
```

## Troubleshooting

### Ollama not responding
```bash
# Check if ollama container is running
docker-compose ps ollama

# Restart ollama
docker-compose restart ollama

# Check ollama logs
docker-compose logs ollama
```

### Backend can't connect to Ollama
```bash
# Verify ollama is accessible from backend
docker-compose exec backend curl http://ollama:11434

# Check network connectivity
docker network inspect project_app-network
```

### Port conflicts
If ports 80, 8000, or 11434 are already in use, edit `docker-compose.yml` to change the port mappings.

---

**Your AI assistant is ready! 🎉**