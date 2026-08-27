# OpenShift AI Assistant — Deployment Guide

A full-stack AI DevOps dashboard built with **React + Vite** (frontend) and **FastAPI + uvicorn** (backend), powered by **IBM watsonx.ai** and talking to an **OpenShift** cluster via its REST API.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Required Changes Before Deployment](#required-changes-before-deployment)
4. [Local / Self-Hosted Deployment](#local--self-hosted-deployment)
5. [Vercel (Frontend) + External Backend](#vercel-frontend--external-backend)
6. [Docker Deployment](#docker-deployment)
7. [OpenShift / Kubernetes Deployment](#openshift--kubernetes-deployment)
8. [Environment Variables Reference](#environment-variables-reference)
9. [Production Checklist](#production-checklist)
10. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
Browser  ──►  React/Vite Frontend  ──►  FastAPI Backend (port 8000)
                                             │
                                    ┌────────┴────────────┐
                                    │                     │
                             OpenShift API           IBM watsonx.ai
                          (REST / Bearer token)    (eu-gb.ml.cloud.ibm.com)
                                    │
                               ChromaDB (local)
                             (RAG knowledge base)
```

---

## Prerequisites

| Tool | Minimum Version |
|------|----------------|
| Python | 3.9+ |
| Node.js | 18+ |
| npm | 9+ |
| OpenShift cluster | Access token (`sha256~…`) |
| IBM watsonx.ai | API key + project ID |

---

## Required Changes Before Deployment

These are the exact changes you **must** make before the app will work in any environment.

### 1. Backend — Create `backend/.env`

Copy the example file and fill in every value:

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

```env
# ── OpenShift ─────────────────────────────────────────────────────────────────
# Your OpenShift cluster API URL (do NOT change unless you use a different cluster)
OPENSHIFT_API_URL=https://api.rm3.7wse.p1.openshiftapps.com:6443

# Token from: OpenShift Console → username → Copy login command → Display Token
# Must start with sha256~
OPENSHIFT_TOKEN=sha256~<YOUR_TOKEN_HERE>

# ── IBM watsonx.ai ─────────────────────────────────────────────────────────────
# Get from: cloud.ibm.com → Manage → Access (IAM) → API keys
WATSONX_API_KEY=<YOUR_IBM_CLOUD_API_KEY>

# Region endpoint — change if your watsonx instance is in a different region
# us-south: https://us-south.ml.cloud.ibm.com
# eu-de:    https://eu-de.ml.cloud.ibm.com
WATSONX_BASE_URL=https://eu-gb.ml.cloud.ibm.com

# Get from: watsonx.ai project → Manage → General → Project ID
WATSONX_PROJECT_ID=<YOUR_WATSONX_PROJECT_ID>

# Model — change if you want a different LLM
WATSONX_MODEL=meta-llama/llama-3-3-70b-instruct

# ── API server ─────────────────────────────────────────────────────────────────
API_HOST=0.0.0.0
API_PORT=8000

# ── CORS ───────────────────────────────────────────────────────────────────────
# Development (local):
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
# Production — replace with your actual frontend URL:
# CORS_ORIGINS=https://your-frontend-domain.com

# ── ChromaDB ───────────────────────────────────────────────────────────────────
CHROMA_PERSIST_DIR=./chroma_db

# ── Environment ────────────────────────────────────────────────────────────────
ENVIRONMENT=development   # change to "production" when deploying

# ── Retry / timeout ────────────────────────────────────────────────────────────
MAX_RETRIES=3
RETRY_DELAY=2
REQUEST_TIMEOUT=30
```

### 2. Frontend — Create `.env.local`

Copy the example and set the backend URL:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# The URL where your FastAPI backend is reachable from the browser
# Local dev:
VITE_BACKEND_API_URL=http://localhost:8000

# Production (replace with your actual backend URL):
# VITE_BACKEND_API_URL=https://your-backend-domain.com

# OpenShift credentials used by the Vite dev proxy (dev only — NOT sent to production)
VITE_OPENSHIFT_API_URL=https://api.rm3.7wse.p1.openshiftapps.com:6443
VITE_OPENSHIFT_TOKEN=sha256~<YOUR_TOKEN_HERE>

VITE_ENV=development
```

> **Important:** `VITE_OPENSHIFT_TOKEN` in `.env.local` is only used by the Vite dev-server proxy.
> In production, all OpenShift calls go **through the FastAPI backend**, so the token lives only in `backend/.env`.

### 3. CORS — Update for Your Domain

In `backend/.env`, set `CORS_ORIGINS` to the exact origin(s) your browser will use:

```env
# Single domain:
CORS_ORIGINS=https://my-dashboard.example.com

# Multiple domains (no spaces around commas):
CORS_ORIGINS=https://my-dashboard.example.com,https://www.my-dashboard.example.com
```

### 4. `watsonx_client.py` — Verify Region Endpoint

Open [`backend/watsonx_client.py`](backend/watsonx_client.py) and confirm the IAM token URL and inference endpoint match your IBM Cloud region. The `WATSONX_BASE_URL` in `backend/.env` controls the inference endpoint; the IAM URL (`https://iam.cloud.ibm.com/identity/token`) is global and does not need changing.

---

## Local / Self-Hosted Deployment

### Step 1 — Install Python dependencies

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### Step 2 — Install Node dependencies

```powershell
cd ..       # back to project root
npm install
```

### Step 3 — Start the backend

```powershell
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Verify it's healthy:

```
GET http://localhost:8000/health
```

Expected response:
```json
{
  "api": "healthy",
  "watsonx_ai": "healthy",
  "model": "meta-llama/llama-3-3-70b-instruct",
  "rag_system": "healthy",
  "knowledge_base_docs": 0
}
```

### Step 4 — Start the frontend

```powershell
npm run dev
```

Open **http://localhost:5173**

### Step 5 — Build for production (static files)

```powershell
npm run build
# Output is in dist/
```

Serve `dist/` with any static file server (nginx, Apache, `python -m http.server`).

---

## Vercel (Frontend) + External Backend

The project has a [`vercel.json`](vercel.json) and a [`.vercel/`](.vercel/) directory, meaning the frontend is already wired for Vercel.

### Changes required

1. **Set environment variables in Vercel dashboard** (Project → Settings → Environment Variables):

   | Name | Value |
   |------|-------|
   | `VITE_BACKEND_API_URL` | `https://your-backend-server.com` |
   | `VITE_ENV` | `production` |

   Do **not** put `VITE_OPENSHIFT_TOKEN` in Vercel — the token is used only on the backend side.

2. **Deploy the backend separately** on a server that has:
   - Python 3.9+
   - Outbound HTTPS access to `api.rm3.7wse.p1.openshiftapps.com` and `eu-gb.ml.cloud.ibm.com`
   - A public IP / domain so Vercel's frontend can reach it

3. **Update CORS** in `backend/.env`:
   ```env
   CORS_ORIGINS=https://<your-vercel-app>.vercel.app
   ```

4. **Rebuild and redeploy** the frontend on Vercel after updating env vars.

---

## Docker Deployment

### Backend Dockerfile

Create `backend/Dockerfile`:

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Build and run:

```bash
docker build -t openshift-ai-backend ./backend
docker run -d \
  --name oas-backend \
  -p 8000:8000 \
  --env-file backend/.env \
  -v $(pwd)/backend/chroma_db:/app/chroma_db \
  openshift-ai-backend
```

### Frontend Dockerfile

Create `Dockerfile` at project root:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_BACKEND_API_URL
ENV VITE_BACKEND_API_URL=$VITE_BACKEND_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

Build and run:

```bash
docker build \
  --build-arg VITE_BACKEND_API_URL=https://your-backend.com \
  -t openshift-ai-frontend .

docker run -d --name oas-frontend -p 80:80 openshift-ai-frontend
```

### docker-compose.yml (optional)

```yaml
version: "3.9"
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    env_file: ./backend/.env
    volumes:
      - ./backend/chroma_db:/app/chroma_db

  frontend:
    build:
      context: .
      args:
        VITE_BACKEND_API_URL: http://backend:8000
    ports:
      - "80:80"
    depends_on:
      - backend
```

---

## OpenShift / Kubernetes Deployment

### Backend manifest

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oas-backend
spec:
  replicas: 1
  selector:
    matchLabels:
      app: oas-backend
  template:
    metadata:
      labels:
        app: oas-backend
    spec:
      containers:
        - name: backend
          image: your-registry/openshift-ai-backend:latest
          ports:
            - containerPort: 8000
          env:
            - name: OPENSHIFT_API_URL
              valueFrom:
                secretKeyRef:
                  name: oas-secrets
                  key: openshift-api-url
            - name: OPENSHIFT_TOKEN
              valueFrom:
                secretKeyRef:
                  name: oas-secrets
                  key: openshift-token
            - name: WATSONX_API_KEY
              valueFrom:
                secretKeyRef:
                  name: oas-secrets
                  key: watsonx-api-key
            - name: WATSONX_PROJECT_ID
              valueFrom:
                secretKeyRef:
                  name: oas-secrets
                  key: watsonx-project-id
            - name: ENVIRONMENT
              value: "production"
            - name: CORS_ORIGINS
              value: "https://your-frontend.example.com"
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
```

Create the Secret:

```bash
oc create secret generic oas-secrets \
  --from-literal=openshift-api-url='https://api.rm3.7wse.p1.openshiftapps.com:6443' \
  --from-literal=openshift-token='sha256~...' \
  --from-literal=watsonx-api-key='...' \
  --from-literal=watsonx-project-id='...'
```

---

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENSHIFT_API_URL` | ✅ | `https://api.rm3.7wse.p1.openshiftapps.com:6443` | OpenShift cluster API endpoint |
| `OPENSHIFT_TOKEN` | ✅ | — | Bearer token (`sha256~…`) |
| `WATSONX_API_KEY` | ✅ | — | IBM Cloud API key |
| `WATSONX_BASE_URL` | ✅ | `https://eu-gb.ml.cloud.ibm.com` | watsonx.ai regional endpoint |
| `WATSONX_PROJECT_ID` | ✅ | — | watsonx.ai project ID |
| `WATSONX_MODEL` | No | `meta-llama/llama-3-3-70b-instruct` | LLM model ID |
| `CHROMA_PERSIST_DIR` | No | `./chroma_db` | ChromaDB storage path |
| `API_HOST` | No | `0.0.0.0` | Bind address |
| `API_PORT` | No | `8000` | Bind port |
| `CORS_ORIGINS` | ✅ (prod) | `http://localhost:5173,...` | Comma-separated allowed origins |
| `ENVIRONMENT` | No | `development` | `development` or `production` |
| `MAX_RETRIES` | No | `3` | HTTP retry count |
| `RETRY_DELAY` | No | `2` | Seconds between retries |
| `REQUEST_TIMEOUT` | No | `30` | Request timeout (seconds) |

### Frontend (`.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_BACKEND_API_URL` | ✅ | URL the browser uses to reach the FastAPI backend |
| `VITE_OPENSHIFT_API_URL` | Dev only | Used by Vite dev proxy to forward `/api/openshift/*` |
| `VITE_OPENSHIFT_TOKEN` | Dev only | Bearer token for Vite dev proxy (NOT used in production) |
| `VITE_ENV` | No | `development` or `production` |

---

## Production Checklist

- [ ] `backend/.env` — all required vars set (no placeholder values left)
- [ ] `OPENSHIFT_TOKEN` is a valid, non-expired `sha256~` token
- [ ] `WATSONX_API_KEY` and `WATSONX_PROJECT_ID` are correct
- [ ] `CORS_ORIGINS` contains your production frontend URL
- [ ] `ENVIRONMENT=production` in `backend/.env`
- [ ] `.env.local` sets `VITE_BACKEND_API_URL` to the public backend URL
- [ ] Frontend built with `npm run build` using production env vars
- [ ] Backend reachable on port 8000 (or behind a reverse proxy)
- [ ] `/health` endpoint returns `"watsonx_ai": "healthy"`
- [ ] `chroma_db/` directory is on persistent storage (not ephemeral)
- [ ] HTTPS configured (required for secure token transmission)
- [ ] No `.env` files committed to git (check `.gitignore`)

---

## Troubleshooting

### `watsonx_ai: "unavailable"` on `/health`

1. Check `WATSONX_API_KEY` — must be an IBM Cloud API key, not an IAM token.
2. Test directly: `GET http://localhost:8000/api/watsonx/test`
3. Verify `WATSONX_PROJECT_ID` matches a project in the correct IBM Cloud region.
4. Confirm `WATSONX_BASE_URL` matches your region (`eu-gb`, `us-south`, `eu-de`).

### Token expired — `⚠️ OpenShift token expired`

1. Go to OpenShift Console → username → **Copy login command** → **Display Token**
2. Copy the new `sha256~…` token
3. Either:
   - Update `OPENSHIFT_TOKEN` in `backend/.env` and restart backend, **or**
   - Use the hot-reload endpoint (no restart needed):
     ```bash
     curl -X POST http://localhost:8000/api/openshift/update-token \
       -H "Content-Type: application/json" \
       -d '{"token": "sha256~<new-token>"}'
     ```

### CORS errors in browser

1. Confirm `CORS_ORIGINS` in `backend/.env` exactly matches your frontend origin (including protocol and port).
2. Restart the backend — CORS settings are read at startup.
3. Clear browser cache.

### Frontend shows "Unable to connect to backend"

1. Verify `VITE_BACKEND_API_URL` in `.env.local` points to the correct backend host/port.
2. Check the backend is running: `curl http://localhost:8000/health`
3. If behind a firewall, ensure port 8000 (or your proxy port) is open.

### ChromaDB / RAG unavailable

ChromaDB requires `sentence-transformers` which downloads model weights on first run (~400 MB).
- Ensure internet access on first startup.
- The `chroma_db/` directory must be writable.
- If running in a container, mount `chroma_db/` as a persistent volume.

### `pip install` fails on `chromadb` or `sentence-transformers`

```bash
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
```

On Python 3.14 (pre-release), use Python 3.11 or 3.12 instead.

---

## Key Files for Deployment

| File | Purpose |
|------|---------|
| [`backend/.env`](backend/.env.example) | All backend secrets and settings |
| [`.env.local`](.env.example) | Frontend environment variables |
| [`backend/config.py`](backend/config.py) | Reads `backend/.env` via pydantic-settings |
| [`backend/requirements.txt`](backend/requirements.txt) | Python dependencies |
| [`package.json`](package.json) | Node dependencies and build scripts |
| [`vite.config.ts`](vite.config.ts) | Vite build + dev proxy config |
| [`vercel.json`](vercel.json) | Vercel deployment config |
| [`src/lib/api-client.ts`](src/lib/api-client.ts) | Frontend → backend URL resolution |

---

*Made with IBM Bob*
