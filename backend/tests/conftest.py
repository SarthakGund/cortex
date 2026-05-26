"""
Shared pytest fixtures for the SPIT backend test suite.

Tests use FastAPI's TestClient with all external services mocked so that
no real database, Neo4j, Qdrant, Redis, or GitHub API calls are made.
"""

import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Minimal settings override so the app boots without real credentials
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True, scope="session")
def _patch_settings():
    with patch("core.config.settings") as mock_settings, \
         patch("neo4j.GraphDatabase.driver"):
        mock_settings.GITHUB_CLIENT_ID = "test_client_id"
        mock_settings.GITHUB_CLIENT_SECRET = "test_client_secret"
        mock_settings.GROQ_API_KEY = "test_groq_key"
        mock_settings.GEMINI_API_KEY = None
        mock_settings.NEO4J_URI = "bolt://localhost:7687"
        mock_settings.NEO4J_USER = "neo4j"
        mock_settings.NEO4J_PASSWORD = "strong_test_password"
        mock_settings.FRONTEND_URL = "http://localhost:3000"
        mock_settings.REDIS_URL = "redis://localhost:6379/0"
        mock_settings.QDRANT_URL = "http://localhost:6333"
        mock_settings.DATABASE_URL = "sqlite:///:memory:"
        mock_settings.WEBHOOK_SECRET = "test_webhook_secret"
        mock_settings.TOKEN_ENCRYPTION_KEY = None
        mock_settings.WEBHOOK_URL = "https://example.com/webhook"
        mock_settings.GITHUB_TOKEN = None
        mock_settings.github_token = None
        yield mock_settings


# ---------------------------------------------------------------------------
# App + TestClient
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def app(_patch_settings):
    with patch("core.database.init_db"):
        from main import app as _app
    return _app


@pytest.fixture
def client(app):
    return TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# Reusable mock GitHub user
# ---------------------------------------------------------------------------

MOCK_GH_USER = {
    "id": 12345,
    "login": "testuser",
    "avatar_url": "https://avatars.githubusercontent.com/u/12345",
}

MOCK_DB_USER = MagicMock()
MOCK_DB_USER.id = 1
MOCK_DB_USER.github_id = 12345
MOCK_DB_USER.login = "testuser"
MOCK_DB_USER.avatar_url = "https://avatars.githubusercontent.com/u/12345"
MOCK_DB_USER.token = "gho_mock_token"


@pytest.fixture
def authed_client(client):
    """Client that injects a mock authenticated user into every request."""
    with patch(
        "services.user_repo_service.UserRepoService.require_user",
        return_value=MOCK_DB_USER,
    ):
        yield client
