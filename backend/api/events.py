"""
Event Sourcing / Time Travel API Router
========================================
Endpoints:
  GET  /events/timeline       – query event log with filters
  GET  /events/snapshot       – graph state at a point in time
  GET  /events/diff           – changes between two timestamps
  GET  /events/stats          – event log statistics
  POST /events/record         – manually record an event
"""

from fastapi import APIRouter, Query as QParam
from pydantic import BaseModel
from typing import Optional
from services.event_service import (
    record_event, get_timeline, graph_snapshot_at,
    diff_between, event_stats,
)

router = APIRouter(prefix="/events", tags=["Events / Time Travel"])


class RecordEventRequest(BaseModel):
    action: str        # CREATE | UPDATE | DELETE
    entity_type: str   # Service | Function | Endpoint | etc.
    entity_name: str
    service: str = ""
    details: Optional[dict] = None
    source: str = "manual"


@router.post("/record")
async def post_record_event(request: RecordEventRequest):
    """Manually record an event in the knowledge graph event log."""
    return record_event(
        action=request.action,
        entity_type=request.entity_type,
        entity_name=request.entity_name,
        service=request.service,
        details=request.details,
        source=request.source,
    )


@router.get("/timeline")
async def get_event_timeline(
    service: Optional[str] = QParam(None),
    entity_type: Optional[str] = QParam(None),
    action: Optional[str] = QParam(None),
    since: Optional[str] = QParam(None, description="ISO timestamp lower bound"),
    until: Optional[str] = QParam(None, description="ISO timestamp upper bound"),
    limit: int = QParam(default=100, ge=1, le=500),
):
    """Query the event timeline with optional filters."""
    return get_timeline(
        service=service, entity_type=entity_type,
        action=action, since=since, until=until, limit=limit,
    )


@router.get("/snapshot")
async def get_snapshot(
    timestamp: str = QParam(..., description="ISO timestamp to snapshot at"),
):
    """Reconstruct the graph state at a specific point in time."""
    return graph_snapshot_at(timestamp)


@router.get("/diff")
async def get_diff(
    start: str = QParam(..., description="ISO timestamp — diff start"),
    end: str = QParam(..., description="ISO timestamp — diff end"),
):
    """Show all changes between two timestamps."""
    return diff_between(start, end)


@router.get("/stats")
async def get_event_stats():
    """High-level statistics about the event log."""
    return event_stats()
