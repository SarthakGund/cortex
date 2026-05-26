"""
RAG Service
===========
Pipeline:
  1. Graph → Documents   : Pull nodes from Neo4j and serialize them as rich text.
  2. Embed               : Use sentence-transformers (all-MiniLM-L6-v2) to embed.
  3. Store               : Persist embeddings in ChromaDB (local, no server needed).
  4. Retrieve            : Semantic nearest-neighbour search for a user query.
    5. Generate            : LLM assembles the answer from retrieved context.
  6. Multi-hop           : Cypher-based graph traversal for dependency / impact queries.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re

import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction

from services.graph_service import graph_service
from services.llm_service import llm_service

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
CHROMA_PERSIST_DIR = os.path.join(os.path.dirname(__file__), "..", "chroma_db")
COLLECTION_NAME = "knowledge_graph"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
TOP_K = 8          # Number of chunks retrieved per query
MAX_CONTEXT_CHARS = 12_000   # Rough limit before we truncate context for the LLM


# ---------------------------------------------------------------------------
# Helper: serialize a Neo4j node into a human-readable text document
# ---------------------------------------------------------------------------

def _node_to_text(label: str, props: dict) -> str:
    """Convert a graph node to a rich plain-text string for embedding."""
    lines = [f"[{label.upper()}]"]
    for k, v in props.items():
        if v is None or k == "last_updated":
            continue
        if isinstance(v, list):
            v = ", ".join(str(i) for i in v)
        lines.append(f"  {k}: {v}")
    return "\n".join(lines)


def _node_id(label: str, props: dict) -> str:
    """
    Derive a stable, globally-unique ID for a graph node.

    Strategy:
      - Compose a human-readable prefix from:  label :: service :: file_path :: class :: name/path
      - Append an 8-char MD5 hash of ALL props so two nodes with identical
        names in different files always get different IDs.
    """
    parts = [label]
    for field in ("service", "file_path", "class", "name", "path", "schema_name", "method"):
        val = props.get(field)
        if val:
            parts.append(str(val))

    prefix = "::".join(parts)

    # Short hash of full props for collision-proof uniqueness
    props_hash = hashlib.md5(
        json.dumps(props, sort_keys=True, default=str).encode()
    ).hexdigest()[:8]

    unique_id = f"{prefix}::{props_hash}"
    # ChromaDB max ID length is 512 chars
    return unique_id[:512]


# ---------------------------------------------------------------------------
# RAG Service
# ---------------------------------------------------------------------------

class RAGService:
    def __init__(self):
        # --- ChromaDB (persistent local store) ---
        self._client = chromadb.PersistentClient(path=os.path.abspath(CHROMA_PERSIST_DIR))
        self._ef = SentenceTransformerEmbeddingFunction(model_name=EMBEDDING_MODEL)
        self._collection = self._client.get_or_create_collection(
            name=COLLECTION_NAME,
            embedding_function=self._ef,
            metadata={"hnsw:space": "cosine"},
        )

        # --- LLM ---
        self._llm_enabled = llm_service.enabled
        if not self._llm_enabled:
            logger.warning("[RAG] LLM not configured — answers will be context-only.")

    def _count_documents(self, where: dict | None = None) -> int:
        """Count documents, with fallback for Chroma versions lacking count(where=...)."""
        if not where:
            return self._collection.count()
        try:
            return self._collection.count(where=where)
        except TypeError:
            return len(self._collection.get(where=where, include=[])['ids'])

    # ------------------------------------------------------------------
    # 1. Build / Refresh Vector Store from Neo4j
    # ------------------------------------------------------------------

    def _fetch_all_nodes(self, repo_key: str) -> list[dict]:
        """Query Neo4j for every node in a repo and return label + props."""
        cypher = """
        MATCH (n)
        WHERE n.service = $service
        RETURN labels(n) AS labels, properties(n) AS props
        LIMIT 5000
        """
        nodes = []
        with graph_service.driver.session() as session:
            for record in session.run(cypher, service=repo_key):
                labels = record["labels"]
                props = dict(record["props"])
                label = labels[0] if labels else "Unknown"
                nodes.append({"label": label, "props": props})
        return nodes

    def _fetch_relationships(self, repo_key: str) -> list[dict]:
        """
        Enrich context with relationship triplets stored as extra documents.
        e.g.  Service 'auth' -[CALLS]-> Service 'users'
        """
        cypher = """
        MATCH (a)-[r]->(b)
        WHERE a.service = $service AND b.service = $service
        RETURN labels(a)[0] AS src_label,
               properties(a) AS src_props,
               type(r)       AS rel_type,
               labels(b)[0]  AS dst_label,
               properties(b) AS dst_props
        LIMIT 3000
        """
        rows = []
        with graph_service.driver.session() as session:
            for record in session.run(cypher, service=repo_key):
                rows.append({
                    "src_label":  record["src_label"],
                    "src_props":  dict(record["src_props"]),
                    "rel_type":   record["rel_type"],
                    "dst_label":  record["dst_label"],
                    "dst_props":  dict(record["dst_props"]),
                })
        return rows

    def _rel_to_text(self, row: dict) -> str:
        src_name = row["src_props"].get("name") or row["src_props"].get("path") or "?"
        dst_name = row["dst_props"].get("name") or row["dst_props"].get("path") or "?"
        return (
            f"[RELATIONSHIP]\n"
            f"  ({row['src_label']}: {src_name}) "
            f"-[{row['rel_type']}]-> "
            f"({row['dst_label']}: {dst_name})"
        )

    def sync_graph_to_vector_store(self, repo_key: str) -> dict:
        """
        Pull the full Knowledge Graph from Neo4j, embed every node + relationship,
        and upsert into ChromaDB.  Returns a status dict.
        """
        if not repo_key:
            return {"status": "error", "message": "repo_key is required", "document_count": 0}

        documents: list[str] = []
        ids: list[str] = []
        metadatas: list[dict] = []

        # ---- Nodes ----
        nodes = self._fetch_all_nodes(repo_key)
        for node in nodes:
            label = node["label"]
            props = node["props"]
            text = _node_to_text(label, props)
            doc_id = _node_id(label, props)
            documents.append(text)
            ids.append(doc_id)
            metadatas.append({
                "label": label,
                "service": str(props.get("service", "")),
                "name": str(props.get("name") or props.get("path") or ""),
                "repo_key": repo_key,
            })

        # ---- Relationships ----
        rels = self._fetch_relationships(repo_key)
        for i, row in enumerate(rels):
            text = self._rel_to_text(row)
            # Include a hash of src+rel+dst so identical rel types don't collide
            rel_hash = hashlib.md5(
                json.dumps(row, sort_keys=True, default=str).encode()
            ).hexdigest()[:8]
            doc_id = f"rel::{row['rel_type']}::{i}::{rel_hash}"
            documents.append(text)
            ids.append(doc_id[:512])
            metadatas.append({
                "label": "Relationship",
                "service": "",
                "name": row["rel_type"],
                "repo_key": repo_key,
            })

        if not documents:
            return {"status": "warning", "message": "No data found in the Knowledge Graph.",
                    "document_count": 0}

        # ---- Deduplicate (belt-and-suspenders) ----
        seen_ids: set[str] = set()
        deduped_docs, deduped_ids, deduped_meta = [], [], []
        for doc, doc_id, meta in zip(documents, ids, metadatas):
            if doc_id not in seen_ids:
                seen_ids.add(doc_id)
                deduped_docs.append(doc)
                deduped_ids.append(doc_id)
                deduped_meta.append(meta)
            else:
                logger.debug("Skipping duplicate ChromaDB ID: %s", doc_id)

        duplicates_dropped = len(documents) - len(deduped_docs)
        if duplicates_dropped:
            logger.debug("Dropped %d duplicate IDs before upsert", duplicates_dropped)

        # ---- Upsert in batches of 500 (ChromaDB limit) ----
        batch_size = 500
        total_upserted = 0
        for start in range(0, len(deduped_docs), batch_size):
            self._collection.upsert(
                documents=deduped_docs[start: start + batch_size],
                ids=deduped_ids[start: start + batch_size],
                metadatas=deduped_meta[start: start + batch_size],
            )
            total_upserted += len(deduped_docs[start: start + batch_size])

        msg = (
            f"Synced {len(nodes)} nodes and {len(rels)} relationships "
            f"({total_upserted} unique documents) into ChromaDB."
            + (f" ({duplicates_dropped} duplicates skipped.)" if duplicates_dropped else "")
        )
        logger.info(msg)
        return {"status": "success", "message": msg, "document_count": total_upserted}

    # ------------------------------------------------------------------
    # 2. Retrieve
    # ------------------------------------------------------------------

    def retrieve(self, query: str, top_k: int = TOP_K, repo_key: str | None = None) -> list[dict]:
        """Semantic search on the vector store."""
        where = {"repo_key": repo_key} if repo_key else None
        count = self._count_documents(where)
        if count == 0:
            return []

        results = self._collection.query(
            query_texts=[query],
            n_results=min(top_k, count),
            include=["documents", "metadatas", "distances"],
            where=where,
        )

        chunks = []
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            chunks.append({
                "text":     doc,
                "metadata": meta,
                "score":    round(1 - dist, 4),   # cosine similarity
            })
        return chunks

    # ------------------------------------------------------------------
    # 3. Generate answer (RAG)
    # ------------------------------------------------------------------

    def _build_context(self, chunks: list[dict]) -> tuple[str, int]:
        """
        Group retrieved chunks by their graph label and format them as a
        structured XML-like context block so the LLM can reason over them
        more reliably.
        Returns (context_string, number_of_chunks_used).
        """
        # Group by label for readability
        grouped: dict[str, list[str]] = {}
        total_chars = 0
        used = 0
        for c in chunks:
            segment = c["text"]
            if total_chars + len(segment) > MAX_CONTEXT_CHARS:
                break
            label = c["metadata"].get("label", "Unknown")
            grouped.setdefault(label, []).append(segment)
            total_chars += len(segment)
            used += 1

        sections: list[str] = []
        for label, texts in grouped.items():
            block = f"<{label}s>\n" + "\n\n".join(texts) + f"\n</{label}s>"
            sections.append(block)

        return "\n\n".join(sections), used

    def answer(self, question: str, top_k: int = TOP_K, repo_key: str | None = None) -> dict:
        """
        Full RAG pipeline:
          retrieve → structure context → build prompt → call LLM → return answer + sources.
        """
        chunks = self.retrieve(question, top_k=top_k, repo_key=repo_key)

        if not chunks:
            return {
                "answer": (
                    "The vector store is empty. "
                    "Please run **Sync Knowledge Graph** first to index your code."
                ),
                "sources": [],
                "context_used": 0,
            }

        context, context_used = self._build_context(chunks)

        if not self._llm_enabled:
            return {
                "answer": "LLM not configured. Raw context:\n\n" + context,
                "sources": chunks,
                "context_used": context_used,
            }

        prompt = f"""You are Cortex — an expert software architecture assistant backed by a living knowledge graph.

The knowledge graph contains the following node types:
- Service: microservices or applications
- Module / File: code files and modules
- Class / Function: code-level entities
- Endpoint: REST/GraphQL API endpoints (path, method, auth requirements)
- Database / Table: persistence layer
- MessageQueue: async messaging
- Developer: code owners (from git blame)
- ADR: Architecture Decision Records
- Incident: production incidents
- Documentation: docs linked to the codebase
- Relationship: directed edges between the above (CALLS, IMPORTS, DEPENDS_ON, WRITES_TO, READS_FROM, OWNED_BY, IMPLEMENTS, EXPOSES)

Below is the most semantically relevant slice of the knowledge graph for this question:

{context}

Instructions:
1. Answer the question using ONLY the context above.
2. Be specific — reference actual node names, file paths, function names, or service names from the context.
3. If you describe a dependency or call chain, trace it explicitly (A → B → C).
4. If the context is insufficient to answer fully, state what is missing and your best inference.
5. Format your answer in clear markdown with headings, bullet points, and code blocks where appropriate.

Question: {question}

Answer:"""

        try:
            answer_text = llm_service.generate_text(
                prompt,
                temperature=0.2,
                max_output_tokens=2048,
            )
        except Exception as e:
            answer_text = (
                f"⚠️ LLM generation failed: {type(e).__name__}: {e}\n\n"
                "**Fallback — raw retrieved context:**\n\n" + context
            )

        return {
            "answer": answer_text,
            "sources": chunks,
            "context_used": context_used,
        }

    def chat(self, messages: list[dict], top_k: int = TOP_K, repo_key: str | None = None) -> dict:
        """
        Multi-turn RAG chat.
        messages: list of {role: 'user'|'assistant', content: str}
        The last user message is used as the retrieval query.
        Returns the same shape as answer().
        """
        if not messages:
            raise ValueError("messages list is empty")

        # Find the last user message to use as retrieval query
        user_messages = [m for m in messages if m.get("role") == "user"]
        if not user_messages:
            raise ValueError("No user message found")
        query = user_messages[-1]["content"]

        chunks = self.retrieve(query, top_k=top_k, repo_key=repo_key)
        if not chunks:
            return {
                "answer": "The vector store is empty. Please sync the knowledge graph first.",
                "sources": [],
                "context_used": 0,
            }

        context, context_used = self._build_context(chunks)

        if not self._llm_enabled:
            return {
                "answer": "LLM not configured.\n\nContext:\n\n" + context,
                "sources": chunks,
                "context_used": context_used,
            }

        # Build chat history string
        history_lines: list[str] = []
        for m in messages[:-1]:   # all except the last user message
            role = "User" if m["role"] == "user" else "Assistant"
            history_lines.append(f"{role}: {m['content']}")
        history_str = "\n".join(history_lines)

        prompt = f"""You are Cortex — an expert software architecture assistant backed by a living knowledge graph.

Relevant knowledge graph context:
{context}

{'Previous conversation:' if history_str else ''}
{history_str}

Instructions:
- Answer using ONLY the context above plus the conversation history.
- Reference specific node names, paths, and relationships.
- Be concise but precise. Use markdown.

User: {query}
Assistant:"""

        try:
            answer_text = llm_service.generate_text(
                prompt,
                temperature=0.2,
                max_output_tokens=2048,
            )
        except Exception as e:
            answer_text = f"⚠️ LLM error: {type(e).__name__}: {e}"

        return {
            "answer": answer_text,
            "sources": chunks,
            "context_used": context_used,
        }

    # ------------------------------------------------------------------
    # 4. Multi-hop graph traversal (Cypher-based impact queries)
    # ------------------------------------------------------------------

    def multi_hop_query(self, question: str, repo_key: str | None = None) -> dict:
        """
        Attempt to answer a question using direct Cypher graph traversal
        before falling back to vector retrieval.  Supports patterns like:
          - "What depends on X?"
          - "What would break if I change X?"
          - "What APIs does service X expose?"
          - "What calls function Y?"
          - "Show me the dependency chain from A to B"
        """
        # Step 1: Use LLM to extract entity names and generate Cypher
        cypher, entity = self._generate_cypher(question)

        graph_context = ""
        if cypher:
            try:
                graph_context = self._execute_cypher(cypher)
            except Exception as e:
                logger.warning("Cypher execution failed: %s", e)
                graph_context = ""

        # Step 2: Also do vector retrieval for supplementary context
        chunks = self.retrieve(question, top_k=TOP_K, repo_key=repo_key)
        vector_context, context_used = self._build_context(chunks)

        if not self._llm_enabled:
            return {
                "answer": "LLM not configured.\n\n" + (graph_context or vector_context),
                "sources": chunks,
                "context_used": context_used,
                "cypher_used": cypher,
            }

        # Step 3: Combine both contexts for the LLM
        combined_context = ""
        if graph_context:
            combined_context += f"<GraphTraversal>\n{graph_context}\n</GraphTraversal>\n\n"
        combined_context += vector_context

        prompt = f"""You are Cortex — an expert software architecture assistant backed by a living knowledge graph.

You have TWO sources of context:
1. **Graph Traversal** — direct Cypher query results showing exact relationships and dependencies from Neo4j.
2. **Vector Search** — semantically similar nodes from the knowledge graph embeddings.

The Graph Traversal results are more authoritative for dependency/impact questions.

{combined_context}

Instructions:
1. Answer the question using the context above, preferring Graph Traversal data when available.
2. Be specific — reference actual node names, file paths, function names, or service names.
3. If describing a dependency or call chain, trace it explicitly (A → B → C).
4. For impact/what-if questions, clearly list ALL affected components with their type (Service, Function, Endpoint, etc.).
5. If the context is insufficient, state what is missing and your best inference.
6. Format in clear markdown with headings, bullet points, and code blocks.

Question: {question}

Answer:"""

        try:
            answer_text = llm_service.generate_text(
                prompt,
                temperature=0.15,
                max_output_tokens=3072,
            )
        except Exception as e:
            answer_text = f"⚠️ LLM error: {e}\n\n**Raw context:**\n\n{combined_context}"

        return {
            "answer": answer_text,
            "sources": chunks,
            "context_used": context_used,
            "cypher_used": cypher,
        }

    def _generate_cypher(self, question: str) -> tuple[str, str]:
        """
        Use the LLM to convert a natural language question into a Cypher query.
        Returns (cypher_query, entity_name) or ("", "") if not applicable.
        """
        if not self._llm_enabled:
            return "", ""

        prompt = f"""Given this question about a software architecture knowledge graph, generate a Neo4j Cypher query to answer it.

The graph has these node types: Service, Module, File, Class, Function, Schema, Endpoint, Database, Table, MessageQueue, Developer, ADR, Incident, Documentation
The graph has these edge types: EXPOSES, USES_DB, HAS_TABLE, PUBLISHES_TO, DEPENDS_ON, HAS_MODULE, CONTAINS, DEFINES, EXTENDS, HAS_METHOD, IMPORTS, CALLS, WRITES_TO, READS_FROM, OWNED_BY, HAS_ADR, IMPLEMENTS, HAD_INCIDENT, HAS_DOC

Important: Node names are stored in the 'name' property, file paths in 'path'.

Question: {question}

Instructions:
- Output ONLY the Cypher query, nothing else.
- Use variable-length path patterns [*1..4] for multi-hop traversal.
- For "what depends on X", traverse INCOMING edges (things that point TO X).
- For "what does X depend on", traverse OUTGOING edges (things X points TO).
- For "blast radius" or "impact" questions, traverse ALL incoming relationship paths.
- Always RETURN useful properties (name, path, type, etc.) not just nodes.
- Use case-insensitive matching with toLower() for node names.
- LIMIT results to 50.
- If the question cannot be answered with a Cypher query, output: NONE

Cypher:"""

        try:
            raw = llm_service.generate_text(
                prompt,
                temperature=0.0,
                max_output_tokens=512,
            )
            # Strip markdown fences
            raw = re.sub(r"^```(?:cypher|sql)?\s*", "", raw, flags=re.MULTILINE)
            raw = re.sub(r"\s*```$", "", raw, flags=re.MULTILINE)
            raw = raw.strip()
            if raw.upper() == "NONE" or not raw:
                return "", ""
            # Basic sanity checks to avoid invalid Cypher (e.g., SQL-style FROM)
            upper_raw = raw.upper()
            first_line = next((ln.strip() for ln in raw.splitlines() if ln.strip()), "")
            if " FROM " in upper_raw or first_line.startswith("FROM "):
                return "", ""
            if not (
                first_line.startswith("MATCH ") or
                first_line.startswith("OPTIONAL MATCH ") or
                first_line.startswith("WITH ") or
                first_line.startswith("CALL ")
            ):
                return "", ""
            # Extract entity name from the question for reference
            entity = ""
            return raw, entity
        except Exception as e:
            logger.warning("Cypher generation failed: %s", e)
            return "", ""

    def _execute_cypher(self, cypher: str) -> str:
        """Execute a Cypher query and format the results as readable text."""
        lines = []
        with graph_service.driver.session() as session:
            result = session.run(cypher)
            records = list(result)
            if not records:
                return "(No results found for this graph traversal.)"

            for rec in records[:50]:
                parts = []
                for key in rec.keys():
                    val = rec[key]
                    if hasattr(val, 'items'):  # Node
                        props = dict(val.items())
                        labels = list(val.labels) if hasattr(val, 'labels') else []
                        name = props.get('name') or props.get('path') or str(props)[:80]
                        parts.append(f"[{','.join(labels)}] {name}")
                    elif hasattr(val, 'type'):  # Relationship
                        parts.append(f"-[{val.type}]->")
                    elif isinstance(val, list):
                        parts.append(str(val))
                    else:
                        parts.append(str(val))
                lines.append(" | ".join(parts))
        return "\n".join(lines)

    # ------------------------------------------------------------------
    # 5. Stats
    # ------------------------------------------------------------------

    def clear_vector_store(self, repo_key: str | None = None) -> dict:
        """
        Delete all documents from the ChromaDB collection.
        The collection itself is preserved so it can be re-synced immediately.
        Returns a status dict.
        """
        where = {"repo_key": repo_key} if repo_key else None
        count_before = self._count_documents(where)
        if count_before == 0:
            return {"status": "ok", "message": "Collection is already empty.", "deleted": 0}

        if where:
            self._collection.delete(where=where)
            return {
                "status": "success",
                "message": f"Deleted {count_before} documents for repo.",
                "deleted": count_before,
            }

        # Delete the collection and recreate it (fastest way to wipe everything)
        self._client.delete_collection(COLLECTION_NAME)
        self._collection = self._client.get_or_create_collection(
            name=COLLECTION_NAME,
            embedding_function=self._ef,
            metadata={"hnsw:space": "cosine"},
        )
        logger.info("Cleared %d documents from ChromaDB collection '%s'", count_before, COLLECTION_NAME)
        return {
            "status": "success",
            "message": f"Deleted all {count_before} documents. Collection is now empty.",
            "deleted": count_before,
        }

    # ------------------------------------------------------------------
    # 7. Stats
    # ------------------------------------------------------------------

    def stats(self, repo_key: str | None = None) -> dict:
        where = {"repo_key": repo_key} if repo_key else None
        count = self._count_documents(where)
        return {
            "document_count": count,
            "collection_name": COLLECTION_NAME,
            "embedding_model": EMBEDDING_MODEL,
            "llm_enabled": self._llm_enabled,
        }


rag_service = RAGService()
