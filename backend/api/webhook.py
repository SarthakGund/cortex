from fastapi import APIRouter, BackgroundTasks, Request
from pydantic import BaseModel
from services.ingestion_service import ingestion_service
import hmac
import hashlib
import os

router = APIRouter(prefix="/webhook", tags=["Webhook"])

# Optionally, set a secret for GitHub/GitLab webhook signature verification
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET")

class WebhookPayload(BaseModel):
    repository: dict
    ref: str = None  # e.g. 'refs/heads/main'
    # Add more fields as needed for your VCS

@router.post("/")
async def receive_webhook(request: Request, background_tasks: BackgroundTasks):
    # Read raw body for signature verification
    body = await request.body()
    headers = request.headers

    # Optional: verify signature if secret is set
    if WEBHOOK_SECRET:
        signature = headers.get("x-hub-signature-256")
        if not signature:
            return {"status": "error", "message": "Missing signature"}
        mac = hmac.new(WEBHOOK_SECRET.encode(), msg=body, digestmod=hashlib.sha256)
        expected = f"sha256={mac.hexdigest()}"
        if not hmac.compare_digest(signature, expected):
            return {"status": "error", "message": "Invalid signature"}

    # Parse JSON payload
    payload = await request.json()
    repo_url = None
    branch = None
    # GitHub push event
    if "repository" in payload:
        repo_url = payload["repository"].get("clone_url") or payload["repository"].get("git_http_url")
        branch = payload.get("ref", "refs/heads/main").split("/")[-1]
    # Add more VCS logic as needed

    if not repo_url:
        return {"status": "error", "message": "No repository URL found in payload"}

    # Trigger background ingestion
    background_tasks.add_task(ingestion_service.ingest_repository, repo_url)
    return {"status": "processing", "message": f"Ingestion triggered for {repo_url} (branch: {branch})"}
