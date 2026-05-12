"""
System Knowledge Health API
============================
Neo4j Knowledge-Graph routes:
  GET  /knowledge-health/dashboard         – full health report (single call)
  GET  /knowledge-health/score             – health score only
  GET  /knowledge-health/coverage          – documentation coverage by node type
  GET  /knowledge-health/gaps              – knowledge gaps sorted by severity
  GET  /knowledge-health/stale             – stale / missing documentation nodes
  GET  /knowledge-health/orphaned          – orphaned (unconnected) nodes
  GET  /knowledge-health/services          – undocumented services
  POST /knowledge-health/suggest           – auto-generate doc for an undocumented node
  POST /knowledge-health/suggest-update    – auto-generate updated doc for a stale entry
  GET  /knowledge-health/templates         – list available standardized templates
  GET  /knowledge-health/templates/{type}  – fetch a specific template

Repo-Scanner routes:
  POST /knowledge-health/scan              – clone repo and return list of issues
  POST /knowledge-health/accept            – apply a single fix to the cloned repo
  POST /knowledge-health/push             – commit & push all accepted fixes
"""

from fastapi import APIRouter, Query as QParam, Body, HTTPException
from services.neo4j_health_service import neo4j_health_service
from services.health_service import health_service          # repo scanner (HealthService)
from services.git_push_service import git_push_service     # commit/push + GitHub auth

router = APIRouter(prefix="/knowledge-health", tags=["Knowledge Health"])


@router.get("/dashboard")
def get_dashboard():
    """
    Full System Knowledge Health report in one call:
    health score, overview, coverage, top gaps, stale docs,
    orphaned nodes, undocumented services.
    """
    return neo4j_health_service.get_full_dashboard()


@router.get("/score")
def get_score():
    """Composite health score (0-100) with letter grade and breakdown."""
    return neo4j_health_service.get_health_score()


@router.get("/coverage")
def get_coverage():
    """Documentation coverage per node type + overall percentage."""
    return neo4j_health_service.get_documentation_coverage()


@router.get("/gaps")
def get_gaps(
    limit: int = QParam(default=50, ge=1, le=200, description="Max gaps to return"),
):
    """
    Undocumented nodes sorted by connectivity (most critical first).
    Severity: critical (degree ≥ 3), moderate (degree ≥ 1), low (isolated).
    """
    return {"gaps": neo4j_health_service.get_knowledge_gaps(limit=limit)}


@router.get("/stale")
def get_stale():
    """Documentation nodes that are missing or not updated in 30+ days."""
    return {"stale": neo4j_health_service.get_stale_docs()}


@router.get("/orphaned")
def get_orphaned():
    """Nodes with zero connections in the knowledge graph."""
    return {"orphaned": neo4j_health_service.get_orphaned_nodes()}


@router.get("/services")
def get_undocumented_services():
    """Service nodes that have no linked Documentation node."""
    return {"services": neo4j_health_service.get_undocumented_services()}


# ── Auto-Documentation ──────────────────────────────────────────────────────────

@router.post("/suggest")
async def suggest_doc(
    name: str = Body(..., description="Node name"),
    node_type: str = Body(..., description="Node type (Function, Class, Endpoint, …)"),
):
    """
    Use the knowledge graph + LLM to auto-generate documentation for an
    undocumented node.  Returns a ready-to-use description draft.
    """
    return neo4j_health_service.generate_doc_suggestion(name, node_type)


@router.post("/suggest-update")
async def suggest_doc_update(
    doc_name: str = Body(..., description="Documentation node name or title"),
    service: str = Body(default="", description="Parent service name (optional)"),
):
    """
    Given an outdated / missing Documentation node, pull the current service
    state from the graph and generate a fresh, up-to-date documentation draft.
    """
    return neo4j_health_service.suggest_stale_doc_update(doc_name, service)


# ── Standardized templates ──────────────────────────────────────────────────────

@router.get("/templates")
def list_templates():
    """List available standardized doc templates: ADR, Incident Postmortem, Service README."""
    return {"templates": neo4j_health_service.list_templates()}


@router.get("/templates/{template_type}")
def get_template(template_type: str):
    """
    Fetch a specific standardized template.
    Types: `adr` | `incident` | `service`
    """
    return neo4j_health_service.get_template(template_type)


# ── Repo Scanner ────────────────────────────────────────────────────────────────

@router.get("/ingested-repos")
def get_ingested_repos():
    """
    Return all Service nodes that have a known repository URL so the
    frontend can show ingested repos instead of a free-text URL input.
    Falls back to parsing the description field for repos ingested via
    the git-clone path (which does not store repo_url directly).
    """
    cypher = """
    MATCH (s:Service)
    WHERE s.repo_url IS NOT NULL
       OR s.description CONTAINS 'Ingested from '
       OR s.description CONTAINS 'Ingested via GitHub API from '
    RETURN
      s.name        AS name,
      COALESCE(s.repo_url,
        CASE
          WHEN s.description CONTAINS 'Ingested via GitHub API from '
            THEN split(s.description, 'Ingested via GitHub API from ')[1]
          WHEN s.description CONTAINS 'Ingested from '
            THEN split(s.description, 'Ingested from ')[1]
          ELSE null
        END
      )             AS repo_url,
      s.language    AS language,
      s.last_ingested AS last_ingested
    ORDER BY s.name
    """
    repos = []
    try:
        with neo4j_health_service.driver.session() as session:
            for rec in session.run(cypher):
                url = (rec["repo_url"] or "").strip()
                if url:
                    repos.append({
                        "name":         rec["name"],
                        "repo_url":     url,
                        "language":     rec["language"] or "Mixed",
                        "last_ingested": str(rec["last_ingested"]) if rec["last_ingested"] else None,
                    })
    except Exception as e:
        return {"repos": [], "error": str(e)}
    return {"repos": repos}


@router.post("/scan")
async def scan_repo(
    repo_url: str = Body(..., embed=True, description="Git URL of an ingested repository"),
):
    """
    Clone the selected ingested repository and run all health checks.
    Returns a list of issues (missing docs, TODOs, vulnerable deps, etc.).
    The clone is kept on disk so /accept and /push can commit fixes.
    """
    if not repo_url or not repo_url.strip():
        raise HTTPException(status_code=400, detail="repo_url is required")
    issues, clone_dir = health_service.scan_repository(repo_url.strip())
    return {"issues": issues, "clone_dir": clone_dir}


@router.post("/accept")
async def accept_fix(
    issue: dict = Body(..., description="Full issue object returned by /scan"),
    clone_dir: str = Body(..., description="Clone directory path returned by /scan"),
):
    """
    Apply the suggested fix for a single issue to the cloned repository.
    Does NOT commit or push — call /push once all desired fixes are accepted.
    """
    applied = health_service.apply_fix(issue, clone_dir)
    return {"applied": applied, "issue_id": issue.get("id")}


@router.post("/verify-token")
async def verify_github_token(
    github_token:    str = Body(..., description="GitHub Personal Access Token"),
    github_username: str = Body(default="", description="GitHub username (optional)"),
):
    """
    Verify a GitHub Personal Access Token against the GitHub REST API.
    Returns the authenticated user's login, name, avatar, and OAuth scopes.
    """
    if not github_token or not github_token.strip():
        raise HTTPException(status_code=400, detail="github_token is required")
    return git_push_service.verify_github_token(github_token.strip(), github_username.strip())


@router.post("/push")
async def push_fixes(
    clone_dir:       str = Body(..., description="Clone directory path returned by /scan"),
    message:         str = Body(default="", description="Optional commit message"),
    github_token:    str = Body(default="", description="GitHub PAT for HTTPS push auth"),
    github_username: str = Body(default="", description="GitHub username"),
):
    """
    Commit all accepted fixes in the clone and push to origin.

    If *github_token* is provided it is temporarily embedded in the remote URL
    for the push, then immediately removed — never stored on disk.
    """
    return git_push_service.commit_and_push(
        clone_dir,
        message,
        github_token=github_token.strip(),
        github_username=github_username.strip(),
    )
