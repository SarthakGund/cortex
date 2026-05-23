"""Tests for /events routes."""

import pytest
from unittest.mock import patch, MagicMock


# ---------------------------------------------------------------------------
# GET /events/timeline
# ---------------------------------------------------------------------------

def test_timeline_happy_path(authed_client):
    with patch("api.events.get_timeline", return_value={"events": []}):
        resp = authed_client.get("/events/timeline")
    assert resp.status_code == 200


def test_timeline_requires_auth(client):
    with patch(
        "services.user_repo_service.UserRepoService.require_user",
        side_effect=Exception("not authed"),
    ):
        resp = client.get("/events/timeline")
    assert resp.status_code in (401, 422, 500)


# ---------------------------------------------------------------------------
# POST /events/record
# ---------------------------------------------------------------------------

def test_record_event_happy_path(authed_client):
    with patch("api.events.record_event", return_value={"id": "evt_001"}):
        resp = authed_client.post(
            "/events/record",
            json={
                "action": "CREATE",
                "entity_type": "Service",
                "entity_name": "auth-service",
            },
        )
    assert resp.status_code == 200


def test_record_event_requires_auth(client):
    with patch(
        "services.user_repo_service.UserRepoService.require_user",
        side_effect=Exception("not authed"),
    ):
        resp = client.post(
            "/events/record",
            json={"action": "CREATE", "entity_type": "Service", "entity_name": "auth"},
        )
    assert resp.status_code in (401, 422, 500)


# ---------------------------------------------------------------------------
# GET /events/snapshot
# ---------------------------------------------------------------------------

def test_snapshot_happy_path(authed_client):
    with patch("api.events.graph_snapshot_at", return_value={"nodes": [], "edges": []}):
        resp = authed_client.get("/events/snapshot?timestamp=2026-01-01T00:00:00")
    assert resp.status_code == 200


def test_snapshot_requires_timestamp(authed_client):
    resp = authed_client.get("/events/snapshot")
    assert resp.status_code == 422
