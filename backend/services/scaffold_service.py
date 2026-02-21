"""
Scaffold Service
================
Autonomous Architecture Design & Infrastructure Scaffolding Agent.

Two-phase approach:
  1. design(requirements, ref_service?)
       → Pulls reference architecture from Neo4j (if provided)
       → Calls Gemini to produce a structured JSON blueprint
         (services, tech stacks, databases, communication protocols, rationale)

  2. generate(blueprint)
       → For each service: generates main app stub (LLM) + Dockerfile + deps file
       → Generates docker-compose.yml, nginx API gateway config, k8s manifests
       → Packages everything into an in-memory zip, returns file tree + zip bytes
"""

from __future__ import annotations

import io
import json
import re
import textwrap
import zipfile
from typing import Any, Optional

import google.generativeai as genai

from core.config import settings
from services.graph_service import graph_service
from services.github_service import GitHubService

# ── LLM setup ────────────────────────────────────────────────────────────────

def _get_llm():
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not configured")
    genai.configure(api_key=settings.GEMINI_API_KEY)
    return genai.GenerativeModel(
        "gemini-2.0-flash",
        generation_config={"temperature": 0.1, "max_output_tokens": 8192},
    )


# ── Reference Architecture Extractor ─────────────────────────────────────────

def _extract_repo_structure(repo_url: str, branch: str = "main") -> str:
    """
    Fetch the file tree from a GitHub repo and format it as a directory tree
    to give the LLM structural context (folder layout, tech stack via filenames).
    """
    try:
        svc = GitHubService(token=settings.github_token)
        tree = svc.get_tree(repo_url, branch=branch)
        if not tree:
            # Try 'master' if 'main' returned nothing
            tree = svc.get_tree(repo_url, branch="master")
    except Exception as e:
        return f"(Could not fetch repo structure: {e})"

    if not tree:
        return "(Repository appears empty or inaccessible)"

    # Build an indented tree string
    paths = sorted(item["path"] for item in tree if item["type"] == "blob")
    lines = [f"Repository: {repo_url}", ""]
    for path in paths[:300]:     # cap at 300 files to stay within prompt budget
        indent = "  " * (path.count("/"))
        lines.append(f"{indent}{path.split('/')[-1]}")

    # Summarise tech stack from file extensions
    exts: dict[str, int] = {}
    for p in paths:
        ext = p.rsplit(".", 1)[-1] if "." in p else ""
        if ext:
            exts[ext] = exts.get(ext, 0) + 1
    top_exts = sorted(exts.items(), key=lambda x: -x[1])[:8]
    lines += [
        "",
        "Detected tech stack (by file count):",
        ", ".join(f".{e} ({c}x)" for e, c in top_exts),
    ]

    return "\n".join(lines)


def _extract_reference_architecture(service_name: str) -> str:
    """
    Query Neo4j for an ingested service and return a human-readable summary
    of its architecture (endpoints, DB models, modules, dependencies) to use
    as template context for the LLM.
    """
    cypher = """
    MATCH (n)
    WHERE n.service = $svc OR n.name = $svc OR
          (n:Service AND toLower(n.name) CONTAINS toLower($svc))
    WITH n LIMIT 200
    RETURN labels(n)[0] AS label, properties(n) AS props
    """
    try:
        rows = []
        with graph_service.driver.session() as session:
            for rec in session.run(cypher, svc=service_name):
                rows.append({"label": rec["label"], "props": dict(rec["props"])})
    except Exception as e:
        return f"(Reference architecture unavailable: {e})"

    if not rows:
        return "(No matching reference service found in the knowledge graph.)"

    lines = [f"Reference service: {service_name}", ""]
    grouped: dict[str, list] = {}
    for r in rows:
        grouped.setdefault(r["label"], []).append(r["props"])

    for label, items in grouped.items():
        lines.append(f"## {label}s ({len(items)})")
        for item in items[:10]:            # cap to avoid huge prompts
            name = item.get("name") or item.get("path") or str(item)[:60]
            extras = []
            for k in ("method", "path", "docstring", "db_name", "table_name"):
                if item.get(k):
                    extras.append(f"{k}={item[k]}")
            lines.append(f"  - {name}" + (f"  [{', '.join(extras)}]" if extras else ""))
        lines.append("")

    return "\n".join(lines)


# ── Blueprint Designer ────────────────────────────────────────────────────────

BLUEPRINT_SCHEMA = """\
{
  "system_name": "string",
  "summary": "string – one-sentence description",
  "rationale": "string – paragraph explaining key decisions",
  "services": [
    {
      "name": "kebab-case-service-name",
      "role": "string",
      "language": "python | typescript | go | java",
      "framework": "fastapi | express | gin | spring",
      "database": {"type": "postgres | mysql | mongodb | redis | none", "name": "shared_db_name_or_unique_if_isolated"},
      "endpoints": [{"path": "/...", "method": "GET|POST|PUT|DELETE", "description": "..."}],
      "port": 8001,
      "communicates_with": [{"service": "other-service", "protocol": "REST | gRPC | events"}],
      "env_vars": ["DATABASE_URL", "..."],
      "responsibilities": ["bullet point", "..."]
    }
  ],
  "api_gateway": {"type": "nginx | kong | traefik", "port": 80},
  "message_queues": [{"name": "queue-name", "used_by": ["svc1", "svc2"]}],
  "global_decisions": "string – cross-cutting concerns, auth strategy, etc.",
  "directory_structure_notes": "string"
}"""


def design_architecture(
    requirements: str,
    reference_service: Optional[str] = None,
    reference_repo_url: Optional[str] = None,
) -> dict:
    """
    Phase 1 – Design.
    Uses Gemini to convert natural-language requirements into a structured
    system blueprint.  If reference_service is provided, the existing
    architecture from Neo4j is injected as template context.
    If reference_repo_url is provided, the GitHub repo file structure is
    fetched and used as additional structural context.
    """
    llm = _get_llm()

    ref_context = ""
    if reference_repo_url:
        repo_struct = _extract_repo_structure(reference_repo_url)
        ref_context += f"""
=== REFERENCE REPO STRUCTURE (use as structural / naming template) ===
{repo_struct}
=== END REFERENCE REPO ===
"""
    if reference_service:
        ref_arch = _extract_reference_architecture(reference_service)
        ref_context += f"""
=== REFERENCE ARCHITECTURE FROM KNOWLEDGE GRAPH ===
{ref_arch}
=== END REFERENCE ===
"""

    prompt = f"""You are an expert Staff Engineer designing a production-grade microservices system.

{ref_context}
=== USER REQUIREMENTS ===
{requirements}
=== END REQUIREMENTS ===

Design a complete system architecture. Output ONLY valid JSON matching this exact schema:
{BLUEPRINT_SCHEMA}

Rules:
- Be CONSERVATIVE and REALISTIC. Design only what the requirements actually ask for.
- If the user describes a single service or small scope, output 1-2 services only. Do NOT invent extra services to hit a minimum.
- A single service is perfectly valid if the requirements describe one bounded concern.
- DATABASE SHARING IS PREFERRED: services that operate on closely related data (e.g. cart + orders, users + profiles, products + inventory) MUST share a single PostgreSQL database (same "name" value in the JSON) and use separate tables/schemas within it. Only give a service its own dedicated database if its data is truly isolated and has no foreign-key relationships with other services.
- Default to PostgreSQL for everything. Only deviate if there is a compelling, explicit reason.
- Do NOT add Redis or a caching layer unless caching, rate-limiting, or async job queuing is explicitly mentioned.
- Do NOT add MongoDB unless the data is inherently document-shaped and schema-less.
- Every service must have a distinct port (start from 8001).
- Respect the user's preferred language if stated (e.g. "primarily use python" → use Python/FastAPI for all services).
- Prefer FastAPI for Python, Express/Fastify for TypeScript, Gin for Go.
- Add an NGINX API gateway only when there are 2 or more services.
- Include rationale for every major decision, especially database choices and why databases are shared or split.
- Maximum 8 services. There is no minimum — match the scope of the requirements exactly.
- Output ONLY the JSON — no prose, no markdown fences, no explanations outside the JSON.
"""

    response = llm.generate_content(prompt)
    raw = response.text.strip()

    # Strip markdown fences if the LLM wrapped it
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    blueprint = json.loads(raw)
    return blueprint


# ── File Generators ───────────────────────────────────────────────────────────

def _generate_service_main(llm, service: dict, blueprint: dict) -> str:
    """
    Call Gemini to generate a production-quality app stub for one service.
    """
    lang = service.get("language", "python")
    framework = service.get("framework", "fastapi")
    endpoints = service.get("endpoints", [])
    role = service.get("role", "")
    db = service.get("database", {})

    endpoint_list = "\n".join(
        f"  - {e['method']} {e['path']}: {e.get('description','')}"
        for e in endpoints
    ) or "  (no endpoints specified)"

    communicates_with = service.get("communicates_with", [])
    comm_list = "\n".join(
        f"  - calls {c['service']} via {c['protocol']}"
        for c in communicates_with
    ) or "  (none)"

    prompt = f"""Generate a complete, production-quality stub for a {framework} ({lang}) microservice.

Service: {service['name']}
Role: {role}
Database: {db.get('type','none')} (db name: {db.get('name','')})
Endpoints to implement:
{endpoint_list}
Calls these services:
{comm_list}
Env vars: {', '.join(service.get('env_vars', []))}

Requirements:
- Include all imports.
- Implement all listed endpoints as stub handlers (return realistic dummy data or a TODO comment).
- Include CORS middleware.
- Include a /health endpoint.
- Include DB connection setup (commented out connection string from env var).
- Use pydantic BaseModel for request/response schemas.
- Add docstrings and inline comments explaining the code.
- Keep it clean, idiomatic, and ready to extend.

Output ONLY the source code — no markdown fences, no explanations.
"""

    resp = llm.generate_content(prompt)
    return resp.text.strip()


def _dockerfile(service: dict) -> str:
    lang = service.get("language", "python")
    port = service.get("port", 8000)
    framework = service.get("framework", "fastapi")

    if lang == "python":
        return textwrap.dedent(f"""\
            FROM python:3.12-slim

            WORKDIR /app

            COPY requirements.txt .
            RUN pip install --no-cache-dir -r requirements.txt

            COPY . .

            EXPOSE {port}

            CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "{port}"]
        """)

    if lang == "typescript":
        return textwrap.dedent(f"""\
            FROM node:20-alpine

            WORKDIR /app

            COPY package*.json ./
            RUN npm ci

            COPY . .
            RUN npm run build

            EXPOSE {port}

            CMD ["node", "dist/main.js"]
        """)

    if lang == "go":
        return textwrap.dedent(f"""\
            FROM golang:1.22-alpine AS builder
            WORKDIR /app
            COPY go.mod go.sum ./
            RUN go mod download
            COPY . .
            RUN go build -o service .

            FROM alpine:3.19
            WORKDIR /app
            COPY --from=builder /app/service .
            EXPOSE {port}
            CMD ["./service"]
        """)

    # fallback
    return f"# Dockerfile for {lang}/{framework}\n# TODO: add build steps\nEXPOSE {port}\n"


def _requirements(service: dict) -> str:
    lang = service.get("language", "python")
    framework = service.get("framework", "fastapi")
    db_type = service.get("database", {}).get("type", "none")

    if lang == "python":
        pkgs = ["fastapi>=0.110.0", "uvicorn[standard]>=0.29.0", "pydantic>=2.0", "httpx>=0.27.0", "python-dotenv>=1.0"]
        if framework == "fastapi":
            pkgs.append("python-multipart>=0.0.9")
        if db_type == "postgres":
            pkgs += ["asyncpg>=0.29.0", "sqlalchemy[asyncio]>=2.0", "alembic>=1.13.0"]
        elif db_type == "mongodb":
            pkgs += ["motor>=3.3.0", "beanie>=1.25.0"]
        elif db_type == "redis":
            pkgs.append("redis[hiredis]>=5.0.0")
        return "\n".join(pkgs) + "\n"

    if lang == "typescript":
        framework_pkg = "express" if framework == "express" else "fastify"
        deps = {framework_pkg: "^4.18.0", "dotenv": "^16.0.0", "axios": "^1.6.0"}
        if db_type == "postgres":
            deps.update({"pg": "^8.11.0", "typeorm": "^0.3.0"})
        elif db_type == "mongodb":
            deps.update({"mongoose": "^8.0.0"})
        pkg = {
            "name": service["name"],
            "version": "1.0.0",
            "scripts": {"start": "node dist/main.js", "build": "tsc", "dev": "ts-node src/main.ts"},
            "dependencies": deps,
            "devDependencies": {"typescript": "^5.3.0", "ts-node": "^10.9.0", "@types/node": "^20.0.0"},
        }
        return json.dumps(pkg, indent=2) + "\n"

    return f"# Dependencies for {lang}\n"


def _env_example(service: dict) -> str:
    lines = [f"# .env for {service['name']}"]
    for var in service.get("env_vars", []):
        lines.append(f"{var}=")
    lines.append(f"PORT={service.get('port', 8000)}")
    if service["database"]["type"] != "none":
        db = service["database"]
        if db["type"] == "postgres":
            lines.append(f"DATABASE_URL=postgresql://user:password@localhost:5432/{db['name']}")
        elif db["type"] == "mongodb":
            lines.append(f"MONGODB_URL=mongodb://localhost:27017/{db['name']}")
        elif db["type"] == "redis":
            lines.append(f"REDIS_URL=redis://localhost:6379/0")
    return "\n".join(lines) + "\n"


def _docker_compose(blueprint: dict) -> str:
    services_block = ""
    for svc in blueprint["services"]:
        db = svc.get("database", {})
        db_type = db.get("type", "none")
        db_name = db.get("name", svc["name"].replace("-", "_") + "_db")

        depends = ""
        if db_type not in ("none", "redis"):
            dep_svc = f"{svc['name']}-db"
            depends = f"\n    depends_on:\n      - {dep_svc}"

        env_block = "\n".join(
            f"      - {var}=${{{{ {var} }}}}"
            for var in svc.get("env_vars", [])
        )
        if env_block:
            env_block = f"\n    environment:\n{env_block}"

        services_block += textwrap.dedent(f"""
  {svc['name']}:
    build: ./{svc['name']}
    ports:
      - "{svc['port']}:{svc['port']}"{env_block}{depends}
    networks:
      - app-network
""")

        # Add DB sidecar
        if db_type == "postgres":
            services_block += textwrap.dedent(f"""
  {svc['name']}-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: {db_name}
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
    volumes:
      - {svc['name']}-db-data:/var/lib/postgresql/data
    networks:
      - app-network
""")
        elif db_type == "mongodb":
            services_block += textwrap.dedent(f"""
  {svc['name']}-db:
    image: mongo:7
    volumes:
      - {svc['name']}-db-data:/data/db
    networks:
      - app-network
""")
        elif db_type == "redis":
            services_block += textwrap.dedent(f"""
  {svc['name']}-redis:
    image: redis:7-alpine
    networks:
      - app-network
""")

    gw = blueprint.get("api_gateway", {})
    gw_port = gw.get("port", 80)
    services_block += textwrap.dedent(f"""
  api-gateway:
    image: nginx:alpine
    ports:
      - "{gw_port}:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
{chr(10).join(f"      - {s['name']}" for s in blueprint['services'])}
    networks:
      - app-network
""")

    # Collect volumes
    volumes = []
    for svc in blueprint["services"]:
        db_type = svc.get("database", {}).get("type", "none")
        if db_type in ("postgres", "mongodb"):
            volumes.append(f"{svc['name']}-db-data:")

    volumes_block = "\n".join(volumes)

    return textwrap.dedent(f"""\
version: "3.9"

services:
{services_block}
networks:
  app-network:
    driver: bridge

volumes:
  {volumes_block}
""")


def _nginx_conf(blueprint: dict) -> str:
    upstreams = ""
    locations = ""
    for svc in blueprint["services"]:
        name = svc["name"].replace("-", "_")
        upstreams += textwrap.dedent(f"""
    upstream {name} {{
        server {svc['name']}:{svc['port']};
    }}
""")
        # Route based on first path segment
        prefix = f"/{svc['name'].split('-')[0]}"
        locations += textwrap.dedent(f"""
        location {prefix} {{
            proxy_pass http://{name};
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }}
""")

    return textwrap.dedent(f"""\
events {{
    worker_connections 1024;
}}

http {{
    {upstreams}
    server {{
        listen 80;
        {locations}
        location /health {{
            return 200 'gateway ok';
            add_header Content-Type text/plain;
        }}
    }}
}}
""")


def _k8s_deployment(svc: dict) -> str:
    name = svc["name"]
    port = svc.get("port", 8000)
    env_block = "\n".join(
        f"            - name: {var}\n              valueFrom:\n                secretKeyRef:\n                  name: {name}-secrets\n                  key: {var.lower()}"
        for var in svc.get("env_vars", [])
    )
    env_section = f"\n          env:\n{env_block}" if env_block else ""

    return textwrap.dedent(f"""\
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {name}
  labels:
    app: {name}
spec:
  replicas: 2
  selector:
    matchLabels:
      app: {name}
  template:
    metadata:
      labels:
        app: {name}
    spec:
      containers:
        - name: {name}
          image: {name}:latest
          ports:
            - containerPort: {port}{env_section}
          livenessProbe:
            httpGet:
              path: /health
              port: {port}
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /health
              port: {port}
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests:
              cpu: "100m"
              memory: "128Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
""")


def _k8s_service(svc: dict) -> str:
    name = svc["name"]
    port = svc.get("port", 8000)
    return textwrap.dedent(f"""\
apiVersion: v1
kind: Service
metadata:
  name: {name}
spec:
  selector:
    app: {name}
  ports:
    - protocol: TCP
      port: 80
      targetPort: {port}
  type: ClusterIP
""")


def _k8s_ingress(blueprint: dict) -> str:
    rules = ""
    for svc in blueprint["services"]:
        name = svc["name"]
        prefix = f"/{name.split('-')[0]}"
        rules += textwrap.dedent(f"""
    - http:
        paths:
          - path: {prefix}
            pathType: Prefix
            backend:
              service:
                name: {name}
                port:
                  number: 80""")

    return textwrap.dedent(f"""\
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-gateway
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:{rules}
""")


def _readme(blueprint: dict) -> str:
    svc_table = "\n".join(
        f"| {s['name']} | {s['role']} | {s['language']}/{s['framework']} | {s.get('database',{}).get('type','—')} | :{s['port']} |"
        for s in blueprint["services"]
    )
    return textwrap.dedent(f"""\
# {blueprint.get("system_name", "System")}

{blueprint.get("summary", "")}

## Architecture Rationale

{blueprint.get("rationale", "")}

## Services

| Service | Role | Stack | Database | Port |
|---------|------|-------|----------|------|
{svc_table}

## API Gateway

- Type: {blueprint.get("api_gateway", {}).get("type", "nginx")}
- Port: {blueprint.get("api_gateway", {}).get("port", 80)}
- Routes each service under `/<service-prefix>/`

## Global Decisions

{blueprint.get("global_decisions", "")}

## Getting Started

```bash
# Start everything with Docker Compose
docker compose up --build

# Or deploy to Kubernetes
kubectl apply -f k8s/
```

## Directory Structure

```
{chr(10).join(f"{s['name']}/" for s in blueprint["services"])}
nginx/
k8s/
docker-compose.yml
README.md
```
""")


# ── Scaffold Generator ────────────────────────────────────────────────────────

def generate_scaffold(blueprint: dict) -> tuple[dict, bytes]:
    """
    Phase 2 – Generate.
    Returns:
      file_tree  – nested dict of {path: content_str}
      zip_bytes  – a zip containing all files
    """
    llm = _get_llm()
    file_tree: dict[str, str] = {}

    # ── Per service files ──
    for svc in blueprint["services"]:
        name = svc["name"]
        lang = svc.get("language", "python")

        # Main application file
        main_code = _generate_service_main(llm, svc, blueprint)
        ext = {"python": "main.py", "typescript": "src/main.ts", "go": "main.go", "java": "src/Main.java"}.get(lang, "main.py")
        file_tree[f"{name}/{ext}"] = main_code

        # Dockerfile
        file_tree[f"{name}/Dockerfile"] = _dockerfile(svc)

        # Deps file
        deps_filename = {"python": "requirements.txt", "typescript": "package.json", "go": "go.mod"}.get(lang, "requirements.txt")
        file_tree[f"{name}/{deps_filename}"] = _requirements(svc)

        # Env example
        file_tree[f"{name}/.env.example"] = _env_example(svc)

        # .dockerignore
        file_tree[f"{name}/.dockerignore"] = "__pycache__/\n*.pyc\n.env\n.venv/\nnode_modules/\n"

    # ── NGINX config ──
    file_tree["nginx/nginx.conf"] = _nginx_conf(blueprint)

    # ── Docker Compose ──
    file_tree["docker-compose.yml"] = _docker_compose(blueprint)

    # ── Kubernetes manifests ──
    for svc in blueprint["services"]:
        name = svc["name"]
        file_tree[f"k8s/{name}-deployment.yaml"] = _k8s_deployment(svc)
        file_tree[f"k8s/{name}-service.yaml"]    = _k8s_service(svc)

    file_tree["k8s/ingress.yaml"] = _k8s_ingress(blueprint)

    # ── README ──
    file_tree["README.md"] = _readme(blueprint)

    # ── Build zip in memory ──
    buf = io.BytesIO()
    system_name = re.sub(r"[^a-z0-9-]", "-", blueprint.get("system_name", "system").lower())
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path, content in file_tree.items():
            zf.writestr(f"{system_name}/{path}", content)
    zip_bytes = buf.getvalue()

    return file_tree, zip_bytes
