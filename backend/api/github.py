import logging

from fastapi import APIRouter, Query, HTTPException, Request

from services.github_service import GitHubService
from services.user_repo_service import user_repo_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/github", tags=["GitHub"])


@router.get("/tree")
async def get_repo_tree(
    request: Request,
    repo_url: str = Query(..., description="GitHub repository URL"),
    branch: str = Query("main", description="Branch name"),
):
    """
    Fetch the complete file/folder tree of a GitHub repository via the GitHub API.
    Uses the authenticated user's own token, not a shared app token.
    """
    user = user_repo_service.require_user(request)
    try:
        svc = GitHubService(token=user.token)
        flat = svc.get_tree(repo_url, branch)
        nested = svc.build_nested_tree(flat)
        flat_simple = [
            {"path": i["path"], "type": "folder" if i["type"] == "tree" else "file", "size": i.get("size")}
            for i in flat
        ]
        return {"nested": nested, "flat": flat_simple, "total": len(flat)}
    except Exception as exc:
        logger.exception("Failed to fetch tree for %s", repo_url)
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/file")
async def get_file_content(
    request: Request,
    repo_url: str = Query(..., description="GitHub repository URL"),
    file_path: str = Query(..., description="Path to file within repo"),
    branch: str = Query("main", description="Branch name"),
):
    """
    Fetch the raw content of a single file in a GitHub repository.
    Uses the authenticated user's own token.
    """
    user = user_repo_service.require_user(request)
    try:
        content = GitHubService(token=user.token).get_file_content(repo_url, file_path, branch)
        return {"path": file_path, "content": content}
    except Exception as exc:
        logger.exception("Failed to fetch file %s from %s", file_path, repo_url)
        raise HTTPException(status_code=400, detail=str(exc))
