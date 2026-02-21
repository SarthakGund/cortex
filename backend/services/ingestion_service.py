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

    def ingest_repository(self, repo_url: str):
        """
        Main entry point:
        1. Clone repo into a temp dir
        2. Walk every source file
        3. Build Module -> File -> Class/Function/Schema/Endpoint nodes
        4. Push everything into Neo4j
        """
        print(f"\nStarting ingestion for {repo_url}")
        service_name = repo_url.rstrip("/").split("/")[-1].replace(".git", "")

        graph_service.create_service_node(name=service_name, description=f"Ingested from {repo_url}", language="Mixed")

        with tempfile.TemporaryDirectory() as temp_dir:
            try:
                print(f"Cloning into {temp_dir} ...")
                subprocess.run(["git", "clone", "--depth", "1", repo_url, temp_dir],
                               check=True, capture_output=True)
            except subprocess.CalledProcessError as e:
                return {"status": "error", "message": f"Clone failed: {e.stderr.decode()}"}

            file_count = 0
            for root, dirs, files in os.walk(temp_dir):
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

        msg = f"Ingested {file_count} files from '{service_name}' into the Knowledge Graph."
        print(f"\n{msg}")
        return {"status": "success", "message": msg}

ingestion_service = IngestionService()
