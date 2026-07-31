# Production Deployment Checklist

Use this checklist to ensure your deployment is production-ready and won't have localhost or network issues.

## Pre-Deployment Configuration

### Backend Configuration (`backend/.env`)

- [ ] **OpenShift Credentials**
  - [ ] `OPENSHIFT_API_URL` is set to production cluster URL
  - [ ] `OPENSHIFT_TOKEN` is valid and has necessary permissions
  - [ ] Token expiration is monitored

- [ ] **Google AI Configuration**
  - [ ] `GOOGLE_API_KEY` is set and valid
  - [ ] `GEMINI_MODEL` is set (default: gemini-1.5-flash)
  - [ ] API quota is sufficient for expected load

- [ ] **CORS Configuration**
  - [ ] `CORS_ORIGINS` includes all production frontend domains
  - [ ] No wildcard (*) in production unless absolutely necessary
  - [ ] Both HTTP and HTTPS variants included if needed

- [ ] **Environment Settings**
  - [ ] `ENVIRONMENT=production`
  - [ ] `MAX_RETRIES` set appropriately (default: 3)
  - [ ] `RETRY_DELAY` configured (default: 2 seconds)
  - [ ] `REQUEST_TIMEOUT` set based on network conditions (default: 30s)

### Frontend Configuration (`project/.env`)

- [ ] **Backend API URL**
  - [ ] `VITE_BACKEND_API_URL` is NOT set to localhost
  - [ ] Using `/api` for same-domain deployment OR
  - [ ] Using full URL for separate backend domain
  - [ ] URL is accessible from production environment

- [ ] **OpenShift Credentials**
  - [ ] `VITE_OPENSHIFT_API_URL` is correct
  - [ ] `VITE_OPENSHIFT_TOKEN` is valid

- [ ] **Environment**
  - [ ] `VITE_ENV=production`

## Network & Connectivity

- [ ] **Backend to OpenShift**
  - [ ] Network path exists from backend to OpenShift API
  - [ ] Firewall rules allow outbound HTTPS (port 6443)
  - [ ] DNS resolution works for OpenShift API URL
  - [ ] SSL/TLS certificates are valid

- [ ] **Backend to Google AI**
  - [ ] Backend can reach https://generativelanguage.googleapis.com
  - [ ] Outbound HTTPS (port 443) is allowed
  - [ ] No localhost references in production config

- [ ] **Frontend to Backend**
  - [ ] Frontend can reach backend API
  - [ ] CORS is properly configured
  - [ ] API endpoints respond correctly

## Deployment & Infrastructure

### Local/Server Deployment

- [ ] **Python Environment**
  - [ ] Python 3.9+ installed on target server
  - [ ] Virtual environment created (recommended)
  - [ ] All dependencies installed: `pip install -r requirements.txt`

- [ ] **Node.js & Frontend**
  - [ ] Node.js 18+ installed
  - [ ] Frontend built: `npm run build`
  - [ ] Built files in `dist/` directory


- [ ] **Process Management**
  - [ ] Backend started with uvicorn or process manager
  - [ ] Frontend served with nginx/Apache/http.server

  - [ ] Services configured to restart on reboot

- [ ] **Networking**
  - [ ] Services can communicate via configured URLs
  - [ ] Firewall rules allow necessary ports
  - [ ] No localhost references in production config

## Testing

- [ ] **Connection Tests**
  - [ ] Backend can connect to OpenShift API
  - [ ] Backend can connect to Google AI (check /health endpoint)
  - [ ] Frontend can connect to backend
  - [ ] All retry logic works as expected

- [ ] **Functionality Tests**
  - [ ] Can list namespaces/projects
  - [ ] Can view pods and their status
  - [ ] Can view nodes (if permissions allow)
  - [ ] AI chat responds correctly
  - [ ] Cluster health analysis works

- [ ] **Error Handling**
  - [ ] Network failures are handled gracefully
  - [ ] Timeout errors show helpful messages
  - [ ] Connection retries work correctly
  - [ ] User sees meaningful error messages

## Security

- [ ] **Credentials**
  - [ ] Tokens are stored securely (not in code)
  - [ ] Environment files are in .gitignore
  - [ ] Secrets are rotated regularly
  - [ ] Token permissions follow least privilege

- [ ] **Network Security**
  - [ ] HTTPS is used for all external connections
  - [ ] SSL/TLS certificates are valid
  - [ ] CORS is restrictive (not allowing all origins)
  - [ ] API endpoints are not publicly exposed unnecessarily

- [ ] **Container Security**
  - [ ] Images are from trusted sources
  - [ ] No unnecessary packages installed
  - [ ] Running as non-root user (where possible)
  - [ ] Security updates applied

## Monitoring & Logging

- [ ] **Health Monitoring**
  - [ ] Health check endpoints are monitored
  - [ ] Alerts configured for service failures
  - [ ] Uptime monitoring in place

- [ ] **Logging**
  - [ ] Application logs are collected
  - [ ] Error logs are monitored
  - [ ] Log retention policy defined
  - [ ] Sensitive data not logged

- [ ] **Metrics**
  - [ ] Response times monitored
  - [ ] Error rates tracked
  - [ ] Resource usage monitored (CPU, memory)

## Performance

- [ ] **Timeouts**
  - [ ] Request timeouts are appropriate for network conditions
  - [ ] Retry delays don't cause excessive wait times
  - [ ] Health check timeouts are reasonable

- [ ] **Resources**
  - [ ] Adequate CPU allocated
  - [ ] Sufficient memory allocated
  - [ ] Storage capacity planned for ChromaDB

- [ ] **Scaling**
  - [ ] Can handle expected load
  - [ ] Horizontal scaling possible if needed
  - [ ] Load balancing configured (if applicable)

## Backup & Recovery

- [ ] **Data Backup**
  - [ ] ChromaDB data is backed up
  - [ ] Backup schedule defined
  - [ ] Restore procedure tested

- [ ] **Disaster Recovery**
  - [ ] Recovery plan documented
  - [ ] RTO/RPO defined
  - [ ] Failover procedure tested

## Documentation

- [ ] **Deployment Docs**
  - [ ] Deployment procedure documented
  - [ ] Configuration options explained
  - [ ] Troubleshooting guide available

- [ ] **Runbooks**
  - [ ] Common issues documented
  - [ ] Resolution steps clear
  - [ ] Contact information included

## Post-Deployment

- [ ] **Verification**
  - [ ] All services are running
  - [ ] Health checks passing
  - [ ] Functionality verified in production
  - [ ] No errors in logs

- [ ] **Monitoring**
  - [ ] Monitoring dashboards checked
  - [ ] Alerts are working
  - [ ] Logs are being collected

- [ ] **Communication**
  - [ ] Stakeholders notified
  - [ ] Documentation updated
  - [ ] Support team briefed

## Common Issues to Avoid

❌ **DON'T:**
- Use `localhost` in production configuration
- Hardcode credentials in code or config files
- Allow all CORS origins (*)
- Skip health checks
- Ignore connection timeouts
- Deploy without testing retry logic
- Use development tokens in production

✅ **DO:**
- Use environment-specific configuration
- Store credentials securely
- Configure specific CORS origins
- Implement health checks
- Set appropriate timeouts
- Test connection retry logic
- Use production tokens with proper permissions
- Monitor and log everything
- Have a rollback plan

---

**Made with Bob**