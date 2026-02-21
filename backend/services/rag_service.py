"""
RAG Service
===========
Pipeline:
  1. Graph → Documents   : Pull nodes from Neo4j and serialize them as rich text.
  2. Embed               : Use sentence-transformers (all-MiniLM-L6-v2) to embed.
  3. Store               : Persist embeddings in ChromaDB (local, no server needed).
  4. Retrieve            : Semantic nearest-neighbour search for a user query.
  5. Generate            : Gemini assembles the answer from retrieved context.
"""

from __future__ import annotations

import hashlib
import json
import os
from typing import Any, Optional

import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
import google.generativeai as genai

from core.config import settings
from services.graph_service import graph_service

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
CHROMA_PERSIST_DIR = os.path.join(os.path.dirname(__file__), "..", "chroma_db")
COLLECTION_NAME = "knowledge_graph"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
TOP_K = 8          # Number of chunks retrieved per query
MAX_CONTEXT_CHARS = 12_000   # Rough limit before we truncate context for Gemini


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

        # --- Gemini ---
        if settings.GEMINI_API_KEY:
            genai.configure(api_key=settings.GEMINI_API_KEY)
            self._llm = genai.GenerativeModel("gemini-2.0-flash")
            self._llm_enabled = True
        else:
            print("[RAG] GEMINI_API_KEY not set – answers will be context-only.")
            self._llm = None
            self._llm_enabled = False

    # ------------------------------------------------------------------
    # 1. Build / Refresh Vector Store from Neo4j
    # ------------------------------------------------------------------

    def _fetch_all_nodes(self) -> list[dict]:
        """Query Neo4j for every node and return label + props."""
        cypher = """
        MATCH (n)
        RETURN labels(n) AS labels, properties(n) AS props
        LIMIT 5000
        """
        nodes = []
        with graph_service.driver.session() as session:
            for record in session.run(cypher):
                labels = record["labels"]
                props = dict(record["props"])
                label = labels[0] if labels else "Unknown"
                nodes.append({"label": label, "props": props})
        return nodes

    def _fetch_relationships(self) -> list[dict]:
        """
        Enrich context with relationship triplets stored as extra documents.
        e.g.  Service 'auth' -[CALLS]-> Service 'users'
        """
        cypher = """
        MATCH (a)-[r]->(b)
        RETURN labels(a)[0] AS src_label,
               properties(a) AS src_props,
               type(r)       AS rel_type,
               labels(b)[0]  AS dst_label,
               properties(b) AS dst_props
        LIMIT 3000
        """
        rows = []
        with graph_service.driver.session() as session:
            for record in session.run(cypher):
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

    def sync_graph_to_vector_store(self) -> dict:
        """
        Pull the full Knowledge Graph from Neo4j, embed every node + relationship,
        and upsert into ChromaDB.  Returns a status dict.
        """
        documents: list[str] = []
        ids: list[str] = []
        metadatas: list[dict] = []

        # ---- Nodes ----
        nodes = self._fetch_all_nodes()
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
            })

        # ---- Relationships ----
        rels = self._fetch_relationships()
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
                print(f"[RAG] ⚠️  Skipping duplicate ID: {doc_id}")

        duplicates_dropped = len(documents) - len(deduped_docs)
        if duplicates_dropped:
            print(f"[RAG] Dropped {duplicates_dropped} duplicate IDs before upsert.")

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
        print(f"[RAG] {msg}")
        return {"status": "success", "message": msg, "document_count": total_upserted}

    # ------------------------------------------------------------------
    # 2. Retrieve
    # ------------------------------------------------------------------

    def retrieve(self, query: str, top_k: int = TOP_K) -> list[dict]:
        """Semantic search on the vector store."""
        count = self._collection.count()
        if count == 0:
            return []

        results = self._collection.query(
            query_texts=[query],
            n_results=min(top_k, count),
            include=["documents", "metadatas", "distances"],
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

    def answer(self, question: str, top_k: int = TOP_K) -> dict:
        """
        Full RAG pipeline:
          retrieve → build prompt → call Gemini → return answer + sources.
        """
        chunks = self.retrieve(question, top_k=top_k)

        if not chunks:
            return {
                "answer": (
                    "The vector store is empty. "
                    "Please run **Sync Knowledge Graph** first to index your code."
                ),
                "sources": [],
                "context_used": 0,
            }

        # Build context string
        context_parts: list[str] = []
        total_chars = 0
        for c in chunks:
            segment = c["text"]
            if total_chars + len(segment) > MAX_CONTEXT_CHARS:
                break
            context_parts.append(segment)
            total_chars += len(segment)

        context = "\n\n---\n\n".join(context_parts)

        if not self._llm_enabled:
            # Fallback: just return raw context
            return {
                "answer": "LLM not configured. Raw context:\n\n" + context,
                "sources": chunks,
                "context_used": len(context_parts),
            }

        prompt = f"""You are an expert software architect assistant with access to a structured knowledge graph of a codebase.

Below is the relevant context extracted from the knowledge graph (services, modules, files, classes, functions, endpoints, schemas, and their relationships).

=== KNOWLEDGE GRAPH CONTEXT ===
{context}
=== END OF CONTEXT ===

Based ONLY on the information above, answer the following question thoroughly and precisely. If the answer cannot be determined from the context, say so clearly.

Question: {question}

Answer:"""

        try:
            response = self._llm.generate_content(prompt)
            answer_text = response.text.strip()
        except Exception as e:
            answer_text = f"⚠️ LLM error: {e}\n\nFallback – raw context returned above."

        return {
            "answer": answer_text,
            "sources": chunks,
            "context_used": len(context_parts),
        }

    # ------------------------------------------------------------------
    # 4. Stats
    # ------------------------------------------------------------------

    def stats(self) -> dict:
        count = self._collection.count()
        return {
            "document_count": count,
            "collection_name": COLLECTION_NAME,
            "embedding_model": EMBEDDING_MODEL,
            "llm_enabled": self._llm_enabled,
        }


rag_service = RAGService()
