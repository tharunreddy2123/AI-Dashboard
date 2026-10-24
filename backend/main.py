from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Tuple
import re
import json
import httpx
import uvicorn

from config import settings
from openshift_client import openshift_client
from watsonx_client import watsonx_client
from ica_client import ica_client

try:
    from rag_system import rag_system
    RAG_AVAILABLE = True
except (ImportError, RuntimeError) as e:
    print(f"Warning: RAG system unavailable ({type(e).__name__}).")
    RAG_AVAILABLE = False
    rag_system = None

app = FastAPI(title="OpenShift AI Assistant API", version="3.0.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins_list,
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    conversation_history: Optional[List[ChatMessage]] = None
    include_context: bool = True

class ChatResponse(BaseModel):
    response: str
    action_performed: Optional[str] = None
    action_success: Optional[bool] = None
    context_used: Optional[str] = None

class AnalyzeLogsRequest(BaseModel):
    namespace: str
    pod_name: str

class ClusterHealthResponse(BaseModel):
    health_data: Dict[str, Any]
    ai_analysis: str

class AddRunbookRequest(BaseModel):
    title: str
    content: str
    category: str
    tags: Optional[List[str]] = None

class ActionRequest(BaseModel):
    action: str
    kind: str
    name: Optional[str] = None
    namespace: Optional[str] = None
    replicas: Optional[int] = None
    manifest: Optional[Dict[str, Any]] = None
    container: Optional[str] = None
    tail_lines: Optional[int] = 0

_DEFAULT_NAMESPACE = "tharunreddy-dev"

_IMAGE_MAP: Dict[str, str] = {
    "nginx": "nginxinc/nginx-unprivileged:latest",
    "httpd": "httpd:alpine",
    "redis": "redis:7-alpine",
    "mysql": "mysql:8",
    "postgres": "postgres:15-alpine",
    "python": "python:3.11-slim",
    "node": "node:20-alpine",
    "busybox": "busybox:latest",
    "alpine": "alpine:3.19",
    "ubuntu": "ubuntu:22.04",
    "golang": "golang:1.22-alpine",
    "java": "eclipse-temurin:21-jre-alpine",
}

_INTENT_PATTERNS = {
    "pods":        r"\b(pod|pods|container|crashloop|oom|evicted|terminating|pending|running|failed|restart)\b",
    "nodes":       r"\b(node|nodes|worker|master|control.?plane|notready|unschedulable)\b",
    "deployments": r"\b(deploy|deployment|deployments|rollout|replica|replicaset|scale)\b",
    "events":      r"\b(event|events|warning|error|reason|backoff|unhealthy)\b",
    "namespaces":  r"\b(namespace|namespaces|project|projects|ns)\b",
    "logs":        r"\b(log|logs|output|stdout|stderr)\b",
    "health":      r"\b(health|healthy|unhealthy|cluster.?health|status|overview|summary)\b",
    "list":        r"\b(list|show|get|display|all)\b",
    "services":    r"\b(service|services|svc|endpoint|port)\b",
    "create":      r"\b(create|make|add|deploy|spin.?up|launch|start|run)\b",
    "delete":      r"\b(delete|remove|destroy|kill|clean.?up)\b",
    "scale":       r"\b(scale|replicas|replica.?count|resize)\b",
    "describe":    r"\b(describe|inspect|detail|info|check)\b",
}

def _detect_intents(message: str) -> set:
    found = set()
    for intent, pattern in _INTENT_PATTERNS.items():
        if re.search(pattern, message, re.IGNORECASE):
            found.add(intent)
    return found

def _ns_from(text: str) -> str:
    m = re.search(r"\b(?:in|namespace|ns|project|on)\s+([\w-]+)", text, re.I)
    return m.group(1) if m else _DEFAULT_NAMESPACE

def _parse_action(msg: str) -> Optional[Dict[str, Any]]:
    t = msg.strip()

    m = re.search(r"\b(create|make|run|deploy|launch|start|add)\b.{0,50}\b(nginx|httpd|redis|mysql|postgres|python|node|busybox|alpine|ubuntu|golang|java)\b", t, re.I)
    if m:
        ik = m.group(2).lower()
        ns = _ns_from(t)
        return {"action": "create", "kind": "Pod", "name": f"{ik}-pod", "namespace": ns,
                "manifest": {"apiVersion": "v1", "kind": "Pod",
                             "metadata": {"name": f"{ik}-pod", "namespace": ns, "labels": {"app": ik, "created-by": "ai-assistant"}},
                             "spec": {"containers": [{"name": ik, "image": _IMAGE_MAP.get(ik, f"{ik}:latest"), "ports": [{"containerPort": 8080 if ik == "nginx" else 80}]}]}}}

    m = re.search(r"\b(delete|remove|destroy|kill)\b.{0,30}\bpod\b.{0,30}\b([\w-]+)\b", t, re.I)
    if m:
        return {"action": "delete", "kind": "Pod", "name": m.group(2), "namespace": _ns_from(t)}

    m = re.search(r"\b(delete|remove|destroy)\b.{0,30}\bdeployment\b.{0,30}\b([\w-]+)\b", t, re.I)
    if m:
        return {"action": "delete", "kind": "Deployment", "name": m.group(2), "namespace": _ns_from(t)}

    m = re.search(r"\bscale\b.{0,50}\b([\w-]+)\b.{0,30}\b(\d+)\b", t, re.I)
    if m and m.group(1).lower() not in ("deployment", "the", "a", "to"):
        return {"action": "scale", "kind": "Deployment", "name": m.group(1), "namespace": _ns_from(t), "replicas": int(m.group(2))}

    m = re.search(r"\brestart\b.{0,40}\b(?:deployment\s+)?([\w-]+)\b", t, re.I)
    if m and m.group(1).lower() not in ("the", "a", "an", "my", "pod", "deployment", "all", "cluster"):
        return {"action": "restart", "kind": "Deployment", "name": m.group(1), "namespace": _ns_from(t)}

    m = re.search(r"\b(describe|inspect|detail|info)\b.{0,30}\bpod\b.{0,30}\b([\w-]+)\b", t, re.I)
    if m:
        return {"action": "describe", "kind": "Pod", "name": m.group(2), "namespace": _ns_from(t)}

    m = re.search(r"\b(?:log|logs)\b.{0,30}\b(?:of|for|from)?\s*([\w-]+)\b(?:.{0,30}\b(?:in|ns)\s+([\w-]+))?", t, re.I)
    if m and m.group(1).lower() not in ("pod", "pods", "the", "a", "an", "all"):
        ns = m.group(2) if m.group(2) else _DEFAULT_NAMESPACE
        return {"action": "logs", "kind": "Pod", "name": m.group(1), "namespace": ns}

    return None

async def _execute_action(act: Dict[str, Any]) -> Tuple[str, bool]:
    action    = act["action"]
    kind      = act.get("kind", "")
    name      = act.get("name", "")
    ns        = act.get("namespace", _DEFAULT_NAMESPACE)
    container = act.get("container")
    try:
        if action == "create":
            r = await openshift_client.create_resource(ns, act["manifest"])
            if r.get("success"):
                rname = r.get("resource", {}).get("metadata", {}).get("name", name)
                return (f"Created {kind} `{rname}` in namespace `{ns}`.", True)
            return (f"Failed to create {kind} `{name}`: {r.get('error','unknown')}", False)
        elif action == "delete":
            r = await openshift_client.delete_resource(ns, kind, name)
            if r.get("success"):
                return (f"Deleted {kind} `{name}` from `{ns}`.", True)
            return (f"Failed to delete {kind} `{name}`: {r.get('error','unknown')}", False)
        elif action == "scale":
            replicas = act.get("replicas", 1)
            r = await openshift_client.scale_deployment(ns, name, replicas)
            if r.get("success"):
                return (f"Scaled Deployment `{name}` to {replicas} replica(s) in `{ns}`.", True)
            return (f"Failed to scale `{name}`: {r.get('error','unknown')}", False)
        elif action == "restart":
            r = await openshift_client.restart_deployment(ns, name)
            if r.get("success"):
                return (f"Triggered rollout restart for Deployment `{name}` in `{ns}`.", True)
            return (f"Failed to restart `{name}`: {r.get('error','unknown')}", False)
        elif action == "describe":
            result = await openshift_client.describe_pod(ns, name)
            return (result, True)
        elif action == "logs":
            # tail_lines=0 means no limit (fetch all logs)
            tail_lines_val = act.get("tail_lines")
            tail = tail_lines_val if tail_lines_val is not None else 0
            result = await openshift_client.get_pod_logs(ns, name, tail_lines=tail, container=container)
            if result.startswith("Error"):
                return (result, False)
            return (result or "(no log output)", True)
    except Exception as e:
        return (f"Error executing {action} {kind} `{name}`: {str(e)}", False)
    return ("Unknown action.", False)

def _fmt_pod(p: Dict) -> str:
    meta = p.get("metadata", {})
    status = p.get("status", {})
    phase = status.get("phase", "Unknown")
    restarts = sum(cs.get("restartCount", 0) for cs in status.get("containerStatuses", []))
    containers = ", ".join(cs.get("name", "?") + ("(ready)" if cs.get("ready") else "(not-ready)") for cs in status.get("containerStatuses", []))
    return f"  pod {meta.get('namespace','?')}/{meta.get('name','?')}  phase={phase}  node={p.get('spec',{}).get('nodeName','?')}  restarts={restarts}  containers=[{containers}]"

def _fmt_deployment(d: Dict) -> str:
    meta = d.get("metadata", {}); spec = d.get("spec", {}); status = d.get("status", {})
    cs = spec.get("template", {}).get("spec", {}).get("containers", [])
    image = cs[0].get("image", "") if cs else ""
    return f"  deploy {meta.get('namespace','?')}/{meta.get('name','?')}  desired={spec.get('replicas',0)}  ready={status.get('readyReplicas',0)}  image={image}"

def _fmt_event(e: Dict) -> str:
    obj = e.get("involvedObject", {})
    return f"  [{e.get('type','?')}] {e.get('reason','?')} on {obj.get('kind','?')}/{obj.get('name','?')} ({obj.get('namespace','?')}): {e.get('message','')[:120]}"

async def _build_cluster_context(intents: set) -> str:
    sections: List[str] = []
    if intents & {"namespaces","pods","deployments","events","health","list","services","logs"}:
        try:
            nss = await openshift_client.get_namespaces()
            # If empty, probe directly to detect token expiry vs genuinely empty cluster
            if not nss:
                probe = await openshift_client._api_request("/apis/project.openshift.io/v1/projects")
                err = probe.get("error", "")
                if "401" in str(err):
                    return "TOKEN_EXPIRED"
            names = [n.get("metadata",{}).get("name","?") for n in nss]
            sections.append(f"ACCESSIBLE NAMESPACES ({len(names)}): {', '.join(names) if names else 'none'}")
        except Exception as ex:
            sections.append(f"NAMESPACES: error - {ex}")
    if intents & {"pods","health","logs","list","create","delete","describe"}:
        try:
            pods = await openshift_client.get_pods()
            running = sum(1 for p in pods if p.get("status",{}).get("phase") == "Running")
            failed  = sum(1 for p in pods if p.get("status",{}).get("phase") == "Failed")
            pending = sum(1 for p in pods if p.get("status",{}).get("phase") == "Pending")
            high_r  = sum(1 for p in pods if sum(cs.get("restartCount",0) for cs in p.get("status",{}).get("containerStatuses",[])) > 2)
            lines = [f"LIVE PODS (total={len(pods)} running={running} failed={failed} pending={pending} high-restarts={high_r}):"]
            # Cap at 20 pods to keep prompt size manageable for watsonx
            for p in pods[:20]:
                lines.append(_fmt_pod(p))
            if not pods:
                lines.append("  No pods found.")
            sections.append("\n".join(lines))
        except Exception as ex:
            sections.append(f"PODS: error - {ex}")
    if intents & {"nodes","health"}:
        try:
            nodes = await openshift_client.get_nodes()
            if nodes:
                ready = sum(1 for n in nodes if any(c.get("type")=="Ready" and c.get("status")=="True" for c in n.get("status",{}).get("conditions",[])))
                lines = [f"LIVE NODES (total={len(nodes)} ready={ready}):"]
                for n in nodes[:15]:
                    meta = n.get("metadata",{}); status = n.get("status",{})
                    rdy = next((c.get("status") for c in status.get("conditions",[]) if c.get("type")=="Ready"), "?")
                    alloc = status.get("allocatable",{})
                    lines.append(f"  node {meta.get('name','?')}  ready={rdy}  cpu={alloc.get('cpu','?')}  mem={alloc.get('memory','?')}")
                sections.append("\n".join(lines))
            else:
                sections.append("LIVE NODES: Not accessible (insufficient permissions)")
        except Exception as ex:
            sections.append(f"NODES: error - {ex}")
    if intents & {"deployments","scale"}:
        try:
            deps = await openshift_client.get_deployments()
            degraded = [d for d in deps if d.get("status",{}).get("readyReplicas",0) < d.get("spec",{}).get("replicas",1)]
            lines = [f"LIVE DEPLOYMENTS (total={len(deps)} degraded={len(degraded)}):"]
            # Cap at 10 deployments
            for d in (degraded or deps)[:10]:
                lines.append(_fmt_deployment(d))
            sections.append("\n".join(lines))
        except Exception as ex:
            sections.append(f"DEPLOYMENTS: error - {ex}")
    if intents & {"events","health"}:
        try:
            evts = await openshift_client.get_events()
            warns = [e for e in evts if e.get("type") in ("Warning","Error")]
            lines = [f"LIVE EVENTS (total={len(evts)} warnings={len(warns)}):"]
            # Cap at 5 warning events
            for e in warns[:5]:
                lines.append(_fmt_event(e))
            if not warns:
                lines.append("  No Warning/Error events.")
            sections.append("\n".join(lines))
        except Exception as ex:
            sections.append(f"EVENTS: error - {ex}")
    return "\n\n".join(sections)

@app.get("/")
async def root():
    return {"service": "OpenShift AI Assistant API", "status": "running", "version": "3.0.0"}

@app.get("/health")
async def health_check():
    wx_healthy  = await watsonx_client.check_health()
    ica_healthy = await ica_client.check_health()
    rag_status  = "healthy" if RAG_AVAILABLE else "unavailable"
    rag_docs    = rag_system.get_stats()["total_documents"] if RAG_AVAILABLE else 0
    return {
        "api": "healthy",
        "watsonx_ai": "healthy" if wx_healthy else "unavailable",
        "ica": "healthy" if ica_healthy else ("unconfigured" if not settings.ica_api_key else "unavailable"),
        "model": settings.watsonx_model,
        "rag_system": rag_status,
        "knowledge_base_docs": rag_docs,
    }

@app.post("/api/chat/ica", response_model=ChatResponse)
async def chat_ica(request: ChatRequest):
    """Chat endpoint that uses IBM Consulting Advantage (ICA) instead of watsonx.ai."""
    if not settings.ica_api_key:
        raise HTTPException(status_code=503, detail="ICA_API_KEY is not configured on the server.")
    try:
        intents = _detect_intents(request.message)
        context_parts: List[str] = []
        action_summary = None
        action_success = None

        parsed_action = _parse_action(request.message)
        if parsed_action:
            summary, ok = await _execute_action(parsed_action)
            action_summary = summary
            action_success = ok
            context_parts.append(
                f"CLUSTER ACTION EXECUTED:\n"
                f"  Action  : {parsed_action['action'].upper()} {parsed_action['kind']}\n"
                f"  Target  : {parsed_action.get('name','?')} in {parsed_action.get('namespace','?')}\n"
                f"  Result  : {'SUCCESS' if ok else 'FAILED'} - {summary}"
            )
            intents.update({"pods", "namespaces"})

        if request.include_context and RAG_AVAILABLE and intents:
            rag_ctx = rag_system.get_relevant_context(request.message, max_results=2)
            if rag_ctx:
                context_parts.append(f"RUNBOOK CONTEXT:\n{rag_ctx}")

        if intents:
            cluster_ctx = await _build_cluster_context(intents)
            if cluster_ctx == "TOKEN_EXPIRED":
                return ChatResponse(
                    response="⚠️ **OpenShift token expired.** Update it via the Token button in the header.",
                    action_performed=None, action_success=None, context_used=None
                )
            if cluster_ctx:
                context_parts.append(cluster_ctx)

        context = "\n\n".join(context_parts) if context_parts else None
        history = None
        if request.conversation_history:
            history = [{"role": m.role, "content": m.content} for m in request.conversation_history]

        response = await ica_client.answer_question(
            question=request.message, context=context, conversation_history=history)

        return ChatResponse(response=response, action_performed=action_summary,
                            action_success=action_success, context_used=context if context else None)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        intents = _detect_intents(request.message)
        context_parts: List[str] = []
        action_summary = None
        action_success = None

        parsed_action = _parse_action(request.message)
        if parsed_action:
            summary, ok = await _execute_action(parsed_action)
            action_summary = summary
            action_success = ok
            context_parts.append(
                f"CLUSTER ACTION EXECUTED:\n"
                f"  Action  : {parsed_action['action'].upper()} {parsed_action['kind']}\n"
                f"  Target  : {parsed_action.get('name','?')} in {parsed_action.get('namespace','?')}\n"
                f"  Result  : {'SUCCESS' if ok else 'FAILED'} - {summary}"
            )
            intents.update({"pods", "namespaces"})

        if request.include_context and RAG_AVAILABLE and intents:
            rag_ctx = rag_system.get_relevant_context(request.message, max_results=2)
            if rag_ctx:
                context_parts.append(f"RUNBOOK CONTEXT:\n{rag_ctx}")

        if intents:
            cluster_ctx = await _build_cluster_context(intents)
            if cluster_ctx == "TOKEN_EXPIRED":
                return ChatResponse(
                    response=(
                        "⚠️ **OpenShift token expired.**\n\n"
                        "Your cluster token is no longer valid. To fix:\n\n"
                        "1. Go to the [OpenShift console](https://console.apps.rm3.7wse.p1.openshiftapps.com)\n"
                        "2. Click your username → **Copy login command** → **Display Token**\n"
                        "3. Copy the `sha256~...` token\n"
                        "4. Open `backend/.env` and update:\n"
                        "   `OPENSHIFT_TOKEN=sha256~<your-new-token>`\n"
                        "5. Restart the backend: `.\\start-backend.ps1`"
                    ),
                    action_performed=None, action_success=None, context_used=None
                )
            if cluster_ctx:
                context_parts.append(cluster_ctx)

        context = "\n\n".join(context_parts) if context_parts else None
        history = None
        if request.conversation_history:
            history = [{"role": m.role, "content": m.content} for m in request.conversation_history]

        response = await watsonx_client.answer_question(
            question=request.message, context=context, conversation_history=history)

        return ChatResponse(response=response, action_performed=action_summary,
                            action_success=action_success, context_used=context if context else None)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat/quick")
async def quick_chat(request: ChatRequest):
    try:
        response = await watsonx_client.answer_question(question=request.message)
        return {"response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/action")
async def execute_action_direct(request: ActionRequest):
    try:
        act = {"action": request.action, "kind": request.kind, "name": request.name or "",
               "namespace": request.namespace or _DEFAULT_NAMESPACE, "manifest": request.manifest,
               "replicas": request.replicas, "container": request.container,
               "tail_lines": request.tail_lines}
        summary, ok = await _execute_action(act)
        return {"result": summary, "success": ok}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/openshift/namespaces")
async def get_namespaces():
    try:
        return {"namespaces": await openshift_client.get_namespaces()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/openshift/pods")
async def get_pods(namespace: Optional[str] = None):
    try:
        return {"pods": await openshift_client.get_pods(namespace)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/openshift/nodes")
async def get_nodes():
    try:
        return {"nodes": await openshift_client.get_nodes()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/openshift/deployments")
async def get_deployments(namespace: Optional[str] = None):
    try:
        return {"deployments": await openshift_client.get_deployments(namespace)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ScaleRequest(BaseModel):
    name: str        # controller name (e.g. "nginx", "nginx2")
    namespace: str
    replicas: int    # absolute target replica count


@app.post("/api/openshift/scale")
async def scale_workload(request: ScaleRequest):
    """Scale a workload to an exact replica count.

    Equivalent to:  oc scale deployment <name> --replicas=<n> -n <namespace>

    Tries deployment → deploymentconfig → replicationcontroller automatically.
    Falls back to direct API patching when the oc binary is not available.
    """
    if request.replicas < 0:
        raise HTTPException(status_code=400, detail="replicas must be >= 0")

    result = await openshift_client.oc_scale(request.namespace, request.name, request.replicas)

    if not result.get("success"):
        err = result.get("error", "Scale failed")
        status_code = 403 if "403" in str(err) else 404 if "not found" in err.lower() else 500
        raise HTTPException(status_code=status_code, detail=err)

    return {
        "success": True,
        "name": request.name,
        "namespace": request.namespace,
        "replicas": request.replicas,
        "message": result.get("message", f"Scaled to {request.replicas} replica(s)"),
        "resource_type": result.get("resource_type", "deployment"),
    }

@app.get("/api/openshift/pod-owner")
async def get_pod_owner(pod_name: str, namespace: str):
    """Return the owner references of a pod so the frontend can determine the correct controller."""
    data = await openshift_client._api_request(
        f"/api/v1/namespaces/{namespace}/pods/{pod_name}"
    )
    err = data.get("error", "")
    if "403" in str(err):
        raise HTTPException(status_code=403, detail=f"No pod read access in namespace '{namespace}'")
    if err or not data.get("metadata"):
        raise HTTPException(status_code=404, detail=f"Pod '{pod_name}' not found in namespace '{namespace}'")
    owners = data.get("metadata", {}).get("ownerReferences", [])
    return {"pod": pod_name, "namespace": namespace, "ownerReferences": owners}

@app.get("/api/openshift/deployment-replicas")
async def get_deployment_replicas(name: str, namespace: str):
    """Return the current replica count for a deployment.
    Returns HTTP 403 when the token lacks permission (used by the frontend permission probe).
    Returns HTTP 404 when the deployment simply does not exist.
    """
    data = await openshift_client._api_request(
        f"/apis/apps/v1/namespaces/{namespace}/deployments/{name}"
    )
    err = data.get("error", "")
    if "403" in str(err):
        raise HTTPException(status_code=403, detail=f"No deployment read access in namespace '{namespace}'")
    if err:
        # Any other error (404, connection, etc.) — treat as "namespace is accessible but deployment missing"
        raise HTTPException(status_code=404, detail=str(err))
    replicas = data.get("spec", {}).get("replicas", 0)
    ready    = data.get("status", {}).get("readyReplicas", 0)
    return {"name": name, "namespace": namespace, "replicas": replicas, "ready_replicas": ready}

@app.get("/api/openshift/events")
async def get_events(namespace: Optional[str] = None):
    try:
        return {"events": await openshift_client.get_events(namespace)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/openshift/cluster-health", response_model=ClusterHealthResponse)
async def get_cluster_health():
    try:
        health_data = await openshift_client.get_cluster_health()
        ai_analysis = await watsonx_client.analyze_cluster_health(health_data)
        return ClusterHealthResponse(health_data=health_data, ai_analysis=ai_analysis)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze/logs")
async def analyze_logs(request: AnalyzeLogsRequest):
    try:
        logs = await openshift_client.get_pod_logs(request.namespace, request.pod_name)
        analysis = await watsonx_client.analyze_logs(logs, f"Pod: {request.pod_name} ns: {request.namespace}")
        return {"logs": logs, "analysis": analysis}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze/event")
async def analyze_event(event: Dict[str, Any]):
    try:
        return {"explanation": await watsonx_client.explain_event(event)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/knowledge/runbook")
async def add_runbook(request: AddRunbookRequest):
    """Add a runbook to the knowledge base"""
    if not RAG_AVAILABLE:
        raise HTTPException(status_code=503, detail="RAG system unavailable")
    try:
        doc_id = rag_system.add_runbook(title=request.title, content=request.content, category=request.category, tags=request.tags)
        return {"doc_id": doc_id, "message": "Runbook added successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/knowledge/search")
async def search_knowledge(query: str, limit: int = 3):
    if not RAG_AVAILABLE:
        raise HTTPException(status_code=503, detail="RAG system unavailable")
    try:
        return {"results": rag_system.search(query, n_results=limit)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/knowledge/stats")
async def get_knowledge_stats():
    if not RAG_AVAILABLE:
        return {"status": "unavailable"}
    try:
        return rag_system.get_stats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/suggestions")
async def get_suggestions():
    return {"suggestions": ["List all pods", "Analyze cluster health", "Create nginx pod",
                            "Delete pod nginx-pod", "Scale deployment myapp to 3 replicas",
                            "Restart deployment myapp", "Show warning events", "Show namespaces"]}

@app.get("/api/openshift/token-status")
async def token_status():
    """Check if the OpenShift token is valid."""
    in_cluster = openshift_client.in_cluster
    probe = await openshift_client._api_request("/apis/project.openshift.io/v1/projects")
    if "401" in str(probe.get("error", "")):
        return {"status": "expired", "in_cluster": in_cluster, "message": "Token is expired — update OPENSHIFT_TOKEN in backend/.env and restart"}
    if "error" in probe:
        return {"status": "error", "in_cluster": in_cluster, "message": probe["error"]}
    count = len(probe.get("items", []))
    return {"status": "valid", "in_cluster": in_cluster, "accessible_projects": count}

class TokenUpdateRequest(BaseModel):
    token: str

@app.post("/api/openshift/update-token")
async def update_token(request: TokenUpdateRequest):
    """Hot-reload the OpenShift token without restarting the backend."""
    new_token = request.token.strip()
    if not new_token.startswith("sha256~"):
        raise HTTPException(status_code=400, detail="Token must start with sha256~")
    openshift_client.token = new_token
    # Verify it works
    probe = await openshift_client._api_request("/apis/project.openshift.io/v1/projects")
    if "401" in str(probe.get("error", "")):
        raise HTTPException(status_code=401, detail="New token is also invalid — check and try again")
    count = len(probe.get("items", []))
    return {"status": "ok", "message": f"Token updated. {count} project(s) accessible."}

@app.get("/api/watsonx/test")
async def test_watsonx():
    """Quick connectivity test — sends a minimal prompt to watsonx.ai and returns the reply."""
    if not settings.watsonx_project_id:
        return {"status": "error", "message": "WATSONX_PROJECT_ID is not set in backend/.env"}
    if not settings.watsonx_api_key:
        return {"status": "error", "message": "WATSONX_API_KEY is not set in backend/.env"}
    try:
        reply = await ica_client.answer_question("Reply with exactly: watsonx connection OK")
        return {"status": "ok", "model": settings.watsonx_model,
                "base_url": settings.watsonx_base_url, "reply": reply}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# ─── ServiceNow Incidents ────────────────────────────────────────────────────

class IncidentModel(BaseModel):
    id: str
    number: str
    short_description: str
    description: str
    severity: str
    priority: str
    state: str
    category: str
    subcategory: str
    affected_service: str
    namespace: Optional[str] = None
    pod_name: Optional[str] = None
    node_name: Optional[str] = None
    assigned_to: str
    opened_at: str
    updated_at: str
    resolved_at: Optional[str] = None
    source: str = "Mock"


import datetime as _dt
import hashlib as _hashlib

INCIDENT_WINDOW_HOURS = 24
_ACTIVE_WINDOW_SECONDS = 3600  # seen again within the last hour => still active

# event reason -> (severity, category, subcategory)
_REASON_MAP: Dict[str, Tuple[str, str, str]] = {
    "BackOff":           ("2", "Application", "CrashLoopBackOff"),
    "CrashLoopBackOff":  ("1", "Application", "CrashLoopBackOff"),
    "OOMKilled":         ("1", "Performance", "Memory"),
    "Evicted":           ("2", "Infrastructure", "Eviction"),
    "NodeNotReady":      ("1", "Infrastructure", "Node"),
    "NodeHasDiskPressure":   ("2", "Infrastructure", "Node"),
    "NodeHasInsufficientMemory": ("2", "Infrastructure", "Node"),
    "Failed":            ("2", "Deployment", "Container Failure"),
    "FailedScheduling":  ("2", "Infrastructure", "Scheduling"),
    "FailedMount":       ("3", "Storage", "Volume Mount"),
    "FailedAttachVolume": ("3", "Storage", "Volume Attach"),
    "ErrImagePull":      ("2", "Deployment", "Image Pull"),
    "ImagePullBackOff":  ("2", "Deployment", "Image Pull"),
    "InspectFailed":     ("3", "Deployment", "Image Pull"),
    "Unhealthy":         ("3", "Application", "Probe Failure"),
    "FailedCreate":      ("3", "Deployment", "Controller"),
    "FailedGetResourceMetric": ("4", "Performance", "Autoscaling"),
}
_SEVERITY_PRIORITY = {"1": "Critical", "2": "High", "3": "Medium", "4": "Low"}


def _parse_ts(value: Optional[str]) -> Optional[_dt.datetime]:
    if not value:
        return None
    try:
        return _dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _event_time(ev: Dict[str, Any]) -> Optional[_dt.datetime]:
    series = ev.get("series") or {}
    return (_parse_ts(ev.get("lastTimestamp")) or _parse_ts(series.get("lastObservedTime"))
            or _parse_ts(ev.get("eventTime")) or _parse_ts(ev.get("metadata", {}).get("creationTimestamp")))


async def _build_cluster_incidents() -> List[Dict[str, Any]]:
    """
    Derive incidents from the live cluster: Warning events from the last 24 hours,
    grouped per (namespace, object, reason).
    """
    now = _dt.datetime.now(_dt.timezone.utc)
    cutoff = now - _dt.timedelta(hours=INCIDENT_WINDOW_HOURS)
    events = await openshift_client.get_events()

    groups: Dict[Tuple[str, str, str, str], Dict[str, Any]] = {}
    for ev in events:
        if ev.get("type") != "Warning":
            continue
        last = _event_time(ev)
        if not last or last < cutoff:
            continue
        obj = ev.get("involvedObject", {})
        reason = ev.get("reason", "Unknown")
        key = (obj.get("namespace") or ev.get("metadata", {}).get("namespace", ""),
               obj.get("kind", ""), obj.get("name", ""), reason)
        first = _parse_ts(ev.get("firstTimestamp")) or _parse_ts(ev.get("eventTime")) or last
        count = ev.get("count") or (ev.get("series") or {}).get("count") or 1
        g = groups.get(key)
        if g is None:
            groups[key] = {"first": first, "last": last, "count": count, "message": ev.get("message", ""),
                           "obj": obj, "reason": reason}
        else:
            g["first"] = min(g["first"], first)
            if last > g["last"]:
                g["last"], g["message"] = last, ev.get("message", "")
            g["count"] += count

    incidents: List[Dict[str, Any]] = []
    for (ns, kind, name, reason), g in groups.items():
        severity, category, subcategory = _REASON_MAP.get(reason, ("3", "Cluster Event", reason))
        age = (now - g["last"]).total_seconds()
        active = age <= _ACTIVE_WINDOW_SECONDS
        uid = _hashlib.sha1(f"{ns}/{kind}/{name}/{reason}".encode()).hexdigest()[:10]
        pod = name if kind == "Pod" else None
        incidents.append({
            "id": uid,
            "number": f"EVT-{uid[:7].upper()}",
            "short_description": f"{reason} on {kind}/{name}" + (f" in {ns}" if ns else ""),
            "description": f"{g['message']} (seen {g['count']} time(s) in the last {INCIDENT_WINDOW_HOURS}h)",
            "severity": severity, "priority": _SEVERITY_PRIORITY[severity],
            "state": "New" if active else "Resolved",
            "category": category, "subcategory": subcategory,
            "affected_service": name, "namespace": ns or None,
            "pod_name": pod, "node_name": name if kind == "Node" else None,
            "assigned_to": "Unassigned",
            "opened_at": g["first"].isoformat(), "updated_at": g["last"].isoformat(),
            "resolved_at": None if active else g["last"].isoformat(),
            "source": "Cluster",
        })
    # newest first, then active before resolved, then most severe first (stable sorts)
    incidents.sort(key=lambda i: i["updated_at"], reverse=True)
    incidents.sort(key=lambda i: (i["state"] != "New", i["severity"]))
    return incidents


@app.get("/api/incidents")
async def get_incidents(state: Optional[str] = None, severity: Optional[str] = None):
    """Incidents from the last 24 hours, derived from live cluster Warning events."""
    incidents = await _build_cluster_incidents()
    if state:
        incidents = [i for i in incidents if i["state"].lower() == state.lower()]
    if severity:
        incidents = [i for i in incidents if i["severity"] == severity]
    return {"incidents": incidents, "total": len(incidents), "window_hours": INCIDENT_WINDOW_HOURS,
            "source": "cluster"}

@app.post("/api/incidents/{incident_id}/analyze")
async def analyze_incident(incident_id: str):
    """
    Trigger AI-powered RCA for a specific incident.
    Fetches live cluster context for the affected namespace/pod and returns
    a structured RCA + remediation from the AI.
    """
    incident = next((i for i in await _build_cluster_incidents() if i["id"] == incident_id), None)
    if not incident:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")

    # Build targeted RCA prompt
    prompt_parts = [
        f"Perform a Root Cause Analysis (RCA) for this incident:",
        f"Incident: {incident['number']} — {incident['short_description']}",
        f"Severity: {incident['priority']} (SEV{incident['severity']})",
        f"Description: {incident['description']}",
    ]
    if incident.get("namespace"):
        prompt_parts.append(f"Affected namespace: {incident['namespace']}")
    if incident.get("pod_name"):
        prompt_parts.append(f"Affected pod: {incident['pod_name']}")
    if incident.get("node_name"):
        prompt_parts.append(f"Affected node: {incident['node_name']}")

    prompt_parts += [
        "",
        "Please:",
        "1. Investigate the cluster (pods, events, logs, deployments)",
        "2. Identify the root cause",
        "3. Provide a detailed RCA",
        "4. List step-by-step remediation actions",
        "5. Suggest preventive measures",
    ]
    prompt = "\n".join(prompt_parts)

    intents = {"pods", "events", "health", "namespaces"}
    if incident.get("namespace"):
        intents.add("deployments")

    cluster_ctx = await _build_cluster_context(intents)
    context = cluster_ctx if cluster_ctx and cluster_ctx != "TOKEN_EXPIRED" else None

    try:
        response = await watsonx_client.answer_question(question=prompt, context=context)
        return {"incident_id": incident_id, "number": incident["number"], "rca": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run("main:app", host=settings.api_host, port=settings.api_port, reload=True)

# Made with Bob
