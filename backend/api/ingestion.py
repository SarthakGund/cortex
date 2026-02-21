from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from services.ingestion_service import ingestion_service

router = APIRouter(prefix="/ingest", tags=["Ingestion"])

class IngestRequest(BaseModel):
    repo_url: str
    branch: str = "main"

@router.post("/")
async def trigger_ingestion(request: IngestRequest, background_tasks: BackgroundTasks):
    # In a real system, this would trigger a Celery task
    background_tasks.add_task(ingestion_service.ingest_repository, request.repo_url)
    return {"message": f"Ingestion started for {request.repo_url}", "status": "processing"}
