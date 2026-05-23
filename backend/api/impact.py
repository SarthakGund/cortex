"""
Impact Analysis API Router
===========================
What-If Analyzer endpoints:
  GET  /impact/blast-radius    – upstream + downstream blast radius
  GET  /impact/chain           – dependency chain between two nodes
  GET  /impact/summary         – LLM-powered risk assessment
  GET  /impact/search          – search nodes by name (autocomplete)

  POST /impact/whatif          – run a what-if scenario simulation
  GET  /impact/whatif/scenarios – list available scenario types
  POST /impact/spec-diff       – compare two OpenAPI specs
  POST /impact/spec-diff/upload – upload and compare OpenAPI spec versions
  GET  /impact/schema-evolution – analyze schema evolution impact
  POST /impact/generate-report  – generate impact report
"""

from fastapi import APIRouter, Query as QParam, Request, Body, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from typing import Optional
import json

from services.impact_service import blast_radius, dependency_chain, impact_summary, search_nodes
from services.whatif_service import (
    run_whatif_scenario,
    WhatIfScenario,
    ScenarioType,
    analyze_schema_evolution,
)
from services.openapi_service import (
    parse_openapi_spec,
    generate_diff,
    OpenAPISpec,
    SpecDiff,
)
from services.user_repo_service import user_repo_service
from services.graph_service import graph_service

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


# ── What-If Scenarios ────────────────────────────────────────────────────────

@router.get("/whatif/scenarios")
async def get_scenario_types(request: Request):
    """
    List all available what-if scenario types with descriptions.
    """
    scenarios = [
        {
            "type": ScenarioType.DEPRECATE_ENDPOINT.value,
            "name": "Deprecate Endpoint",
            "description": "Mark an API endpoint as deprecated and forecast impact",
            "parameters": [],
        },
        {
            "type": ScenarioType.REMOVE_ENDPOINT.value,
            "name": "Remove Endpoint",
            "description": "Simulate what happens if an endpoint is completely removed",
            "parameters": [],
        },
        {
            "type": ScenarioType.CHANGE_FIELD_TYPE.value,
            "name": "Change Field Type",
            "description": "Simulate changing a field's data type",
            "parameters": ["field", "old_type", "new_type"],
        },
        {
            "type": ScenarioType.REMOVE_SCHEMA.value,
            "name": "Remove Schema",
            "description": "Simulate removing a data schema/model",
            "parameters": [],
        },
        {
            "type": ScenarioType.ADD_SCHEMA.value,
            "name": "Add New Schema",
            "description": "Forecast how adding a new schema will impact consumers",
            "parameters": [],
        },
        {
            "type": ScenarioType.ADD_ENDPOINT.value,
            "name": "Add New Endpoint",
            "description": "See which services might benefit from a new endpoint",
            "parameters": [],
        },
        {
            "type": ScenarioType.CHANGE_ENDPOINT_SIGNATURE.value,
            "name": "Change Endpoint Signature",
            "description": "Simulate changing request/response structure",
            "parameters": ["change_description"],
        },
    ]
    return {"scenarios": scenarios}


@router.post("/whatif")
async def run_whatif(
    request: Request,
    scenario: dict = Body(...),
):
    """
    Run a what-if scenario simulation.

    Request body:
    {
        "type": "deprecate_endpoint",  # scenario type
        "target": "POST /api/users",   # target node name
        "target_type": "Endpoint",     # optional: node type
        "parameters": {}                # scenario-specific parameters
    }
    """
    try:
        scenario_type = ScenarioType(scenario.get("type"))
    except ValueError:
        raise HTTPException(400, f"Invalid scenario type. Valid types: {[s.value for s in ScenarioType]}")

    ws = WhatIfScenario(
        scenario_type=scenario_type,
        target_node=scenario.get("target", ""),
        target_type=scenario.get("target_type", ""),
        parameters=scenario.get("parameters", {}),
    )

    user = user_repo_service.require_user(request)
    repo = user_repo_service.get_active_repo(user)

    impact = run_whatif_scenario(ws, repo_key=repo.repo_key, depth=4)
    return impact.to_dict()


# ── OpenAPI Spec Diff ──────────────────────────────────────────────────────

@router.post("/spec-diff")
async def diff_specs(
    request: Request,
    old_spec_content: str = Body(..., description="Original OpenAPI spec (JSON or YAML)"),
    new_spec_content: str = Body(..., description="New OpenAPI spec (JSON or YAML)"),
    old_version: Optional[str] = Body(None, description="Version label for old spec"),
    new_version: Optional[str] = Body(None, description="Version label for new spec"),
):
    """
    Compare two OpenAPI specs and identify breaking changes.

    Send raw OpenAPI spec content (JSON or YAML) for both versions.
    """
    try:
        old_spec = parse_openapi_spec(old_spec_content)
        new_spec = parse_openapi_spec(new_spec_content)
    except Exception as e:
        raise HTTPException(400, f"Failed to parse OpenAPI spec: {e}")

    diff = generate_diff(old_spec, new_spec)

    # Add affected services from graph
    try:
        impacted = diff.get_impacted_services(graph_service)
        result = diff.to_dict()
        result["impacted_services"] = impacted
        result["versions"] = {
            "old": old_version or old_spec.version_string or "unknown",
            "new": new_version or new_spec.version_string or "unknown",
        }
        return result
    except Exception:
        return diff.to_dict()


@router.post("/spec-diff/upload")
async def diff_specs_upload(
    request: Request,
    old_file: UploadFile = File(...),
    new_file: UploadFile = File(...),
):
    """
    Upload two OpenAPI spec files to compare.

    Supports .json, .yaml, and .yml files.
    """
    try:
        old_content = await old_file.read()
        new_content = await new_file.read()
    except Exception as e:
        raise HTTPException(400, f"Failed to read files: {e}")

    try:
        old_spec = parse_openapi_spec(old_content.decode("utf-8"))
        new_spec = parse_openapi_spec(new_content.decode("utf-8"))
    except Exception as e:
        raise HTTPException(400, f"Failed to parse OpenAPI spec: {e}")

    diff = generate_diff(old_spec, new_spec)
    result = diff.to_dict()
    result["files"] = {
        "old": old_file.filename,
        "new": new_file.filename,
    }

    try:
        impacted = diff.get_impacted_services(graph_service)
        result["impacted_services"] = impacted
    except Exception:
        import logging as _log
        _log.getLogger(__name__).exception("Failed to compute impacted services for spec diff")
        result["impacted_services"] = []

    return result


@router.get("/spec-diff/parse")
async def parse_spec_preview(
    request: Request,
    spec_url: Optional[str] = QParam(None, description="URL to fetch spec from"),
    spec_content: Optional[str] = QParam(None, description="Or paste spec content directly"),
):
    """
    Parse an OpenAPI spec and return a preview of its structure.
    Useful for verifying spec validity before diffing.
    """
    content = spec_content
    if spec_url:
        import httpx
        try:
            resp = httpx.get(spec_url)
            content = resp.text
        except Exception as e:
            raise HTTPException(400, f"Failed to fetch spec: {e}")

    if not content:
        raise HTTPException(400, "Provide either spec_url or spec_content")

    try:
        spec = parse_openapi_spec(content)
    except Exception as e:
        raise HTTPException(400, f"Failed to parse spec: {e}")

    return {
        "title": spec.title,
        "version": spec.version_string,
        "openapi_version": spec.version,
        "endpoint_count": len(spec.endpoints),
        "schema_count": len(spec.schemas),
        "endpoints": [
            {
                "path": e.path,
                "method": e.method,
                "summary": e.summary,
                "deprecated": e.deprecated,
            }
            for e in spec.endpoints[:20]
        ],
        "schemas": list(spec.schemas.keys())[:20],
    }


# ── Schema Evolution ────────────────────────────────────────────────────────

@router.get("/schema-evolution")
async def get_schema_evolution(
    request: Request,
    schema_name: str = QParam(..., description="Name of the schema to analyze"),
    old_schema: Optional[str] = QParam(None, description="Old schema as JSON string"),
    new_schema: Optional[str] = QParam(None, description="New schema as JSON string"),
    depth: int = QParam(default=4, ge=1, le=8),
):
    """
    Analyze the impact of evolving a schema definition.

    If old_schema and new_schema are provided, compares them statically.
    Otherwise, gets schema from graph and simulates a removal.
    """
    from services.openapi_service import _parse_schema_definition

    user = user_repo_service.require_user(request)
    repo = user_repo_service.get_active_repo(user)

    if old_schema and new_schema:
        try:
            old_s = json.loads(old_schema)
            new_s = json.loads(new_schema)
        except json.JSONDecodeError as e:
            raise HTTPException(400, f"Invalid JSON schema: {e}")
    else:
        # Get schema from graph
        old_s = None
        new_s = None

    # Get affected nodes
    try:
        affected = blast_radius(schema_name, node_type="Schema", depth=depth, repo_key=repo.repo_key)
    except Exception as e:
        affected = {"upstream": {"count": 0, "by_type": {}, "items": []}, "downstream": {"count": 0}, "affected_services": [], "total_affected": 0}

    if old_s and new_s:
        return analyze_schema_evolution(schema_name, old_s, new_s, affected)
    else:
        # Simulate removal by default
        return {
            "schema": schema_name,
            "simulation_type": "removal_simulated",
            "affected": affected,
            "recommendation": (
                f"Removing this schema would impact {affected['upstream']['count']} components "
                f"across {len(affected.get('affected_services', []))} services. "
                "Provide old_schema and new_schema parameters for detailed field-level analysis."
            ),
        }


# ── Impact Report Generation ────────────────────────────────────────────────

@router.post("/generate-report")
async def generate_impact_report(
    request: Request,
    payload: dict = Body(...),
):
    """
    Generate a comprehensive impact report combining all analysis types.

    Request body:
    {
        "target": "endpoint or schema name",
        "target_type": "Endpoint or Schema",
        "include_whatif": true,
        "include_blast_radius": true,
        "scenario_type": "deprecate_endpoint",  // optional
        "openapi_spec": {}  // optional, if OpenAPI analysis wanted
    }
    """
    user = user_repo_service.require_user(request)
    repo = user_repo_service.get_active_repo(user)
    target = payload.get("target", "")
    target_type = payload.get("target_type", "")
    repo_key = repo.repo_key

    report = {
        "target": target,
        "target_type": target_type,
        "generated_at": None,
        "sections": {},
    }

    # Blast radius analysis
    if payload.get("include_blast_radius", True):
        try:
            report["sections"]["blast_radius"] = blast_radius(
                target, node_type=target_type or None, depth=4, repo_key=repo_key
            )
        except Exception as e:
            report["sections"]["blast_radius"] = {"error": str(e)}

    # What-if scenario
    if payload.get("include_whatif") and payload.get("scenario_type"):
        try:
            from services.whatif_service import WhatIfScenario as WS, ScenarioType
            scenario = WS(
                scenario_type=ScenarioType(payload["scenario_type"]),
                target_node=target,
                target_type=target_type,
                parameters=payload.get("parameters", {}),
            )
            impact = run_whatif_scenario(scenario, repo_key=repo_key, depth=4)
            report["sections"]["whatif"] = impact.to_dict()
        except Exception as e:
            report["sections"]["whatif"] = {"error": str(e)}

    # OpenAPI analysis
    if payload.get("openapi_spec"):
        try:
            spec = parse_openapi_spec(payload["openapi_spec"])
            report["sections"]["openapi"] = {
                "title": spec.title,
                "version": spec.version_string,
                "endpoints_count": len(spec.endpoints),
                "schemas_count": len(spec.schemas),
            }
        except Exception as e:
            report["sections"]["openapi"] = {"error": str(e)}

    return report


@router.get("/report/markdown")
async def generate_markdown_report(
    request: Request,
    target: str = QParam(..., description="Target node name"),
    target_type: Optional[str] = QParam(None),
    scenario_type: Optional[str] = QParam(None),
    depth: int = QParam(default=4, ge=1, le=8),
):
    """
    Generate a markdown-formatted impact report for export.
    """
    user = user_repo_service.require_user(request)
    repo = user_repo_service.get_active_repo(user)
    repo_key = repo.repo_key

    lines = [
        f"# Impact Analysis Report: {target}",
        "",
        f"**Generated:** {__import__('datetime').datetime.now().isoformat()}",
        f"**Target Type:** {target_type or 'auto-detected'}",
        f"**Analysis Depth:** {depth}",
        "",
    ]

    # Blast radius
    try:
        br = blast_radius(target, node_type=target_type, depth=depth, repo_key=repo_key)
        lines.extend([
            "## Blast Radius",
            "",
            f"- **Upstream affected:** {br['upstream']['count']} components",
            f"- **Downstream dependencies:** {br['downstream']['count']} components",
            f"- **Affected services:** {', '.join(br['affected_services']) or 'none'}",
            "",
        ])
    except Exception as e:
        lines.append(f"**Error in blast radius analysis:** {e}\n")

    # What-if scenario
    if scenario_type:
        try:
            from services.whatif_service import WhatIfScenario as WS, ScenarioType as ST
            sc = WS(
                scenario_type=ST(scenario_type),
                target_node=target,
                target_type=target_type or "",
            )
            impact = run_whatif_scenario(sc, repo_key=repo_key, depth=depth)
            lines.extend([
                "## What-If Scenario Analysis",
                "",
                f"**Scenario:** {scenario_type}",
                f"**Risk Level:** {impact.risk_level}",
                f"**Impact Summary:** {impact.impact_summary}",
                "",
                "### Recommendations",
                "",
            ])
            for i, rec in enumerate(impact.recommendations, 1):
                lines.append(f"{i}. {rec}")
            lines.append("")
        except Exception as e:
            lines.append(f"**Error in what-if analysis:** {e}\n")

    return {"markdown": "\n".join(lines)}


@router.get("/report/json")
async def export_json_report(
    request: Request,
    target: str = QParam(..., description="Target node name"),
    target_type: Optional[str] = QParam(None),
    include_whatif: bool = QParam(True),
    scenario_type: Optional[str] = QParam(None),
    depth: int = QParam(default=4, ge=1, le=8),
):
    """
    Export analysis as JSON for programmatic use.
    """
    user = user_repo_service.require_user(request)
    repo = user_repo_service.get_active_repo(user)
    repo_key = repo.repo_key

    report = {"target": target, "target_type": target_type}

    try:
        report["blast_radius"] = blast_radius(target, node_type=target_type, depth=depth, repo_key=repo_key)
    except Exception as e:
        report["blast_radius"] = {"error": str(e)}

    if include_whatif and scenario_type:
        try:
            from services.whatif_service import WhatIfScenario as WS, ScenarioType as ST
            sc = WS(
                scenario_type=ST(scenario_type),
                target_node=target,
                target_type=target_type or "",
            )
            impact = run_whatif_scenario(sc, repo_key=repo_key, depth=depth)
            report["whatif_scenario"] = impact.to_dict()
        except Exception as e:
            report["whatif_scenario"] = {"error": str(e)}

    return report