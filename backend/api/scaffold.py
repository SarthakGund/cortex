"""
Scaffold API Router
===================
POST /scaffold/design    – Phase 1: natural language → architecture blueprint
POST /scaffold/generate  – Phase 2: blueprint → full file tree + downloadable zip
GET  /scaffold/download  – Download the latest generated zip (by job_id)
"""

import base64
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from services.scaffold_service import design_architecture, generate_scaffold

router = APIRouter(prefix="/scaffold", tags=["Scaffold"])

# ── In-memory job store (fine for hackathon) ──────────────────────────────────
# key = job_id  value = {"zip": bytes, "file_tree": dict, "blueprint": dict}
_jobs: dict[str, dict] = {}


# ── Models ────────────────────────────────────────────────────────────────────

class DesignRequest(BaseModel):
    requirements: str = Field(..., min_length=20, max_length=5000,
        description="Natural language description of the system to build")
    reference_service: Optional[str] = Field(None,
        description="Name of an already-ingested service to use as architectural template")
    reference_repo_url: Optional[str] = Field(None,
        description="GitHub repo URL to analyse as structural reference (e.g. https://github.com/org/repo)")


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
    zip_base64: str   # base64 encoded zip for direct download in-browser
    system_name: str


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/design", response_model=Blueprint)
async def design(request: DesignRequest):
    """
    Phase 1 – Architecture Design.

    Takes natural language requirements and optionally the name of a reference
    service already ingested into the knowledge graph (used as template context).

    Returns a structured blueprint with:
    - Services (name, role, stack, DB, endpoints, ports)
    - Communication protocols (REST / gRPC / events)
    - API gateway config
    - Rationale for every decision
    """
    try:
        blueprint = design_architecture(
            requirements=request.requirements,
            reference_service=request.reference_service,
            reference_repo_url=request.reference_repo_url,
        )
        return blueprint
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Design failed: {e}")


@router.post("/generate", response_model=GenerateResponse)
async def generate(request: GenerateRequest):
    """
    Phase 2 – Infrastructure Scaffolding.

    Takes the blueprint from /scaffold/design and generates:
    - Main application stub per service (LLM-generated, production-quality)
    - Dockerfile per service
    - Requirements / package.json per service
    - docker-compose.yml for the full system
    - NGINX API gateway config
    - Kubernetes Deployment + Service + Ingress manifests
    - README with architecture overview

    Returns the full file tree + a base64-encoded zip for direct download.
    """
    import uuid
    try:
        file_tree, zip_bytes = generate_scaffold(request.blueprint)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scaffolding failed: {e}")

    job_id = str(uuid.uuid4())[:8]
    system_name = request.blueprint.get("system_name", "system")

    _jobs[job_id] = {
        "zip": zip_bytes,
        "file_tree": file_tree,
        "blueprint": request.blueprint,
    }

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
async def download_zip(job_id: str):
    """
    Download the scaffolded project as a zip file.
    """
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found. Generate first via POST /scaffold/generate")

    system_name = job["blueprint"].get("system_name", "scaffold")
    filename = system_name.lower().replace(" ", "-") + ".zip"

    return Response(
        content=job["zip"],
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
