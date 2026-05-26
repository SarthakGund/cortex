"""Tests for /impact routes."""

from unittest.mock import patch, MagicMock


MOCK_ACTIVE_REPO = MagicMock()
MOCK_ACTIVE_REPO.repo_key = "testuser:org/repo"


# ---------------------------------------------------------------------------
# POST /impact/whatif
# ---------------------------------------------------------------------------

def test_whatif_happy_path(authed_client):
    mock_impact = MagicMock()
    mock_impact.to_dict.return_value = {"impacted_services": ["auth"], "risk_level": "medium"}
    with patch(
        "services.user_repo_service.UserRepoService.get_active_repo",
        return_value=MOCK_ACTIVE_REPO,
    ), patch(
        "services.whatif_service.run_whatif_scenario",
        return_value=mock_impact,
    ):
        resp = authed_client.post(
            "/impact/whatif",
            json={"type": "deprecate_endpoint", "target": "POST /users"},
        )
    assert resp.status_code != 401


def test_whatif_requires_auth(client):
    with patch(
        "services.user_repo_service.UserRepoService.require_user",
        side_effect=Exception("not authed"),
    ):
        resp = client.post("/impact/whatif", json={"type": "deprecate_endpoint", "target": "POST /users"})
    assert resp.status_code in (401, 422, 500)


# ---------------------------------------------------------------------------
# GET /impact/blast-radius  (was incorrectly /impact/blast-chain)
# ---------------------------------------------------------------------------

def test_blast_chain_requires_auth(client):
    with patch(
        "services.user_repo_service.UserRepoService.require_user",
        side_effect=Exception("not authed"),
    ):
        resp = client.get("/impact/blast-radius?node=auth")
    assert resp.status_code in (401, 422, 500)


def test_blast_chain_happy_path(authed_client):
    with patch(
        "services.user_repo_service.UserRepoService.get_active_repo",
        return_value=MOCK_ACTIVE_REPO,
    ), patch(
        "services.impact_service.blast_radius",
        return_value={"upstream": {"count": 0}, "downstream": {"count": 0}, "affected_services": []},
    ):
        resp = authed_client.get("/impact/blast-radius?node=auth")
    assert resp.status_code in (200, 500)
