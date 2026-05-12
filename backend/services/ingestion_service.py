from services.graph_service import graph_service
from services.llm_service import llm_service
from services.github_service import GitHubService
from services.event_service import record_event
from core.parsers.python_parser import python_parser
from core.parsers.typescript_parser import typescript_parser
from core.config import settings
import os
import tempfile
import subprocess
import hashlib
import traceback

# File extensions we skip entirely (binary, lockfiles, configs)
SKIP_EXTENSIONS = {
    ".json", ".lock", ".yml", ".yaml", ".md", ".txt", ".env",
    ".png", ".jpg", ".gif", ".svg", ".ico", ".woff", ".woff2",
    ".map", ".css", ".scss", ".html", ".xml", ".toml", ".ini",
    ".pyc", ".pyo", ".egg-info"
}

class IngestionService:
    def __init__(self):
        self._file_hashes: dict[str, str] = {}  # path → content hash for incremental ingestion

    def _content_hash(self, content: str) -> str:
        """SHA256 hash of file content for change detection."""
        return hashlib.sha256(content.encode('utf-8', errors='ignore')).hexdigest()[:16]

    def _check_existing_hash(self, service_name: str, file_path: str) -> str:
        """Check if this file already has a content hash stored in Neo4j."""
        try:
            with graph_service.driver.session() as session:
                result = session.run(
                    "MATCH (f:File {path: $path, service: $service}) RETURN f.content_hash AS hash",
                    path=file_path, service=service_name
                )
                rec = result.single()
                return rec["hash"] if rec and rec["hash"] else ""
        except Exception:
            return ""

    def _store_file_hash(self, service_name: str, file_path: str, content_hash: str):
        """Store the content hash on the File node for future incremental checks."""
        try:
            with graph_service.driver.session() as session:
                session.run(
                    "MATCH (f:File {path: $path, service: $service}) SET f.content_hash = $hash",
                    path=file_path, service=service_name, hash=content_hash
                )
        except Exception:
            pass

    def _get_git_metadata(self, repo_dir: str, file_path: str) -> dict:
        """
        Returns {"hash": <last commit hash>, "date": <ISO date>} for the given file
        by running git log once with --follow.
        Falls back to empty strings on any error.
        """
        try:
            rel = os.path.relpath(file_path, repo_dir)
            result = subprocess.run(
                ["git", "-C", repo_dir, "log", "--follow", "--format=%H %aI", "-1", "--", rel],
                capture_output=True, text=True, timeout=5
            )
            parts = result.stdout.strip().split(" ", 1)
            if len(parts) == 2:
                return {"hash": parts[0], "date": parts[1]}
        except Exception:
            pass
        return {"hash": "", "date": ""}

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

    def _ingest_python_file(self, service_name: str, file_path: str, module_name: str,
                              code: str, repo_dir: str = ""):
        """Processes a single Python file and creates all graph nodes for it."""
        fname = os.path.basename(file_path)

        # Git metadata
        git = self._get_git_metadata(repo_dir, file_path) if repo_dir else {"hash": "", "date": ""}

        # 1. File node  (with git metadata)
        graph_service.create_file_node(
            service_name, module_name, file_path, language="python",
            last_commit_hash=git["hash"], last_modified_date=git["date"]
        )

        # 2. API Endpoints  (Flask/FastAPI decorators)
        raw_endpoints = python_parser.extract_endpoints(code)
        endpoints = llm_service.validate_and_fix_endpoints(code, raw_endpoints, fname)
        for ep in endpoints:
            graph_service.create_endpoint_node(
                service_name, ep["path"], method=ep["method"], file_path=file_path
            )
            print(f"  [Python] Endpoint  {ep['method']} {ep['path']}")

        # 3. Classes  (including Pydantic schemas detected separately)
        schemas = {s["name"] for s in python_parser.extract_schemas(code)}
        for cls in python_parser.extract_classes(code):
            if cls["name"] in schemas:
                graph_service.create_schema_node(service_name, file_path, cls["name"], schema_type="pydantic")
                print(f"  [Python] Schema    {cls['name']}")
            else:
                graph_service.create_class_node(
                    service_name, file_path, cls["name"], base_classes=cls["bases"]
                )
                print(f"  [Python] Class     {cls['name']}")

        # 4. Functions — with line_number, docstring, complexity_score
        all_functions = python_parser.extract_functions(code)
        func_names = {fn["name"] for fn in all_functions}
        for fn in all_functions:
            graph_service.create_function_node(
                service_name, file_path, fn["name"],
                is_async=fn["is_async"],
                line_number=fn["line_number"],
                docstring=fn["docstring"],
                complexity_score=fn["complexity_score"]
            )

        # 5. Function CALLS edges (intra-file: only if callee is a known function here)
        all_callees = python_parser.extract_function_calls(code)
        for fn in all_functions:
            for callee in all_callees:
                if callee in func_names and callee != fn["name"]:
                    graph_service.create_function_call_edge(fn["name"], file_path, callee)

        # 6. DB operations  — attribute to file-level placeholder table
        db_ops = python_parser.extract_db_operations(code)
        if db_ops:
            table_hint = f"{service_name}_db"
            for fn in all_functions:
                for op in db_ops:
                    if op["operation"] == "write":
                        graph_service.create_db_write_edge(fn["name"], file_path, table_hint)
                    else:
                        graph_service.create_db_read_edge(fn["name"], file_path, table_hint)

        # 7. Import edges (inter-file dependencies)
        for imp in python_parser.extract_imports(code):
            graph_service.create_import_edge(file_path, imp)

    def _ingest_ts_js_file(self, service_name: str, file_path: str, module_name: str,
                             code: str, lang: str, repo_dir: str = ""):
        """Processes a single TypeScript or JavaScript file."""
        fname = os.path.basename(file_path)

        # Git metadata
        git = self._get_git_metadata(repo_dir, file_path) if repo_dir else {"hash": "", "date": ""}

        # 1. File node  (with git metadata)
        graph_service.create_file_node(
            service_name, module_name, file_path, language=lang,
            last_commit_hash=git["hash"], last_modified_date=git["date"]
        )

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

        # 4. Functions / arrow functions — with line_number
        all_functions = []
        try:
            all_functions = typescript_parser.extract_functions(code, language=lang)
            for fn in all_functions:
                graph_service.create_function_node(
                    service_name, file_path, fn["name"],
                    is_async=fn["is_async"],
                    line_number=fn.get("line_number", 0)
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
                            self._ingest_python_file(service_name, file_path, module_name, code, repo_dir=temp_dir)
                            file_count += 1
                        elif ext in (".ts", ".tsx"):
                            self._ingest_ts_js_file(service_name, file_path, module_name, code, lang="ts", repo_dir=temp_dir)
                            file_count += 1
                        elif ext in (".js", ".jsx", ".mjs", ".cjs"):
                            self._ingest_ts_js_file(service_name, file_path, module_name, code, lang="js", repo_dir=temp_dir)
                            file_count += 1

                    except Exception as e:
                        print(f"  [ERROR] {file_path}: {e}")

        # 5. Create Webhook
        try:
            from services.github_service import github_webhook_service
            github_webhook_service.create_webhook(repo_url, github_token=request_token)
        except Exception as e:
            print(f"  [ERROR] Webhook setup failed: {e}")

        msg = f"Ingested {file_count} files from '{service_name}' into the Knowledge Graph."
        print(f"\n{msg}")
        return {"status": "success", "message": msg}

    def ingest_from_github(
        self,
        repo_url: str,
        branch: str = "main",
        incremental: bool = True,
        github_token: str | None = None,
        repo_key: str | None = None,
    ):
        """
        Ingest a GitHub repository via the GitHub API — no local clone needed.
        Fetches every code file directly and parses it into the Knowledge Graph.
        
        incremental=True: Only re-parse files whose content hash has changed.
        """
        print(f"\nStarting GitHub API ingestion for {repo_url} (branch: {branch}, incremental: {incremental})")
        repo_name = repo_url.rstrip("/").replace(".git", "").split("/")[-1]
        service_name = repo_key or repo_name

        graph_service.create_service_node(
            name=service_name,
            description=f"Ingested via GitHub API from {repo_url}",
            language="Mixed",
        )
        record_event("CREATE", "Service", service_name, service=service_name,
                      details={"repo_url": repo_url, "branch": branch}, source="ingestion")

        # Store repo metadata on the Service node
        try:
            with graph_service.driver.session() as session:
                session.run("""
                    MATCH (s:Service {name: $name})
                    SET s.repo_url = $repo_url,
                        s.branch = $branch,
                        s.last_ingested = datetime()
                """, name=service_name, repo_url=repo_url, branch=branch)
        except Exception:
            pass

        token_to_use = github_token or settings.GITHUB_TOKEN or settings.github_token

        # Auto-create webhook for continuous updates
        try:
            from services.github_service import github_webhook_service
            github_webhook_service.create_webhook(repo_url, github_token=token_to_use)
        except Exception as e:
            print(f"[Ingestion] Webhook setup failed: {e}")

        svc = GitHubService(token=token_to_use)
        file_count = 0
        skipped_count = 0

        for file_path, ext, code in svc.iter_code_files(repo_url, branch):
            # --- Incremental check ---
            if incremental:
                new_hash = self._content_hash(code)
                existing_hash = self._check_existing_hash(service_name, file_path)
                if new_hash == existing_hash:
                    skipped_count += 1
                    continue

            # Derive a module name from the directory portion of the path
            dir_part = "/".join(file_path.split("/")[:-1])
            module_name = dir_part.replace("/", ".") if dir_part else "root"

            graph_service.create_module_node(service_name, module_name)

            try:
                if ext == ".py":
                    self._ingest_python_file(service_name, file_path, module_name, code)
                elif ext in (".ts", ".tsx"):
                    self._ingest_ts_js_file(service_name, file_path, module_name, code, lang="ts")
                elif ext in (".js", ".jsx", ".mjs", ".cjs"):
                    self._ingest_ts_js_file(service_name, file_path, module_name, code, lang="js")

                # Store content hash for incremental detection
                if incremental:
                    self._store_file_hash(service_name, file_path, new_hash)

                record_event("CREATE", "File", file_path, service=service_name,
                              details={"extension": ext, "module": module_name}, source="ingestion")
                file_count += 1
            except Exception as e:
                print(f"  [ERROR] {file_path}: {e}")

        msg = f"GitHub ingestion complete: {file_count} files processed from '{service_name}'."
        if incremental and skipped_count > 0:
            msg += f" ({skipped_count} unchanged files skipped.)"
        print(f"\n{msg}")

        # Auto-sync to RAG vector store after successful ingestion
        try:
            print("[Ingestion] Starting RAG auto-sync...")
            from services.rag_service import rag_service
            print(f"[Ingestion] rag_service imported: {rag_service}")
            print(f"[Ingestion] Calling sync_graph_to_vector_store()...")
            rag_result = rag_service.sync_graph_to_vector_store(service_name)
            print(f"[Ingestion] RAG sync result: {rag_result}")
            print(f"[Ingestion] RAG sync complete: {rag_result.get('document_count', '?')} docs indexed")
        except Exception as rag_err:
            print(f"[Ingestion] RAG auto-sync FAILED: {type(rag_err).__name__}: {rag_err}")
            traceback.print_exc()

        return {"status": "success", "message": msg, "files_processed": file_count, "files_skipped": skipped_count}

    def ingest_multiple_repos(self, repos: list[dict]) -> dict:
        """
        Ingest multiple repositories and create cross-repo dependency links.
        
        repos: list of {"repo_url": str, "branch": str} dicts.
        """
        results = []
        service_names = []

        for repo in repos:
            url = repo["repo_url"]
            branch = repo.get("branch", "main")
            result = self.ingest_from_github(url, branch)
            results.append(result)
            service_name = url.rstrip("/").replace(".git", "").split("/")[-1]
            service_names.append(service_name)

        # After ingesting all repos, attempt to discover cross-repo dependencies
        # by looking for import references that match other service module names
        cross_links = self._discover_cross_repo_deps(service_names)

        # Auto-sync to RAG vector store once all repos are ingested
        try:
            print("[Multi-repo] Starting RAG auto-sync...")
            from services.rag_service import rag_service
            print(f"[Multi-repo] rag_service imported: {rag_service}")
            print(f"[Multi-repo] Calling sync_graph_to_vector_store()...")
            rag_result = rag_service.sync_graph_to_vector_store()
            print(f"[Multi-repo] RAG sync result: {rag_result}")
            print(f"[Multi-repo] RAG sync complete: {rag_result.get('document_count', '?')} docs indexed")
        except Exception as rag_err:
            print(f"[Multi-repo] RAG auto-sync FAILED: {type(rag_err).__name__}: {rag_err}")
            traceback.print_exc()

        return {
            "status": "success",
            "repos": results,
            "services": service_names,
            "cross_repo_links": cross_links,
        }

    def _discover_cross_repo_deps(self, service_names: list[str]) -> int:
        """
        After multi-repo ingestion, look for import edges that reference
        modules belonging to other services, and create DEPENDS_ON edges.
        """
        if len(service_names) < 2:
            return 0

        cypher = """
        MATCH (f:File)-[:IMPORTS]->(m:Module)
        WHERE f.service IN $services AND m.service IN $services
          AND f.service <> m.service
        WITH DISTINCT f.service AS src, m.service AS dst
        MERGE (s1:Service {name: src})
        MERGE (s2:Service {name: dst})
        MERGE (s1)-[:DEPENDS_ON {protocol: 'import', discovered: true}]->(s2)
        RETURN count(*) AS links
        """
        try:
            with graph_service.driver.session() as session:
                result = session.run(cypher, services=service_names)
                rec = result.single()
                count = rec["links"] if rec else 0
                if count > 0:
                    print(f"  [Multi-repo] Discovered {count} cross-repo dependencies")
                return count
        except Exception as e:
            print(f"  [Multi-repo] Cross-repo discovery failed: {e}")
            return 0


ingestion_service = IngestionService()
