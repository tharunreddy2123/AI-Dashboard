import chromadb
from chromadb.config import Settings as ChromaSettings
from typing import List, Dict, Any
from config import settings
import os

class RAGSystem:
    """RAG (Retrieval Augmented Generation) system for runbooks and documentation"""
    
    def __init__(self):
        # Initialize ChromaDB
        self.client = chromadb.PersistentClient(
            path=settings.chroma_persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False)
        )
        
        # Create or get collection
        self.collection = self.client.get_or_create_collection(
            name="openshift_knowledge",
            metadata={"description": "OpenShift runbooks, SOPs, and troubleshooting guides"}
        )
    
    def add_document(
        self, 
        content: str, 
        metadata: Dict[str, Any],
        doc_id: str
    ) -> None:
        """Add a document to the knowledge base"""
        self.collection.add(
            documents=[content],
            metadatas=[metadata],
            ids=[doc_id]
        )
    
    def add_runbook(
        self,
        title: str,
        content: str,
        category: str,
        tags: List[str] = None
    ) -> str:
        """Add a runbook to the knowledge base"""
        doc_id = f"runbook_{title.lower().replace(' ', '_')}"
        metadata = {
            "type": "runbook",
            "title": title,
            "category": category,
            "tags": ",".join(tags) if tags else ""
        }
        self.add_document(content, metadata, doc_id)
        return doc_id
    
    def add_incident_report(
        self,
        title: str,
        content: str,
        severity: str,
        resolution: str
    ) -> str:
        """Add an incident report to the knowledge base"""
        doc_id = f"incident_{title.lower().replace(' ', '_')}"
        full_content = f"{content}\n\nResolution: {resolution}"
        metadata = {
            "type": "incident",
            "title": title,
            "severity": severity
        }
        self.add_document(full_content, metadata, doc_id)
        return doc_id
    
    def search(
        self, 
        query: str, 
        n_results: int = 3,
        filter_type: str = None
    ) -> List[Dict[str, Any]]:
        """Search the knowledge base"""
        where_filter = {"type": filter_type} if filter_type else None
        
        results = self.collection.query(
            query_texts=[query],
            n_results=n_results,
            where=where_filter
        )
        
        # Format results
        formatted_results = []
        if results and results["documents"]:
            for i, doc in enumerate(results["documents"][0]):
                formatted_results.append({
                    "content": doc,
                    "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                    "distance": results["distances"][0][i] if results["distances"] else 0
                })
        
        return formatted_results
    
    def get_relevant_context(self, query: str, max_results: int = 3) -> str:
        """Get relevant context for a query"""
        results = self.search(query, n_results=max_results)
        
        if not results:
            return "No relevant documentation found."
        
        context_parts = []
        for i, result in enumerate(results, 1):
            metadata = result["metadata"]
            title = metadata.get("title", "Unknown")
            doc_type = metadata.get("type", "document")
            content = result["content"]
            
            context_parts.append(f"[{doc_type.upper()} {i}: {title}]\n{content}\n")
        
        return "\n---\n".join(context_parts)
    
    def initialize_sample_data(self):
        """Initialize with sample runbooks and documentation"""
        
        # Sample Portworx runbook
        self.add_runbook(
            title="Portworx Migration Troubleshooting",
            content="""
# Portworx Migration Troubleshooting

## Common Issues:

1. **Migration Stuck at 80%**
   - Check network connectivity between nodes
   - Verify storage capacity on target nodes
   - Review Portworx logs: `kubectl logs -n kube-system -l name=portworx`
   - Check migration status: `pxctl cloudsnap status`

2. **Volume Not Accessible After Migration**
   - Verify volume is attached: `pxctl volume inspect <vol-id>`
   - Check pod events: `oc describe pod <pod-name>`
   - Restart the pod to remount volume

3. **Performance Degradation During Migration**
   - Throttle migration speed: `pxctl cloudsnap throttle --rate 100`
   - Schedule migration during off-peak hours
   - Monitor I/O metrics

## Resolution Steps:
1. Identify the stuck volume
2. Check Portworx cluster status
3. Review migration logs
4. If needed, cancel and restart migration
5. Verify data integrity after completion
""",
            category="storage",
            tags=["portworx", "migration", "storage"]
        )
        
        # Sample Grafana runbook
        self.add_runbook(
            title="Grafana Not Starting",
            content="""
# Grafana Startup Issues

## Diagnostic Steps:

1. **Check Pod Status**
   ```
   oc get pods -n monitoring | grep grafana
   oc describe pod <grafana-pod> -n monitoring
   ```

2. **Review Logs**
   ```
   oc logs <grafana-pod> -n monitoring
   ```

3. **Common Causes**:
   - Database connection issues
   - Insufficient permissions
   - Configuration errors
   - Resource constraints (CPU/Memory)
   - PVC mount failures

4. **Solutions**:
   - Verify database connectivity
   - Check ConfigMap and Secrets
   - Increase resource limits if needed
   - Verify PVC is bound and accessible
   - Check for port conflicts

5. **Recovery**:
   - Delete and recreate pod if configuration is correct
   - Scale deployment to 0 then back to 1
   - Check for competing services on same port
""",
            category="monitoring",
            tags=["grafana", "monitoring", "troubleshooting"]
        )
        
        # Sample pod restart runbook
        self.add_runbook(
            title="Pod Restart Loop Troubleshooting",
            content="""
# Pod Restart Loop Analysis

## Investigation Steps:

1. **Check Pod Events**
   ```
   oc describe pod <pod-name> -n <namespace>
   ```

2. **Review Container Logs**
   ```
   oc logs <pod-name> -n <namespace> --previous
   ```

3. **Common Causes**:
   - Application crashes (check exit code)
   - Failed health checks (liveness/readiness probes)
   - OOMKilled (out of memory)
   - CrashLoopBackOff
   - Image pull errors

4. **Solutions by Exit Code**:
   - Exit 0: Normal termination, check why it's exiting
   - Exit 1: Application error, review logs
   - Exit 137: OOMKilled, increase memory limits
   - Exit 143: SIGTERM, graceful shutdown issue

5. **Health Check Issues**:
   - Adjust probe timing (initialDelaySeconds, periodSeconds)
   - Verify probe endpoints are accessible
   - Check if app needs more startup time

6. **Resource Issues**:
   - Monitor resource usage
   - Increase CPU/memory limits
   - Check node capacity
""",
            category="troubleshooting",
            tags=["pods", "restart", "crashloop", "troubleshooting"]
        )
        
        # Sample incident report
        self.add_incident_report(
            title="Production Database Connection Pool Exhaustion",
            content="""
Incident occurred on 2024-01-15 when multiple microservices experienced 
database connection timeouts. Investigation revealed connection pool 
was exhausted due to long-running queries and insufficient pool size.
""",
            severity="high",
            resolution="""
1. Increased connection pool size from 20 to 50
2. Implemented query timeout of 30 seconds
3. Added connection pool monitoring alerts
4. Optimized slow queries identified in logs
5. Implemented connection retry logic with exponential backoff
"""
        )
        
        print("Sample knowledge base initialized successfully")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get statistics about the knowledge base"""
        count = self.collection.count()
        return {
            "total_documents": count,
            "collection_name": self.collection.name
        }

# Singleton instance
rag_system = RAGSystem()

# Initialize sample data on first import
if not os.path.exists(settings.chroma_persist_dir):
    os.makedirs(settings.chroma_persist_dir, exist_ok=True)
    try:
        rag_system.initialize_sample_data()
    except Exception as e:
        print(f"Warning: Could not initialize sample data: {e}")

# Made with Bob
