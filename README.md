# Cortex — Intelligent Architecture & Knowledge Platform

Cortex is an **Automated Staff Engineer** and **Living Documentation** platform that continuously reads your codebase, builds a dynamic knowledge graph, and acts as an intelligent assistant for architecture, onboarding, and change analysis.

---

## Features

| Feature | Description |
|---------|-------------|
| 🧠 **Living Knowledge Graph** | Continuously ingests code, APIs, and schemas to build a dynamic, versioned dependency map powered by Neo4j |
| 💬 **RAG-Powered Q&A** | Ask natural-language questions about your codebase and get precise answers with file paths and code references |
| 💥 **Impact Analysis** | Predicts the blast radius of proposed changes by traversing the knowledge graph |
| 📝 **Auto-Documentation** | Automatically generates and updates ADRs, service specs, and API docs when code changes |
| 🏗️ **Code Scaffolding** | Generates production-ready boilerplate: microservices, Dockerfiles, Kubernetes manifests, and more |
| ⏱️ **Time Machine** | Scrub through a historical timeline of your architecture to replay incidents and model future states |
| 🔌 **GitHub Integration** | Webhook-driven ingestion that updates the knowledge graph on every push |
| 🩺 **Health Dashboard** | Visualises documentation coverage, orphaned services, and stale specs |

---

## Tech Stack

**Backend**
- [FastAPI](https://fastapi.tiangolo.com/) + [Uvicorn](https://www.uvicorn.org/) (Python 3.12+)
- [Neo4j](https://neo4j.com/) — Living Knowledge Graph
- [Qdrant](https://qdrant.tech/) — Vector database for semantic search
- [ChromaDB](https://www.trychroma.com/) — Embedded vector store for RAG
- [PostgreSQL](https://www.postgresql.org/) — App state & graph snapshots
- [Redis](https://redis.io/) + [Celery](https://docs.celeryq.dev/) — Async task queue
- [LangChain](https://python.langchain.com/) + [Google Gemini](https://ai.google.dev/) — LLM orchestration
- [Sentence Transformers](https://www.sbert.net/) — Code & doc embeddings
- [Tree-Sitter](https://tree-sitter.github.io/) — Multi-language AST parsing (Python, TypeScript, JavaScript)
- [SQLAlchemy](https://www.sqlalchemy.org/) — ORM for relational data

**Frontend**
- [Next.js 16](https://nextjs.org/) + [React 19](https://react.dev/) (TypeScript)
- [React Flow](https://reactflow.dev/) + [D3.js](https://d3js.org/) — Interactive graph visualisation
- [Tailwind CSS 4](https://tailwindcss.com/) — Styling
- [Framer Motion](https://www.framer.com/motion/) — Animations

**Infrastructure**
- Docker & Docker Compose

---

## Prerequisites

- **Python** 3.12+
- **Node.js** 18+ and npm
- **Docker** & **Docker Compose**
- **[uv](https://github.com/astral-sh/uv)** (recommended Python package manager) — `pip install uv`

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/SarthakGund/cortex.git
cd cortex
```

### 2. Start infrastructure services

```bash
docker-compose up -d
```

This starts Neo4j, Qdrant, PostgreSQL, and Redis. Wait ~30 seconds for all services to be healthy.

### 3. Configure environment variables

Create a `.env` file inside the `backend/` directory (use the table in [Configuration](#configuration) as a reference):

```bash
cp backend/.env.example backend/.env   # if the example file exists, otherwise create it manually
```

At a minimum set `GEMINI_API_KEY` to enable LLM features.

### 4. Start the backend

```bash
cd backend
uv sync                          # install Python dependencies
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Interactive API docs are available at **http://localhost:8000/docs**.

### 5. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## Configuration

All backend configuration is loaded from environment variables (see `backend/core/config.py`).

| Variable | Default | Description |
|----------|---------|-------------|
| `NEO4J_URI` | `bolt://localhost:7687` | Neo4j connection URI |
| `NEO4J_USER` | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | `password` | Neo4j password |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant REST endpoint |
| `DATABASE_URL` | `postgresql://postgres:password@localhost:5432/spit_db` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection string |
| `GEMINI_API_KEY` | — | **Required** for RAG & scaffolding |
| `GITHUB_TOKEN` | — | Increases GitHub API rate limit |
| `GITHUB_CLIENT_ID` | — | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | — | GitHub OAuth app client secret |
| `WEBHOOK_SECRET` | — | Secret used to verify GitHub webhook payloads |
| `FRONTEND_URL` | `http://localhost:3000` | Allowed CORS origin |

---

## API Overview

The FastAPI backend exposes the following route groups:

| Prefix | Description |
|--------|-------------|
| `GET /health` | Service health check |
| `GET /health/dashboard` | Full documentation-health metrics |
| `GET /graph/full` | Fetch the entire knowledge graph |
| `GET /graph/service/{name}` | Fetch subgraph for a specific service |
| `POST /rag/query` | Semantic Q&A against the knowledge graph |
| `POST /ingestion/ingest` | Manually trigger repo ingestion |
| `GET /webhook/commits` | List tracked commits |
| `POST /webhook/` | GitHub webhook receiver |
| `POST /impact/analyze` | Predict blast radius of a proposed change |
| `POST /scaffold/design` | Generate architecture + boilerplate from requirements |
| `GET /snapshots` | List historical graph snapshots |
| `GET /timeline` | Architecture timeline events |

Full interactive documentation: **http://localhost:8000/docs**

---

## Frontend Pages

| Route | Description |
|-------|-------------|
| `/` | Home — RAG chat interface & commit history |
| `/graph` | Interactive knowledge graph visualisation (React Flow) |
| `/health` | System health & documentation coverage dashboard |
| `/impact` | Change impact / blast-radius analyser |
| `/search` | Semantic code search |
| `/scaffold` | Code generation wizard |
| `/timeline` | Temporal architecture browser ("Time Machine") |

---

## Project Structure

```
cortex/
├── backend/                    # Python FastAPI application
│   ├── main.py                 # App entry point & router registration
│   ├── api/                    # Route handlers
│   ├── services/               # Business logic (graph, RAG, scaffold, …)
│   ├── core/
│   │   ├── config.py           # Settings from environment variables
│   │   ├── database.py         # SQLAlchemy engine & session factory
│   │   ├── models.py           # ORM models (Commit, GraphSnapshot)
│   │   └── parsers/            # Tree-Sitter AST parsers (Python, TypeScript)
│   ├── requirements.txt        # Pinned Python dependencies
│   └── pyproject.toml          # Project metadata (uv)
├── frontend/                   # Next.js TypeScript application
│   ├── src/app/                # Next.js App Router pages
│   └── src/components/         # Shared React components
├── docs/
│   └── SYSTEM_DOCS.md          # Auto-generated architecture documentation
├── docker-compose.yml          # Infrastructure services
├── PROJECT_SPEC.md             # Full product specification
└── QUICKSTART.md               # Abbreviated getting-started guide
```

---

## Running Tests

```bash
# Backend — API smoke tests
cd backend
python test_api.py

# Backend — database tests
python test_commits.py
```

---

## Ingesting a Repository

Once the backend is running, point Cortex at any GitHub repository:

```bash
curl -X POST http://localhost:8000/ingestion/ingest \
  -H "Content-Type: application/json" \
  -d '{"repo_url": "https://github.com/your-org/your-repo", "service_name": "my-service"}'
```

Cortex will clone the repository, parse all Python and TypeScript/JavaScript files, update the Neo4j knowledge graph, and embed the code for semantic search.

---

## Architecture Overview

```
                         ┌──────────────────────┐
  GitHub Webhook ───────▶│  Ingestion Service   │
                         │  (Tree-Sitter AST)   │
                         └────────┬─────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
         ┌─────────┐        ┌──────────┐        ┌──────────┐
         │  Neo4j  │        │ ChromaDB │        │ Qdrant   │
         │  Graph  │        │ Vectors  │        │ Vectors  │
         └────┬────┘        └────┬─────┘        └────┬─────┘
              │                  │                   │
              └──────────────────┼───────────────────┘
                                 │
                         ┌───────▼────────┐
                         │  FastAPI + LLM │  ◀─── Developer Q&A
                         │  (Gemini/RAG)  │  ◀─── Impact Analysis
                         └───────┬────────┘  ◀─── Scaffolding
                                 │
                         ┌───────▼────────┐
                         │  Next.js UI    │
                         │  (React Flow)  │
                         └────────────────┘
```

---

## Contributing

1. Fork the repository and create a feature branch.
2. Make your changes, add tests where appropriate.
3. Open a pull request — Cortex will eventually review its own PRs! 🤖

---

## License

This project does not yet have a license file. Please contact the maintainers before using it in a commercial product.
