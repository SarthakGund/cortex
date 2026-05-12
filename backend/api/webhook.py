from fastapi import APIRouter, BackgroundTasks, Request, HTTPException
from pydantic import BaseModel
from services.ingestion_service import ingestion_service
from services.commit_service import commit_service
from services.github_service import github_webhook_service
from services.snapshot_service import snapshot_service
from core.database import SessionLocal
from core.models import User, UserRepo
from core.config import settings
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
    repo_full_name = None
    branch = None
    # GitHub push event
    if "repository" in payload:
        repo_url = payload["repository"].get("clone_url") or payload["repository"].get("git_http_url")
        repo_full_name = payload["repository"].get("full_name")
        branch = payload.get("ref", "refs/heads/main").split("/")[-1]
        
        # Summarize commits if this is a push event
        commits = payload.get("commits", [])
    # Add more VCS logic as needed

    if not repo_url:
        return {"status": "error", "message": "No repository URL found in payload"}

    def normalize_url(url: str | None) -> str:
        if not url:
            return ""
        return url.rstrip("/").replace(".git", "")

    # Find matching user repos for this webhook
    db = SessionLocal()
    try:
        normalized = normalize_url(repo_url)
        query = db.query(UserRepo)
        if repo_full_name:
            query = query.filter(
                (UserRepo.repo_full_name == repo_full_name) |
                (UserRepo.repo_url == repo_url) |
                (UserRepo.repo_url == normalized)
            )
        else:
            query = query.filter((UserRepo.repo_url == repo_url) | (UserRepo.repo_url == normalized))
        repo_rows = query.all()

        if not repo_rows:
            return {"status": "error", "message": f"Repo not registered: {repo_url}"}

        for repo in repo_rows:
            user = db.query(User).filter(User.id == repo.user_id).first()
            token = user.token if user else None
            service_name = repo.repo_key
            last_commit = None
            for commit in commits:
                last_commit = commit_service.summarize_commit(
                    repo.repo_url,
                    commit,
                    service_name_override=service_name,
                )

            # Capture a graph snapshot after processing commits
            if last_commit:
                background_tasks.add_task(
                    snapshot_service.capture,
                    commit_hash=last_commit.get("hash"),
                    commit_message=last_commit.get("message"),
                    author=last_commit.get("author"),
                    repo_url=repo.repo_url,
                    service_name=service_name,
                )

            background_tasks.add_task(
                ingestion_service.ingest_from_github,
                repo.repo_url,
                branch or repo.default_branch,
                True,
                token,
                service_name,
            )
    finally:
        db.close()

    return {"status": "processing", "message": f"Webhook processed. Ingestion + commit summaries queued for {repo_url} (branch: {branch})"}

@router.get("/commits")
async def get_recent_commits(request: Request, limit: int = 20):
    """Retrieve recent commit summaries for the active repo."""
    from services.user_repo_service import user_repo_service

    try:
        user = user_repo_service.require_user(request)
        repo = user_repo_service.get_active_repo(user)
        commits = commit_service.get_recent_summaries(limit=limit, service_name=repo.repo_key)
        print(f"[Webhook] Returning {len(commits)} commits for {repo.repo_key}")
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
async def check_webhook(request: WebhookCheckRequest, http_request: Request):
    """Check if a webhook exists for the given repository."""
    import requests
    from core.config import settings
    
    token = request.github_token
    if not token:
        auth = http_request.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth.split(" ", 1)[1].strip()
    token = token or settings.GITHUB_TOKEN
    webhook_url = settings.WEBHOOK_URL
    
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
async def create_webhook(request: WebhookCreateRequest, http_request: Request):
    """Create a webhook for the given repository."""
    token = request.github_token
    if not token:
        auth = http_request.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth.split(" ", 1)[1].strip()

    result = github_webhook_service.create_webhook(request.repo_url, token)
    
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    
    return result
