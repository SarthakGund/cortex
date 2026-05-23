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

from fastapi import APIRouter, Query as QParam, Request
from pydantic import BaseModel
from typing import Optional
from services.event_service import (
    record_event, get_timeline, graph_snapshot_at,
    diff_between, event_stats,
)
from services.user_repo_service import user_repo_service

router = APIRouter(prefix="/events", tags=["Events / Time Travel"])


class RecordEventRequest(BaseModel):
    action: str        # CREATE | UPDATE | DELETE
    entity_type: str   # Service | Function | Endpoint | etc.
    entity_name: str
    service: str = ""
    details: Optional[dict] = None
    source: str = "manual"


@router.post("/record")
async def post_record_event(request: Request, body: RecordEventRequest):
    """Manually record an event in the knowledge graph event log."""
    user_repo_service.require_user(request)
    return record_event(
        action=body.action,
        entity_type=body.entity_type,
        entity_name=body.entity_name,
        service=body.service,
        details=body.details,
        source=body.source,
    )


@router.get("/timeline")
async def get_event_timeline(
    request: Request,
    service: Optional[str] = QParam(None),
    entity_type: Optional[str] = QParam(None),
    action: Optional[str] = QParam(None),
    since: Optional[str] = QParam(None, description="ISO timestamp lower bound"),
    until: Optional[str] = QParam(None, description="ISO timestamp upper bound"),
    limit: int = QParam(default=100, ge=1, le=500),
):
    """Query the event timeline with optional filters."""
    user_repo_service.require_user(request)
    return get_timeline(
        service=service, entity_type=entity_type,
        action=action, since=since, until=until, limit=limit,
    )


@router.get("/snapshot")
async def get_snapshot(
    request: Request,
    timestamp: str = QParam(..., description="ISO timestamp to snapshot at"),
):
    """Reconstruct the graph state at a specific point in time."""
    user_repo_service.require_user(request)
    return graph_snapshot_at(timestamp)


@router.get("/diff")
async def get_diff(
    request: Request,
    start: str = QParam(..., description="ISO timestamp — diff start"),
    end: str = QParam(..., description="ISO timestamp — diff end"),
):
    """Show all changes between two timestamps."""
    user_repo_service.require_user(request)
    return diff_between(start, end)


@router.get("/stats")
async def get_event_stats(request: Request):
    """High-level statistics about the event log."""
    user_repo_service.require_user(request)
    return event_stats()
