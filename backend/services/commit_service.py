from services.graph_service import graph_service
from services.llm_service import llm_service
from datetime import datetime
import json

class CommitService:
    def __init__(self):
        pass

    def summarize_commit(self, repo_url: str, commit_data: dict) -> dict:
        """
        Takes raw commit data from a webhook (message, modified files, etc.)
        and generates a high-level technical summary using Gemini.
        """
        commit_msg = commit_data.get("message", "No commit message")
        author = commit_data.get("author", {}).get("name", "Unknown")
        added = commit_data.get("added", [])
        modified = commit_data.get("modified", [])
        removed = commit_data.get("removed", [])
        timestamp = commit_data.get("timestamp", datetime.now().isoformat())

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
        if llm_service.enabled:
            try:
                response = llm_service.model.generate_content(prompt)
                summary = response.text.strip()
            except Exception as e:
                print(f"[CommitService] LLM Error: {e}")
        
        # Store in Neo4j
        service_name = repo_url.rstrip("/").split("/")[-1].replace(".git", "")
        self._store_commit_node(service_name, commit_data.get("id", "unknown"), author, summary, timestamp, commit_msg)
        
        return {
            "id": commit_data.get("url"),
            "author": author,
            "summary": summary,
            "message": commit_msg,
            "timestamp": timestamp
        }

    def _store_commit_node(self, service_name, commit_hash, author, summary, timestamp, raw_message):
        cypher = """
        MERGE (c:Commit {hash: $hash})
        ON CREATE SET 
            c.author = $author,
            c.summary = $summary,
            c.timestamp = $timestamp,
            c.message = $message
        WITH c
        MERGE (s:Service {name: $service_name})
        MERGE (c)-[:BELONGS_TO]->(s)
        """
        with graph_service.driver.session() as session:
            session.run(cypher, hash=commit_hash, author=author, summary=summary, timestamp=timestamp, message=raw_message, service_name=service_name)

    def get_recent_summaries(self, limit: int = 10):
        cypher = """
        MATCH (c:Commit)-[:BELONGS_TO]->(s:Service)
        RETURN c.hash as hash, c.author as author, c.summary as summary, c.timestamp as timestamp, c.message as message, s.name as service
        ORDER BY c.timestamp DESC
        LIMIT $limit
        """
        results = []
        with graph_service.driver.session() as session:
            records = session.run(cypher, limit=limit)
            for r in records:
                results.append({
                    "hash": r["hash"],
                    "author": r["author"],
                    "summary": r["summary"],
                    "timestamp": r["timestamp"],
                    "message": r["message"],
                    "service": r["service"]
                })
        return results

commit_service = CommitService()
