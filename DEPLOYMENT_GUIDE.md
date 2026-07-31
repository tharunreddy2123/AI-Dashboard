# Deployment Guide

Guide for deploying the OpenShift AI Assistant in production environments.

## Table of Contents

1. [Local Production Setup](#local-production-setup)
2. [Configuration](#configuration)
3. [Process Management](#process-management)
4. [Environment Variables](#environment-variables)
5. [Troubleshooting](#troubleshooting)

## Local Production Setup

For deploying on a local machine or server.

### 1. Install Dependencies

**Backend:**
```bash
cd project/backend
pip install -r requirements.txt
```

**Frontend:**
```bash
cd project
npm install
npm run build
```

### 2. Configure Environment

**Backend Production Config:**

Edit `backend/.env`:
```env
# OpenShift Configuration
OPENSHIFT_API_URL=https://your-openshift-api.com:6443
OPENSHIFT_TOKEN=your_token_here

# Google AI Configuration
GOOGLE_API_KEY=your_google_api_key_here
GEMINI_MODEL=gemini-1.5-flash

# Production Settings
ENVIRONMENT=production
API_HOST=0.0.0.0
API_PORT=8000

# CORS Origins (your frontend domain)
CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com

# Connection settings
MAX_RETRIES=3
RETRY_DELAY=2
REQUEST_TIMEOUT=30
```

### 3. Start Services

#### Option A: Using Process Manager (systemd - Linux)

**Create systemd service for backend:**

`/etc/systemd/system/openshift-assistant-backend.service`:
```ini
[Unit]
Description=OpenShift AI Assistant Backend
After=network.target

[Service]
Type=simple
User=appuser
WorkingDirectory=/path/to/project/backend
ExecStart=/usr/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable openshift-assistant-backend
sudo systemctl start openshift-assistant-backend
```

#### Option B: Manual Process (Development/Testing)

**Terminal 1 - Backend:**
```bash
# (Google AI is cloud-based, no local service needed)
```

**Terminal 2 - Backend:**
```bash
cd project/backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

**Terminal 3 - Frontend (if using dev server):**
```bash
cd project
npm run dev
```

Or serve built frontend with a web server (see below).

### 4. Serve Frontend (Production)

**Option A: Using Python's http.server:**
```bash
cd project/dist
python -m http.server 80
```

**Option B: Using nginx:**

`/etc/nginx/sites-available/openshift-assistant`:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Redirect HTTP to HTTPS in production
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    root /path/to/project/dist;
    index index.html;

    # Frontend static files
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API proxy
    location /api/ {
        proxy_pass http://localhost:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable and restart:
```bash
sudo ln -s /etc/nginx/sites-available/openshift-assistant /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

**Option C: Using Apache:**

`.htaccess` in `dist/`:
```apache
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /
    RewriteRule ^index\.html$ - [L]
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule . /index.html [L]
</IfModule>
```

## Configuration

### Environment Variables

All variables are loaded from `backend/.env`.

#### Required Variables
- `OPENSHIFT_API_URL` - OpenShift cluster API endpoint
- `OPENSHIFT_TOKEN` - Valid OpenShift authentication token

#### Google AI Configuration
- `GOOGLE_API_KEY` - Google AI API key (free at https://aistudio.google.com/app/apikey)
- `GEMINI_MODEL` - Gemini model name (default: `gemini-1.5-flash`)

#### API Configuration
- `API_HOST` - Listen address (default: `0.0.0.0`)
- `API_PORT` - Listen port (default: `8000`)

#### CORS Configuration
- `CORS_ORIGINS` - Comma-separated list of allowed frontend origins
  - Development: `http://localhost:5173,http://localhost:3000`
  - Production: `https://your-domain.com,https://www.your-domain.com`

#### Connection Settings
- `MAX_RETRIES` - Number of retries for failed requests (default: `3`)
- `RETRY_DELAY` - Delay between retries in seconds (default: `2`)
- `REQUEST_TIMEOUT` - Request timeout in seconds (default: `30`)

#### Environment
- `ENVIRONMENT` - `development` or `production` (default: `development`)

### Example Production .env

```env
# OpenShift
OPENSHIFT_API_URL=https://api.example.com:6443
OPENSHIFT_TOKEN=sha256~abcdef123456

# Google AI
GOOGLE_API_KEY=your_google_api_key_here
GEMINI_MODEL=gemini-1.5-flash

# API
API_HOST=0.0.0.0
API_PORT=8000
ENVIRONMENT=production

# CORS
CORS_ORIGINS=https://openshift-assistant.example.com,https://www.openshift-assistant.example.com

# Connection
MAX_RETRIES=3
RETRY_DELAY=2
REQUEST_TIMEOUT=30
```

## Process Management

### Starting/Stopping Manually

```bash
# Start all three services in separate terminals
# (Google AI is cloud-based, no local service needed)
cd project/backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000
cd project && npm run preview  # or serve via web server

# Stop by pressing Ctrl+C in each terminal
```

### Using supervisor (Linux/macOS)

Install supervisor:
```bash
pip install supervisor
```

Create `/etc/supervisor/conf.d/openshift-assistant.conf`:
```ini
[program:openshift-assistant-backend]
command=python -m uvicorn main:app --host 0.0.0.0 --port 8000
directory=/path/to/project/backend
user=appuser
autostart=true
autorestart=true
stderr_logfile=/var/log/openshift-assistant/backend.err.log
stdout_logfile=/var/log/openshift-assistant/backend.out.log
```

Then:
```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start openshift-assistant-backend
```

## Troubleshooting

### Backend Won't Start

1. Check Python version: `python --version` (must be 3.9+)
2. Check dependencies: `pip list | grep fastapi`
3. Check port availability: `lsof -i :8000` (Linux/macOS)
4. Check logs in terminal output

### Google AI Connection Error

1. Verify `GOOGLE_API_KEY` is set in `backend/.env`
2. Test API key at https://aistudio.google.com/app/apikey
3. Check health: `curl http://localhost:8000/health`

### CORS Errors

1. Verify `CORS_ORIGINS` includes your frontend domain
2. Match protocol (http vs https)
3. Restart backend after changing CORS settings

### High Memory Usage

1. Monitor with: `free -h` or Task Manager
2. Check model size: models require 2-8 GB RAM
3. Google AI is cloud-based - no local memory concerns

See [LOCAL_SETUP.md](LOCAL_SETUP.md) for more details on local setup and [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues.
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
| `GOOGLE_API_KEY` | Yes | - | Google AI (Gemini) API key |
| `GEMINI_MODEL` | No | `gemini-1.5-flash` | Gemini model name |
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
3. Verify Google AI is accessible (check /health endpoint)
4. Review retry settings (`MAX_RETRIES`, `RETRY_DELAY`)

### Google AI Issues

**Problem**: "Error communicating with Google AI"

**Solutions**:
1. Verify `GOOGLE_API_KEY` is set in `backend/.env`
2. Check key is valid at https://aistudio.google.com/app/apikey
3. Check health: `curl http://localhost:8000/health`


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