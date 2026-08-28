import httpx
from typing import List, Dict, Any, Optional
from config import settings

_SYSTEM_INSTRUCTION = (
    "You are an OpenShift assistant powered by IBM Consulting Advantage. "
    "Answer questions about the live cluster data provided.\n\n"
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

# ICA API base URL
_ICA_BASE_URL = "https://api.nextgen-beta.ica.ibm.com/ica/v1"


class ICAClient:
    """Client for IBM Consulting Advantage (ICA) chat API."""

    def __init__(self):
        self.api_key = settings.ica_api_key
        self.base_url = _ICA_BASE_URL

        if not self.api_key:
            print("WARNING: ICA_API_KEY is not set in backend/.env — ICA calls will be skipped")

    # ------------------------------------------------------------------
    # Core generation
    # ------------------------------------------------------------------

    async def _generate(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.4,
    ) -> str:
        """Call the ICA chat completions endpoint."""
        if not self.api_key:
            raise ValueError("ICA_API_KEY is not configured")

        payload = {
            "messages": messages,
            "temperature": temperature,
            "max_tokens": 400,
        }

        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"apikey {self.api_key}",
                    "X-IBM-Client-Id": self.api_key,
                },
                json=payload,
            )
            # surface auth errors clearly instead of raising
            if response.status_code == 401:
                body = response.text[:300]
                raise ValueError(f"ICA authentication failed (401). Response: {body}")
            response.raise_for_status()
            data = response.json()
            # ICA follows OpenAI-compatible response shape
            return data["choices"][0]["message"]["content"].strip()

    # ------------------------------------------------------------------
    # Prompt building
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
    # Public API  (same interface as WatsonXClient)
    # ------------------------------------------------------------------

    async def answer_question(
        self,
        question: str,
        context: Optional[str] = None,
        conversation_history: Optional[List[Dict[str, str]]] = None,
    ) -> str:
        if context:
            user_message = f"Cluster data:\n{context}\n\nQuestion: {question}"
        else:
            user_message = question
        messages = self._build_messages(user_message, conversation_history)
        try:
            return await self._generate(messages)
        except Exception as e:
            return f"Error communicating with ICA: {str(e)}"

    async def analyze_logs(self, logs: str, context: str = "") -> str:
        messages = self._build_messages(
            f"Identify issues in these pod logs. Be brief.\n\n"
            f"Context: {context or 'General'}\nLogs:\n{logs}\n\n"
            f"Reply with: what's wrong, why, and the fix command. 3-5 lines max."
        )
        try:
            return await self._generate(messages)
        except Exception as e:
            return f"Error communicating with ICA: {str(e)}"

    async def analyze_cluster_health(self, health_data: Dict[str, Any]) -> str:
        messages = self._build_messages(
            f"Cluster snapshot:\n"
            f"Pods: {health_data['pods']['running']} running, {health_data['pods']['failed']} failed, {health_data['pods']['pending']} pending\n"
            f"Nodes: {health_data['nodes']['ready']}/{health_data['nodes']['total']} ready\n\n"
            f"Give a 1-line status, then bullet only the problems and their fix commands. Skip healthy items."
        )
        try:
            return await self._generate(messages)
        except Exception as e:
            return f"Error communicating with ICA: {str(e)}"

    async def check_health(self) -> bool:
        """Verify the ICA API key is valid by hitting the models endpoint."""
        if not self.api_key:
            return False
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(
                    f"{self.base_url}/models",
                    headers={
                        "Authorization": f"apikey {self.api_key}",
                        "X-IBM-Client-Id": self.api_key,
                    },
                )
                return response.status_code in (200, 401, 403)  # reachable = healthy enough
        except Exception:
            return False


# Singleton instance (None if key not set)
ica_client = ICAClient()
