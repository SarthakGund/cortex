from services.graph_service import graph_service
from services.llm_service import llm_service
from core.parsers.python_parser import python_parser
from core.parsers.typescript_parser import typescript_parser
import os
import tempfile
import subprocess

# File extensions we skip entirely (binary, lockfiles, configs)
SKIP_EXTENSIONS = {
    ".json", ".lock", ".yml", ".yaml", ".md", ".txt", ".env",
    ".png", ".jpg", ".gif", ".svg", ".ico", ".woff", ".woff2",
    ".map", ".css", ".scss", ".html", ".xml", ".toml", ".ini",
    ".pyc", ".pyo", ".egg-info"
}

class IngestionService:
    def __init__(self):
        pass

    def _get_module_name(self, file_path: str, root_dir: str) -> str:
        """
        Derives the module name from the directory path relative to the repo root.
        e.g.  /tmp/repo/src/routes/user.py  ->  'src.routes'
        Falls back to 'root' for top-level files.
        """
        rel = os.path.relpath(os.path.dirname(file_path), root_dir)
        if rel == ".":
            return "root"
        return rel.replace(os.sep, ".")

    def _ingest_python_file(self, service_name: str, file_path: str, module_name: str, code: str):
        """Processes a single Python file and creates all graph nodes for it."""

        # 1. File node
        graph_service.create_file_node(service_name, module_name, file_path, language="python")

        # 2. API Endpoints  (Flask/FastAPI decorators)
        # Tree-sitter does the fast structural pass first
        raw_endpoints = python_parser.extract_endpoints(code)
        # Gemini then validates and fills in anything Tree-sitter missed
        endpoints = llm_service.validate_and_fix_endpoints(code, raw_endpoints, os.path.basename(file_path))
        for ep in endpoints:
            graph_service.create_endpoint_node(
                service_name, ep["path"], method=ep["method"], file_path=file_path
            )
            print(f"  [Python] Endpoint  {ep['method']} {ep['path']}")

        # 3. Classes  (including Pydantic schemas detected separately)
        schemas = {s["name"] for s in python_parser.extract_schemas(code)}
        for cls in python_parser.extract_classes(code):
            if cls["name"] in schemas:
                # This class is a Pydantic / dataclass model -> Schema node
                graph_service.create_schema_node(service_name, file_path, cls["name"], schema_type="pydantic")
                print(f"  [Python] Schema    {cls['name']}")
            else:
                graph_service.create_class_node(service_name, file_path, cls["name"], base_classes=cls["bases"])
                print(f"  [Python] Class     {cls['name']}")

        # 4. Functions  (top-level only — class methods are picked up via class_name=None)
        for fn in python_parser.extract_functions(code):
            graph_service.create_function_node(
                service_name, file_path, fn["name"], is_async=fn["is_async"]
            )

        # 5. Import edges (inter-file dependencies)
        for imp in python_parser.extract_imports(code):
            graph_service.create_import_edge(file_path, imp)

    def _ingest_ts_js_file(self, service_name: str, file_path: str, module_name: str, code: str, lang: str):
        """Processes a single TypeScript or JavaScript file."""
        fname = os.path.basename(file_path)

        # 1. File node
        graph_service.create_file_node(service_name, module_name, file_path, language=lang)

        # 2. API Endpoints  (Express-style calls)
        try:
            raw_endpoints = typescript_parser.extract_endpoints(code, language=lang)
            endpoints = llm_service.validate_and_fix_endpoints(code, raw_endpoints, fname)
            for ep in endpoints:
                graph_service.create_endpoint_node(
                    service_name, ep["path"], method=ep["method"], file_path=file_path
                )
                print(f"  [TS/JS]  Endpoint  {ep['method']} {ep['path']}")
        except Exception as e:
            print(f"  [WARN]   Endpoints skipped for {fname}: {e}")

        # 3. Classes
        try:
            for cls in typescript_parser.extract_classes(code, language=lang):
                graph_service.create_class_node(service_name, file_path, cls["name"], base_classes=cls["bases"])
                print(f"  [TS/JS]  Class     {cls['name']}")
        except Exception as e:
            print(f"  [WARN]   Classes skipped for {fname}: {e}")

        # 4. Functions / arrow functions
        try:
            for fn in typescript_parser.extract_functions(code, language=lang):
                graph_service.create_function_node(
                    service_name, file_path, fn["name"], is_async=fn["is_async"]
                )
        except Exception as e:
            print(f"  [WARN]   Functions skipped for {fname}: {e}")

        # 5. Schemas (TypeScript interfaces / type aliases)
        try:
            for sc in typescript_parser.extract_schemas(code, language=lang):
                graph_service.create_schema_node(service_name, file_path, sc["name"], schema_type=sc["type"])
                print(f"  [TS/JS]  Schema    {sc['name']}")
        except Exception as e:
            print(f"  [WARN]   Schemas skipped for {fname}: {e}")

        # 6. Import edges
        try:
            for imp in typescript_parser.extract_imports(code, language=lang):
                graph_service.create_import_edge(file_path, imp)
        except Exception as e:
            print(f"  [WARN]   Imports skipped for {fname}: {e}")

    def ingest_repository(self, repo_url: str, github_token: str = None):
        """
        Main entry point:
        1. Fetch repo source zip from GitHub API
        2. Walk every source file
        3. Build Module -> File -> Class/Function/Schema/Endpoint nodes
        4. Push everything into Neo4j
        """
        import requests
        import zipfile
        import io
        from core.config import settings

        print(f"\nStarting ingestion for {repo_url}")
        service_name = repo_url.rstrip("/").split("/")[-1].replace(".git", "")

        graph_service.create_service_node(name=service_name, description=f"Ingested from {repo_url}", language="Mixed")

        # Extract owner and repo
        parts = repo_url.rstrip("/").replace(".git", "").split("/")
        if len(parts) >= 2:
            owner, repo = parts[-2], parts[-1]
        else:
            return {"status": "error", "message": "Invalid GitHub repository URL"}

        # Use the passed token or fallback to environment token
        request_token = github_token or settings.GITHUB_TOKEN

        # Use the GitHub API to fetch the zipball for the default branch
        api_url = f"https://api.github.com/repos/{owner}/{repo}/zipball"
        headers = {}
        if request_token:
            headers["Authorization"] = f"token {request_token}"

        with tempfile.TemporaryDirectory() as temp_dir:
            try:
                print(f"Fetching source from GitHub API...")
                resp = requests.get(api_url, headers=headers)
                
                # Check for rate limiting / not found
                if resp.status_code != 200:
                    error_msg = resp.json().get('message', 'Unknown API Error') if resp.headers.get('Content-Type') == 'application/json' else resp.text
                    return {"status": "error", "message": f"GitHub API failed ({resp.status_code}): {error_msg}"}

                # Extract zip into temp_dir
                print("Extracting repository...")
                with zipfile.ZipFile(io.BytesIO(resp.content)) as z:
                    z.extractall(temp_dir)
                    
                # GitHub zips put everything in a nested folder (owner-repo-commithash)
                extracted_items = os.listdir(temp_dir)
                if len(extracted_items) == 1 and os.path.isdir(os.path.join(temp_dir, extracted_items[0])):
                    source_dir = os.path.join(temp_dir, extracted_items[0])
                else:
                    source_dir = temp_dir
                    
            except Exception as e:
                return {"status": "error", "message": f"Failed to fetch/extract repo: {e}"}

            file_count = 0
            for root, dirs, files in os.walk(source_dir):
                # Skip hidden / vendor directories
                dirs[:] = [d for d in dirs if not d.startswith(".") and d not in ("node_modules", "__pycache__", ".git", "dist", "build")]

                for file in files:
                    # Skip non-code files
                    ext = os.path.splitext(file)[1].lower()
                    if ext in SKIP_EXTENSIONS:
                        continue

                    file_path = os.path.join(root, file)
                    module_name = self._get_module_name(file_path, temp_dir)

                    # Ensure module node exists
                    graph_service.create_module_node(service_name, module_name)

                    try:
                        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                            code = f.read()

                        if ext == ".py":
                            self._ingest_python_file(service_name, file_path, module_name, code)
                            file_count += 1
                        elif ext in (".ts", ".tsx"):
                            self._ingest_ts_js_file(service_name, file_path, module_name, code, lang="ts")
                            file_count += 1
                        elif ext in (".js", ".jsx", ".mjs", ".cjs"):
                            self._ingest_ts_js_file(service_name, file_path, module_name, code, lang="js")
                            file_count += 1

                    except Exception as e:
                        print(f"  [ERROR] {file_path}: {e}")

        # 5. Create Webhook
        try:
            from services.github_service import github_service
            github_service.create_webhook(repo_url, github_token=request_token)
        except Exception as e:
            print(f"  [ERROR] Webhook setup failed: {e}")

        msg = f"Ingested {file_count} files from '{service_name}' into the Knowledge Graph."
        print(f"\n{msg}")
        return {"status": "success", "message": msg}

ingestion_service = IngestionService()
