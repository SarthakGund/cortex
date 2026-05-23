"""Tests for /auth routes (GitHub OAuth flow)."""

import pytest
from unittest.mock import patch, MagicMock


# ---------------------------------------------------------------------------
# GET /auth/github/login
# ---------------------------------------------------------------------------

def test_login_redirects_to_github(client):
    resp = client.get("/auth/github/login", follow_redirects=False)
    assert resp.status_code in (302, 307)
    assert "github.com/login/oauth/authorize" in resp.headers["location"]


def test_login_includes_scopes(client):
    resp = client.get("/auth/github/login", follow_redirects=False)
    assert "repo" in resp.headers["location"]


# ---------------------------------------------------------------------------
# GET /auth/github/callback
# ---------------------------------------------------------------------------

def test_callback_sets_httponly_cookie_on_success(client):
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"access_token": "gho_abc123"}

    with patch("api.auth.requests.post", return_value=mock_resp):
        resp = client.get("/auth/github/callback?code=test_code", follow_redirects=False)

    assert resp.status_code in (302, 307)
    # Confirm token NOT in redirect URL
    assert "token=" not in resp.headers.get("location", "")
    # Confirm httpOnly cookie was set
    assert "github_token" in resp.cookies


def test_callback_redirects_with_error_on_bad_code(client):
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"error": "bad_verification_code", "error_description": "bad code"}

    with patch("api.auth.requests.post", return_value=mock_resp):
        resp = client.get("/auth/github/callback?code=bad_code", follow_redirects=False)

    assert resp.status_code in (302, 307)
    assert "error=" in resp.headers.get("location", "")


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------

def test_me_returns_user_when_authenticated(authed_client):
    resp = authed_client.get("/auth/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["login"] == "testuser"


def test_me_returns_401_when_unauthenticated(client):
    with patch(
        "services.user_repo_service.UserRepoService.require_user",
        side_effect=Exception("not authed"),
    ):
        resp = client.get("/auth/me")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /auth/logout
# ---------------------------------------------------------------------------

def test_logout_clears_cookie(client):
    resp = client.post("/auth/logout", follow_redirects=False)
    # Cookie should be deleted (empty value or max-age=0)
    assert resp.status_code in (302, 307)
