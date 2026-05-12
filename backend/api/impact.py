"""
Impact Analysis API Router
===========================
What-If Analyzer endpoints:
  GET  /impact/blast-radius    – upstream + downstream blast radius
  GET  /impact/chain           – dependency chain between two nodes
  GET  /impact/summary         – LLM-powered risk assessment
  GET  /impact/search          – search nodes by name (autocomplete)
"""

from fastapi import APIRouter, Query as QParam, Request
from typing import Optional
from services.impact_service import blast_radius, dependency_chain, impact_summary, search_nodes
from services.user_repo_service import user_repo_service

router = APIRouter(prefix="/impact", tags=["Impact Analysis"])


@router.get("/blast-radius")
async def get_blast_radius(
    request: Request,
    node: str = QParam(..., description="Name or path of the target node"),
    node_type: Optional[str] = QParam(None, description="Node type filter (Service, Function, Endpoint, etc.)"),
    depth: int = QParam(default=4, ge=1, le=8, description="Max traversal depth"),
):
    """
    Compute the blast radius of a node — all upstream dependents
    and downstream dependencies.
    """
    user = user_repo_service.require_user(request)
    repo = user_repo_service.get_active_repo(user)
    return blast_radius(node, node_type=node_type, depth=depth, repo_key=repo.repo_key)


@router.get("/chain")
async def get_dependency_chain(
    request: Request,
    source: str = QParam(..., description="Source node name"),
    target: str = QParam(..., description="Target node name"),
    max_depth: int = QParam(default=6, ge=1, le=10),
):
    """
    Find the shortest dependency chain between two nodes.
    """
    user = user_repo_service.require_user(request)
    repo = user_repo_service.get_active_repo(user)
    return dependency_chain(source, target, max_depth=max_depth, repo_key=repo.repo_key)


@router.get("/summary")
async def get_impact_summary(
    request: Request,
    node: str = QParam(..., description="Name or path of the target node"),
    node_type: Optional[str] = QParam(None, description="Node type filter"),
    depth: int = QParam(default=4, ge=1, le=8, description="Max traversal depth"),
):
    """
    LLM-powered risk assessment for changing a specific component.
    Combines blast radius data with LLM analysis.
    """
    user = user_repo_service.require_user(request)
    repo = user_repo_service.get_active_repo(user)
    return impact_summary(node, node_type=node_type, depth=depth, repo_key=repo.repo_key)


@router.get("/search")
async def search_graph_nodes(
    request: Request,
    q: str = QParam("", description="Search query"),
    node_type: Optional[str] = QParam(None, description="Filter by node type"),
    limit: int = QParam(default=20, ge=1, le=100),
):
    """
    Search for nodes in the knowledge graph by name/path.
    Powers the autocomplete in the What-If UI.
    """
    user = user_repo_service.require_user(request)
    repo = user_repo_service.get_active_repo(user)
    return {"results": search_nodes(q, node_type=node_type, limit=limit, repo_key=repo.repo_key)}
