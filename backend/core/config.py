from pydantic_settings import BaseSettings
from typing import Optional
from pathlib import Path

# Always resolve .env at the repo root regardless of cwd
_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"

class Settings(BaseSettings):
    PROJECT_NAME: str = "Cortex - Intelligent Architecture Platform"
    
    # Neo4j Settings
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "password"
    
    # Qdrant Settings
    QDRANT_URL: str = "http://localhost:6333"
    
    # Postgres Settings
    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/cortex_db"
    
    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # LLM Settings
    OPENAI_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None
    GROQ_API_KEY: Optional[str] = None
    GROQ_MODEL: str = "llama-3.1-70b-versatile"
    
    # GitHub Automation Settings
    GITHUB_TOKEN: Optional[str] = None
    WEBHOOK_URL: Optional[str] = None
    GITHUB_CLIENT_ID: Optional[str] = None
    GITHUB_CLIENT_SECRET: Optional[str] = None
    FRONTEND_URL: str = "http://localhost:3000"
    WEBHOOK_SECRET: Optional[str] = None

    google_api_key: Optional[str] = None

    # GitHub API token (optional — increases rate limit from 60 to 5000 req/hr)
    github_token: Optional[str] = None

    # Fernet key for encrypting GitHub tokens at rest in the DB.
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    TOKEN_ENCRYPTION_KEY: Optional[str] = None

    class Config:
        env_file = str(_ENV_FILE)
        extra = "ignore"

settings = Settings()
