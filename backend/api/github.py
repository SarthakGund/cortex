from fastapi import APIRouter, Query, HTTPException
from services.github_service import GitHubService
from core.config import settings

router = APIRouter(prefix="/github", tags=["GitHub"])


def _svc() -> GitHubService:
    return GitHubService(token=settings.github_token)


@router.get("/tree")
async def get_repo_tree(
    repo_url: str = Query(..., description="GitHub repository URL"),
    branch: str = Query("main", description="Branch name"),
):
    """
    Fetch the complete file/folder tree of a GitHub repository via the
    GitHub API — no local clone required.
    Returns both a nested tree (for UI rendering) and a flat list.
    """
    try:
        svc = _svc()
        flat = svc.get_tree(repo_url, branch)
        nested = svc.build_nested_tree(flat)
        # Simplify flat list for the response
        flat_simple = [
            {"path": i["path"], "type": "folder" if i["type"] == "tree" else "file", "size": i.get("size")}
            for i in flat
        ]
        return {"nested": nested, "flat": flat_simple, "total": len(flat)}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/file")
async def get_file_content(
    repo_url: str = Query(..., description="GitHub repository URL"),
    file_path: str = Query(..., description="Path to file within repo"),
    branch: str = Query("main", description="Branch name"),
):
    """
    Fetch the raw content of a single file in a GitHub repository.
    """
    try:
        content = _svc().get_file_content(repo_url, file_path, branch)
        return {"path": file_path, "content": content}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
