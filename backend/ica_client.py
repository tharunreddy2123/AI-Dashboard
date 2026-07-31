import httpx
from typing import List, Dict, Any, Optional
from config import settings

_SYSTEM_INSTRUCTION = (
    "You are an expert OpenShift / Kubernetes DevOps assistant connected to a LIVE cluster. "
    "You can READ live cluster data AND EXECUTE real actions on the cluster.\n\n"
    "LIVE DATA is provided with labels: LIVE PODS, LIVE NODES, ACCESSIBLE NAMESPACES/PROJECTS.\n"
    "Executed actions appear as: ACTION EXECUTED: SUCCESS/FAILED\n\n"
    "Rules:\n"
    "1. Always use real pod/resource names from live data. Never invent names.\n"
    "2. For list/show requests: list EVERY pod by exact name, namespace, phase, restart count.\n"
    "3. For action results: confirm exactly what was done and show current state from live data.\n"
    "4. For problems: state the exact pod name, root cause, and the oc command to fix it.\n"
    "5. Use markdown: ## headers, bullet points, backtick code blocks.\n"
    "6. Default namespace for actions: tharunreddy-dev.\n"
    "7. Be concise and actionable.\n"
)


class ICAClient:
    """Client for interacting with IBM Consulting Advantage (ICA) AI API"""

    def __init__(self):
        self.api_key = settings.ica_api_key
        self.base_url = settings.ica_base_url.rstrip("/")
        self.model = settings.ica_model
        self._headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

    def _build_messages(
        self,
        user_message: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
    ) -> List[Dict[str, str]]:
        messages: List[Dict[str, str]] = [
            {"role": "system", "content": _SYSTEM_INSTRUCTION}
        ]
        if conversation_history:
            for msg in conversation_history:
                if msg.get("role") in ("user", "assistant"):
                    messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": user_message})
        return messages

    async def _chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.4,
    ) -> str:
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
        }
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers=self._headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]

    # -- Public API ------------------------------------------------------------

    async def answer_question(
        self,
        question: str,
        context: Optional[str] = None,
        conversation_history: Optional[List[Dict[str, str]]] = None,
    ) -> str:
        if context:
            user_message = (
                f"=== LIVE CLUSTER DATA ===\n{context}\n=== END LIVE DATA ===\n\n"
                f"User question: {question}"
            )
        else:
            user_message = question

        messages = self._build_messages(user_message, conversation_history)
        try:
            return await self._chat(messages)
        except Exception as e:
            return f"Error communicating with ICA AI: {str(e)}"

    async def analyze_logs(self, logs: str, context: str = "") -> str:
        prompt = f"""Analyze these OpenShift pod logs and identify issues.

Context: {context or "General log analysis"}

Logs:
{logs}

Provide:
1. Summary of errors/warnings found
2. Root cause explanation
3. Recommended fix (with oc commands if applicable)
4. Severity: Critical / Warning / Info"""
        messages = self._build_messages(prompt)
        try:
            return await self._chat(messages)
        except Exception as e:
            return f"Error communicating with ICA AI: {str(e)}"

    async def analyze_cluster_health(self, health_data: Dict[str, Any]) -> str:
        prompt = f"""Analyze this OpenShift cluster health snapshot and provide a full assessment.

Cluster Status:
- Total Pods:   {health_data['pods']['total']}
- Running Pods: {health_data['pods']['running']}
- Failed Pods:  {health_data['pods']['failed']}
- Pending Pods: {health_data['pods']['pending']}
- Total Nodes:  {health_data['nodes']['total']}
- Ready Nodes:  {health_data['nodes']['ready']}

Recent Warnings/Errors:
{self._format_events(health_data.get('recent_warnings', []))}

Provide:
1. Overall health status (Healthy / Degraded / Critical)
2. Issues requiring immediate attention
3. Root causes for any problems
4. Remediation steps with oc commands
5. Preventive recommendations"""
        messages = self._build_messages(prompt)
        try:
            return await self._chat(messages)
        except Exception as e:
            return f"Error communicating with ICA AI: {str(e)}"

    async def explain_event(self, event: Dict[str, Any]) -> str:
        prompt = f"""Explain this OpenShift event in clear terms:

Type:      {event.get('type', 'Unknown')}
Reason:    {event.get('reason', 'Unknown')}
Message:   {event.get('message', 'No message')}
Object:    {event.get('involvedObject', {}).get('kind', '?')}/{event.get('involvedObject', {}).get('name', '?')}
Namespace: {event.get('involvedObject', {}).get('namespace', '?')}

Explain:
1. What this event means
2. Is it a problem or normal?
3. What action should be taken (with oc command if applicable)"""
        messages = self._build_messages(prompt)
        try:
            return await self._chat(messages)
        except Exception as e:
            return f"Error communicating with ICA AI: {str(e)}"

    def _format_events(self, events: List[Dict]) -> str:
        if not events:
            return "  None"
        lines = []
        for e in events[:8]:
            obj = e.get("involvedObject", {})
            lines.append(
                f"  - [{e.get('type','?')}] {e.get('reason','?')} on "
                f"{obj.get('kind','?')}/{obj.get('name','?')} "
                f"({obj.get('namespace','?')}): {e.get('message','')[:100]}"
            )
        return "\n".join(lines)

    async def check_health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(
                    f"{self.base_url}/models",
                    headers=self._headers,
                )
                return response.status_code == 200
        except Exception:
            return False


# Singleton instance
ica_client = ICAClient()
