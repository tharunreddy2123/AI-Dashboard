# Deployment Guide

This guide explains how to deploy the OpenShift AI Assistant in production environments without localhost dependencies or network issues.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Configuration](#configuration)
4. [Deployment Options](#deployment-options)
5. [Environment Variables](#environment-variables)
6. [Troubleshooting](#troubleshooting)

## Overview

The application has been configured for production deployment with:

- ✅ **Environment-aware configuration** - Automatically adapts to development/production
- ✅ **Connection retry logic** - Handles network failures gracefully
- ✅ **Configurable timeouts** - Prevents hanging requests
- ✅ **CORS configuration** - Supports multiple frontend domains
- ✅ **Health checks** - Monitors service availability
- ✅ **Docker support** - Easy containerized deployment

## Prerequisites

### Required
- Docker and Docker Compose (for containerized deployment)
- OpenShift cluster access with valid token
- Network access to OpenShift API

### Optional
- Ollama instance (local or remote) for AI features
- Kubernetes/OpenShift cluster for orchestrated deployment

## Configuration

### 1. Backend Configuration

Copy the example environment file and configure:

```bash
cd project/backend
cp .env.example .env
```

Edit `backend/.env`:

```env
# OpenShift Configuration
OPENSHIFT_API_URL=https://your-openshift-api.com:6443
OPENSHIFT_TOKEN=your_token_here

# Ollama Configuration (use deployed instance URL)
OLLAMA_BASE_URL=http://ollama-service:11434
OLLAMA_MODEL=llama3.1:8b

# CORS Origins (comma-separated, include your frontend domain)
CORS_ORIGINS=https://your-frontend.com,https://www.your-frontend.com

# Environment
ENVIRONMENT=production

# Connection settings
MAX_RETRIES=3
RETRY_DELAY=2
REQUEST_TIMEOUT=30
```

### 2. Frontend Configuration

Copy the example environment file:

```bash
cd project
cp .env.example .env
```

Edit `.env`:

```env
# OpenShift Configuration
VITE_OPENSHIFT_API_URL=https://your-openshift-api.com:6443
VITE_OPENSHIFT_TOKEN=your_token_here

# Backend API URL
# For production with same domain: /api
# For separate backend domain: https://api.your-domain.com
VITE_BACKEND_API_URL=/api

# Environment
VITE_ENV=production
```

## Deployment Options

### Option 1: Docker Compose (Recommended for Quick Start)

This deploys frontend, backend, and Ollama together:

```bash
# 1. Set environment variables
export OPENSHIFT_TOKEN="your_token_here"
export OPENSHIFT_API_URL="https://your-openshift-api.com:6443"

# 2. Start all services
docker-compose up -d

# 3. Check status
docker-compose ps

# 4. View logs
docker-compose logs -f

# 5. Access application
# Frontend: http://localhost
# Backend API: http://localhost:8000
# Ollama: http://localhost:11434
```

### Option 2: Separate Container Deployment

#### Backend Only

```bash
# Build backend image
docker build -f Dockerfile.backend -t openshift-assistant-backend .

# Run backend container
docker run -d \
  --name backend \
  -p 8000:8000 \
  -e OPENSHIFT_API_URL="https://your-api.com:6443" \
  -e OPENSHIFT_TOKEN="your_token" \
  -e OLLAMA_BASE_URL="http://ollama-host:11434" \
  -e ENVIRONMENT="production" \
  -e CORS_ORIGINS="https://your-frontend.com" \
  openshift-assistant-backend
```

#### Frontend Only

```bash
# Build frontend image
cd project
docker build -f Dockerfile.frontend -t openshift-assistant-frontend .

# Run frontend container
docker run -d \
  --name frontend \
  -p 80:80 \
  -e VITE_BACKEND_API_URL="/api" \
  openshift-assistant-frontend
```

### Option 3: Kubernetes/OpenShift Deployment

Create deployment manifests:

```yaml
# backend-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: openshift-assistant-backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: openshift-assistant-backend
  template:
    metadata:
      labels:
        app: openshift-assistant-backend
    spec:
      containers:
      - name: backend
        image: your-registry/openshift-assistant-backend:latest
        ports:
        - containerPort: 8000
        env:
        - name: OPENSHIFT_API_URL
          valueFrom:
            secretKeyRef:
              name: openshift-credentials
              key: api-url
        - name: OPENSHIFT_TOKEN
          valueFrom:
            secretKeyRef:
              name: openshift-credentials
              key: token
        - name: ENVIRONMENT
          value: "production"
        - name: CORS_ORIGINS
          value: "https://your-frontend.com"
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 10
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: backend-service
spec:
  selector:
    app: openshift-assistant-backend
  ports:
  - port: 8000
    targetPort: 8000
```

Deploy:

```bash
kubectl apply -f backend-deployment.yaml
kubectl apply -f frontend-deployment.yaml
```

### Option 4: Traditional Server Deployment

#### Backend

```bash
# 1. Install Python dependencies
cd project/backend
pip install -r requirements.txt

# 2. Set environment variables
export OPENSHIFT_API_URL="https://your-api.com:6443"
export OPENSHIFT_TOKEN="your_token"
export ENVIRONMENT="production"
export CORS_ORIGINS="https://your-frontend.com"

# 3. Run with production server
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

#### Frontend

```bash
# 1. Install dependencies
cd project
npm install

# 2. Build for production
npm run build

# 3. Serve with nginx or any static file server
# Copy dist/ folder to your web server
```

## Environment Variables

### Backend Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENSHIFT_API_URL` | Yes | - | OpenShift API endpoint |
| `OPENSHIFT_TOKEN` | Yes | - | OpenShift authentication token |
| `OLLAMA_BASE_URL` | No | `http://localhost:11434` | Ollama service URL |
| `OLLAMA_MODEL` | No | `llama3.1:8b` | Ollama model name |
| `CORS_ORIGINS` | No | `http://localhost:5173,http://localhost:3000` | Allowed CORS origins |
| `ENVIRONMENT` | No | `development` | Environment (development/production) |
| `MAX_RETRIES` | No | `3` | Maximum connection retry attempts |
| `RETRY_DELAY` | No | `2` | Delay between retries (seconds) |
| `REQUEST_TIMEOUT` | No | `30` | Request timeout (seconds) |
| `API_HOST` | No | `0.0.0.0` | API bind host |
| `API_PORT` | No | `8000` | API bind port |

### Frontend Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_OPENSHIFT_API_URL` | Yes | - | OpenShift API endpoint |
| `VITE_OPENSHIFT_TOKEN` | Yes | - | OpenShift authentication token |
| `VITE_BACKEND_API_URL` | No | Auto-detected | Backend API URL |
| `VITE_ENV` | No | `development` | Environment |

## Troubleshooting

### Connection Issues

**Problem**: "Unable to connect to backend"

**Solutions**:
1. Check backend is running: `curl http://backend-url/health`
2. Verify CORS origins include your frontend domain
3. Check network connectivity between services
4. Review backend logs: `docker-compose logs backend`

**Problem**: "OpenShift API connection failed"

**Solutions**:
1. Verify token is valid: `oc whoami`
2. Check API URL is correct
3. Ensure network access to OpenShift API
4. Check firewall rules

### Timeout Issues

**Problem**: Requests timing out

**Solutions**:
1. Increase `REQUEST_TIMEOUT` in backend `.env`
2. Check network latency to OpenShift API
3. Verify Ollama service is responsive
4. Review retry settings (`MAX_RETRIES`, `RETRY_DELAY`)

### Ollama Issues

**Problem**: "Error communicating with Ollama"

**Solutions**:
1. Verify Ollama is running: `curl http://ollama-url:11434/api/tags`
2. Check `OLLAMA_BASE_URL` is correct
3. Ensure model is pulled: `ollama pull llama3.1:8b`
4. Check Ollama logs for errors

### CORS Issues

**Problem**: CORS errors in browser console

**Solutions**:
1. Add your frontend domain to `CORS_ORIGINS` in backend `.env`
2. Restart backend after changing CORS settings
3. Clear browser cache
4. Check browser network tab for actual error

### Health Check Failures

**Problem**: Container health checks failing

**Solutions**:
1. Check service is actually running inside container
2. Verify health endpoint responds: `curl http://localhost:8000/health`
3. Increase health check timeout in docker-compose.yml
4. Review container logs for startup errors

## Production Checklist

Before deploying to production:

- [ ] Update all tokens and credentials
- [ ] Configure proper CORS origins
- [ ] Set `ENVIRONMENT=production`
- [ ] Configure appropriate retry and timeout values
- [ ] Set up monitoring and logging
- [ ] Configure SSL/TLS certificates
- [ ] Set up backup for ChromaDB data
- [ ] Test health check endpoints
- [ ] Verify network connectivity
- [ ] Review security settings
- [ ] Set up log aggregation
- [ ] Configure resource limits (CPU/Memory)

## Monitoring

### Health Endpoints

- Backend: `http://backend-url:8000/health`
- Frontend: `http://frontend-url/`

### Logs

```bash
# Docker Compose
docker-compose logs -f backend
docker-compose logs -f frontend

# Kubernetes
kubectl logs -f deployment/openshift-assistant-backend
kubectl logs -f deployment/openshift-assistant-frontend
```

## Support

For issues or questions:
1. Check logs for error messages
2. Review this troubleshooting guide
3. Verify all environment variables are set correctly
4. Test connectivity to all required services

---

**Made with Bob**