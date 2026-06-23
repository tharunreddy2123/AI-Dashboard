import httpx
import subprocess
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
        """Make a request to OpenShift API with retry logic"""
        url = f"{self.api_url}{path}"
        
        last_error = None
        for attempt in range(self.max_retries):
            try:
                async with httpx.AsyncClient(verify=False, timeout=self.timeout) as client:
                    response = await client.get(url, headers=self.headers)
                    response.raise_for_status()
                    return response.json()
            except httpx.TimeoutException as e:
                last_error = f"Request timeout after {self.timeout}s"
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay * (attempt + 1))
                    continue
            except httpx.ConnectError as e:
                last_error = f"Connection failed: Unable to connect to OpenShift API at {self.api_url}"
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay * (attempt + 1))
                    continue
            except httpx.HTTPStatusError as e:
                # Don't retry on authentication/authorization errors
                if e.response.status_code in [401, 403]:
                    last_error = f"Authentication failed: {e.response.status_code}"
                    break
                last_error = f"HTTP error: {e.response.status_code}"
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay * (attempt + 1))
                    continue
            except httpx.HTTPError as e:
                last_error = str(e)
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay * (attempt + 1))
                    continue
            except Exception as e:
                last_error = f"Unexpected error: {str(e)}"
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay * (attempt + 1))
                    continue
        
        return {"error": last_error, "items": []}
    
    async def get_namespaces(self) -> List[Dict[str, Any]]:
        """Get all namespaces/projects"""
        data = await self._api_request("/apis/project.openshift.io/v1/projects")
        return data.get("items", [])
    
    async def get_pods(self, namespace: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get pods from namespace or all namespaces"""
        if namespace:
            data = await self._api_request(f"/api/v1/namespaces/{namespace}/pods")
            return data.get("items", [])
        
        # Get all namespaces and fetch pods from each
        namespaces = await self.get_namespaces()
        all_pods = []
        for ns in namespaces:
            ns_name = ns.get("metadata", {}).get("name")
            if ns_name:
                data = await self._api_request(f"/api/v1/namespaces/{ns_name}/pods")
                all_pods.extend(data.get("items", []))
        return all_pods
    
    async def get_nodes(self) -> List[Dict[str, Any]]:
        """Get all nodes"""
        data = await self._api_request("/api/v1/nodes")
        return data.get("items", [])
    
    async def get_deployments(self, namespace: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get deployments from namespace or all namespaces"""
        if namespace:
            data = await self._api_request(f"/apis/apps/v1/namespaces/{namespace}/deployments")
            return data.get("items", [])
        
        namespaces = await self.get_namespaces()
        all_deployments = []
        for ns in namespaces:
            ns_name = ns.get("metadata", {}).get("name")
            if ns_name:
                data = await self._api_request(f"/apis/apps/v1/namespaces/{ns_name}/deployments")
                all_deployments.extend(data.get("items", []))
        return all_deployments
    
    async def get_events(self, namespace: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get events from namespace or all namespaces"""
        if namespace:
            data = await self._api_request(f"/api/v1/namespaces/{namespace}/events")
            return data.get("items", [])
        
        namespaces = await self.get_namespaces()
        all_events = []
        for ns in namespaces:
            ns_name = ns.get("metadata", {}).get("name")
            if ns_name:
                data = await self._api_request(f"/api/v1/namespaces/{ns_name}/events")
                all_events.extend(data.get("items", []))
        return all_events
    
    async def get_pod_logs(self, namespace: str, pod_name: str, tail_lines: int = 100) -> str:
        """Get logs from a specific pod"""
        path = f"/api/v1/namespaces/{namespace}/pods/{pod_name}/log?tailLines={tail_lines}"
        data = await self._api_request(path)
        if isinstance(data, dict) and "error" in data:
            return f"Error fetching logs: {data['error']}"
        return str(data)
    
    async def get_cluster_health(self) -> Dict[str, Any]:
        """Get overall cluster health summary"""
        pods = await self.get_pods()
        nodes = await self.get_nodes()
        events = await self.get_events()
        
        # Analyze pod health
        total_pods = len(pods)
        running_pods = sum(1 for p in pods if p.get("status", {}).get("phase") == "Running")
        failed_pods = sum(1 for p in pods if p.get("status", {}).get("phase") == "Failed")
        pending_pods = sum(1 for p in pods if p.get("status", {}).get("phase") == "Pending")
        
        # Analyze node health
        total_nodes = len(nodes)
        ready_nodes = sum(1 for n in nodes 
                         if any(c.get("type") == "Ready" and c.get("status") == "True" 
                               for c in n.get("status", {}).get("conditions", [])))
        
        # Get recent warning/error events
        recent_warnings = [e for e in events if e.get("type") in ["Warning", "Error"]][:10]
        
        return {
            "pods": {
                "total": total_pods,
                "running": running_pods,
                "failed": failed_pods,
                "pending": pending_pods
            },
            "nodes": {
                "total": total_nodes,
                "ready": ready_nodes
            },
            "recent_warnings": recent_warnings
        }
    
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
    
    def execute_safe_command(self, command: str) -> str:
        """Execute a whitelisted oc command"""
        if not self.is_command_allowed(command):
            return f"Error: Command '{command}' is not allowed. Only whitelisted read-only commands are permitted."
        
        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=30
            )
            return result.stdout if result.returncode == 0 else result.stderr
        except subprocess.TimeoutExpired:
            return "Error: Command timed out"
        except Exception as e:
            return f"Error executing command: {str(e)}"

# Singleton instance
openshift_client = OpenShiftClient()

# Made with Bob
