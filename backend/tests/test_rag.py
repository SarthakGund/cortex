"""Tests for /rag routes."""

from unittest.mock import patch, MagicMock


MOCK_RAG_RESPONSE = {
    "answer": "The service handles authentication.",
    "sources": [{"text": "auth code snippet", "metadata": {"file": "auth.py"}, "score": 0.95}],
    "context_used": 1,
}

MOCK_ACTIVE_REPO = MagicMock()
MOCK_ACTIVE_REPO.repo_key = "testuser:org/repo"


# ---------------------------------------------------------------------------
# POST /rag/ask
# ---------------------------------------------------------------------------

def test_rag_ask_happy_path(authed_client):
    with patch(
        "services.user_repo_service.UserRepoService.get_active_repo",
        return_value=MOCK_ACTIVE_REPO,
    ), patch(
        "services.rag_service.rag_service.multi_hop_query",
        return_value=MOCK_RAG_RESPONSE,
    ):
        resp = authed_client.post("/rag/ask", json={"question": "What does auth do?"})

    assert resp.status_code == 200
    data = resp.json()
    assert "answer" in data


def test_rag_ask_requires_auth(client):
    with patch(
        "services.user_repo_service.UserRepoService.require_user",
        side_effect=Exception("not authed"),
    ):
        resp = client.post("/rag/ask", json={"question": "What does auth do?"})
    assert resp.status_code in (401, 422, 500)


def test_rag_ask_missing_question_returns_error(authed_client):
    resp = authed_client.post("/rag/ask", json={})
    assert resp.status_code == 422
