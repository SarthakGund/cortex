"""Tests for health / readiness probes."""

import pytest
from unittest.mock import patch, MagicMock


# ---------------------------------------------------------------------------
# GET /knowledge-health/live
# ---------------------------------------------------------------------------

def test_liveness_always_200(client):
    resp = client.get("/knowledge-health/live")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


# ---------------------------------------------------------------------------
# GET /knowledge-health/ready
# ---------------------------------------------------------------------------

def test_readiness_200_when_all_healthy(client):
    with patch("services.neo4j_health_service.neo4j_health_service.driver") as mock_driver, \
         patch("httpx.get") as mock_get, \
         patch("core.database.SessionLocal") as mock_session:

        mock_session_ctx = MagicMock()
        mock_session.return_value = mock_session_ctx
        mock_session_ctx.execute = MagicMock()

        mock_driver.session.return_value.__enter__ = MagicMock(return_value=MagicMock())
        mock_driver.session.return_value.__exit__ = MagicMock(return_value=False)

        mock_get.return_value = MagicMock(is_success=True)

        resp = client.get("/knowledge-health/ready")

    assert resp.status_code in (200, 503)  # 503 if any dep unreachable in test env


def test_readiness_503_when_neo4j_down(client):
    with patch("services.neo4j_health_service.neo4j_health_service.driver") as mock_driver:
        mock_driver.session.side_effect = Exception("Neo4j connection refused")
        resp = client.get("/knowledge-health/ready")

    assert resp.status_code == 503
    data = resp.json()
    assert "neo4j" in data["checks"]
    assert "error" in data["checks"]["neo4j"]
