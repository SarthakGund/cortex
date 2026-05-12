from core.database import SessionLocal
from core.models import Commit
from datetime import datetime
from sqlalchemy.exc import IntegrityError
import json

# Try to import LLM service, but don't fail if it's not available
try:
    from services.llm_service import llm_service
    LLM_AVAILABLE = True
except Exception as e:
    print(f"[CommitService] LLM service not available: {e}")
    LLM_AVAILABLE = False
    llm_service = None

class CommitService:
    def __init__(self):
        pass

    def summarize_commit(self, repo_url: str, commit_data: dict, service_name_override: str | None = None) -> dict:
        """
        Takes raw commit data from a webhook (message, modified files, etc.)
        and generates a high-level technical summary using the LLM.
        Stores in PostgreSQL database.
        """
        commit_hash = commit_data.get("id", "unknown")
        commit_msg = commit_data.get("message", "No commit message")
        author_data = commit_data.get("author", {})
        author = author_data.get("name", author_data.get("username", "Unknown"))
        added = commit_data.get("added", [])
        modified = commit_data.get("modified", [])
        removed = commit_data.get("removed", [])
        timestamp_str = commit_data.get("timestamp", datetime.now().isoformat())
        
        # Parse timestamp
        try:
            timestamp = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
        except:
            timestamp = datetime.now()

        # Extract service name from repo URL (or override with repo_key)
        service_name = service_name_override or repo_url.rstrip("/").split("/")[-1].replace(".git", "")

        prompt = f"""
        You are an expert lead developer reviewing a code change.
        Commit Message: {commit_msg}
        Author: {author}
        Added Files: {added}
        Modified Files: {modified}
        Removed Files: {removed}

        Provide a 2-3 sentence technical summary of WHAT this change likely accomplishes in the codebase architecture.
        Focus on the impact (e.g., 'Adds new authentication middleware', 'Refactors database connection logic').
        If you can't tell exactly, give your best technical guess based on the file paths.

        Summary:
        """

        summary = "No summary available."
        if LLM_AVAILABLE and llm_service and llm_service.enabled:
            try:
                response = llm_service.model.generate_content(prompt)
                summary = response.text.strip()
            except Exception as e:
                print(f"[CommitService] LLM Error: {e}")
        
        # Store in PostgreSQL
        self._store_commit_db(
            commit_hash=commit_hash,
            repo_url=repo_url,
            service_name=service_name,
            author=author,
            message=commit_msg,
            summary=summary,
            timestamp=timestamp
        )
        
        return {
            "hash": commit_hash,
            "author": author,
            "summary": summary,
            "message": commit_msg,
            "timestamp": timestamp.isoformat(),
            "service": service_name
        }

    def _store_commit_db(self, commit_hash: str, repo_url: str, service_name: str, 
                         author: str, message: str, summary: str, timestamp: datetime):
        """Store commit in PostgreSQL database."""
        db = SessionLocal()
        try:
            # Check if commit already exists
            existing = db.query(Commit).filter(Commit.hash == commit_hash).first()
            if existing:
                print(f"[CommitService] Commit {commit_hash[:7]} already exists, skipping")
                return
            
            commit = Commit(
                hash=commit_hash,
                repo_url=repo_url,
                service_name=service_name,
                author=author,
                message=message,
                summary=summary,
                timestamp=timestamp
            )
            db.add(commit)
            db.commit()
            print(f"[CommitService] ✅ Stored commit {commit_hash[:7]} for {service_name}")
        except IntegrityError as e:
            db.rollback()
            print(f"[CommitService] Commit {commit_hash[:7]} already exists (integrity error)")
        except Exception as e:
            db.rollback()
            print(f"[CommitService] Error storing commit: {e}")
        finally:
            db.close()

    def get_recent_summaries(self, limit: int = 20, service_name: str | None = None):
        """Retrieve recent commit summaries from PostgreSQL."""
        db = SessionLocal()
        try:
            query = db.query(Commit)
            if service_name:
                query = query.filter(Commit.service_name == service_name)
            commits = query.order_by(Commit.timestamp.desc()).limit(limit).all()
            result = [commit.to_dict() for commit in commits]
            print(f"[CommitService] Fetched {len(result)} commits from database")
            return result
        except Exception as e:
            print(f"[CommitService] Error fetching commits: {e}")
            import traceback
            traceback.print_exc()
            return []
        finally:
            db.close()

commit_service = CommitService()
