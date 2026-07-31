import google.generativeai as genai
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


class GoogleAIClient:
    """Client for interacting with Google Gemini AI"""

    def __init__(self):
        genai.configure(api_key=settings.google_api_key)
        self.model_name = settings.gemini_model
        self.model = genai.GenerativeModel(
            model_name=self.model_name,
            system_instruction=_SYSTEM_INSTRUCTION,
        )

    def _to_gemini_history(self, messages):
        history = []
        for msg in messages:
            if msg["role"] == "system":
                continue
            role = "model" if msg["role"] == "assistant" else "user"
            history.append({"role": role, "parts": [msg["content"]]})
        return history

    async def _chat(self, messages, temperature=0.4):
        history_messages = [m for m in messages if m["role"] != "system"]
        if not history_messages:
            return "No message provided."
        last_msg  = history_messages[-1]
        prior     = history_messages[:-1]
        chat      = self.model.start_chat(history=self._to_gemini_history(prior))
        gen_cfg   = genai.types.GenerationConfig(temperature=temperature)
        response  = chat.send_message(last_msg["content"], generation_config=gen_cfg)
        return response.text

    # -- Public API ------------------------------------------------------------

    async def answer_question(self, question, context=None, conversation_history=None):
        messages = []
        if conversation_history:
            messages.extend(conversation_history)

        if context:
            user_message = (
                f"=== LIVE CLUSTER DATA ===\n{context}\n=== END LIVE DATA ===\n\n"
                f"User question: {question}"
            )
        else:
            user_message = question

        messages.append({"role": "user", "content": user_message})
        try:
            return await self._chat(messages)
        except Exception as e:
            return f"Error communicating with Google AI: {str(e)}"

    async def analyze_logs(self, logs, context=""):
        prompt = f"""Analyze these OpenShift pod logs and identify issues.

Context: {context or "General log analysis"}

Logs:
{logs}

Provide:
1. Summary of errors/warnings found
2. Root cause explanation
3. Recommended fix (with oc commands if applicable)
4. Severity: Critical / Warning / Info"""
        try:
            return await self._chat([{"role": "user", "content": prompt}])
        except Exception as e:
            return f"Error communicating with Google AI: {str(e)}"

    async def analyze_cluster_health(self, health_data):
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
        try:
            return await self._chat([{"role": "user", "content": prompt}])
        except Exception as e:
            return f"Error communicating with Google AI: {str(e)}"

    async def explain_event(self, event):
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
        try:
            return await self._chat([{"role": "user", "content": prompt}])
        except Exception as e:
            return f"Error communicating with Google AI: {str(e)}"

    def _format_events(self, events):
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

    async def check_health(self):
        try:
            models = [m.name for m in genai.list_models()]
            return len(models) > 0
        except Exception:
            return False


# Singleton instance
google_ai_client = GoogleAIClient()

