# Deployment Readiness Audit — Cortex

> **Status:** Pre-deployment review. All items below must be resolved before the app goes live.
> PostgreSQL will be hosted on AWS RDS — local SQLite is dev-only and not a blocker.

---

## Section 1 — Critical Blockers

These must be fixed before any deployment attempt.

### 1. Secrets Committed to Git — DONE
- **File:** `backend/.env`
- A live Groq API key (`gsk_...`), a real GitHub PAT (`github_pat_11BELLF6I...`), and GitHub OAuth client credentials are all committed in plaintext.
- **Action:**
  1. Rotate all exposed tokens immediately (Groq dashboard, GitHub → Settings → Developer settings → PATs, GitHub OAuth app).
  2. Add `backend/.env` to `.gitignore`.
  3. Create `backend/.env.example` with placeholder values only.

### 2. CORS Wildcard + Credentials — DONE
- **File:** [`backend/main.py:14-21`](backend/main.py#L14-L21)
- `allow_origins=["*"]` combined with `allow_credentials=True` is an insecure combination that allows any website to make credentialed cross-origin requests to the API.
- **Action:** Replace `"*"` with `[settings.FRONTEND_URL]` (already defined in config).

### 3. No Dockerfiles — Cannot Deploy — DONE
- **Missing:** `backend/Dockerfile`, `frontend/Dockerfile`
- The current `docker-compose.yml` only starts Neo4j. The backend runs with `uvicorn --reload` (dev flag) and the frontend with `npm run dev` — neither is deployable.
- **Action:**
  - `backend/Dockerfile`: Python 3.12 + uv, production entrypoint via gunicorn: `gunicorn -k uvicorn.workers.UvicornWorker -w 4 main:app`
  - `frontend/Dockerfile`: Node 20 LTS, `npm run build && npm start`
  - Extend `docker-compose.yml` to add `redis` and `qdrant` for local dev (AWS RDS handles postgres in prod).

### 4. OAuth Token Exposed in URL Query Parameter — DONE
- **File:** [`backend/api/auth.py:42`](backend/api/auth.py#L42)
- The GitHub access token is returned as `?token=xxx` in a redirect URL — this gets written to server access logs, browser history, and referrer headers.
- **Action:** Set the token in an `httpOnly`, `SameSite=Lax` cookie on the redirect response instead. Update [`frontend/src/app/context/AuthContext.tsx`](frontend/src/app/context/AuthContext.tsx) to read from the cookie rather than `localStorage` and drop the URL param parsing.

### 5. No Startup Validation of Required Env Vars — DONE
- **File:** [`backend/core/config.py`](backend/core/config.py)
- Missing API keys are only discovered at runtime the moment a feature is first used. A missing `GROQ_API_KEY` silently disables LLM features with no visible error.
- **Action:** Add a FastAPI `startup` event in `main.py` that checks all required env vars (at minimum: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `NEO4J_PASSWORD`, `GROQ_API_KEY` or `GEMINI_API_KEY`) and raises `RuntimeError` with a clear message if any are absent.

---

## Section 2 — Security Hardening

### 6. Multiple Endpoints Have No Auth Guard — DONE
- **Files:** [`backend/api/github.py`](backend/api/github.py), [`backend/api/events.py`](backend/api/events.py), [`backend/api/scaffold.py`](backend/api/scaffold.py), [`backend/api/ingestion.py`](backend/api/ingestion.py)
- The following endpoints accept requests without any authentication:
  - `GET /github/tree` and `GET /github/file`
  - `GET /events/timeline`, `POST /events/record`, `GET /events/snapshot`
  - `POST /scaffold/design`, `POST /scaffold/generate`, `GET /scaffold/download`
  - `POST /ingest/` (legacy) and `POST /ingest/multi`
- **Action:** Add `require_user(request)` as a FastAPI dependency at the router level for each of these modules so every route inherits it automatically.

### 7. Webhook Signature Verification Is Optional — DONE
- **File:** [`backend/api/webhook.py:16-17`](backend/api/webhook.py#L16-L17)
- If `WEBHOOK_SECRET` is not set, HMAC verification is silently skipped — anyone can POST fake GitHub events.
- **Action:** Make verification mandatory. If `WEBHOOK_SECRET` is missing, raise `RuntimeError` at startup (add to the check in item 5). Return `HTTP 403` on signature mismatch.

### 8. Rate Limiting — Not Implemented — DONE
- No rate limiting exists on any endpoint. Expensive operations like `/ingest/github` (clones and parses entire repos), `/rag/ask`, and `/impact/whatif` (multi-hop graph traversal) can be called in tight loops with no throttling.
- **Action:** Add [`slowapi`](https://pypi.org/project/slowapi/) middleware to `main.py`. Suggested limits:
  - `/ingest/*` — 10 requests / minute / IP
  - `/rag/*`, `/impact/*` — 30 requests / minute / IP
  - `/scaffold/*` — 20 requests / minute / IP
  - Read-only endpoints — 120 requests / minute / IP

### 9. No Security Response Headers — DONE
- Responses carry no security headers, leaving the frontend exposed to clickjacking, MIME sniffing, and other client-side attacks.
- **Action:** Add the [`secure`](https://pypi.org/project/secure/) pypi package and register it as middleware in `main.py`. This covers `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy`, and `Strict-Transport-Security` in one call.

### 10. Shared Global GitHub Token Across All Users — DONE
- **File:** [`backend/api/github.py`](backend/api/github.py)
- `/github/tree` and `/github/file` use the single app-wide `settings.github_token` PAT. Any authenticated user can trigger requests under the app's identity and access repos it can see.
- **Action:** Retrieve the authenticated user's own token from the DB (via `require_user`) and pass it into the GitHub API calls instead.

### 11. GitHub Tokens Stored in Plaintext (remaining) — DONE
- **File:** [`backend/core/models.py`](backend/core/models.py) — `User.token` column is plain `TEXT`.
- **Action:** Encrypt the token with `cryptography.fernet.Fernet` (symmetric key stored as env var `TOKEN_ENCRYPTION_KEY`) before writing to DB. Decrypt on read. Add a migration (Alembic) to re-encrypt existing rows.

---

## Section 3 — Observability & Reliability

### 12. No Structured Logging — Only print() — DONE
- **Files:** [`backend/services/llm_service.py`](backend/services/llm_service.py), [`backend/api/rag.py`](backend/api/rag.py), [`backend/api/webhook.py`](backend/api/webhook.py), [`backend/services/ingestion_service.py`](backend/services/ingestion_service.py), [`backend/main.py`](backend/main.py), and others.
- The entire backend uses `print()` for all output. There are no log levels, no JSON-structured output, and no correlation IDs to trace a request across services.
- **Action:**
  1. Configure Python's `logging` module with a JSON formatter (e.g., `python-json-logger`) in `main.py`.
  2. Replace every `print(...)` with `logger = logging.getLogger(__name__)` and appropriate level calls (`logger.info`, `logger.warning`, `logger.exception`).
  3. Add a `request_id` middleware that generates a UUID per request and injects it into the log context.

### 13. Frontend Console Logs in Production Paths (remaining) — DONE
- **Files:** [`frontend/src/app/page.tsx:997`](frontend/src/app/page.tsx#L997), [`frontend/src/app/search/page.tsx:173`](frontend/src/app/search/page.tsx#L173), and several others across impact and timeline pages.
- **Action:** Remove debug `console.log` calls or gate them: `if (process.env.NODE_ENV === "development") console.log(...)`.

### 14. Silent Exception Blocks — DONE
- **File:** [`backend/api/impact.py:264-265`](backend/api/impact.py#L264) — `except Exception: pass`
- **Files:** [`backend/services/ingestion_service.py:40-41`](backend/services/ingestion_service.py#L40) and [`:70-71`](backend/services/ingestion_service.py#L70) — `except Exception: return ""`
- These swallow errors with no log output, making failures invisible in production.
- **Action:** Replace each with `except Exception as e: logger.exception("brief context description")` and return a meaningful value or re-raise as appropriate.

### 15. Health / Readiness Probes Are Shallow — DONE
- **File:** [`backend/api/health.py`](backend/api/health.py)
- The `/health` endpoint exists but doesn't verify that Neo4j, Qdrant, or the database are actually reachable. Kubernetes / ECS readiness probes will report healthy even when the app can't serve traffic.
- **Action:**
  - `GET /health/live` — returns `200 {"status": "ok"}` always (liveness).
  - `GET /health/ready` — attempts a lightweight ping of Neo4j (Bolt ping), Qdrant (`GET /healthz`), and DB (connection check); returns `503` if any fail.

### 16. No Database Migrations (Alembic) (remaining) — DONE
- **File:** [`backend/core/database.py`](backend/core/database.py)
- Tables are created with `Base.metadata.create_all(bind=engine)` on startup — a raw overwrite with no versioning. Any schema change will require manual intervention or will silently skip on existing DBs.
- **Action:**
  1. `pip install alembic` and run `alembic init alembic` in `backend/`.
  2. Generate an initial migration from existing models.
  3. Replace `create_all()` in startup with `alembic upgrade head`.
  4. Add the migration step to the Docker entrypoint.

---

## Section 4 — Code Quality & Completeness

### 17. Hardcoded `localhost` Fallbacks in Frontend — DONE
- **Files:** [`frontend/src/app/page.tsx:34`](frontend/src/app/page.tsx#L34), [`scaffold/page.tsx:23`](frontend/src/app/scaffold/page.tsx#L23), [`search/page.tsx:26`](frontend/src/app/search/page.tsx#L26), [`impact/page.tsx:14`](frontend/src/app/impact/page.tsx#L14), [`health/page.tsx:33`](frontend/src/app/health/page.tsx#L33), and 8+ more pages.
- Every page independently constructs the base URL with a `?? "http://localhost:8000"` fallback.
- **Action:** Create `frontend/src/lib/api.ts` with a single exported `API_BASE` constant. In production builds, throw if `NEXT_PUBLIC_API_URL` is not set. All pages import from this one location.

### 18. In-Memory Scaffold Job Store — DONE
- **File:** [`backend/api/scaffold.py:20-22`](backend/api/scaffold.py#L20)
- `_jobs: dict[str, dict] = {}` — all generated zip files are lost on server restart, no cleanup, and this is not safe under multiple gunicorn workers.
- **Action:** Store job output in Redis (already declared as a dependency) with a 1-hour TTL. Key: `scaffold:job:<job_id>`, value: serialised zip bytes.

### 19. Incomplete Scaffold Dockerfile Template (remaining) — DONE
- **File:** [`backend/services/scaffold_service.py:326`](backend/services/scaffold_service.py#L326)
- The fallback Dockerfile generator returns `# TODO: add build steps` as a placeholder.
- **Action:** Either implement proper language-specific templates or raise a clear `HTTP 422 Unprocessable Entity` with `"Unsupported language/framework combination"` rather than returning a broken file.

### 20. No Test Coverage (remaining) — DONE
- Only `backend/test_api.py` exists and it's a manual smoke test, not an automated suite.
- **Action:** Add pytest-based integration tests for:
  - Auth flow (mock GitHub OAuth callback, assert cookie is set)
  - Repo ingestion (mock GitHub API responses)
  - RAG query (mock Qdrant + LLM responses)
  - Impact analysis (mock Neo4j responses)
- Target: cover all 11 router modules with at least one happy-path and one error-path test each.

### 21. No CI/CD Pipeline (remaining) — DONE
- No GitHub Actions workflows exist.
- **Action:** Add `.github/workflows/ci.yml` that on every PR:
  1. Runs `ruff` / `mypy` (backend linting)
  2. Runs `pytest` against the test suite
  3. Runs `eslint` + `tsc --noEmit` (frontend)
  4. Builds the Docker images to confirm they compile

---

## Section 5 — Infrastructure Gaps

### 22. docker-compose.yml Missing Services — DONE
- **File:** [`docker-compose.yml`](docker-compose.yml)
- Only Neo4j is containerised. Redis (`REDIS_URL`) and Qdrant (`QDRANT_URL`) are referenced throughout the config but must be started manually.
- **Action:** Add to `docker-compose.yml`:
  ```yaml
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
  qdrant:
    image: qdrant/qdrant:latest
    ports: ["6333:6333", "6334:6334"]
    volumes: ["qdrant_data:/qdrant/storage"]
  ```

### 23. Backend Starts in Development Mode — DONE
- **File:** [`QUICKSTART.md`](QUICKSTART.md)
- The documented start command is `uvicorn main:app --reload` — `--reload` enables filesystem watching and is a development-only flag that should never run in production.
- **Action:** Production entrypoint: `gunicorn -k uvicorn.workers.UvicornWorker -w 4 -b 0.0.0.0:8000 main:app`. Keep `--reload` only in the dev docker-compose override.

### 24. Frontend Starts in Development Mode — DONE
- Same issue: `npm run dev` is dev-only — no bundle optimisation, larger payloads, slower cold start.
- **Action:** Production Dockerfile final step: `RUN npm run build` followed by `CMD ["npm", "start"]`.