import logging
import time
import uuid
from collections import defaultdict

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api import ingestion, webhook, rag, auth
from api import github, scaffold, graph, impact, events, snapshots, health, repos
from core.config import settings
from core.database import init_db

# ── Structured JSON Logging ───────────────────────────────────────────────────

try:
    from pythonjsonlogger import jsonlogger
    _handler = logging.StreamHandler()
    _handler.setFormatter(jsonlogger.JsonFormatter(
        fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    ))
    logging.root.handlers = [_handler]
    logging.root.setLevel(logging.INFO)
except ImportError:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

logger = logging.getLogger(__name__)

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Cortex - Intelligent Architecture & Knowledge Platform",
    description="API for the Living Knowledge Graph and Automated Staff Engineer",
    version="2.0.0",
)

# ── CORS — restrict to configured frontend origin only ────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

# ── Security response headers ─────────────────────────────────────────────────

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    return response

# ── Request-ID middleware ─────────────────────────────────────────────────────

@app.middleware("http")
async def inject_request_id(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response

# ── Global rate limiter (per-IP, in-memory) ───────────────────────────────────
# For multi-process prod, replace with Redis-backed slowapi.

_ip_request_log: dict[str, list[float]] = defaultdict(list)
_RATE_WINDOW_SECONDS = 60
_RATE_LIMIT_PER_MINUTE = 120          # general endpoints
_EXPENSIVE_PATHS = ("/ingest", "/scaffold/design", "/scaffold/generate", "/rag/ask", "/impact/whatif")
_EXPENSIVE_LIMIT_PER_MINUTE = 15      # expensive LLM / graph endpoints


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    client_ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    window_start = now - _RATE_WINDOW_SECONDS

    timestamps = _ip_request_log[client_ip]
    # Evict stale timestamps
    _ip_request_log[client_ip] = [t for t in timestamps if t > window_start]
    count = len(_ip_request_log[client_ip])

    path = request.url.path
    limit = (
        _EXPENSIVE_LIMIT_PER_MINUTE
        if any(path.startswith(p) for p in _EXPENSIVE_PATHS)
        else _RATE_LIMIT_PER_MINUTE
    )

    if count >= limit:
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many requests. Please slow down."},
            headers={"Retry-After": "60"},
        )

    _ip_request_log[client_ip].append(now)
    return await call_next(request)

# ── Startup ───────────────────────────────────────────────────────────────────

def _validate_env() -> None:
    """Fail fast on startup if critical env vars are missing."""
    missing: list[str] = []
    if not settings.GITHUB_CLIENT_ID:
        missing.append("GITHUB_CLIENT_ID")
    if not settings.GITHUB_CLIENT_SECRET:
        missing.append("GITHUB_CLIENT_SECRET")
    if not settings.GROQ_API_KEY and not settings.GEMINI_API_KEY:
        missing.append("GROQ_API_KEY or GEMINI_API_KEY (at least one required)")
    if not settings.NEO4J_PASSWORD or settings.NEO4J_PASSWORD == "password":
        missing.append("NEO4J_PASSWORD (must not be the default 'password')")
    if missing:
        raise RuntimeError(
            "Missing or insecure required environment variables:\n  - "
            + "\n  - ".join(missing)
            + "\nCheck backend/.env.example for reference."
        )


@app.on_event("startup")
async def startup_event():
    logger.info("Validating environment variables...")
    _validate_env()
    logger.info("Initializing database tables...")
    init_db()
    logger.info("Startup complete.")

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(ingestion.router)
app.include_router(github.router)
app.include_router(webhook.router)
app.include_router(rag.router)
app.include_router(auth.router)
app.include_router(scaffold.router)
app.include_router(graph.router)
app.include_router(impact.router)
app.include_router(events.router)
app.include_router(snapshots.router)
app.include_router(health.router)
app.include_router(repos.router)

# ── Root ──────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"message": "Cortex API online. Living Knowledge Graph is active."}
