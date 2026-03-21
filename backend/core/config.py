from pydantic_settings import BaseSettings
from typing import Optional
from pathlib import Path

# Always resolve .env relative to this file (backend/.env) regardless of cwd
_ENV_FILE = Path(__file__).parent.parent / ".env"

class Settings(BaseSettings):
    PROJECT_NAME: str = "SPIT - Intelligent Architecture Platform"
    
    # Neo4j Settings
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "password"
    
    # Qdrant Settings
    QDRANT_URL: str = "http://localhost:6333"
    
    # Postgres Settings
    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/spit_db"
    
    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # LLM Settings
    OPENAI_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None
    
    # GitHub Automation Settings
    GITHUB_TOKEN: Optional[str] = None
    WEBHOOK_URL: Optional[str] = None
    GITHUB_CLIENT_ID: Optional[str] = None
    GITHUB_CLIENT_SECRET: Optional[str] = None
    FRONTEND_URL: str = "http://localhost:3000"

    google_api_key: Optional[str] = None

    # GitHub API token (optional — increases rate limit from 60 to 5000 req/hr)
    github_token: Optional[str] = None

    class Config:
        env_file = str(_ENV_FILE)
        extra = "ignore"

settings = Settings()
