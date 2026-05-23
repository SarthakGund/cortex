"""Tests for /ingest routes."""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock


# ---------------------------------------------------------------------------
# POST /ingest/ (clone-based)
# ---------------------------------------------------------------------------

def test_ingest_accepts_valid_repo(authed_client):
    with patch("services.ingestion_service.IngestionService.ingest_repository") as mock_ingest:
        resp = authed_client.post("/ingest/", json={"repo_url": "https://github.com/org/repo"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "processing"


def test_ingest_requires_auth(client):
    with patch(
        "services.user_repo_service.UserRepoService.require_user",
        side_effect=Exception("not authed"),
    ):
        resp = client.post("/ingest/", json={"repo_url": "https://github.com/org/repo"})
    assert resp.status_code in (401, 422, 500)


# ---------------------------------------------------------------------------
# POST /ingest/github (API-based, no clone)
# ---------------------------------------------------------------------------

def test_ingest_github_accepts_repo_url(authed_client):
    with patch("services.ingestion_service.IngestionService.ingest_from_github"):
        resp = authed_client.post(
            "/ingest/github",
            json={"repo_url": "https://github.com/org/repo", "branch": "main"},
        )
    assert resp.status_code == 200
    assert resp.json()["status"] == "processing"


def test_ingest_github_with_repo_id_requires_auth(client):
    with patch(
        "services.user_repo_service.UserRepoService.require_user",
        side_effect=Exception("not authed"),
    ):
        resp = client.post(
            "/ingest/github",
            json={"repo_url": "https://github.com/org/repo", "repo_id": 1},
        )
    assert resp.status_code in (401, 422, 500)


# ---------------------------------------------------------------------------
# POST /ingest/multi
# ---------------------------------------------------------------------------

def test_ingest_multi_accepts_list(authed_client):
    with patch("services.ingestion_service.IngestionService.ingest_multiple_repos"):
        resp = authed_client.post(
            "/ingest/multi",
            json={"repos": [
                {"repo_url": "https://github.com/org/a"},
                {"repo_url": "https://github.com/org/b"},
            ]},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "processing"
    assert len(data["repos"]) == 2
