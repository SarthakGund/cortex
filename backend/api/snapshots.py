from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from services.snapshot_service import snapshot_service

router = APIRouter(prefix="/snapshots", tags=["Snapshots"])


class ManualSnapshotRequest(BaseModel):
    label: Optional[str] = None


@router.get("/")
async def list_snapshots(limit: int = 50):
    """List all saved graph snapshots (summary, no graph data)."""
    return snapshot_service.list_snapshots(limit=limit)


@router.post("/capture")
async def capture_snapshot(body: ManualSnapshotRequest, background_tasks: BackgroundTasks):
    """Manually trigger a graph snapshot right now."""
    background_tasks.add_task(snapshot_service.capture, label=body.label or "Manual snapshot")
    return {"status": "capturing", "message": "Graph snapshot is being captured in the background"}


@router.get("/{snapshot_id}")
async def get_snapshot(snapshot_id: int):
    """Get full snapshot including nodes and edges."""
    snap = snapshot_service.get_snapshot(snapshot_id)
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return snap


@router.get("/diff/{id_before}/{id_after}")
async def diff_snapshots(id_before: int, id_after: int):
    """Compare two snapshots — shows added/removed/changed nodes and edges."""
    result = snapshot_service.diff_snapshots(id_before, id_after)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result
