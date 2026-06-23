import httpx
from typing import List, Dict, Any, Optional
from config import settings
import asyncio

class OllamaClient:
    """Client for interacting with Ollama LLM with retry logic"""
    
    def __init__(self):
        self.base_url = settings.ollama_base_url
        self.model = settings.ollama_model
        self.max_retries = settings.max_retries
        self.retry_delay = settings.retry_delay
        self.timeout = settings.request_timeout
    
    async def chat(
        self,
        messages: List[Dict[str, str]],
        stream: bool = False,
        temperature: float = 0.7
    ) -> Dict[str, Any]:
        """Send a chat request to Ollama with retry logic"""
        url = f"{self.base_url}/api/chat"
        
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": stream,
            "options": {
                "temperature": temperature
            }
        }
        
        last_error = None
        for attempt in range(self.max_retries):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(url, json=payload)
                    response.raise_for_status()
                    return response.json()
            except httpx.TimeoutException as e:
                last_error = f"Request timeout after {self.timeout}s"
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay * (attempt + 1))
                    continue
            except httpx.ConnectError as e:
                last_error = f"Connection failed: Unable to connect to Ollama at {self.base_url}"
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay * (attempt + 1))
                    continue
            except httpx.HTTPError as e:
                last_error = str(e)
                # Don't retry on HTTP errors (4xx, 5xx)
                break
            except Exception as e:
                last_error = f"Unexpected error: {str(e)}"
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay * (attempt + 1))
                    continue
        
        return {
            "error": last_error,
            "message": {
                "role": "assistant",
                "content": f"Error communicating with Ollama: {last_error}. Please ensure Ollama is running and accessible."
            }
        }
    
    async def analyze_logs(self, logs: str, context: str = "") -> str:
        """Analyze logs using the LLM"""
        prompt = f"""You are a DevOps expert analyzing OpenShift logs.

Context: {context if context else "General log analysis"}

Logs:
{logs}

Please analyze these logs and:
1. Identify any errors or warnings
2. Explain what might be causing issues
3. Suggest potential solutions
4. Highlight any critical problems

Keep your response concise and actionable."""

        messages = [{"role": "user", "content": prompt}]
        response = await self.chat(messages)
        
        if "error" in response:
            return response["message"]["content"]
        
        return response.get("message", {}).get("content", "No response from LLM")
    
    async def analyze_cluster_health(self, health_data: Dict[str, Any]) -> str:
        """Analyze cluster health data"""
        prompt = f"""You are a DevOps expert analyzing OpenShift cluster health.

Cluster Status:
- Total Pods: {health_data['pods']['total']}
- Running Pods: {health_data['pods']['running']}
- Failed Pods: {health_data['pods']['failed']}
- Pending Pods: {health_data['pods']['pending']}
- Total Nodes: {health_data['nodes']['total']}
- Ready Nodes: {health_data['nodes']['ready']}

Recent Warnings/Errors:
{self._format_events(health_data.get('recent_warnings', []))}

Please provide:
1. Overall cluster health assessment
2. Any critical issues that need immediate attention
3. Recommendations for improvement
4. Potential risks or concerns

Keep your response concise and actionable."""

        messages = [{"role": "user", "content": prompt}]
        response = await self.chat(messages)
        
        if "error" in response:
            return response["message"]["content"]
        
        return response.get("message", {}).get("content", "No response from LLM")
    
    async def answer_question(
        self, 
        question: str, 
        context: Optional[str] = None,
        conversation_history: Optional[List[Dict[str, str]]] = None
    ) -> str:
        """Answer a DevOps question with optional context"""
        system_prompt = """You are an expert DevOps assistant specializing in OpenShift, Kubernetes, and cloud infrastructure.
You help users troubleshoot issues, understand cluster behavior, and follow best practices.
Always provide clear, actionable advice. If you're not certain about something, say so."""

        messages = [{"role": "system", "content": system_prompt}]
        
        # Add conversation history if provided
        if conversation_history:
            messages.extend(conversation_history)
        
        # Add context if provided
        user_message = question
        if context:
            user_message = f"Context:\n{context}\n\nQuestion: {question}"
        
        messages.append({"role": "user", "content": user_message})
        
        response = await self.chat(messages, temperature=0.7)
        
        if "error" in response:
            return response["message"]["content"]
        
        return response.get("message", {}).get("content", "No response from LLM")
    
    async def explain_event(self, event: Dict[str, Any]) -> str:
        """Explain an OpenShift event"""
        prompt = f"""Explain this OpenShift event in simple terms:

Type: {event.get('type', 'Unknown')}
Reason: {event.get('reason', 'Unknown')}
Message: {event.get('message', 'No message')}
Object: {event.get('involvedObject', {}).get('kind', 'Unknown')} - {event.get('involvedObject', {}).get('name', 'Unknown')}
Namespace: {event.get('involvedObject', {}).get('namespace', 'Unknown')}

Please explain:
1. What this event means
2. Whether it's a problem or normal behavior
3. What action (if any) should be taken"""

        messages = [{"role": "user", "content": prompt}]
        response = await self.chat(messages)
        
        if "error" in response:
            return response["message"]["content"]
        
        return response.get("message", {}).get("content", "No response from LLM")
    
    def _format_events(self, events: List[Dict[str, Any]]) -> str:
        """Format events for display"""
        if not events:
            return "No recent warnings or errors"
        
        formatted = []
        for event in events[:5]:  # Limit to 5 most recent
            obj = event.get('involvedObject', {})
            formatted.append(
                f"- {event.get('type', 'Unknown')}: {event.get('reason', 'Unknown')} "
                f"in {obj.get('kind', 'Unknown')}/{obj.get('name', 'Unknown')} "
                f"({obj.get('namespace', 'Unknown')}): {event.get('message', 'No message')}"
            )
        return "\n".join(formatted)
    
    async def check_health(self) -> bool:
        """Check if Ollama is running and the model is available"""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                response.raise_for_status()
                data = response.json()
                
                # Check if our model is in the list
                models = data.get("models", [])
                return any(m.get("name", "").startswith(self.model.split(":")[0]) for m in models)
        except httpx.ConnectError:
            # Connection failed - Ollama not accessible
            return False
        except httpx.TimeoutException:
            # Timeout - Ollama might be overloaded
            return False
        except Exception:
            # Any other error
            return False

# Singleton instance
ollama_client = OllamaClient()

# Made with Bob
