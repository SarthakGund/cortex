# Cortex — Intelligent Architecture & Knowledge Platform

**Cortex** is an AI-powered "Automated Staff Engineer" that ingests your GitHub repositories, builds a living knowledge graph of your codebase, and lets you ask questions, simulate breaking changes, and scaffold new services — all in one platform.

[![CI](https://github.com/SarthakGund/cortex/actions/workflows/ci.yml/badge.svg)](https://github.com/SarthakGund/cortex/actions/workflows/ci.yml)

---

## What it does

| Capability | Description |
|---|---|
| **Living Knowledge Graph** | Parses repos into a Neo4j graph of services, functions, endpoints, and schemas with their relationships |
| **RAG Q&A** | Ask natural language questions about your codebase — answers are grounded in your actual code graph |
| **Impact Analysis** | Compute blast radius, find dependency chains, and get LLM-powered risk assessments before making changes |
| **What-If Simulator** | Simulate deprecating an endpoint, changing a field type, removing a schema — before touching production |
| **OpenAPI Spec Diffing** | Upload two spec versions to detect breaking changes and see which services are affected |
| **Architecture Scaffolding** | Describe a system in plain English → architecture blueprint → download a ready-to-run project zip |
| **GitHub Integration** | OAuth login, per-user repo isolation, webhook-driven auto-ingestion on push |

---

## Tech stack

**Backend** — Python 3.12, FastAPI, [uv](https://github.com/astral-sh/uv)

**Frontend** — Next.js 16, React 19, React Flow, Tailwind CSS

**Databases**

| Service | Role |
|---|---|
| Neo4j 5.15 | Knowledge graph — nodes and relationships |
| Qdrant | Vector search for semantic retrieval |
| PostgreSQL | Users, repos, sessions |
| Redis | Job store, scaffold zip cache |
| ChromaDB | Local embedding store for RAG |

**LLMs** — Groq (`llama-3.1-70b-versatile`, primary) or Gemini

---

## Quick start (local)

### 1. Start the databases

```bash
docker-compose up -d
```

This brings up Neo4j, Qdrant, PostgreSQL, and Redis with persistent volumes.

### 2. Configure the environment

```bash
cp .env.example .env
```

Edit `.env` with at minimum:

```env
GITHUB_CLIENT_ID=your_github_oauth_app_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_app_client_secret
GROQ_API_KEY=your_groq_api_key          # or GEMINI_API_KEY
NEO4J_PASSWORD=a_strong_password        # must not be "password"
TOKEN_ENCRYPTION_KEY=                   # generate below
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Generate an encryption key:
```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### 3. Start the backend

```bash
cd backend
uv sync
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API docs are available at [http://localhost:8000/docs](http://localhost:8000/docs).

### 4. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GITHUB_CLIENT_ID` | Yes | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | Yes | GitHub OAuth App client secret |
| `GROQ_API_KEY` | Yes* | Groq API key (*or `GEMINI_API_KEY`) |
| `NEO4J_PASSWORD` | Yes | Neo4j password (must not be the default) |
| `TOKEN_ENCRYPTION_KEY` | Yes | Fernet key for encrypting stored GitHub tokens |
| `DATABASE_URL` | No | PostgreSQL connection string (defaults to local Docker) |
| `NEO4J_URI` | No | Neo4j bolt URI (default: `bolt://localhost:7687`) |
| `QDRANT_URL` | No | Qdrant REST URL (default: `http://localhost:6333`) |
| `REDIS_URL` | No | Redis URL (default: `redis://localhost:6379/0`) |
| `WEBHOOK_SECRET` | No | Secret for validating GitHub webhook payloads |
| `FRONTEND_URL` | No | CORS allowed origin (default: `http://localhost:3000`) |
| `NEXT_PUBLIC_API_URL` | No | Frontend API base URL (default: `http://localhost:8000`) |

---

## API overview

```
POST /ingest                  Ingest a GitHub repo into the knowledge graph
GET  /graph/                  Full graph (nodes + edges) for the active repo
GET  /graph/service/{name}    Subgraph filtered to one service

POST /rag/ask                 RAG Q&A — question → LLM answer with sources
POST /rag/chat                Multi-turn RAG chat
POST /rag/sync                Sync Neo4j graph into the vector store

GET  /impact/blast-radius     Upstream + downstream blast radius for a node
GET  /impact/chain            Shortest dependency path between two nodes
GET  /impact/summary          LLM-powered risk assessment for a change
POST /impact/whatif           Run a what-if scenario simulation
POST /impact/spec-diff        Compare two OpenAPI specs for breaking changes

POST /scaffold/design         Natural language → architecture blueprint
POST /scaffold/generate       Blueprint → full file tree + downloadable zip
GET  /scaffold/download/{id}  Download the generated zip

GET  /auth/github             Start GitHub OAuth flow
GET  /auth/github/callback    OAuth callback
GET  /health                  Service health check
```

---

## What-if scenario types

| Scenario | What it simulates |
|---|---|
| `deprecate_endpoint` | Mark an endpoint deprecated and forecast downstream impact |
| `remove_endpoint` | Completely remove an endpoint |
| `change_field_type` | Change a field's data type |
| `remove_schema` | Remove a data model |
| `add_schema` | Add a new schema and forecast consumer impact |
| `add_endpoint` | Add a new endpoint and see which services benefit |
| `change_endpoint_signature` | Change request/response structure |

---

## CI

GitHub Actions runs on every push to `main` and on all pull requests:

- **Backend** — ruff lint, mypy type check, pytest
- **Frontend** — ESLint, TypeScript type check
- **Docker** — builds both `cortex-backend` and `cortex-frontend` images

---

## Project structure

```
cortex/
├── backend/
│   ├── api/            # FastAPI routers (auth, graph, rag, impact, scaffold, …)
│   ├── services/       # Business logic (ingestion, RAG, what-if, scaffold, …)
│   ├── core/           # Config, database init
│   └── tests/
├── frontend/
│   └── src/
│       ├── app/        # Next.js app router pages
│       └── components/ # React components (GraphView, …)
└── docker-compose.yml  # Local dev databases
```

---

## License

MIT
