from sqlalchemy import Column, String, DateTime, Text, Integer
from sqlalchemy.sql import func
from core.database import Base

class Commit(Base):
    __tablename__ = "commits"
    
    id = Column(Integer, primary_key=True, index=True)
    hash = Column(String(255), unique=True, index=True, nullable=False)
    repo_url = Column(String(500), nullable=False)
    service_name = Column(String(255), index=True, nullable=False)
    author = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    summary = Column(Text, nullable=True)
    timestamp = Column(DateTime, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    
    def to_dict(self):
        return {
            "id": self.id,
            "hash": self.hash,
            "repo_url": self.repo_url,
            "service": self.service_name,
            "author": self.author,
            "message": self.message,
            "summary": self.summary,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
