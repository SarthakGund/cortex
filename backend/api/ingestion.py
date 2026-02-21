from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from services.ingestion_service import ingestion_service

router = APIRouter(prefix="/ingest", tags=["Ingestion"])

from typing import Optional

class IngestRequest(BaseModel):
    repo_url: str
    branch: str = "main"
    github_token: Optional[str] = None

@router.post("/")
async def trigger_ingestion(request: IngestRequest, background_tasks: BackgroundTasks):
    # In a real system, this would trigger a Celery task
    background_tasks.add_task(ingestion_service.ingest_repository, request.repo_url, request.github_token)
    return {"message": f"Ingestion started for {request.repo_url}", "status": "processing"}
