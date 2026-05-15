from fastapi import APIRouter, HTTPException, BackgroundTasks, Request, Query as QParam
from pydantic import BaseModel
from typing import Optional
from services.snapshot_service import snapshot_service
from services.user_repo_service import user_repo_service

router = APIRouter(prefix="/snapshots", tags=["Snapshots"])


class ManualSnapshotRequest(BaseModel):
    label: Optional[str] = None


@router.get("/")
async def list_snapshots(
    request: Request,
    limit: int = QParam(default=50, ge=1, le=200),
):
    """List graph snapshots scoped to the currently active repo."""
    user = user_repo_service.require_user(request)
    repo = user_repo_service.get_active_repo(user)
    return snapshot_service.list_snapshots(limit=limit, service_name=repo.repo_key)


@router.post("/capture")
async def capture_snapshot(
    request: Request,
    body: ManualSnapshotRequest,
    background_tasks: BackgroundTasks,
):
    """Manually trigger a graph snapshot for the active repo."""
    user = user_repo_service.require_user(request)
    repo = user_repo_service.get_active_repo(user)
    background_tasks.add_task(
        snapshot_service.capture,
        label=body.label or "Manual snapshot",
        service_name=repo.repo_key,
        repo_url=repo.repo_url,
    )
    return {"status": "capturing", "message": "Graph snapshot is being captured in the background"}


@router.get("/{snapshot_id}")
async def get_snapshot(
    request: Request,
    snapshot_id: int,
):
    """Get full snapshot including nodes and edges (must belong to active repo)."""
    user = user_repo_service.require_user(request)
    repo = user_repo_service.get_active_repo(user)
    snap = snapshot_service.get_snapshot(snapshot_id, service_name=repo.repo_key)
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return snap


@router.get("/diff/{id_before}/{id_after}")
async def diff_snapshots(
    request: Request,
    id_before: int,
    id_after: int,
):
    """Compare two snapshots — must both belong to the active repo."""
    user = user_repo_service.require_user(request)
    repo = user_repo_service.get_active_repo(user)
    result = snapshot_service.diff_snapshots(id_before, id_after, service_name=repo.repo_key)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result
