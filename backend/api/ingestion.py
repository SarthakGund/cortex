from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from services.ingestion_service import ingestion_service

router = APIRouter(prefix="/ingest", tags=["Ingestion"])

from typing import Optional

class IngestRequest(BaseModel):
    repo_url: str
    branch: str = "main"
    github_token: Optional[str] = None

class MultiRepoRequest(BaseModel):
    repos: list[IngestRequest]

@router.post("/")
async def trigger_ingestion(request: IngestRequest, background_tasks: BackgroundTasks):
    # In a real system, this would trigger a Celery task
    background_tasks.add_task(ingestion_service.ingest_repository, request.repo_url, request.github_token)
    """Ingest a repository by cloning it locally (requires git)."""
    background_tasks.add_task(ingestion_service.ingest_repository, request.repo_url)
    return {"message": f"Ingestion started for {request.repo_url}", "status": "processing"}

@router.post("/github")
async def trigger_github_ingestion(request: IngestRequest, background_tasks: BackgroundTasks):
    """Ingest a repository via the GitHub API — no local clone required. Supports incremental updates."""
    background_tasks.add_task(
        ingestion_service.ingest_from_github, request.repo_url, request.branch
    )
    return {
        "message": f"GitHub ingestion started for {request.repo_url} (branch: {request.branch})",
        "status": "processing",
    }

@router.post("/multi")
async def trigger_multi_repo_ingestion(request: MultiRepoRequest, background_tasks: BackgroundTasks):
    """Ingest multiple repositories and discover cross-repo dependencies."""
    repos = [{"repo_url": r.repo_url, "branch": r.branch} for r in request.repos]
    background_tasks.add_task(ingestion_service.ingest_multiple_repos, repos)
    return {
        "message": f"Multi-repo ingestion started for {len(repos)} repositories",
        "status": "processing",
        "repos": [r.repo_url for r in request.repos],
    }
