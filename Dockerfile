# ── Build the React app ──────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# No VITE_BACKEND_API_URL: the app calls the same origin and nginx proxies /api to the backend
RUN npm run build

# ── Serve with nginx (non-root, port 8080 — works with OpenShift's random UID) ─
FROM nginxinc/nginx-unprivileged:1.27-alpine
# Rendered by the image entrypoint with envsubst; only BACKEND_URL is substituted
ENV NGINX_ENVSUBST_FILTER=BACKEND_
ENV BACKEND_URL=http://ai-dashboard-backend:8000
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
