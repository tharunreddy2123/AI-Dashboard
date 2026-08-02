import httpx
from typing import List, Dict, Any, Optional
from config import settings

_SYSTEM_INSTRUCTION = (
    "You are an OpenShift assistant. Answer questions about the live cluster data provided.\n\n"
    "Rules:\n"
    "1. Be SHORT and DIRECT. No long introductions or summaries.\n"
    "2. Only mention what is relevant to the question asked.\n"
    "3. For lists: show only the key facts (name, status, restarts). Skip healthy/normal items unless asked.\n"
    "4. For problems: one line per issue — pod name, what's wrong, fix command.\n"
    "5. For actions: one confirmation line of what was done.\n"
    "6. Never repeat information. Never pad with explanations unless asked.\n"
    "7. Use bullet points for lists, inline backticks for names and commands.\n"
    "8. Max 10 bullet points in any response. If more exist, summarise the rest in one line.\n"
    "9. Default namespace: tharunreddy-dev.\n"
)

# IAM token endpoint (same for all regions)
_IAM_URL = "https://iam.cloud.ibm.com/identity/token"


class WatsonXClient:
    """Client for IBM watsonx.ai text generation API (eu-gb region)."""

    def __init__(self):
        self.api_key    = settings.watsonx_api_key
        self.base_url   = settings.watsonx_base_url.rstrip("/")
        self.project_id = settings.watsonx_project_id
        self.model      = settings.watsonx_model
        self._iam_token: Optional[str] = None

        if not self.api_key:
            print("WARNING: WATSONX_API_KEY is not set in backend/.env")
        if not self.project_id:
            print("WARNING: WATSONX_PROJECT_ID is not set in backend/.env — API calls will fail")

    # ------------------------------------------------------------------
    # IAM token exchange
    # ------------------------------------------------------------------

    async def _get_iam_token(self) -> str:
        """Exchange the API key for a short-lived IAM bearer token."""
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                _IAM_URL,
                data={
                    "grant_type":    "urn:ibm:params:oauth:grant-type:apikey",
                    "apikey":        self.api_key,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            response.raise_for_status()
            self._iam_token = response.json()["access_token"]
            return self._iam_token

    async def _bearer(self) -> str:
        """Return a valid IAM bearer token, fetching one if needed."""
        if not self._iam_token:
            await self._get_iam_token()
        return self._iam_token  # type: ignore[return-value]

    # ------------------------------------------------------------------
    # Core generation
    # ------------------------------------------------------------------

    async def _generate(self, messages: List[Dict[str, str]], temperature: float = 0.4) -> str:
        """Call the watsonx.ai chat/completions endpoint (proper instruction-following mode)."""
        token = await self._bearer()
        payload = {
            "model_id":   self.model,
            "project_id": self.project_id,
            "messages":   messages,
            "parameters": {
                "max_tokens":  400,
                "temperature": temperature,
            },
        }
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(
                f"{self.base_url}/ml/v1/text/chat?version=2023-05-29",
                headers={
                    "Content-Type":  "application/json",
                    "Authorization": f"Bearer {token}",
                },
                json=payload,
            )
            if response.status_code == 401:
                await self._get_iam_token()
                token = self._iam_token
                response = await client.post(
                    f"{self.base_url}/ml/v1/text/chat?version=2023-05-29",
                    headers={
                        "Content-Type":  "application/json",
                        "Authorization": f"Bearer {token}",
                    },
                    json=payload,
                )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"].strip()

    # ------------------------------------------------------------------
    # Prompt building (system instruction + conversation history + user msg)
    # ------------------------------------------------------------------

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

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def answer_question(
        self,
        question: str,
        context: Optional[str] = None,
        conversation_history: Optional[List[Dict[str, str]]] = None,
    ) -> str:
        if context:
            user_message = (
                f"Cluster data:\n{context}\n\n"
                f"Question: {question}"
            )
        else:
            user_message = question
        messages = self._build_messages(user_message, conversation_history)
        try:
            return await self._generate(messages)
        except Exception as e:
            return f"Error communicating with watsonx.ai: {str(e)}"

    async def analyze_logs(self, logs: str, context: str = "") -> str:
        messages = self._build_messages(
            f"Identify issues in these pod logs. Be brief.\n\n"
            f"Context: {context or 'General'}\nLogs:\n{logs}\n\n"
            f"Reply with: what's wrong, why, and the fix command. 3-5 lines max."
        )
        try:
            return await self._generate(messages)
        except Exception as e:
            return f"Error communicating with watsonx.ai: {str(e)}"

    async def analyze_cluster_health(self, health_data: Dict[str, Any]) -> str:
        messages = self._build_messages(
            f"Cluster snapshot:\n"
            f"Pods: {health_data['pods']['running']} running, {health_data['pods']['failed']} failed, {health_data['pods']['pending']} pending\n"
            f"Nodes: {health_data['nodes']['ready']}/{health_data['nodes']['total']} ready\n"
            f"Events: {self._format_events(health_data.get('recent_warnings', []))}\n\n"
            f"Give a 1-line status, then bullet only the problems and their fix commands. Skip healthy items."
        )
        try:
            return await self._generate(messages)
        except Exception as e:
            return f"Error communicating with watsonx.ai: {str(e)}"

    async def explain_event(self, event: Dict[str, Any]) -> str:
        messages = self._build_messages(
            f"OpenShift event: {event.get('type')} / {event.get('reason')} on "
            f"{event.get('involvedObject', {}).get('kind')}/{event.get('involvedObject', {}).get('name')} "
            f"({event.get('involvedObject', {}).get('namespace')}): {event.get('message')}\n\n"
            f"In 2-3 lines: what it means, is it a problem, and fix command if needed."
        )
        try:
            return await self._generate(messages)
        except Exception as e:
            return f"Error communicating with watsonx.ai: {str(e)}"

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
            await self._get_iam_token()
            return True
        except Exception:
            return False


# Singleton instance
watsonx_client = WatsonXClient()
