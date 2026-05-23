import logging
from datetime import datetime
from sqlalchemy.exc import IntegrityError

from core.database import SessionLocal
from core.models import Commit

logger = logging.getLogger(__name__)

# Try to import LLM service, but don't fail if it's not available
try:
    from services.llm_service import llm_service
    LLM_AVAILABLE = True
except Exception as e:
    logger.warning("LLM service not available: %s", e)
    LLM_AVAILABLE = False
    llm_service = None


class CommitService:
    def summarize_commit(self, repo_url: str, commit_data: dict, service_name_override: str | None = None) -> dict:
        commit_hash = commit_data.get("id", "unknown")
        commit_msg = commit_data.get("message", "No commit message")
        author_data = commit_data.get("author", {})
        author = author_data.get("name", author_data.get("username", "Unknown"))
        added = commit_data.get("added", [])
        modified = commit_data.get("modified", [])
        removed = commit_data.get("removed", [])
        timestamp_str = commit_data.get("timestamp", datetime.now().isoformat())

        try:
            timestamp = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
        except Exception:
            timestamp = datetime.now()

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
                logger.warning("LLM error summarising commit %s: %s", commit_hash[:7], e)

        self._store_commit_db(
            commit_hash=commit_hash,
            repo_url=repo_url,
            service_name=service_name,
            author=author,
            message=commit_msg,
            summary=summary,
            timestamp=timestamp,
        )

        return {
            "hash": commit_hash,
            "author": author,
            "summary": summary,
            "message": commit_msg,
            "timestamp": timestamp.isoformat(),
            "service": service_name,
        }

    def _store_commit_db(self, commit_hash: str, repo_url: str, service_name: str,
                         author: str, message: str, summary: str, timestamp: datetime):
        db = SessionLocal()
        try:
            existing = db.query(Commit).filter(Commit.hash == commit_hash).first()
            if existing:
                logger.debug("Commit %s already exists, skipping", commit_hash[:7])
                return

            commit = Commit(
                hash=commit_hash,
                repo_url=repo_url,
                service_name=service_name,
                author=author,
                message=message,
                summary=summary,
                timestamp=timestamp,
            )
            db.add(commit)
            db.commit()
            logger.info("Stored commit %s for %s", commit_hash[:7], service_name)
        except IntegrityError:
            db.rollback()
            logger.debug("Commit %s already exists (integrity error)", commit_hash[:7])
        except Exception as e:
            db.rollback()
            logger.exception("Error storing commit %s", commit_hash[:7])
        finally:
            db.close()

    def get_recent_summaries(self, limit: int = 20, service_name: str | None = None):
        db = SessionLocal()
        try:
            query = db.query(Commit)
            if service_name:
                query = query.filter(Commit.service_name == service_name)
            commits = query.order_by(Commit.timestamp.desc()).limit(limit).all()
            result = [commit.to_dict() for commit in commits]
            logger.debug("Fetched %d commits from database", len(result))
            return result
        except Exception as e:
            logger.exception("Error fetching commits")
            return []
        finally:
            db.close()


commit_service = CommitService()
