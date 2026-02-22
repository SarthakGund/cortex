import json
from core.config import settings

# Try to import Gemini, but don't fail if it's not available
try:
    import google.generativeai as genai
    GENAI_AVAILABLE = True
except ImportError as e:
    print(f"[LLM] google.generativeai not available: {e}")
    GENAI_AVAILABLE = False
    genai = None

class LLMService:
    def __init__(self):
        self._client = None
        self.model = None
        self.enabled = False
        
        if not GENAI_AVAILABLE:
            print("[LLM] google.generativeai not installed. LLM features disabled.")
        elif settings.GEMINI_API_KEY:
            try:
                genai.configure(api_key=settings.GEMINI_API_KEY)
                self.model = genai.GenerativeModel("gemini-flash-latest")
                self._client = genai
                self.enabled = True
                print("[LLM] ✅ Gemini configured successfully")
            except Exception as e:
                print(f"[LLM] Failed to configure Gemini: {e}")
        else:
            print("[LLM] GEMINI_API_KEY not set. LLM validation disabled.")

    def validate_and_fix_endpoints(self, code: str, raw_endpoints: list, file_name: str) -> list:
        """
        Takes the raw endpoints extracted by Tree-sitter and asks Gemini to:
        1. Correct any malformed paths (e.g. stripped quotes, wrong slashes)
        2. Find any endpoints that Tree-sitter MISSED
        3. Return a clean JSON list

        We only call Gemini if Tree-sitter found at least something, or the
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
            response = self.model.generate_content(prompt)
            text = response.text.strip()

            # Strip markdown code fences if Gemini wraps them anyway
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

            print(f"  [LLM] Validated endpoints for {file_name}: {cleaned}")
            return cleaned

        except Exception as e:
            print(f"  [LLM] Gemini call failed for {file_name}: {e}. Using Tree-sitter results.")
            return raw_endpoints

llm_service = LLMService()
