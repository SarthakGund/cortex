from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from core.config import settings
import os

# Use SQLite for local development
db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "spit_commits.db")
DATABASE_URL = f"sqlite:///{db_path}"

print(f"[Database] Using SQLite: {db_path}")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    pool_pre_ping=True
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    """Dependency for FastAPI routes to get a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Initialize database tables."""
    from core.models import Commit  # Import models here to avoid circular imports
    Base.metadata.create_all(bind=engine)
    print(f"[Database] ✅ Tables initialized")
