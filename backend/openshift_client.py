import httpx
import subprocess
import json
from typing import List, Dict, Any, Optional
from config import settings
import asyncio

class OpenShiftClient:
    """Client for interacting with OpenShift API and oc commands with retry logic"""
    
    # Security whitelist - only these commands are allowed
    ALLOWED_COMMANDS = [
        "oc get pods -A",
        "oc get pods -n {namespace}",
        "oc get nodes",
        "oc get events -A",
        "oc get events -n {namespace}",
        "oc get deployments -A",
        "oc get deployments -n {namespace}",
        "oc get namespaces",
        "oc get projects",
        "oc describe pod {pod} -n {namespace}",
        "oc describe node {node}",
        "oc logs {pod} -n {namespace}",
        "oc logs {pod} -n {namespace} --tail=100",
        "oc get all -n {namespace}",
    ]
    
    def __init__(self):
        self.api_url = settings.openshift_api_url
        self.token = settings.openshift_token
        self.max_retries = settings.max_retries
        self.retry_delay = settings.retry_delay
        self.timeout = settings.request_timeout
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json"
        }
    
    async def _api_request(self, path: str) -> Dict[str, Any]:
        """Make a JSON request to OpenShift API with retry logic"""
        url = f"{self.api_url}{path}"
        last_error = None
        for attempt in range(self.max_retries):
            try:
                async with httpx.AsyncClient(verify=False, timeout=self.timeout) as client:
                    response = await client.get(url, headers=self.headers)
                    if response.status_code in (401, 403):
                        last_error = f"HTTP {response.status_code}: insufficient permissions for {path}"
                        break  # do not retry auth errors
                    response.raise_for_status()
                    return response.json()
            except httpx.TimeoutException:
                last_error = f"Request timeout after {self.timeout}s"
            except httpx.ConnectError:
                last_error = f"Connection failed to OpenShift API at {self.api_url}"
            except httpx.HTTPError as e:
                last_error = str(e)
            except Exception as e:
                last_error = f"Unexpected error: {str(e)}"
            if attempt < self.max_retries - 1:
                await asyncio.sleep(self.retry_delay * (attempt + 1))
        return {"error": last_error, "items": []}

    async def _api_request_text(self, path: str) -> str:
        """Make a plain-text request to OpenShift API (used for pod logs)"""
        url = f"{self.api_url}{path}"
        try:
            async with httpx.AsyncClient(verify=False, timeout=self.timeout) as client:
                response = await client.get(url, headers=self.headers)
                if response.status_code in (401, 403):
                    return f"Error: HTTP {response.status_code} - insufficient permissions"
                response.raise_for_status()
                return response.text
        except Exception as e:
            return f"Error fetching logs: {str(e)}"

    async def get_namespaces(self) -> List[Dict[str, Any]]:
        """Get accessible projects/namespaces for this user"""
        data = await self._api_request("/apis/project.openshift.io/v1/projects")
        return data.get("items", [])

    async def get_pods(self, namespace: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get pods - queries per accessible namespace (no cluster-wide list permission needed)"""
        if namespace:
            data = await self._api_request(f"/api/v1/namespaces/{namespace}/pods")
            return data.get("items", [])
        namespaces = await self.get_namespaces()
        all_pods: List[Dict[str, Any]] = []
        for ns in namespaces:
            ns_name = ns.get("metadata", {}).get("name")
            if ns_name:
                data = await self._api_request(f"/api/v1/namespaces/{ns_name}/pods")
                all_pods.extend(data.get("items", []))
        return all_pods

    async def get_nodes(self) -> List[Dict[str, Any]]:
        """Get cluster nodes - returns empty list if user lacks cluster-admin permission"""
        data = await self._api_request("/api/v1/nodes")
        # 403 is expected for non-admin users; return empty without error
        if "error" in data and "403" in str(data.get("error", "")):
            return []
        return data.get("items", [])

    async def get_deployments(self, namespace: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get deployments per accessible namespace"""
        if namespace:
            data = await self._api_request(f"/apis/apps/v1/namespaces/{namespace}/deployments")
            return data.get("items", [])
        namespaces = await self.get_namespaces()
        all_deps: List[Dict[str, Any]] = []
        for ns in namespaces:
            ns_name = ns.get("metadata", {}).get("name")
            if ns_name:
                data = await self._api_request(f"/apis/apps/v1/namespaces/{ns_name}/deployments")
                all_deps.extend(data.get("items", []))
        return all_deps

    async def get_events(self, namespace: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get events per accessible namespace"""
        if namespace:
            data = await self._api_request(f"/api/v1/namespaces/{namespace}/events")
            return data.get("items", [])
        namespaces = await self.get_namespaces()
        all_events: List[Dict[str, Any]] = []
        for ns in namespaces:
            ns_name = ns.get("metadata", {}).get("name")
            if ns_name:
                data = await self._api_request(f"/api/v1/namespaces/{ns_name}/events")
                all_events.extend(data.get("items", []))
        return all_events

    async def get_pod_logs(self, namespace: str, pod_name: str, tail_lines: int = 100) -> str:
        """Get logs from a specific pod (plain text response)"""
        path = f"/api/v1/namespaces/{namespace}/pods/{pod_name}/log?tailLines={tail_lines}"
        return await self._api_request_text(path)

    async def get_cluster_health(self) -> Dict[str, Any]:
        """Get overall cluster health across all accessible namespaces"""
        pods   = await self.get_pods()
        nodes  = await self.get_nodes()
        events = await self.get_events()

        total_pods   = len(pods)
        running_pods = sum(1 for p in pods if p.get("status", {}).get("phase") == "Running")
        failed_pods  = sum(1 for p in pods if p.get("status", {}).get("phase") == "Failed")
        pending_pods = sum(1 for p in pods if p.get("status", {}).get("phase") == "Pending")

        total_nodes = len(nodes)
        ready_nodes = sum(
            1 for n in nodes
            if any(c.get("type") == "Ready" and c.get("status") == "True"
                   for c in n.get("status", {}).get("conditions", []))
        )

        recent_warnings = [e for e in events if e.get("type") in ("Warning", "Error")][:10]

        return {
            "pods":  {"total": total_pods, "running": running_pods,
                      "failed": failed_pods, "pending": pending_pods},
            "nodes": {"total": total_nodes, "ready": ready_nodes},
            "recent_warnings": recent_warnings,
        }
    

    async def describe_pod(self, namespace: str, pod_name: str) -> str:
        """Get full pod description as formatted text"""
        data = await self._api_request(f"/api/v1/namespaces/{namespace}/pods/{pod_name}")
        if "error" in data:
            return f"Error: {data['error']}"
        meta   = data.get("metadata", {})
        spec   = data.get("spec", {})
        status = data.get("status", {})
        lines  = [
            f"Pod: {meta.get('name','?')}",
            f"Namespace: {meta.get('namespace','?')}",
            f"Node: {spec.get('nodeName','?')}",
            f"Phase: {status.get('phase','?')}",
            f"IP: {status.get('podIP','?')}",
            f"Labels: {meta.get('labels',{})}",
            "Containers:",
        ]
        for cs in status.get("containerStatuses", []):
            state = list(cs.get("state", {}).keys())
            lines.append(
                f"  {cs.get('name','?')}: ready={cs.get('ready')}  "
                f"restarts={cs.get('restartCount',0)}  state={state}"
            )
        for cond in status.get("conditions", []):
            lines.append(
                f"Condition {cond.get('type','?')}: {cond.get('status','?')}  "
                f"reason={cond.get('reason','')}"
            )
        return "\n".join(lines)

    def is_command_allowed(self, command: str) -> bool:
        """Check if a command is in the whitelist"""
        # Remove extra spaces and normalize
        cmd = " ".join(command.split())
        
        # Check against whitelist patterns
        for allowed in self.ALLOWED_COMMANDS:
            # Replace placeholders with regex patterns
            pattern = allowed.replace("{namespace}", r"\S+")
            pattern = pattern.replace("{pod}", r"\S+")
            pattern = pattern.replace("{node}", r"\S+")
            
            import re
            if re.match(f"^{pattern}$", cmd):
                return True
        return False
    
    # ── Write / action operations ─────────────────────────────────────────────

    async def create_resource(self, namespace: str, manifest: Dict[str, Any]) -> Dict[str, Any]:
        """Create a Kubernetes resource via POST to the API"""
        kind = manifest.get("kind", "")
        api_version = manifest.get("apiVersion", "v1")

        # Build the correct API path based on kind
        group_version, path = self._resource_path(kind, api_version, namespace)
        url = f"{self.api_url}{path}"

        headers = dict(self.headers)
        headers["Content-Type"] = "application/json"

        try:
            async with httpx.AsyncClient(verify=False, timeout=30) as client:
                resp = await client.post(url, headers=headers, content=json.dumps(manifest))
                if resp.status_code in (200, 201):
                    return {"success": True, "resource": resp.json()}
                return {"success": False, "error": f"HTTP {resp.status_code}: {resp.text[:300]}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def delete_resource(self, namespace: str, kind: str, name: str) -> Dict[str, Any]:
        """Delete a named Kubernetes resource"""
        _, path = self._resource_path(kind, "v1", namespace)
        # replace list path with named path
        url = f"{self.api_url}{path}/{name}"
        try:
            async with httpx.AsyncClient(verify=False, timeout=30) as client:
                resp = await client.delete(url, headers=self.headers)
                if resp.status_code in (200, 202, 204):
                    return {"success": True, "message": f"{kind}/{name} deleted"}
                return {"success": False, "error": f"HTTP {resp.status_code}: {resp.text[:300]}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def scale_deployment(self, namespace: str, name: str, replicas: int) -> Dict[str, Any]:
        """Patch a Deployment's replica count"""
        url = f"{self.api_url}/apis/apps/v1/namespaces/{namespace}/deployments/{name}/scale"
        patch = {"spec": {"replicas": replicas}}
        headers = dict(self.headers)
        headers["Content-Type"] = "application/merge-patch+json"
        try:
            async with httpx.AsyncClient(verify=False, timeout=30) as client:
                resp = await client.patch(url, headers=headers, content=json.dumps(patch))
                if resp.status_code == 200:
                    return {"success": True, "message": f"Deployment {name} scaled to {replicas} replicas"}
                return {"success": False, "error": f"HTTP {resp.status_code}: {resp.text[:300]}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def restart_deployment(self, namespace: str, name: str) -> Dict[str, Any]:
        """Rollout restart a deployment by patching its annotation"""
        import datetime
        url = f"{self.api_url}/apis/apps/v1/namespaces/{namespace}/deployments/{name}"
        patch = {
            "spec": {
                "template": {
                    "metadata": {
                        "annotations": {
                            "kubectl.kubernetes.io/restartedAt": datetime.datetime.utcnow().isoformat()
                        }
                    }
                }
            }
        }
        headers = dict(self.headers)
        headers["Content-Type"] = "application/merge-patch+json"
        try:
            async with httpx.AsyncClient(verify=False, timeout=30) as client:
                resp = await client.patch(url, headers=headers, content=json.dumps(patch))
                if resp.status_code == 200:
                    return {"success": True, "message": f"Deployment {name} restart triggered"}
                return {"success": False, "error": f"HTTP {resp.status_code}: {resp.text[:300]}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def _resource_path(self, kind: str, api_version: str, namespace: str) -> tuple:
        """Return (group_version, api_path) for a given resource kind"""
        kind_lower = kind.lower()
        ns = f"/namespaces/{namespace}" if namespace else ""
        # Core API group resources
        core = {
            "pod": ("v1", f"/api/v1{ns}/pods"),
            "service": ("v1", f"/api/v1{ns}/services"),
            "configmap": ("v1", f"/api/v1{ns}/configmaps"),
            "secret": ("v1", f"/api/v1{ns}/secrets"),
            "persistentvolumeclaim": ("v1", f"/api/v1{ns}/persistentvolumeclaims"),
        }
        apps = {
            "deployment": ("apps/v1", f"/apis/apps/v1{ns}/deployments"),
            "statefulset": ("apps/v1", f"/apis/apps/v1{ns}/statefulsets"),
            "daemonset": ("apps/v1", f"/apis/apps/v1{ns}/daemonsets"),
            "replicaset": ("apps/v1", f"/apis/apps/v1{ns}/replicasets"),
        }
        route = {
            "route": ("route.openshift.io/v1", f"/apis/route.openshift.io/v1{ns}/routes"),
        }
        all_kinds = {**core, **apps, **route}
        if kind_lower in all_kinds:
            return all_kinds[kind_lower]
        # Fallback: try apps group
        plural = kind_lower + "s"
        return (api_version, f"/apis/apps/v1{ns}/{plural}")

    def execute_safe_command(self, command: str) -> str:
        """Execute a whitelisted oc command"""
        if not self.is_command_allowed(command):
            return f"Error: Command '{command}' is not allowed."
        try:
            result = subprocess.run(
                command, shell=True, capture_output=True, text=True, timeout=30
            )
            return result.stdout if result.returncode == 0 else result.stderr
        except subprocess.TimeoutExpired:
            return "Error: Command timed out"
        except Exception as e:
            return f"Error executing command: {str(e)}"


# Singleton instance
openshift_client = OpenShiftClient()

# Made with Bob
