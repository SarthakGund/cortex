import json
import logging
from types import SimpleNamespace
import httpx
from core.config import settings

logger = logging.getLogger(__name__)


class GroqModel:
    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model
        self.base_url = "https://api.groq.com/openai/v1"

    def generate_content(self, prompt: str, temperature: float = 0.2, max_output_tokens: int = 2048):
        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "max_tokens": max_output_tokens,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        with httpx.Client(timeout=60) as client:
            try:
                resp = client.post(f"{self.base_url}/chat/completions", json=payload, headers=headers)
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                detail = exc.response.text
                raise RuntimeError(
                    f"Groq API error {exc.response.status_code}: {detail}"
                ) from exc

            data = resp.json()
            text = data["choices"][0]["message"]["content"]
            return SimpleNamespace(text=text)

class LLMService:
    def __init__(self):
        self.model = None
        self.enabled = False

        if settings.GROQ_API_KEY:
            model_name = settings.GROQ_MODEL or "llama-3.1-70b-versatile"
            try:
                self.model = GroqModel(settings.GROQ_API_KEY, model_name)
                self.enabled = True
                logger.info("Groq configured successfully (%s)", model_name)
            except Exception as e:
                logger.error("Failed to configure Groq: %s", e)
        else:
            logger.warning("GROQ_API_KEY not set — LLM features disabled.")

    def generate_text(self, prompt: str, temperature: float = 0.2, max_output_tokens: int = 2048) -> str:
        if not self.enabled or not self.model:
            raise RuntimeError("LLM not configured")
        response = self.model.generate_content(
            prompt,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
        )
        return response.text.strip()

    def validate_and_fix_endpoints(self, code: str, raw_endpoints: list, file_name: str) -> list:
        """
        Takes the raw endpoints extracted by Tree-sitter and asks the LLM to:
        1. Correct any malformed paths (e.g. stripped quotes, wrong slashes)
        2. Find any endpoints that Tree-sitter MISSED
        3. Return a clean JSON list

        We only call the LLM if Tree-sitter found at least something, or the
        file name suggests it contains routes (route, controller, view, handler).
        This avoids wasting API calls on non-route files.
        """
        if not self.enabled:
            return raw_endpoints

        route_hints = ("route", "controller", "view", "handler", "api", "endpoint", "urls")
        is_route_file = any(hint in file_name.lower() for hint in route_hints)

        if not raw_endpoints and not is_route_file:
            return raw_endpoints

        # Build a compact prompt — we pass only the code and raw results
        prompt = f"""
You are a code analysis assistant. Analyze the following source code and extract ALL HTTP API endpoints defined in it.

Return ONLY a valid JSON array. No explanation, no markdown, no code fences.
Each item must have exactly two keys: "path" (string) and "method" (string, uppercase).

If a path uses a variable placeholder, keep it in standard format e.g. "/users/:id" or "/users/{{id}}".
If there are no endpoints, return an empty array: []

Tree-sitter already found these (may be incomplete or have errors):
{json.dumps(raw_endpoints)}

Source file: {file_name}
```
{code[:4000]}
```

JSON array:
"""
        try:
            text = self.generate_text(prompt, temperature=0.1, max_output_tokens=1024)

            # Strip markdown code fences if the LLM wraps them anyway
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]

            parsed = json.loads(text)

            # Validate structure — must be a list of dicts with path and method
            if not isinstance(parsed, list):
                return raw_endpoints

            cleaned = []
            for item in parsed:
                if isinstance(item, dict) and "path" in item and "method" in item:
                    cleaned.append({
                        "path":   str(item["path"]),
                        "method": str(item["method"]).upper()
                    })

            logger.debug("Validated endpoints for %s: %s", file_name, cleaned)
            return cleaned

        except Exception as e:
            logger.warning("LLM call failed for %s: %s — falling back to Tree-sitter results", file_name, e)
            return raw_endpoints

llm_service = LLMService()
