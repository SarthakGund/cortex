"""
RAG API Router
==============
Endpoints:
  POST /rag/sync       – Pull Neo4j graph into ChromaDB vector store
  POST /rag/ask        – Ask a question; returns LLM answer + sources
  POST /rag/retrieve   – Raw semantic retrieval (no LLM)
  GET  /rag/stats      – Collection statistics
"""

import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel, Field
from services.rag_service import rag_service
from services.user_repo_service import user_repo_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rag", tags=["RAG"])


# ---- Request / Response models -----------------------------------------------

class SyncResponse(BaseModel):
    status: str
    message: str
    document_count: int = 0


class AskRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=1000)
    top_k: int = Field(default=8, ge=1, le=20)


class SourceChunk(BaseModel):
    text: str
    metadata: dict
    score: float


class AskResponse(BaseModel):
    answer: str
    sources: list[SourceChunk]
    context_used: int


class RetrieveRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=500)
    top_k: int = Field(default=8, ge=1, le=20)


class ChatMessage(BaseModel):
    role: str   # 'user' | 'assistant'
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1)
    top_k: int = Field(default=8, ge=1, le=20)


class StatsResponse(BaseModel):
    document_count: int
    collection_name: str
    embedding_model: str
    llm_enabled: bool


# ---- Routes ------------------------------------------------------------------

@router.post("/sync", response_model=SyncResponse)
async def sync_graph(request: Request, background_tasks: BackgroundTasks):
    """
    Ingest/refresh the ChromaDB vector store from the Neo4j Knowledge Graph.
    Runs in the background so the HTTP response is immediate.
    """
    user = user_repo_service.require_user(request)
    repo = user_repo_service.get_active_repo(user)
    background_tasks.add_task(_do_sync, repo.repo_key)
    return SyncResponse(
        status="processing",
        message="Graph-to-vector sync started in background. Check /rag/stats for progress.",
    )


async def _do_sync(repo_key: str):
    """Background wrapper so errors don't crash the server."""
    try:
        result = rag_service.sync_graph_to_vector_store(repo_key)
        logger.info("[RAG Sync] %s", result)
    except Exception:
        logger.exception("[RAG Sync] Failed for repo_key=%s", repo_key)


@router.post("/sync/wait", response_model=SyncResponse)
async def sync_graph_sync(request: Request):
    """
    Synchronous version of /rag/sync (waits for completion).
    Useful for smaller graphs or during development.
    """
    user = user_repo_service.require_user(request)
    repo = user_repo_service.get_active_repo(user)

    logger.info("RAG sync/wait triggered for repo: %s", repo.repo_key)
    try:
        result = rag_service.sync_graph_to_vector_store(repo.repo_key)
        logger.info("RAG sync complete for %s: %s", repo.repo_key, result)
        return SyncResponse(**result)
    except Exception as e:
        logger.exception("RAG sync failed for %s", repo.repo_key)
        return SyncResponse(status="error", message=f"{type(e).__name__}: {e}", document_count=0)


@router.post("/ask", response_model=AskResponse)
async def ask_question(request: Request, payload: AskRequest):
    """
    RAG Q&A: retrieve relevant graph context then generate an answer with the LLM.
    Uses multi-hop Cypher traversal for dependency/impact questions.
    """
    try:
        user = user_repo_service.require_user(request)
        repo = user_repo_service.get_active_repo(user)
        result = rag_service.multi_hop_query(payload.question, repo_key=repo.repo_key)
        return AskResponse(
            answer=result["answer"],
            sources=result["sources"],
            context_used=result["context_used"],
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat", response_model=AskResponse)
async def chat(request: Request, payload: ChatRequest):
    """
    Multi-turn RAG chat.  Pass the full conversation history as a list of
    {role, content} messages.  The last user message drives retrieval.
    """
    try:
        user = user_repo_service.require_user(request)
        repo = user_repo_service.get_active_repo(user)
        result = rag_service.chat(
            messages=[m.model_dump() for m in payload.messages],
            top_k=payload.top_k,
            repo_key=repo.repo_key,
        )
        return AskResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/retrieve", response_model=list[SourceChunk])
async def retrieve_context(request: Request, payload: RetrieveRequest):
    """
    Pure semantic retrieval – returns the closest chunks without LLM generation.
    """
    try:
        user = user_repo_service.require_user(request)
        repo = user_repo_service.get_active_repo(user)
        chunks = rag_service.retrieve(payload.query, top_k=payload.top_k, repo_key=repo.repo_key)
        return [SourceChunk(**c) for c in chunks]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/clear")
async def clear_vector_store(request: Request):
    """
    Delete all documents from the ChromaDB vector store.
    The collection is preserved and can be re-synced immediately.
    """
    try:
        user = user_repo_service.require_user(request)
        repo = user_repo_service.get_active_repo(user)
        result = rag_service.clear_vector_store(repo_key=repo.repo_key)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats", response_model=StatsResponse)
async def get_stats(request: Request):
    """Returns ChromaDB collection statistics."""
    try:
        user = user_repo_service.require_user(request)
        repo = user_repo_service.get_active_repo(user)
        return StatsResponse(**rag_service.stats(repo_key=repo.repo_key))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
