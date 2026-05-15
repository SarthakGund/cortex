"""
What-If Scenario Service
==========================
Simulates hypothetical changes to the system and forecasts their impact.
Handles "what if" questions like:
- What if I mark this endpoint as deprecated?
- What if I change this field from string to integer?
- What if I remove this schema entirely?
- What if I add this new endpoint?
"""

from __future__ import annotations

from typing import Optional, Any
from dataclasses import dataclass, field
from enum import Enum

from services.graph_service import graph_service
from services.llm_service import llm_service
from services.openapi_service import (
    BreakingChangeSeverity,
    BreakingChange,
    OpenAPISpec,
    parse_openapi_spec,
)


class ScenarioType(str, Enum):
    DEPRECATE_ENDPOINT = "deprecate_endpoint"
    CHANGE_FIELD_TYPE = "change_field_type"
    REMOVE_SCHEMA = "remove_schema"
    REMOVE_ENDPOINT = "remove_endpoint"
    ADD_SCHEMA = "add_schema"
    ADD_ENDPOINT = "add_endpoint"
    CHANGE_ENDPOINT_SIGNATURE = "change_endpoint_signature"
    CUSTOM = "custom"


@dataclass
class WhatIfScenario:
    scenario_type: ScenarioType
    target_node: str
    target_type: str
    parameters: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "type": self.scenario_type.value,
            "target": self.target_node,
            "target_type": self.target_type,
            "parameters": self.parameters,
        }


@dataclass
class ScenarioImpact:
    scenario: WhatIfScenario
    affected_nodes: dict  # upstream/downstream from graph
    affected_services: list[str]
    breaking_changes: list[dict]
    risk_level: str
    impact_summary: str
    recommendations: list[str]
    cascading_failures: list[dict] = field(default_factory=list)
    migration_steps: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "scenario": self.scenario.to_dict(),
            "affected_nodes": self.affected_nodes,
            "affected_services": self.affected_services,
            "breaking_changes": self.breaking_changes,
            "risk_level": self.risk_level,
            "impact_summary": self.impact_summary,
            "recommendations": self.recommendations,
            "cascading_failures": self.cascading_failures,
            "migration_steps": self.migration_steps,
        }


def run_whatif_scenario(
    scenario: WhatIfScenario,
    repo_key: Optional[str] = None,
    depth: int = 3,
) -> ScenarioImpact:
    """
    Execute a what-if scenario and return the predicted impact.
    """
    # Get affected nodes from graph
    affected = _get_affected_from_graph(
        scenario.target_node,
        scenario.target_type,
        depth,
        repo_key,
    )

    # Analyze based on scenario type
    breaking_changes = _analyze_breaking_changes(scenario, affected)

    # Determine risk level
    risk_level = _calculate_risk_level(breaking_changes, affected)

    # Generate impact summary and recommendations
    impact_summary, recommendations = _generate_recommendations(
        scenario,
        breaking_changes,
        affected,
        risk_level,
    )

    # Simulate cascading failures
    cascading = _simulate_cascading_failures(scenario, affected, breaking_changes)

    # Generate migration steps
    migration = _generate_migration_steps(scenario, breaking_changes, affected)

    return ScenarioImpact(
        scenario=scenario,
        affected_nodes=affected,
        affected_services=sorted(affected.get("affected_services", [])),
        breaking_changes=[
            {
                "type": bc.type,
                "severity": bc.severity.value if hasattr(bc.severity, "value") else str(bc.severity),
                "description": bc.description,
                "path": bc.path,
                "method": bc.method,
                "schema_name": bc.schema_name,
                "field_name": bc.field_name,
            }
            for bc in breaking_changes
        ],
        risk_level=risk_level,
        impact_summary=impact_summary,
        recommendations=recommendations,
        cascading_failures=cascading,
        migration_steps=migration,
    )


def _get_affected_from_graph(
    node_name: str,
    node_type: str,
    depth: int,
    repo_key: Optional[str],
) -> dict:
    """Query Neo4j to find all nodes affected by changes to the target."""
    service_filter = " AND target.service = $service" if repo_key else ""

    # Find upstream: nodes that point TO this node (would be affected)
    upstream_cypher = f"""
    MATCH (target)
    WHERE (toLower(target.name) = toLower($name) OR toLower(target.path) = toLower($name))
        {service_filter}
    WITH target LIMIT 1
    MATCH path = (src)-[*1..{depth}]->(target)
    WHERE src <> target
        {"AND src.service = $service" if repo_key else ""}
    WITH src,
         [r IN relationships(path) | type(r)] AS rel_chain,
         [n IN nodes(path) | labels(n)[0]] AS label_chain,
         length(path) AS distance
    RETURN DISTINCT
        labels(src)[0] AS source_type,
        COALESCE(src.name, src.path) AS source_name,
        src.service AS source_service,
        src.file_path AS source_file,
        rel_chain,
        label_chain,
        distance
    ORDER BY distance
    LIMIT 100
    """

    # Find downstream: nodes this node points TO (dependencies)
    downstream_cypher = f"""
    MATCH (target)
    WHERE (toLower(target.name) = toLower($name) OR toLower(target.path) = toLower($name))
        {service_filter}
    WITH target LIMIT 1
    MATCH path = (target)-[*1..{depth}]->(dst)
    WHERE dst <> target
        {"AND dst.service = $service" if repo_key else ""}
    WITH dst,
         [r IN relationships(path) | type(r)] AS rel_chain,
         [n IN nodes(path) | labels(n)[0]] AS label_chain,
         length(path) AS distance
    RETURN DISTINCT
        labels(dst)[0] AS target_type,
        COALESCE(dst.name, dst.path) AS target_name,
        dst.service AS target_service,
        dst.file_path AS target_file,
        rel_chain,
        label_chain,
        distance
    ORDER BY distance
    LIMIT 100
    """

    upstream = []
    downstream = []
    params = {"name": node_name}
    if repo_key:
        params["service"] = repo_key

    try:
        with graph_service.driver.session() as session:
            for rec in session.run(upstream_cypher, **params):
                upstream.append({
                    "type": rec["source_type"],
                    "name": rec["source_name"],
                    "service": rec["source_service"] or "",
                    "file": rec["source_file"] or "",
                    "rel_chain": rec["rel_chain"],
                    "label_chain": rec["label_chain"],
                    "distance": rec["distance"],
                    "direction": "upstream",
                })

            for rec in session.run(downstream_cypher, **params):
                downstream.append({
                    "type": rec["target_type"],
                    "name": rec["target_name"],
                    "service": rec["target_service"] or "",
                    "file": rec["target_file"] or "",
                    "rel_chain": rec["rel_chain"],
                    "label_chain": rec["label_chain"],
                    "distance": rec["distance"],
                    "direction": "downstream",
                })
    except Exception:
        pass  # Graph might not be available

    # Categorize
    upstream_by_type = {}
    downstream_by_type = {}
    for item in upstream:
        upstream_by_type.setdefault(item["type"], []).append(item)
    for item in downstream:
        downstream_by_type.setdefault(item["type"], []).append(item)

    affected_services = set()
    for item in upstream + downstream:
        if item.get("service"):
            affected_services.add(item["service"])

    return {
        "upstream": {
            "count": len(upstream),
            "by_type": upstream_by_type,
            "items": upstream,
        },
        "downstream": {
            "count": len(downstream),
            "by_type": downstream_by_type,
            "items": downstream,
        },
        "affected_services": sorted(affected_services),
        "total_affected": len(upstream) + len(downstream),
    }


def _analyze_breaking_changes(
    scenario: WhatIfScenario,
    affected: dict,
) -> list[BreakingChange]:
    """Analyze what breaking changes this scenario would introduce."""
    breaking = []

    if scenario.scenario_type == ScenarioType.DEPRECATE_ENDPOINT:
        # Deprecation is a warning, not a breaking change by itself
        # But any code still using it will eventually break
        for item in affected["upstream"]["items"]:
            if item.get("type") == "Endpoint" or "Endpoint" in item.get("label_chain", []):
                breaking.append(BreakingChange(
                    type="deprecated_endpoint_consumer",
                    severity=BreakingChangeSeverity.MEDIUM,
                    path=scenario.target_node,
                    description=f"Consumer '{item['name']}' still calls deprecated endpoint",
                ))

    elif scenario.scenario_type == ScenarioType.REMOVE_ENDPOINT:
        # All consumers will break
        for item in affected["upstream"]["items"]:
            breaking.append(BreakingChange(
                type="endpoint_removed",
                severity=BreakingChangeSeverity.CRITICAL,
                path=scenario.target_node,
                description=f"Consumer '{item['name']}' will break when endpoint is removed",
            ))

    elif scenario.scenario_type == ScenarioType.REMOVE_SCHEMA:
        # All consumers of this schema will break
        schema_name = scenario.target_node
        for item in affected["upstream"]["items"]:
            if item.get("type") == "Schema" or "Schema" in item.get("label_chain", []):
                breaking.append(BreakingChange(
                    type="schema_removed",
                    severity=BreakingChangeSeverity.CRITICAL,
                    schema_name=schema_name,
                    description=f"Schema consumer '{item['name']}' will break",
                ))

    elif scenario.scenario_type == ScenarioType.CHANGE_FIELD_TYPE:
        # Check if any consumers depend on the field type
        field_name = scenario.parameters.get("field")
        old_type = scenario.parameters.get("old_type")
        new_type = scenario.parameters.get("new_type")
        schema_name = scenario.target_node

        breaking.append(BreakingChange(
            type="field_type_changed",
            severity=BreakingChangeSeverity.HIGH,
            schema_name=schema_name,
            field_name=field_name,
            old_value=old_type,
            new_value=new_type,
            description=f"Field '{field_name}' in '{schema_name}' type change from {old_type} to {new_type} will affect all consumers",
        ))

    return breaking


def _calculate_risk_level(breaking_changes: list[BreakingChange], affected: dict) -> str:
    """Calculate overall risk level based on breaking changes and affected scope."""
    if not breaking_changes and affected["total_affected"] == 0:
        return "LOW"

    max_severity = "LOW"
    severity_order = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]

    for bc in breaking_changes:
        if hasattr(bc.severity, "value"):
            severity = bc.severity.value
        else:
            severity = str(bc.severity)

        if severity_order.index(severity) > severity_order.index(max_severity):
            max_severity = severity

    # Escalate if many services affected
    service_count = len(affected.get("affected_services", []))
    if service_count >= 5 and max_severity in ("LOW", "MEDIUM"):
        max_severity = "HIGH"
    elif service_count >= 10 and max_severity in ("LOW", "MEDIUM", "HIGH"):
        max_severity = "CRITICAL"

    return max_severity


def _generate_recommendations(
    scenario: WhatIfScenario,
    breaking_changes: list[BreakingChange],
    affected: dict,
    risk_level: str,
) -> tuple[str, list[str]]:
    """Generate impact summary and actionable recommendations using LLM."""
    recommendations = []
    summary_parts = []

    # Base recommendations based on scenario type
    if scenario.scenario_type == ScenarioType.DEPRECATE_ENDPOINT:
        summary_parts.append(f"If you deprecate {scenario.target_node}, {affected['upstream']['count']} components currently consume it.")
        recommendations.extend([
            "Update all calling services to use the new alternative endpoint",
            "Add deprecation headers (Deprecation, Sunset) to the endpoint",
            "Create migration documentation for API consumers",
            f"Notify {len(affected.get('affected_services', []))} affected service teams",
        ])
    elif scenario.scenario_type == ScenarioType.REMOVE_ENDPOINT:
        summary_parts.append(f"Removing {scenario.target_node} will break {affected['upstream']['count']} components.")
        recommendations.extend([
            "Remove endpoint only after all consumers are migrated",
            "Create a removal checklist including all affected services",
            "Plan a deprecation period before removal",
        ])
    elif scenario.scenario_type == ScenarioType.REMOVE_SCHEMA:
        summary_parts.append(f"Removing schema {scenario.target_node} will impact {len(affected.get('affected_services', []))} services.")
        recommendations.extend([
            "Ensure all code references to this schema are updated first",
            "Check for database migrations that reference this schema",
            "Update any documentation referencing this schema",
        ])
    elif scenario.scenario_type == ScenarioType.CHANGE_FIELD_TYPE:
        field_name = scenario.parameters.get("field")
        summary_parts.append(f"Changing field '{field_name}' type will require updating all consumers.")
        recommendations.extend([
            "Add field type validation in the schema",
            "Update all client SDKs that use this field",
            "Plan a gradual rollout with backward compatibility",
        ])

    # Enhance with LLM if available
    if llm_service.enabled and breaking_changes:
        try:
            enhanced = _llm_enhance_recommendations(scenario, breaking_changes, affected)
            if enhanced["summary"]:
                summary_parts = [enhanced["summary"]]
            if enhanced["recommendations"]:
                recommendations = enhanced["recommendations"]
        except Exception:
            pass  # Fall back to base recommendations

    return " ".join(summary_parts), recommendations


def _llm_enhance_recommendations(
    scenario: WhatIfScenario,
    breaking_changes: list[BreakingChange],
    affected: dict,
) -> dict:
    """Use LLM to generate more detailed recommendations."""
    prompt = f"""You are SPIT — a software architecture impact analyzer.

Analyze this What-If scenario and provide an enhanced impact summary:

Scenario: {scenario.scenario_type.value}
Target: {scenario.target_node} ({scenario.target_type})
Parameters: {scenario.parameters}

Impact Data:
- Upstream affected: {affected['upstream']['count']} components
- Downstream dependencies: {affected['downstream']['count']} components
- Affected services: {', '.join(affected.get('affected_services', [])) or 'none'}

Breaking Changes:
{chr(10).join(f"- {bc.type}: {bc.description}" for bc in breaking_changes[:10])}

Provide:
1. A 2-3 sentence impact summary describing the scope and severity
2. 4-6 specific, actionable recommendations ordered by priority

Format as JSON:
{{
  "summary": "...",
  "recommendations": ["step1", "step2", "step3", "step4", "step5", "step6"]
}}

Output ONLY the JSON."""

    try:
        raw = llm_service.generate_text(prompt, temperature=0.1, max_output_tokens=1024)
        import re
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        import json
        return json.loads(raw)
    except Exception:
        return {"summary": None, "recommendations": []}


def _simulate_cascading_failures(
    scenario: WhatIfScenario,
    affected: dict,
    breaking_changes: list[BreakingChange],
) -> list[dict]:
    """Simulate potential cascading failures if changes are applied."""
    cascading = []

    # Find high-risk chains
    upstream_items = affected.get("upstream", {}).get("items", [])

    for item in upstream_items[:10]:
        chain = " → ".join(item.get("rel_chain", []))
        # Look for risky patterns: service → endpoint → schema
        if "CALLS" in chain or "DEPENDS" in chain:
            cascading.append({
                "source": item["name"],
                "source_type": item["type"],
                "chain": chain,
                "severity": "HIGH" if item.get("distance", 0) <= 2 else "MEDIUM",
                "description": f"Change will propagate through {chain}",
            })

    return cascading


def _generate_migration_steps(
    scenario: WhatIfScenario,
    breaking_changes: list[BreakingChange],
    affected: dict,
) -> list[str]:
    """Generate a step-by-step migration plan."""
    steps = []

    if scenario.scenario_type == ScenarioType.DEPRECATE_ENDPOINT:
        steps = [
            "1. Add Deprecation header to endpoint response",
            "2. Log usage metrics for consumer tracking",
            "3. Notify affected service teams via Slack/email",
            "4. Provide migration guide with new endpoint alternative",
            "5. Set removal date (recommended: 90 days minimum)",
            "6. Monitor usage and follow up with remaining consumers",
            "7. Remove endpoint after all consumers migrate",
        ]
    elif scenario.scenario_type == ScenarioType.REMOVE_ENDPOINT:
        steps = [
            "1. Ensure no production traffic uses this endpoint",
            "2. Update all calling services to use alternatives",
            "3. Deploy changes to affected services",
            "4. Verify migrations work in staging environment",
            "5. Coordinate production deployment window",
            "6. Remove endpoint and associated code",
            "7. Update API documentation",
        ]
    elif scenario.scenario_type == ScenarioType.REMOVE_SCHEMA:
        steps = [
            "1. Find all code references to this schema",
            "2. Update or remove schema usage in each service",
            "3. Run tests to verify schema removal",
            "4. Update database migrations if needed",
            "5. Update documentation and type definitions",
            "6. Deploy in order: producers first, then consumers",
        ]
    elif scenario.scenario_type == ScenarioType.CHANGE_FIELD_TYPE:
        steps = [
            "1. Update schema definition with new type",
            "2. Add data transformation/validation logic",
            "3. Update client SDKs to handle new type",
            "4. Deploy producer service first",
            "5. Deploy consumers with type handling updates",
            "6. Monitor for type compatibility errors",
            "7. Rollback plan if needed",
        ]

    return steps


def analyze_schema_evolution(
    schema_name: str,
    old_schema: dict,
    new_schema: dict,
    affected_nodes: dict,
) -> dict:
    """
    Analyze the impact of evolving a schema definition.
    Returns field-level impact analysis.
    """
    from services.openapi_service import _flatten_fields, _compare_fields, BreakingChangeSeverity

    old_fields = _flatten_fields(old_schema) if old_schema else {}
    new_fields = _flatten_fields(new_schema) if new_schema else {}

    comparison = _compare_fields(schema_name, old_fields, new_fields)

    # Categorize changes by impact
    added = [f for f in comparison["field_changes"] if f["type"] == "field_added"]
    removed = [f for f in comparison["field_changes"] if f["type"] == "field_removed"]
    type_changes = [f for f in comparison["field_changes"] if "type_changed" in f["type"]]

    # Impact on consumers
    consumers = affected_nodes.get("upstream", {}).get("items", [])
    service_count = len(set(c.get("service") for c in consumers if c.get("service")))

    return {
        "schema": schema_name,
        "summary": {
            "fields_added": len(added),
            "fields_removed": len(removed),
            "type_changes": len(type_changes),
            "services_affected": service_count,
        },
        "breaking_changes": [
            {
                "field": f.get("name"),
                "change": f["type"],
                "detail": f.get("old_type") or f.get("new_type") or "",
            }
            for f in comparison["breaking_changes"]
        ],
        "additions": added,
        "removals": removed,
        "modifications": type_changes,
        "recommendation": _generate_schema_evolution_recommendation(
            added, removed, type_changes, service_count
        ),
    }


def _generate_schema_evolution_recommendation(
    added: list,
    removed: list,
    type_changes: list,
    service_count: int,
) -> str:
    """Generate recommendation based on schema evolution type."""
    if removed or type_changes:
        return (
            f"This evolution introduces {len(removed)} breaking changes. "
            f"Plan migration carefully for {service_count} affected services."
        )
    elif added:
        return (
            f"Schema expanded with {len(added)} new fields. "
            "Non-breaking for existing consumers, but update SDKs to expose new fields."
        )
    return "Minimal impact. Consider adding validation for new constraints."