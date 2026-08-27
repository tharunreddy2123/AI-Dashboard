# Deploying to Netlify + Render — Complete Setup

**Your details are already filled in below. Just follow each step.**

| Service | URL |
|---------|-----|
| **Netlify (frontend)** | https://cluster-dashboard-ai.netlify.app |
| **Render (backend)** | https://openshift-ai-backend.onrender.com *(assigned after deploy)* |

---

## Architecture

```
Browser
  │
  ▼
Netlify CDN  ──  static assets / index.html
  │
  │  /.netlify/functions/api/*
  ▼
Netlify Function (api.ts)  ────────────────►  Render.com
                                              FastAPI :$PORT
                                                  │
                                     ┌────────────┴────────────┐
                                     │                         │
                              OpenShift API             IBM watsonx.ai
                    api.rm3.7wse.p1.openshiftapps.com   eu-gb.ml.cloud.ibm.com
```

---

## PART 1 — Deploy the Backend on Render.com

### Step 1 — Create a Render account

Go to **https://render.com** → sign up (free tier is fine).

### Step 2 — Create a Web Service

1. Dashboard → **New** → **Web Service**
2. Click **Connect a repository** → select your GitHub repo
3. Fill in these settings:

   | Setting | Value |
   |---------|-------|
   | Name | `openshift-ai-backend` |
   | Region | Oregon or Frankfurt |
   | Root Directory | `backend` |
   | Runtime | **Python 3** |
   | Build Command | `pip install -r requirements.txt` |
   | Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
   | Instance Type | **Free** |

4. Click **Create Web Service** (don't deploy yet — add env vars first)

### Step 3 — Add environment variables

In your Render service → **Environment** tab → add every row below.
Tick **Secret** for the three sensitive ones.

| Variable | Value | Secret? |
|----------|-------|---------|
| `OPENSHIFT_API_URL` | `https://api.rm3.7wse.p1.openshiftapps.com:6443` | No |
| `OPENSHIFT_TOKEN` | `sha256~dRZGvVkp1FnEadcYML6l6rn6W743IStvDlAzLqfRhAQ` | **Yes** |
| `WATSONX_API_KEY` | `lHm_RhZegZErFPK9HDXffPNerm9vIB5RUe8PNMid4mcx` | **Yes** |
| `WATSONX_BASE_URL` | `https://eu-gb.ml.cloud.ibm.com` | No |
| `WATSONX_PROJECT_ID` | `13561b59-e277-4250-98a3-2ccd0c4caee0` | **Yes** |
| `WATSONX_MODEL` | `meta-llama/llama-3-3-70b-instruct` | No |
| `ENVIRONMENT` | `production` | No |
| `CORS_ORIGINS` | `https://cluster-dashboard-ai.netlify.app` | No |
| `CHROMA_PERSIST_DIR` | `./chroma_db` | No |
| `API_HOST` | `0.0.0.0` | No |
| `MAX_RETRIES` | `3` | No |
| `RETRY_DELAY` | `2` | No |
| `REQUEST_TIMEOUT` | `30` | No |

Click **Save Changes**.

### Step 4 — Add a Persistent Disk (for ChromaDB / RAG)

1. Render service → **Disks** → **Add Disk**
2. Settings:

   | Setting | Value |
   |---------|-------|
   | Name | `chroma-data` |
   | Mount Path | `/opt/render/project/src/chroma_db` |
   | Size | 1 GB |

3. Click **Save**.

> If you don't need the AI knowledge base / RAG, you can skip this step.

### Step 5 — Deploy

Click **Deploy** (or push a commit to trigger it automatically).

First deploy takes **3–5 minutes** — it downloads the `sentence-transformers` model weights (~400 MB).

Once it's running, test the health endpoint in your browser:

```
https://openshift-ai-backend.onrender.com/health
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

> **Note your Render URL** — Render assigns the name from Step 2, so it will be:
> `https://openshift-ai-backend.onrender.com`

---

## PART 2 — Deploy the Frontend on Netlify

### Step 6 — Connect your repo to Netlify

1. Go to **https://app.netlify.com/projects/cluster-dashboard-ai/overview**
2. If not already connected: **Add new site** → **Import an existing project** → connect GitHub → select this repo
3. Netlify auto-reads [`netlify.toml`](netlify.toml) and pre-fills:

   | Setting | Value |
   |---------|-------|
   | Build command | `npm run build` |
   | Publish directory | `dist` |
   | Functions directory | `netlify/functions` |

4. Do **not** deploy yet — add the environment variable first.

### Step 7 — Set the one required environment variable

**Site settings → Environment variables → Add variable:**

| Key | Value |
|-----|-------|
| `BACKEND_URL` | `https://openshift-ai-backend.onrender.com` |

This is read at runtime by the Netlify proxy function to know where to forward API calls.

> ⚠️ Do **NOT** set `VITE_BACKEND_API_URL` here — leave it unset.
> The frontend build automatically uses `/.netlify/functions/api` in production.

### Step 8 — Deploy

Click **Deploy site** (or push a commit).

Build takes ~1 minute. When it finishes, open:

```
https://cluster-dashboard-ai.netlify.app
```

The dashboard should load and display your OpenShift cluster data.

---

## PART 3 — Verify End-to-End

Open the deployed app and run these checks in order:

### ✅ Check 1 — Backend reachable through proxy
Open in browser:
```
https://cluster-dashboard-ai.netlify.app/.netlify/functions/api/health
```
Expected: `{"api":"healthy","watsonx_ai":"healthy",...}`

### ✅ Check 2 — Token status (green dot in header)
The header should show a **green dot** and "All Systems Operational".
If it shows red "Token Expired", use the **Token** button to paste a fresh `sha256~` token.

### ✅ Check 3 — Cluster data loads
Navigate to **Pods**, **Deployments**, **Namespaces** — data from your OpenShift cluster should appear.

### ✅ Check 4 — AI chat works
Open the chat and type:
```
Show all pods
```
watsonx.ai should respond with the live pod list.

---

## PART 4 — Keeping the Token Fresh

OpenShift tokens expire. When yours expires:

**Option A — Hot reload (no redeploy needed):**
1. Get a new token: OpenShift Console → username → **Copy login command** → **Display Token**
2. Click the **Token** button in the app header → paste the new `sha256~…` token → **Apply**

**Option B — Update Render env var (persists across restarts):**
1. Render → your service → **Environment** → update `OPENSHIFT_TOKEN`
2. Render auto-redeploys

---

## PART 5 — Local Development (unchanged)

Nothing changes for local dev. Run:

```powershell
# Terminal 1 — backend
cd backend
.\venv\Scripts\Activate.ps1      # or: python -m venv venv first
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 — frontend
npm run dev
```

Open **http://localhost:5173** — talks directly to `http://localhost:8000`.

---

## Environment Variables — Quick Reference

### Netlify dashboard (1 variable only)

| Key | Value |
|-----|-------|
| `BACKEND_URL` | `https://openshift-ai-backend.onrender.com` |

### Render dashboard (all backend config)

| Variable | Value |
|----------|-------|
| `OPENSHIFT_API_URL` | `https://api.rm3.7wse.p1.openshiftapps.com:6443` |
| `OPENSHIFT_TOKEN` | `sha256~dRZGvVkp1FnEadcYML6l6rn6W743IStvDlAzLqfRhAQ` |
| `WATSONX_API_KEY` | `lHm_RhZegZErFPK9HDXffPNerm9vIB5RUe8PNMid4mcx` |
| `WATSONX_BASE_URL` | `https://eu-gb.ml.cloud.ibm.com` |
| `WATSONX_PROJECT_ID` | `13561b59-e277-4250-98a3-2ccd0c4caee0` |
| `WATSONX_MODEL` | `meta-llama/llama-3-3-70b-instruct` |
| `ENVIRONMENT` | `production` |
| `CORS_ORIGINS` | `https://cluster-dashboard-ai.netlify.app` |
| `CHROMA_PERSIST_DIR` | `./chroma_db` |
| `API_HOST` | `0.0.0.0` |

### Local dev (`.env.local` — already set)

| Variable | Value |
|----------|-------|
| `VITE_BACKEND_API_URL` | `http://localhost:8000` |
| `VITE_OPENSHIFT_API_URL` | `https://api.rm3.7wse.p1.openshiftapps.com:6443` |
| `VITE_OPENSHIFT_TOKEN` | `sha256~dRZGvVkp1FnEadcYML6l6rn6W743IStvDlAzLqfRhAQ` |

### Local dev backend (`backend/.env` — set manually, see below)

```env
OPENSHIFT_API_URL=https://api.rm3.7wse.p1.openshiftapps.com:6443
OPENSHIFT_TOKEN=sha256~dRZGvVkp1FnEadcYML6l6rn6W743IStvDlAzLqfRhAQ
WATSONX_API_KEY=lHm_RhZegZErFPK9HDXffPNerm9vIB5RUe8PNMid4mcx
WATSONX_BASE_URL=https://eu-gb.ml.cloud.ibm.com
WATSONX_PROJECT_ID=13561b59-e277-4250-98a3-2ccd0c4caee0
WATSONX_MODEL=meta-llama/llama-3-3-70b-instruct
CHROMA_PERSIST_DIR=./chroma_db
API_HOST=0.0.0.0
API_PORT=8000
CORS_ORIGINS=http://localhost:5173,http://localhost:3000,https://cluster-dashboard-ai.netlify.app
ENVIRONMENT=development
MAX_RETRIES=3
RETRY_DELAY=2
REQUEST_TIMEOUT=30
```

> **`backend/.env` is gitignored** — paste the block above into `backend/.env` manually if the file is missing or empty.

---

## Production Checklist

- [ ] Render backend deployed — `/health` returns `"api":"healthy"`
- [ ] `OPENSHIFT_TOKEN` set on Render (marked Secret)
- [ ] `WATSONX_API_KEY` set on Render (marked Secret)
- [ ] `WATSONX_PROJECT_ID` set on Render (marked Secret)
- [ ] `CORS_ORIGINS` on Render = `https://cluster-dashboard-ai.netlify.app`
- [ ] Persistent disk attached at `/opt/render/project/src/chroma_db`
- [ ] `BACKEND_URL` set in Netlify environment variables
- [ ] Netlify build passes (green deploy)
- [ ] `https://cluster-dashboard-ai.netlify.app/.netlify/functions/api/health` returns healthy
- [ ] Dashboard loads cluster data
- [ ] AI chat responds

---

## Troubleshooting

### Netlify Function returns 503 — "BACKEND_URL not set"
→ Add `BACKEND_URL` in Netlify → Site settings → Environment variables, then **Trigger deploy**

### Netlify Function returns 502
→ Render service is sleeping (free tier sleeps after 15 min idle). First request after sleep takes ~30 s — just wait and retry.
→ Double-check `BACKEND_URL` has no trailing slash: `https://openshift-ai-backend.onrender.com`

### `"watsonx_ai": "unavailable"` on `/health`
→ Verify `WATSONX_API_KEY` is set correctly on Render (no extra spaces)
→ Test: `https://openshift-ai-backend.onrender.com/api/watsonx/test`

### Red "Token Expired" banner
→ Get a fresh token from OpenShift Console → username → Copy login command → Display Token
→ Paste it in the app header **Token** modal (hot reload — no restart needed)
→ Also update `OPENSHIFT_TOKEN` on Render so it survives the next redeploy

### CORS error in browser console
→ `CORS_ORIGINS` on Render must be exactly `https://cluster-dashboard-ai.netlify.app` (no trailing slash)
→ After updating, Render redeploys automatically — wait ~1 min

---

*Made with IBM Bob*
