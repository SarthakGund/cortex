"""Tests for /repos routes."""

from unittest.mock import patch


MOCK_REPO = {
    "id": 1,
    "repo_url": "https://github.com/org/repo",
    "repo_full_name": "org/repo",
    "default_branch": "main",
    "repo_key": "testuser:org/repo",
    "is_active": True,
}


# ---------------------------------------------------------------------------
# GET /repos/
# ---------------------------------------------------------------------------

def test_list_repos_happy_path(authed_client):
    with patch(
        "services.user_repo_service.UserRepoService.list_repos",
        return_value=[MOCK_REPO],
    ):
        resp = authed_client.get("/repos/")
    assert resp.status_code == 200
    assert isinstance(resp.json()["repos"], list)


def test_list_repos_requires_auth(client):
    with patch(
        "services.user_repo_service.UserRepoService.require_user",
        side_effect=Exception("not authed"),
    ):
        resp = client.get("/repos/")
    assert resp.status_code in (401, 422, 500)


# ---------------------------------------------------------------------------
# POST /repos/
# ---------------------------------------------------------------------------

def test_add_repo_happy_path(authed_client):
    with patch(
        "services.user_repo_service.UserRepoService.add_repo",
        return_value=MOCK_REPO,
    ):
        resp = authed_client.post(
            "/repos/",
            json={"repo_url": "https://github.com/org/repo"},
        )
    assert resp.status_code in (200, 201)


# ---------------------------------------------------------------------------
# DELETE /repos/{repo_id}
# ---------------------------------------------------------------------------

def test_remove_repo_happy_path(authed_client):
    with patch(
        "services.user_repo_service.UserRepoService.remove_repo",
        return_value={"removed": 1},
    ):
        resp = authed_client.delete("/repos/1")
    assert resp.status_code == 200


def test_remove_repo_not_found(authed_client):
    from fastapi import HTTPException
    with patch(
        "services.user_repo_service.UserRepoService.remove_repo",
        side_effect=HTTPException(status_code=404, detail="Repo not found"),
    ):
        resp = authed_client.delete("/repos/999")
    assert resp.status_code == 404
