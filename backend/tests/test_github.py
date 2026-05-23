"""Tests for /github routes."""

from unittest.mock import patch


MOCK_FLAT = [{"path": "src/main.py", "type": "blob", "size": 200}]
MOCK_NESTED = {"name": "src", "type": "folder", "children": []}


# ---------------------------------------------------------------------------
# GET /github/tree
# ---------------------------------------------------------------------------

def test_tree_happy_path(authed_client):
    with patch("api.github.GitHubService") as MockGitHub:
        svc = MockGitHub.return_value
        svc.get_tree.return_value = MOCK_FLAT
        svc.build_nested_tree.return_value = MOCK_NESTED

        resp = authed_client.get(
            "/github/tree?repo_url=https://github.com/org/repo&branch=main"
        )

    assert resp.status_code == 200
    data = resp.json()
    assert "flat" in data
    assert "nested" in data


def test_tree_requires_auth(client):
    with patch(
        "services.user_repo_service.UserRepoService.require_user",
        side_effect=Exception("not authed"),
    ):
        resp = client.get("/github/tree?repo_url=https://github.com/org/repo")
    assert resp.status_code in (401, 422, 500)


def test_tree_returns_400_on_github_error(authed_client):
    with patch("api.github.GitHubService") as MockGitHub:
        MockGitHub.return_value.get_tree.side_effect = Exception("repo not found")
        resp = authed_client.get("/github/tree?repo_url=https://github.com/org/notfound")
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# GET /github/file
# ---------------------------------------------------------------------------

def test_file_happy_path(authed_client):
    with patch("api.github.GitHubService") as MockGitHub:
        MockGitHub.return_value.get_file_content.return_value = "print('hello')"
        resp = authed_client.get(
            "/github/file?repo_url=https://github.com/org/repo&file_path=main.py"
        )
    assert resp.status_code == 200
    assert resp.json()["content"] == "print('hello')"


def test_file_returns_400_on_missing_path(authed_client):
    with patch("api.github.GitHubService") as MockGitHub:
        MockGitHub.return_value.get_file_content.side_effect = Exception("not found")
        resp = authed_client.get(
            "/github/file?repo_url=https://github.com/org/repo&file_path=missing.py"
        )
    assert resp.status_code == 400
