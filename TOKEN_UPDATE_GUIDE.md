# OpenShift Token Update Guide

## Quick Update Instructions

To update your OpenShift token, you only need to modify **TWO** `.env` files:

### 1. Frontend Configuration
Edit `project/.env`:
```env
VITE_OPENSHIFT_API_URL=https://api.rm3.7wse.p1.openshiftapps.com:6443
VITE_OPENSHIFT_TOKEN=<YOUR_NEW_TOKEN_HERE>
```

### 2. Backend Configuration
Edit `project/backend/.env`:
```env
OPENSHIFT_API_URL=https://api.rm3.7wse.p1.openshiftapps.com:6443
OPENSHIFT_TOKEN=<YOUR_NEW_TOKEN_HERE>
```

## How It Works

### Frontend (Vite + React)
- **Environment File**: `project/.env`
- **Configuration**: [`vite.config.ts`](project/vite.config.ts) reads `VITE_OPENSHIFT_TOKEN` from `.env`
- **Client Code**: [`openshift-direct.ts`](project/src/lib/openshift-direct.ts) uses `import.meta.env.VITE_OPENSHIFT_TOKEN`
- **Restart Required**: Yes, restart the Vite dev server after updating

### Backend (Python FastAPI)
- **Environment File**: `project/backend/.env`
- **Configuration**: [`config.py`](project/backend/config.py) uses `pydantic_settings` to load `OPENSHIFT_TOKEN`
- **Client Code**: [`openshift_client.py`](project/backend/openshift_client.py) reads from `settings.openshift_token`
- **Restart Required**: Yes, restart the backend server after updating

## Getting a New Token

1. Login to OpenShift Console
2. Click your username (top right) → "Copy login command"
3. Click "Display Token"
4. Copy the token (starts with `sha256~`)
5. Update both `.env` files as shown above

## Restart Services

After updating the token:

### Frontend
```bash
# Stop the current dev server (Ctrl+C)
npm run dev
```

### Backend
```bash
# Stop the current server (Ctrl+C)
cd backend
python main.py
```

## Verification

Test the connection:
```bash
# Using oc CLI
oc login --token=<YOUR_TOKEN> --server=https://api.rm3.7wse.p1.openshiftapps.com:6443

# Check if it works
oc get projects
```

## Important Notes

- ⚠️ **Never commit tokens to Git** - `.env` files are in `.gitignore`
- 🔄 **Both .env files must have the same token**
- 🔒 **Tokens expire** - Update when you see authentication errors
- 📝 **Environment variables** - Frontend uses `VITE_` prefix, backend doesn't

## Troubleshooting

### "Unauthorized" or "401" errors
- Token has expired - get a new one
- Token not updated in both `.env` files
- Services not restarted after update

### Changes not taking effect
- Restart both frontend and backend servers
- Clear browser cache
- Check `.env` files have no extra spaces or quotes

### Token format
- Should start with `sha256~`
- No quotes needed in `.env` files
- Example: `sha256~Cpv1qGHYumkC1P-ugt5BWK3Xdl65bOtx3Qb94g7e1nI`