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


class GraphSnapshot(Base):
    """Full Neo4j graph state captured at the moment of each commit."""
    __tablename__ = "graph_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    # linked commit info (can be null for manual snapshots)
    commit_hash = Column(String(255), nullable=True, index=True)
    commit_message = Column(Text, nullable=True)
    author = Column(String(255), nullable=True)
    repo_url = Column(String(500), nullable=True)
    service_name = Column(String(255), nullable=True, index=True)
    # full graph state
    nodes_json = Column(Text, nullable=False)   # JSON array of {id, label, props}
    edges_json = Column(Text, nullable=False)   # JSON array of {source, target, type, props}
    node_count = Column(Integer, default=0)
    edge_count = Column(Integer, default=0)
    # meta
    label = Column(String(500), nullable=True)  # human readable label e.g. "After commit abc1234"
    taken_at = Column(DateTime, server_default=func.now(), nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "commit_hash": self.commit_hash,
            "commit_message": self.commit_message,
            "author": self.author,
            "repo_url": self.repo_url,
            "service": self.service_name,
            "node_count": self.node_count,
            "edge_count": self.edge_count,
            "label": self.label,
            "taken_at": self.taken_at.isoformat() if self.taken_at else None,
        }

    def to_full_dict(self):
        import json
        d = self.to_dict()
        d["nodes"] = json.loads(self.nodes_json or "[]")
        d["edges"] = json.loads(self.edges_json or "[]")
        return d

