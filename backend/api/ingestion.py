from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from services.ingestion_service import ingestion_service

router = APIRouter(prefix="/ingest", tags=["Ingestion"])

class IngestRequest(BaseModel):
    repo_url: str
    branch: str = "main"

@router.post("/")
async def trigger_ingestion(request: IngestRequest, background_tasks: BackgroundTasks):
    """Ingest a repository by cloning it locally (requires git)."""
    background_tasks.add_task(ingestion_service.ingest_repository, request.repo_url)
    return {"message": f"Ingestion started for {request.repo_url}", "status": "processing"}

@router.post("/github")
async def trigger_github_ingestion(request: IngestRequest, background_tasks: BackgroundTasks):
    """Ingest a repository via the GitHub API — no local clone required."""
    background_tasks.add_task(
        ingestion_service.ingest_from_github, request.repo_url, request.branch
    )
    return {
        "message": f"GitHub ingestion started for {request.repo_url} (branch: {request.branch})",
        "status": "processing",
    }
