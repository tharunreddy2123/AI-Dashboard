from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import re
import uvicorn

from config import settings
from openshift_client import openshift_client
from ollama_client import ollama_client
from rag_system import rag_system

app = FastAPI(
    title="OpenShift AI Assistant API",
    description="AI-powered DevOps assistant for OpenShift clusters",
    version="1.0.0"
)

# CORS middleware - use environment-aware origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request/Response Models
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    conversation_history: Optional[List[ChatMessage]] = None
    include_context: bool = True

class ChatResponse(BaseModel):
    response: str
    context_used: Optional[str] = None

class AnalyzeLogsRequest(BaseModel):
    namespace: str
    pod_name: str
    container: Optional[str] = None

class ClusterHealthResponse(BaseModel):
    health_data: Dict[str, Any]
    ai_analysis: str

class AddRunbookRequest(BaseModel):
    title: str
    content: str
    category: str
    tags: Optional[List[str]] = None


def _is_cluster_query(message: str) -> bool:
    if not message:
        return False
    return bool(re.search(r"\b(cluster|pod|node|deployment|event|log|health|restart|crashloop|oom|status|warning|error)\b", message, re.IGNORECASE))


def _format_cluster_health_context(health_data: Dict[str, Any]) -> str:
    pods = health_data.get("pods", {})
    nodes = health_data.get("nodes", {})
    warnings = health_data.get("recent_warnings", [])

    lines = [
        "Live OpenShift cluster health summary:",
        f"- Total Pods: {pods.get('total', 'N/A')}",
        f"- Running Pods: {pods.get('running', 'N/A')}",
        f"- Failed Pods: {pods.get('failed', 'N/A')}",
        f"- Pending Pods: {pods.get('pending', 'N/A')}",
        f"- Total Nodes: {nodes.get('total', 'N/A')}",
        f"- Ready Nodes: {nodes.get('ready', 'N/A')}"
    ]

    if warnings:
        lines.append("Recent warnings/errors:")
        for i, event in enumerate(warnings[:5], 1):
            obj = event.get('involvedObject', {})
            lines.append(
                f"  {i}. {event.get('type', 'Unknown')}: {event.get('reason', 'Unknown')} "
                f"on {obj.get('kind', 'Unknown')}/{obj.get('name', 'Unknown')} "
                f"({obj.get('namespace', 'Unknown')}): {event.get('message', 'No message')}"
            )
    else:
        lines.append("Recent warnings/errors: none")

    return "\n".join(lines)

# Health check endpoints
@app.get("/")
async def root():
    return {
        "service": "OpenShift AI Assistant API",
        "status": "running",
        "version": "1.0.0"
    }

@app.get("/health")
async def health_check():
    """Check health of all services"""
    ollama_healthy = await ollama_client.check_health()
    
    return {
        "api": "healthy",
        "ollama": "healthy" if ollama_healthy else "unavailable",
        "model": settings.ollama_model,
        "rag_system": "healthy",
        "knowledge_base_docs": rag_system.get_stats()["total_documents"]
    }

# Chat endpoints
@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Main chat endpoint with RAG support"""
    try:
        context = None
        
        # Get relevant context from RAG if requested
        if request.include_context:
            context = rag_system.get_relevant_context(request.message, max_results=2)

        # Attach live cluster status when query is about OpenShift, pods, nodes, events, or health
        if _is_cluster_query(request.message):
            try:
                cluster_health = await openshift_client.get_cluster_health()
                cluster_context = _format_cluster_health_context(cluster_health)
                context = f"{context}\n\n{cluster_context}" if context else cluster_context
            except Exception:
                # If live cluster data fails, continue with RAG context only
                pass
        
        # Convert conversation history
        history = None
        if request.conversation_history:
            history = [{"role": msg.role, "content": msg.content} 
                      for msg in request.conversation_history]
        
        # Get AI response
        response = await ollama_client.answer_question(
            question=request.message,
            context=context,
            conversation_history=history
        )
        
        return ChatResponse(
            response=response,
            context_used=context if request.include_context or _is_cluster_query(request.message) else None
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat/quick")
async def quick_chat(request: ChatRequest):
    """Quick chat without RAG context"""
    try:
        response = await ollama_client.answer_question(
            question=request.message,
            context=None,
            conversation_history=None
        )
        return {"response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# OpenShift data endpoints
@app.get("/api/openshift/namespaces")
async def get_namespaces():
    """Get all namespaces"""
    try:
        namespaces = await openshift_client.get_namespaces()
        return {"namespaces": namespaces}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/openshift/pods")
async def get_pods(namespace: Optional[str] = None):
    """Get pods from namespace or all namespaces"""
    try:
        pods = await openshift_client.get_pods(namespace)
        return {"pods": pods}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/openshift/nodes")
async def get_nodes():
    """Get all nodes"""
    try:
        nodes = await openshift_client.get_nodes()
        return {"nodes": nodes}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/openshift/deployments")
async def get_deployments(namespace: Optional[str] = None):
    """Get deployments"""
    try:
        deployments = await openshift_client.get_deployments(namespace)
        return {"deployments": deployments}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/openshift/events")
async def get_events(namespace: Optional[str] = None):
    """Get events"""
    try:
        events = await openshift_client.get_events(namespace)
        return {"events": events}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/openshift/cluster-health", response_model=ClusterHealthResponse)
async def get_cluster_health():
    """Get cluster health with AI analysis"""
    try:
        health_data = await openshift_client.get_cluster_health()
        ai_analysis = await ollama_client.analyze_cluster_health(health_data)
        
        return ClusterHealthResponse(
            health_data=health_data,
            ai_analysis=ai_analysis
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Analysis endpoints
@app.post("/api/analyze/logs")
async def analyze_logs(request: AnalyzeLogsRequest):
    """Analyze pod logs with AI"""
    try:
        # Get logs
        logs = await openshift_client.get_pod_logs(
            namespace=request.namespace,
            pod_name=request.pod_name
        )
        
        # Analyze with AI
        context = f"Pod: {request.pod_name} in namespace: {request.namespace}"
        analysis = await ollama_client.analyze_logs(logs, context)
        
        return {
            "logs": logs,
            "analysis": analysis
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze/event")
async def analyze_event(event: Dict[str, Any]):
    """Analyze an OpenShift event with AI"""
    try:
        explanation = await ollama_client.explain_event(event)
        return {"explanation": explanation}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# RAG/Knowledge base endpoints
@app.post("/api/knowledge/runbook")
async def add_runbook(request: AddRunbookRequest):
    """Add a runbook to the knowledge base"""
    try:
        doc_id = rag_system.add_runbook(
            title=request.title,
            content=request.content,
            category=request.category,
            tags=request.tags
        )
        return {"doc_id": doc_id, "message": "Runbook added successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/knowledge/search")
async def search_knowledge(query: str, limit: int = 3):
    """Search the knowledge base"""
    try:
        results = rag_system.search(query, n_results=limit)
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/knowledge/stats")
async def get_knowledge_stats():
    """Get knowledge base statistics"""
    try:
        stats = rag_system.get_stats()
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Utility endpoints
@app.get("/api/suggestions")
async def get_suggestions():
    """Get suggested questions/commands"""
    return {
        "suggestions": [
            "Show unhealthy pods",
            "Analyze cluster health",
            "Why is my pod restarting?",
            "Explain recent warning events",
            "Show pods in pending state",
            "What's causing high memory usage?",
            "Troubleshoot Portworx migration",
            "Why is Grafana not starting?",
            "Show failed deployments",
            "Analyze pod logs for errors"
        ]
    }

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=True
    )

# Made with Bob
