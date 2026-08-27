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
        "oc scale deployment {name} --replicas={replicas} -n {namespace}",
        "oc scale deploymentconfig {name} --replicas={replicas} -n {namespace}",
        "oc scale replicationcontroller {name} --replicas={replicas} -n {namespace}",
        "oc scale statefulset {name} --replicas={replicas} -n {namespace}",
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

    async def _api_request_text(self, path: str, timeout: int = 60) -> str:
        """Make a plain-text request to OpenShift API (used for pod logs)"""
        url = f"{self.api_url}{path}"
        print(f"[LOG REQUEST] GET {url}", flush=True)
        try:
            async with httpx.AsyncClient(verify=False, timeout=timeout) as client:
                response = await client.get(url, headers=self.headers)
                print(f"[LOG RESPONSE] status={response.status_code} len={len(response.text)} bytes", flush=True)
                if response.status_code == 401:
                    return "Error: HTTP 401 - token expired or invalid"
                if response.status_code == 403:
                    # Return the K8s error body — it names exactly what RBAC rule is missing
                    try:
                        body = response.json()
                        msg = body.get("message") or body.get("reason") or "insufficient permissions"
                    except Exception:
                        msg = response.text[:300] or "insufficient permissions"
                    print(f"[LOG 403] {msg}", flush=True)
                    return f"Error: HTTP 403 - {msg}"
                response.raise_for_status()
                print(f"[LOG CONTENT] first 200 chars: {response.text[:200]!r}", flush=True)
                return response.text
        except Exception as e:
            print(f"[LOG EXCEPTION] {e}", flush=True)
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

    async def get_pod_logs(self, namespace: str, pod_name: str, tail_lines: int = 0, container: Optional[str] = None) -> str:
        """Get logs from a specific pod.

        For crashed/CrashLoopBackOff pods the current container may be in waiting
        state with no output — so we also try &previous=true to fetch the last
        terminated container's logs as a fallback.

        Also falls back to every other container in the pod spec if a 403 is
        returned (common in shared namespaces).
        """
        async def _fetch(ctr: Optional[str], previous: bool = False) -> str:
            params: List[str] = []
            # tail_lines=0 means fetch all logs (no limit)
            if tail_lines and tail_lines > 0:
                params.append(f"tailLines={tail_lines}")
            if ctr:
                params.append(f"container={ctr}")
            if previous:
                params.append("previous=true")
            qs = ("?" + "&".join(params)) if params else ""
            path = f"/api/v1/namespaces/{namespace}/pods/{pod_name}/log{qs}"
            return await self._api_request_text(path, timeout=60)

        result = await _fetch(container)

        # Empty output on a live container — try previous (last crashed) container logs
        if result.strip() == "" or result.strip() == "(no log output)":
            prev = await _fetch(container, previous=True)
            # Only use previous if it actually returned content (not an error)
            if prev.strip() and not prev.startswith("Error"):
                return f"[previous container logs]\n{prev}"
            # Still nothing — return the original empty result
            return result

        if not result.startswith("Error: HTTP 403"):
            return result

        # 403 on the requested container — fetch pod spec and try each container
        pod_data = await self._api_request(f"/api/v1/namespaces/{namespace}/pods/{pod_name}")
        containers: List[str] = [
            c.get("name", "") for c in
            pod_data.get("spec", {}).get("containers", [])
            if c.get("name") and c.get("name") != container
        ]
        for ctr in containers:
            alt = await _fetch(ctr)
            if not alt.startswith("Error: HTTP 403"):
                return f"[container: {ctr}]\n{alt}"

        # All containers returned 403 — surface a clear RBAC message
        all_ctrs = ([container] if container else []) + containers
        ctr_list = ", ".join(all_ctrs) if all_ctrs else "unknown"
        return (
            f"Error: Logs are not accessible for this pod.\n\n"
            f"The cluster token does not have 'get' permission on the pods/log "
            f"sub-resource in namespace '{namespace}'.\n\n"
            f"Containers in this pod: {ctr_list}\n\n"
            f"To fix: ask a cluster admin to grant:\n"
            f"  verb: get  resource: pods/log  namespace: {namespace}"
        )

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
        """Get full pod description as formatted text (mirrors oc describe pod)"""
        pod_data, events_data = await asyncio.gather(
            self._api_request(f"/api/v1/namespaces/{namespace}/pods/{pod_name}"),
            self._api_request(
                f"/api/v1/namespaces/{namespace}/events"
                f"?fieldSelector=involvedObject.name={pod_name},involvedObject.namespace={namespace}"
            ),
        )
        if "error" in pod_data:
            return f"Error: {pod_data['error']}"

        meta   = pod_data.get("metadata", {})
        spec   = pod_data.get("spec", {})
        status = pod_data.get("status", {})

        lines = [
            f"Name:       {meta.get('name','?')}",
            f"Namespace:  {meta.get('namespace','?')}",
            f"Node:       {spec.get('nodeName','?')}",
            f"Phase:      {status.get('phase','?')}",
            f"Pod IP:     {status.get('podIP','?')}",
            f"Host IP:    {status.get('hostIP','?')}",
            f"Start Time: {meta.get('creationTimestamp','?')}",
            f"Labels:     {', '.join(f'{k}={v}' for k, v in meta.get('labels', {}).items()) or '<none>'}",
        ]

        # QoS class
        if status.get("qosClass"):
            lines.append(f"QoS Class:  {status['qosClass']}")

        # Containers
        container_specs = {c["name"]: c for c in spec.get("containers", [])}
        container_statuses = {cs["name"]: cs for cs in status.get("containerStatuses", [])}
        init_specs = {c["name"]: c for c in spec.get("initContainers", [])}
        init_statuses = {cs["name"]: cs for cs in status.get("initContainerStatuses", [])}

        def _fmt_container(cspec: dict, cstatus: dict) -> List[str]:
            out = []
            out.append(f"  Name:    {cspec.get('name','?')}")
            out.append(f"  Image:   {cspec.get('image','?')}")

            # Resource requests / limits
            res = cspec.get("resources", {})
            req = res.get("requests", {})
            lim = res.get("limits", {})
            if req or lim:
                out.append(f"  Resources:")
                if req:
                    out.append(f"    Requests: cpu={req.get('cpu','?')}  memory={req.get('memory','?')}")
                if lim:
                    out.append(f"    Limits:   cpu={lim.get('cpu','?')}  memory={lim.get('memory','?')}")

            # Ports
            ports = cspec.get("ports", [])
            if ports:
                p_str = ", ".join(f"{p.get('containerPort','?')}/{p.get('protocol','TCP')}" for p in ports)
                out.append(f"  Ports:   {p_str}")

            # Current state
            state = cstatus.get("state", {})
            if state:
                if "running" in state:
                    started = state["running"].get("startedAt", "?")
                    out.append(f"  State:   Running (started: {started})")
                elif "waiting" in state:
                    w = state["waiting"]
                    out.append(f"  State:   Waiting")
                    if w.get("reason"):
                        out.append(f"    Reason:  {w['reason']}")
                    if w.get("message"):
                        out.append(f"    Message: {w['message']}")
                elif "terminated" in state:
                    t = state["terminated"]
                    out.append(f"  State:   Terminated")
                    if t.get("reason"):
                        out.append(f"    Reason:    {t['reason']}")
                    if t.get("message"):
                        out.append(f"    Message:   {t['message']}")
                    out.append(f"    Exit Code: {t.get('exitCode', '?')}")
                    if t.get("startedAt"):
                        out.append(f"    Started:   {t['startedAt']}")
                    if t.get("finishedAt"):
                        out.append(f"    Finished:  {t['finishedAt']}")

            # Last (previous) state
            last_state = cstatus.get("lastState", {})
            if last_state.get("terminated"):
                t = last_state["terminated"]
                out.append(f"  Last State: Terminated")
                if t.get("reason"):
                    out.append(f"    Reason:    {t['reason']}")
                if t.get("message"):
                    out.append(f"    Message:   {t['message']}")
                out.append(f"    Exit Code: {t.get('exitCode', '?')}")
                if t.get("finishedAt"):
                    out.append(f"    Finished:  {t['finishedAt']}")

            out.append(f"  Ready:    {cstatus.get('ready', '?')}")
            out.append(f"  Restarts: {cstatus.get('restartCount', 0)}")
            return out

        if init_specs:
            lines.append("\nInit Containers:")
            for name, cspec in init_specs.items():
                cstatus = init_statuses.get(name, {})
                lines.extend(_fmt_container(cspec, cstatus))

        lines.append("\nContainers:")
        for name, cspec in container_specs.items():
            cstatus = container_statuses.get(name, {})
            lines.extend(_fmt_container(cspec, cstatus))

        # Conditions
        conditions = status.get("conditions", [])
        if conditions:
            lines.append("\nConditions:")
            for cond in conditions:
                reason = f"  reason={cond['reason']}" if cond.get("reason") else ""
                msg    = f"  message={cond['message']}" if cond.get("message") else ""
                ctype  = str(cond.get("type") or "?")
                cstat  = str(cond.get("status") or "?")
                lines.append(f"  {ctype}: {cstat}{reason}{msg}")

        # Volumes
        volumes = spec.get("volumes", [])
        if volumes:
            lines.append("\nVolumes:")
            for v in volumes[:10]:
                vtype = next((k for k in v if k != "name"), "unknown")
                lines.append(f"  {v.get('name','?')} ({vtype})")

        # Tolerations
        tolerations = spec.get("tolerations", [])
        if tolerations:
            lines.append(f"\nTolerations: {len(tolerations)} rule(s)")

        # Events related to this pod
        events = events_data.get("items", [])
        if events:
            # Sort by last timestamp descending
            events_sorted = sorted(
                events,
                key=lambda e: e.get("lastTimestamp") or e.get("eventTime") or "",
                reverse=True,
            )
            lines.append("\nEvents:")
            lines.append(f"  {'Type':<10} {'Reason':<25} {'Age':<14} {'Message'}")
            lines.append(f"  {'----':<10} {'------':<25} {'---':<14} {'-------'}")
            for e in events_sorted[:15]:
                etype  = str(e.get("type") or "?")
                reason = str(e.get("reason") or "?")
                age_raw = e.get("lastTimestamp") or e.get("firstTimestamp") or "?"
                # Trim ISO timestamp to just the time portion for readability
                age = str(age_raw)
                if "T" in age:
                    age = age.split("T")[-1].rstrip("Z")
                msg = str(e.get("message") or "")[:120]
                lines.append(f"  {etype:<10} {reason:<25} {age:<14} {msg}")
        else:
            lines.append("\nEvents:  <none>")

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

    async def oc_scale(self, namespace: str, name: str, replicas: int) -> Dict[str, Any]:
        """Scale a workload by running `oc scale` for each resource type in sequence.

        Tries: deployment → deploymentconfig → replicationcontroller.
        Returns the first success, or the last error if all fail.
        """
        import re as _re

        resource_types = ["deployment", "deploymentconfig", "replicationcontroller", "statefulset"]
        last_error = ""

        for rtype in resource_types:
            cmd = f"oc scale {rtype} {name} --replicas={replicas} -n {namespace}"

            # Validate against whitelist before running
            cmd_normalised = " ".join(cmd.split())
            allowed = False
            for pattern_tpl in self.ALLOWED_COMMANDS:
                pat = pattern_tpl.replace("{namespace}", r"\S+") \
                                 .replace("{name}", r"[\w-]+") \
                                 .replace("{replicas}", r"\d+")
                if _re.match(f"^{pat}$", cmd_normalised):
                    allowed = True
                    break
            if not allowed:
                continue  # should never happen given the whitelist above

            try:
                env = {"OC_TOKEN": self.token, "HOME": "/tmp"}
                result = subprocess.run(
                    ["oc", "scale", rtype, name, f"--replicas={replicas}", "-n", namespace,
                     "--token", self.token, "--server", self.api_url,
                     "--insecure-skip-tls-verify=true"],
                    capture_output=True, text=True, timeout=30
                )
                stdout = result.stdout.strip()
                stderr = result.stderr.strip()

                if result.returncode == 0:
                    # e.g. "deployment.apps/nginx scaled" or "replicationcontroller/nginx scaled"
                    msg = stdout or f"{rtype}/{name} scaled to {replicas} replica(s)"
                    return {"success": True, "message": msg, "resource_type": rtype, "replicas": replicas}

                # "not found" means this resource type doesn't exist — try the next one
                if "not found" in stderr.lower() or "NotFound" in stderr:
                    last_error = stderr
                    continue

                # Any other error (permissions, etc.) — surface immediately
                return {"success": False, "error": stderr or stdout}

            except subprocess.TimeoutExpired:
                return {"success": False, "error": f"oc scale timed out for {rtype}/{name}"}
            except FileNotFoundError:
                # `oc` binary not in PATH — fall back to API-based scaling
                return await self._oc_scale_via_api(namespace, name, replicas)
            except Exception as e:
                return {"success": False, "error": str(e)}

        return {"success": False, "error": last_error or f"No Deployment, DeploymentConfig or ReplicationController named '{name}' found in '{namespace}'"}

    async def _oc_scale_via_api(self, namespace: str, name: str, replicas: int) -> Dict[str, Any]:
        """API fallback when oc binary is not available: tries all three controller types."""
        candidates = [
            ("deployment",            f"/apis/apps/v1/namespaces/{namespace}/deployments/{name}/scale"),
            ("deploymentconfig",      f"/apis/apps.openshift.io/v1/namespaces/{namespace}/deploymentconfigs/{name}/scale"),
            ("replicationcontroller", f"/api/v1/namespaces/{namespace}/replicationcontrollers/{name}/scale"),
            ("statefulset",           f"/apis/apps/v1/namespaces/{namespace}/statefulsets/{name}/scale"),
        ]
        patch = json.dumps({"spec": {"replicas": replicas}})
        headers = dict(self.headers)
        headers["Content-Type"] = "application/merge-patch+json"
        last_error = ""
        for rtype, path in candidates:
            url = f"{self.api_url}{path}"
            try:
                async with httpx.AsyncClient(verify=False, timeout=30) as client:
                    resp = await client.patch(url, headers=headers, content=patch)
                    if resp.status_code == 200:
                        return {"success": True,
                                "message": f"{rtype}/{name} scaled to {replicas} replica(s)",
                                "resource_type": rtype, "replicas": replicas}
                    if resp.status_code == 404:
                        last_error = f"{rtype}/{name} not found"
                        continue
                    if resp.status_code in (401, 403):
                        return {"success": False, "error": f"HTTP {resp.status_code}: insufficient permissions to scale {rtype}/{name} in {namespace}"}
                    last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
            except Exception as e:
                last_error = str(e)
        return {"success": False, "error": last_error or f"No scalable controller '{name}' found in '{namespace}'"}

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
