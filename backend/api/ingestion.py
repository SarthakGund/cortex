from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Request
from pydantic import BaseModel
from services.ingestion_service import ingestion_service

router = APIRouter(prefix="/ingest", tags=["Ingestion"])

class IngestRequest(BaseModel):
    repo_url: str
    branch: str = "main"
    github_token: Optional[str] = None
    repo_id: Optional[int] = None

class MultiRepoRequest(BaseModel):
    repos: list[IngestRequest]

@router.post("/")
async def trigger_ingestion(request: IngestRequest, background_tasks: BackgroundTasks, http_request: Request):
    """Ingest a repository by cloning it locally (requires git)."""
    from services.user_repo_service import user_repo_service
    user_repo_service.require_user(http_request)
    background_tasks.add_task(ingestion_service.ingest_repository, request.repo_url, request.github_token)
    return {"message": f"Ingestion started for {request.repo_url}", "status": "processing"}

@router.post("/github")
async def trigger_github_ingestion(
    request: IngestRequest,
    background_tasks: BackgroundTasks,
    http_request: Request,
):
    """Ingest a repository via the GitHub API — no local clone required. Supports incremental updates."""
    from services.user_repo_service import user_repo_service

    repo_url = request.repo_url
    branch = request.branch
    repo_key = None
    token = request.github_token

    if request.repo_id:
        user = user_repo_service.require_user(http_request)
        repo = user_repo_service.get_repo(user, request.repo_id)
        repo_url = repo.repo_url
        branch = repo.default_branch
        repo_key = repo.repo_key
        token = token or user.token
    else:
        token = token or user_repo_service._get_token(http_request)

    background_tasks.add_task(
        ingestion_service.ingest_from_github,
        repo_url,
        branch,
        True,
        token,
        repo_key,
    )
    return {
        "message": f"GitHub ingestion started for {repo_url} (branch: {branch})",
        "status": "processing",
    }

@router.post("/multi")
async def trigger_multi_repo_ingestion(request: MultiRepoRequest, background_tasks: BackgroundTasks, http_request: Request):
    """Ingest multiple repositories and discover cross-repo dependencies."""
    from services.user_repo_service import user_repo_service
    user_repo_service.require_user(http_request)
    repos = [{"repo_url": r.repo_url, "branch": r.branch} for r in request.repos]
    background_tasks.add_task(ingestion_service.ingest_multiple_repos, repos)
    return {
        "message": f"Multi-repo ingestion started for {len(repos)} repositories",
        "status": "processing",
        "repos": [r.repo_url for r in request.repos],
    }
