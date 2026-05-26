"""Tests for /webhook routes."""

import hashlib
import hmac
import json
from unittest.mock import patch, MagicMock


WEBHOOK_SECRET = "test_webhook_secret"

SAMPLE_PAYLOAD = {
    "repository": {
        "clone_url": "https://github.com/org/repo.git",
        "full_name": "org/repo",
    },
    "ref": "refs/heads/main",
    "commits": [],
}


def _sign(body: bytes, secret: str) -> str:
    mac = hmac.new(secret.encode(), msg=body, digestmod=hashlib.sha256)
    return f"sha256={mac.hexdigest()}"


# ---------------------------------------------------------------------------
# POST /webhook — signature verification
# ---------------------------------------------------------------------------

def test_webhook_rejects_missing_signature(client):
    body = json.dumps(SAMPLE_PAYLOAD).encode()
    resp = client.post("/webhook/", content=body, headers={"content-type": "application/json"})
    assert resp.status_code == 403


def test_webhook_rejects_bad_signature(client):
    body = json.dumps(SAMPLE_PAYLOAD).encode()
    resp = client.post(
        "/webhook/",
        content=body,
        headers={
            "content-type": "application/json",
            "x-hub-signature-256": "sha256=deadbeef",
        },
    )
    assert resp.status_code == 403


def test_webhook_accepts_valid_signature(client):
    body = json.dumps(SAMPLE_PAYLOAD).encode()
    sig = _sign(body, WEBHOOK_SECRET)

    with patch("api.webhook.SessionLocal") as mock_sl:
        mock_db = MagicMock()
        mock_sl.return_value = mock_db
        mock_db.query.return_value.filter.return_value.all.return_value = []

        resp = client.post(
            "/webhook/",
            content=body,
            headers={
                "content-type": "application/json",
                "x-hub-signature-256": sig,
            },
        )

    # Either processes (200) or returns "Repo not registered" error (200 with error key)
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# GET /webhook/commits
# ---------------------------------------------------------------------------

def test_commits_requires_auth(client):
    with patch(
        "services.user_repo_service.UserRepoService.require_user",
        side_effect=Exception("not authed"),
    ):
        resp = client.get("/webhook/commits")
    assert resp.status_code in (401, 422, 500)


def test_commits_returns_list(authed_client):
    mock_repo = MagicMock()
    mock_repo.repo_key = "testuser:org/repo"

    with patch(
        "services.user_repo_service.UserRepoService.get_active_repo",
        return_value=mock_repo,
    ), patch(
        "services.commit_service.commit_service.get_recent_summaries",
        return_value=[{"hash": "abc123", "message": "fix: auth bug"}],
    ):
        resp = authed_client.get("/webhook/commits")

    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
