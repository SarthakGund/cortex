from fastapi import APIRouter, BackgroundTasks, Request, HTTPException
from pydantic import BaseModel
from services.ingestion_service import ingestion_service
from services.commit_service import commit_service
from services.github_service import github_service, github_webhook_service
from services.snapshot_service import snapshot_service
import hmac
import hashlib
import os

router = APIRouter(prefix="/webhook", tags=["Webhook"])

# Optionally, set a secret for GitHub/GitLab webhook signature verification
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET")

from typing import Optional

class WebhookPayload(BaseModel):
    repository: dict
    ref: Optional[str] = None  # e.g. 'refs/heads/main'
    # Add more fields as needed for your VCS

@router.post("")
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
        
        # Summarize commits if this is a push event
        commits = payload.get("commits", [])
        last_commit = None
        for commit in commits:
            last_commit = commit_service.summarize_commit(repo_url, commit)

        # Capture a graph snapshot after processing commits
        if last_commit:
            service_name = repo_url.rstrip("/").split("/")[-1].replace(".git", "")
            background_tasks.add_task(
                snapshot_service.capture,
                commit_hash=last_commit.get("hash"),
                commit_message=last_commit.get("message"),
                author=last_commit.get("author"),
                repo_url=repo_url,
                service_name=service_name,
            )
    # Add more VCS logic as needed

    if not repo_url:
        return {"status": "error", "message": "No repository URL found in payload"}

    # Trigger background ingestion
    background_tasks.add_task(ingestion_service.ingest_repository, repo_url)
    return {"status": "processing", "message": f"Ingestion triggered, commits summarized, and graph snapshot scheduled for {repo_url} (branch: {branch})"}

@router.get("/commits")
async def get_recent_commits(limit: int = 20):
    """Retrieve recent commit summaries with AI analysis."""
    try:
        commits = commit_service.get_recent_summaries(limit=limit)
        print(f"[Webhook] Returning {len(commits)} commits")
        return commits
    except Exception as e:
        print(f"[Webhook] Error getting commits: {e}")
        import traceback
        traceback.print_exc()
        return []

class WebhookCheckRequest(BaseModel):
    repo_url: str
    github_token: str = None

class WebhookCreateRequest(BaseModel):
    repo_url: str
    github_token: str = None

@router.post("/check")
async def check_webhook(request: WebhookCheckRequest):
    """Check if a webhook exists for the given repository."""
    import requests
    from core.config import settings
    
    token = request.github_token or settings.GITHUB_TOKEN
    webhook_url = 'https://antique-motherboard-unsigned-howard.trycloudflare.com/webhook/'
    
    if not token:
        raise HTTPException(status_code=400, detail="GitHub token not provided")
    
    if not webhook_url:
        raise HTTPException(status_code=400, detail="WEBHOOK_URL not configured")
    
    # Parse repo URL
    parts = request.repo_url.rstrip("/").replace(".git", "").split("/")
    if len(parts) < 2:
        raise HTTPException(status_code=400, detail="Invalid repository URL")
    
    owner, repo = parts[-2], parts[-1]
    api_url = f"https://api.github.com/repos/{owner}/{repo}/hooks"
    
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    try:
        resp = requests.get(api_url, headers=headers)
        if not resp.ok:
            raise HTTPException(status_code=resp.status_code, detail=f"GitHub API error: {resp.json().get('message', 'Unknown error')}")
        
        existing_hooks = resp.json()
        webhook_exists = False
        webhook_data = None
        
        for hook in existing_hooks:
            if hook["config"].get("url") == webhook_url:
                webhook_exists = True
                webhook_data = {
                    "id": hook["id"],
                    "url": hook["config"]["url"],
                    "events": hook["events"],
                    "active": hook["active"],
                    "created_at": hook["created_at"],
                    "updated_at": hook["updated_at"]
                }
                break
        
        return {
            "exists": webhook_exists,
            "webhook": webhook_data,
            "repository": f"{owner}/{repo}"
        }
    except requests.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Error checking webhook: {str(e)}")

@router.post("/create")
async def create_webhook(request: WebhookCreateRequest):
    """Create a webhook for the given repository."""
    result = github_webhook_service.create_webhook(request.repo_url, request.github_token)
    
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    
    return result
