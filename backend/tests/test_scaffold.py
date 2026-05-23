"""Tests for /scaffold routes."""

from unittest.mock import patch


SAMPLE_BLUEPRINT = {
    "system_name": "TestSystem",
    "summary": "A test system",
    "rationale": "For testing",
    "services": [],
    "api_gateway": {},
}


# ---------------------------------------------------------------------------
# POST /scaffold/design
# ---------------------------------------------------------------------------

def test_design_happy_path(authed_client):
    with patch(
        "services.scaffold_service.design_architecture",
        return_value=SAMPLE_BLUEPRINT,
    ):
        resp = authed_client.post(
            "/scaffold/design",
            json={"requirements": "Build a simple REST API with auth and a user service"},
        )
    assert resp.status_code == 200


def test_design_rejects_short_requirements(authed_client):
    resp = authed_client.post("/scaffold/design", json={"requirements": "too short"})
    assert resp.status_code == 422


def test_design_requires_auth(client):
    with patch(
        "services.user_repo_service.UserRepoService.require_user",
        side_effect=Exception("not authed"),
    ):
        resp = client.post(
            "/scaffold/design",
            json={"requirements": "Build a simple REST API with auth and a user service"},
        )
    assert resp.status_code in (401, 422, 500)


# ---------------------------------------------------------------------------
# POST /scaffold/generate
# ---------------------------------------------------------------------------

def test_generate_happy_path(authed_client):
    mock_file_tree = {"service/main.py": "# main", "service/Dockerfile": "FROM python:3.12"}
    mock_zip = b"PK\x03\x04"  # minimal zip magic bytes

    with patch(
        "services.scaffold_service.generate_scaffold",
        return_value=(mock_file_tree, mock_zip),
    ), patch("api.scaffold._save_job"):
        resp = authed_client.post("/scaffold/generate", json={"blueprint": SAMPLE_BLUEPRINT})

    assert resp.status_code == 200
    data = resp.json()
    assert "job_id" in data
    assert data["file_count"] == 2


def test_generate_returns_422_for_unsupported_language(authed_client):
    with patch(
        "services.scaffold_service.generate_scaffold",
        side_effect=ValueError("Unsupported language/framework combination: cobol/legacy"),
    ):
        resp = authed_client.post("/scaffold/generate", json={"blueprint": SAMPLE_BLUEPRINT})

    assert resp.status_code == 422
    assert "Unsupported" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# GET /scaffold/download/{job_id}
# ---------------------------------------------------------------------------

def test_download_404_for_unknown_job(authed_client):
    with patch("api.scaffold._load_job", return_value=None):
        resp = authed_client.get("/scaffold/download/nonexistent")
    assert resp.status_code == 404
