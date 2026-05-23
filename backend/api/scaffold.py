"""
Scaffold API Router
===================
POST /scaffold/design    – Phase 1: natural language → architecture blueprint
POST /scaffold/generate  – Phase 2: blueprint → full file tree + downloadable zip
GET  /scaffold/download  – Download the generated zip (by job_id)
"""

import base64
import json
import logging
import uuid
from typing import Optional

import redis as redis_lib
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from core.config import settings
from services.scaffold_service import design_architecture, generate_scaffold
from services.user_repo_service import user_repo_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/scaffold", tags=["Scaffold"])

# ── Redis-backed job store ────────────────────────────────────────────────────
# Jobs expire after 1 hour — avoids memory growth from uncollected downloads.

_JOB_TTL_SECONDS = 3600
_redis: Optional[redis_lib.Redis] = None


def _get_redis() -> redis_lib.Redis:
    global _redis
    if _redis is None:
        _redis = redis_lib.from_url(settings.REDIS_URL, decode_responses=False)
    return _redis


def _save_job(job_id: str, zip_bytes: bytes, file_tree: dict, blueprint: dict) -> None:
    payload = json.dumps({
        "file_tree": file_tree,
        "blueprint": blueprint,
    }).encode()
    r = _get_redis()
    r.setex(f"scaffold:zip:{job_id}", _JOB_TTL_SECONDS, zip_bytes)
    r.setex(f"scaffold:meta:{job_id}", _JOB_TTL_SECONDS, payload)


def _load_job(job_id: str) -> Optional[dict]:
    r = _get_redis()
    zip_bytes = r.get(f"scaffold:zip:{job_id}")
    meta_bytes = r.get(f"scaffold:meta:{job_id}")
    if not zip_bytes or not meta_bytes:
        return None
    meta = json.loads(meta_bytes.decode())
    return {"zip": zip_bytes, **meta}


# ── Models ────────────────────────────────────────────────────────────────────

class DesignRequest(BaseModel):
    requirements: str = Field(..., min_length=20, max_length=5000,
        description="Natural language description of the system to build")
    reference_service: Optional[str] = Field(None,
        description="Name of an already-ingested service to use as architectural template")
    reference_repo_url: Optional[str] = Field(None,
        description="GitHub repo URL to analyse as structural reference")


class ServiceBlueprint(BaseModel):
    name: str
    role: str
    language: str
    framework: str
    database: dict
    endpoints: list[dict]
    port: int
    communicates_with: list[dict]
    env_vars: list[str]
    responsibilities: list[str] = []


class Blueprint(BaseModel):
    system_name: str
    summary: str
    rationale: str
    services: list[ServiceBlueprint]
    api_gateway: dict
    message_queues: list[dict] = []
    global_decisions: str = ""
    directory_structure_notes: str = ""


class GenerateRequest(BaseModel):
    blueprint: dict = Field(..., description="Blueprint object returned by /scaffold/design")


class FileNode(BaseModel):
    path: str
    content: str
    size: int


class GenerateResponse(BaseModel):
    job_id: str
    file_count: int
    files: list[FileNode]
    zip_base64: str
    system_name: str


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/design", response_model=Blueprint)
async def design(request: Request, body: DesignRequest):
    """Phase 1 – Architecture Design."""
    user_repo_service.require_user(request)
    try:
        blueprint = design_architecture(
            requirements=body.requirements,
            reference_service=body.reference_service,
            reference_repo_url=body.reference_repo_url,
        )
        return blueprint
    except Exception as e:
        logger.exception("Scaffold design failed")
        raise HTTPException(status_code=500, detail=f"Design failed: {e}")


@router.post("/generate", response_model=GenerateResponse)
async def generate(request: Request, body: GenerateRequest):
    """Phase 2 – Infrastructure Scaffolding."""
    user_repo_service.require_user(request)
    try:
        file_tree, zip_bytes = generate_scaffold(body.blueprint)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Scaffold generation failed")
        raise HTTPException(status_code=500, detail=f"Scaffolding failed: {e}")

    job_id = str(uuid.uuid4())[:8]
    system_name = body.blueprint.get("system_name", "system")

    try:
        _save_job(job_id, zip_bytes, file_tree, body.blueprint)
    except Exception:
        logger.exception("Failed to persist scaffold job %s to Redis", job_id)
        raise HTTPException(status_code=500, detail="Could not store scaffold job")

    files = [
        FileNode(path=path, content=content, size=len(content))
        for path, content in file_tree.items()
    ]

    return GenerateResponse(
        job_id=job_id,
        file_count=len(files),
        files=files,
        zip_base64=base64.b64encode(zip_bytes).decode(),
        system_name=system_name,
    )


@router.get("/download/{job_id}")
async def download_zip(job_id: str, request: Request):
    """Download the scaffolded project as a zip file."""
    user_repo_service.require_user(request)
    try:
        job = _load_job(job_id)
    except Exception:
        logger.exception("Failed to load scaffold job %s from Redis", job_id)
        raise HTTPException(status_code=500, detail="Job store unavailable")

    if not job:
        raise HTTPException(
            status_code=404,
            detail="Job not found or expired. Generate first via POST /scaffold/generate",
        )

    system_name = job["blueprint"].get("system_name", "scaffold")
    filename = system_name.lower().replace(" ", "-") + ".zip"

    return Response(
        content=job["zip"],
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
