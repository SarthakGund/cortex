"""
Impact Analysis Service
=======================
"What-If" Analyzer — select any node in the knowledge graph and compute
upstream + downstream blast radius, dependency chains, and risk summaries.

Supports:
  - blast_radius(node_name, node_type) → all upstream/downstream affected nodes
  - dependency_chain(source, target) → shortest path(s) between two nodes
  - impact_summary(node_name, node_type) → LLM-generated risk assessment
"""

from __future__ import annotations

import re
from typing import Optional

from services.llm_service import llm_service
from services.graph_service import graph_service


# ── Blast Radius ─────────────────────────────────────────────────────────────

def blast_radius(
    node_name: str,
    node_type: Optional[str] = None,
    depth: int = 4,
    repo_key: Optional[str] = None,
) -> dict:
    """
    Find all nodes that depend on (upstream) or are depended upon by (downstream)
    the given node.  Returns categorized lists with relationship paths.
    """
    # Build match clause
    service_filter = " AND target.service = $service" if repo_key else ""
    if node_type:
        match_clause = (
            f"MATCH (target:{node_type}) "
            f"WHERE (toLower(target.name) = toLower($name) OR toLower(target.path) = toLower($name)){service_filter}"
        )
    else:
        match_clause = (
            "MATCH (target) "
            f"WHERE (toLower(target.name) = toLower($name) OR toLower(target.path) = toLower($name)){service_filter}"
        )

    # Upstream: things that point TO this node (would be affected by changes)
    upstream_cypher = f"""
    {match_clause}
    WITH target LIMIT 1
        MATCH path = (src)-[*1..{depth}]->(target)
        WHERE src <> target
            {"AND src.service = $service" if repo_key else ""}
    WITH src, [r IN relationships(path) | type(r)] AS rel_chain,
         [n IN nodes(path) | COALESCE(n.name, n.path, 'unknown')] AS node_chain,
         [n IN nodes(path) | labels(n)[0]] AS label_chain
    RETURN DISTINCT
      labels(src)[0] AS source_type,
      COALESCE(src.name, src.path) AS source_name,
      src.service AS source_service,
      src.file_path AS source_file,
      rel_chain, node_chain, label_chain
    LIMIT 100
    """

    # Downstream: things this node points TO (dependencies)
    downstream_cypher = f"""
    {match_clause}
    WITH target LIMIT 1
        MATCH path = (target)-[*1..{depth}]->(dst)
        WHERE dst <> target
            {"AND dst.service = $service" if repo_key else ""}
    WITH dst, [r IN relationships(path) | type(r)] AS rel_chain,
         [n IN nodes(path) | COALESCE(n.name, n.path, 'unknown')] AS node_chain,
         [n IN nodes(path) | labels(n)[0]] AS label_chain
    RETURN DISTINCT
      labels(dst)[0] AS target_type,
      COALESCE(dst.name, dst.path) AS target_name,
      dst.service AS target_service,
      dst.file_path AS target_file,
      rel_chain, node_chain, label_chain
    LIMIT 100
    """

    # Direct relationships (1-hop)
    neighbor_filter = "WHERE neighbor.service = $service" if repo_key else ""
    direct_cypher = f"""
    {match_clause}
    WITH target LIMIT 1
    MATCH (target)-[r]-(neighbor)
    {neighbor_filter}
    RETURN
        labels(neighbor)[0] AS neighbor_type,
        COALESCE(neighbor.name, neighbor.path) AS neighbor_name,
        neighbor.service AS neighbor_service,
        type(r) AS relationship,
        CASE WHEN startNode(r) = target THEN 'outgoing' ELSE 'incoming' END AS direction
    LIMIT 50
    """

    upstream = []
    downstream = []
    direct = []

    params = {"name": node_name}
    if repo_key:
        params["service"] = repo_key

    with graph_service.driver.session() as session:
        # Upstream
        for rec in session.run(upstream_cypher, **params):
            upstream.append({
                "type": rec["source_type"],
                "name": rec["source_name"],
                "service": rec["source_service"] or "",
                "file": rec["source_file"] or "",
                "rel_chain": rec["rel_chain"],
                "node_chain": rec["node_chain"],
                "label_chain": rec["label_chain"],
            })

        # Downstream
        for rec in session.run(downstream_cypher, **params):
            downstream.append({
                "type": rec["target_type"],
                "name": rec["target_name"],
                "service": rec["target_service"] or "",
                "file": rec["target_file"] or "",
                "rel_chain": rec["rel_chain"],
                "node_chain": rec["node_chain"],
                "label_chain": rec["label_chain"],
            })

        # Direct
        for rec in session.run(direct_cypher, **params):
            direct.append({
                "type": rec["neighbor_type"],
                "name": rec["neighbor_name"],
                "service": rec["neighbor_service"] or "",
                "relationship": rec["relationship"],
                "direction": rec["direction"],
            })

    # Categorize by type
    def _categorize(items: list) -> dict:
        cats: dict[str, list] = {}
        for item in items:
            cats.setdefault(item["type"], []).append(item)
        return cats

    # Unique affected services
    affected_services = set()
    for item in upstream + downstream:
        if item.get("service"):
            affected_services.add(item["service"])

    return {
        "node": node_name,
        "node_type": node_type,
        "depth": depth,
        "upstream": {
            "count": len(upstream),
            "by_type": _categorize(upstream),
            "items": upstream,
        },
        "downstream": {
            "count": len(downstream),
            "by_type": _categorize(downstream),
            "items": downstream,
        },
        "direct": direct,
        "affected_services": sorted(affected_services),
        "total_affected": len(upstream) + len(downstream),
    }


# ── Dependency Chain ─────────────────────────────────────────────────────────

def dependency_chain(
    source: str,
    target: str,
    max_depth: int = 6,
    repo_key: Optional[str] = None,
) -> dict:
    """
    Find the shortest path(s) between two nodes in the knowledge graph.
    """
    cypher = f"""
    MATCH (a), (b)
        WHERE (toLower(a.name) = toLower($source) OR toLower(a.path) = toLower($source))
            AND (toLower(b.name) = toLower($target) OR toLower(b.path) = toLower($target))
            {"AND a.service = $service AND b.service = $service" if repo_key else ""}
    WITH a, b LIMIT 1
    MATCH path = shortestPath((a)-[*1..{max_depth}]-(b))
    WITH path,
         [n IN nodes(path) | COALESCE(n.name, n.path, 'unknown')] AS node_names,
         [n IN nodes(path) | labels(n)[0]] AS node_types,
         [r IN relationships(path) | type(r)] AS rel_types,
         length(path) AS hops
    RETURN node_names, node_types, rel_types, hops
    LIMIT 5
    """

    chains = []
    params = {"source": source, "target": target}
    if repo_key:
        params["service"] = repo_key

    with graph_service.driver.session() as session:
        for rec in session.run(cypher, **params):
            chain_steps = []
            node_names = rec["node_names"]
            node_types = rec["node_types"]
            rel_types = rec["rel_types"]
            for i, (name, ntype) in enumerate(zip(node_names, node_types)):
                step = {"name": name, "type": ntype}
                if i < len(rel_types):
                    step["edge"] = rel_types[i]
                chain_steps.append(step)
            chains.append({
                "steps": chain_steps,
                "hops": rec["hops"],
            })

    return {
        "source": source,
        "target": target,
        "chains": chains,
        "found": len(chains) > 0,
    }


# ── Impact Summary (LLM) ────────────────────────────────────────────────────

def impact_summary(
    node_name: str,
    node_type: Optional[str] = None,
    depth: int = 4,
    repo_key: Optional[str] = None,
) -> dict:
    """
    Generate an LLM-powered risk assessment for changing a specific node.
    Combines blast radius data with LLM analysis.
    """
    # Compute blast radius first
    radius = blast_radius(node_name, node_type, depth=depth, repo_key=repo_key)

    if not llm_service.enabled:
        return {
            **radius,
            "summary": "LLM not available. See blast radius data above.",
            "risk_level": "unknown",
            "recommendations": [],
        }

    # Build context for the LLM
    context_parts = [
        f"Target node: {node_name} (type: {node_type or 'auto-detected'})",
        f"Total affected components: {radius['total_affected']}",
        f"Affected services: {', '.join(radius['affected_services']) or 'none'}",
        "",
        f"Upstream (things that depend on this): {radius['upstream']['count']}",
    ]

    for typ, items in radius["upstream"]["by_type"].items():
        names = [i["name"] for i in items[:5]]
        context_parts.append(f"  {typ}: {', '.join(names)}" + (f" (+{len(items)-5} more)" if len(items) > 5 else ""))

    context_parts.append(f"\nDownstream (things this depends on): {radius['downstream']['count']}")
    for typ, items in radius["downstream"]["by_type"].items():
        names = [i["name"] for i in items[:5]]
        context_parts.append(f"  {typ}: {', '.join(names)}" + (f" (+{len(items)-5} more)" if len(items) > 5 else ""))

    context_parts.append(f"\nDirect connections: {len(radius['direct'])}")
    for d in radius["direct"][:10]:
        context_parts.append(f"  {d['direction']}: {d['relationship']} -> {d['type']}: {d['name']}")

    context = "\n".join(context_parts)

    prompt = f"""You are SPIT — a software architecture impact analyzer.

Analyze the risk and impact of modifying this component in a software system:

{context}

Provide:
1. **Risk Level**: LOW / MEDIUM / HIGH / CRITICAL — based on number and type of affected components.
2. **Impact Summary**: 2-3 sentences describing the blast radius in plain English.
3. **Affected Areas**: List key areas that would need testing/updating.
4. **Recommendations**: 3-5 specific, actionable steps to safely make changes to this component.
5. **Breaking Change Risk**: What could break if this component is modified without updating dependents?

Format as JSON:
{{
  "risk_level": "LOW|MEDIUM|HIGH|CRITICAL",
  "summary": "...",
  "affected_areas": ["area1", "area2"],
  "recommendations": ["step1", "step2", "step3"],
  "breaking_change_risk": "..."
}}

Output ONLY the JSON."""

    try:
        raw = llm_service.generate_text(prompt, temperature=0.1, max_output_tokens=2048)
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        import json
        analysis = json.loads(raw)
    except Exception as e:
        analysis = {
            "risk_level": "unknown",
            "summary": f"Analysis failed: {e}",
            "affected_areas": [],
            "recommendations": [],
            "breaking_change_risk": "unknown",
        }

    return {
        **radius,
        **analysis,
    }


# ── Search nodes ─────────────────────────────────────────────────────────────

def search_nodes(
    query: str,
    node_type: Optional[str] = None,
    limit: int = 20,
    repo_key: Optional[str] = None,
) -> list[dict]:
    """
    Search for nodes in the knowledge graph by name/path.
    This powers the autocomplete/search in the What-If UI.
    """
    q_stripped = query.strip()
    where_clause = "WHERE toLower(COALESCE(n.name, n.path, '')) CONTAINS toLower($search_term)" if q_stripped else "WHERE 1=1"
    if repo_key:
        where_clause += " AND n.service = $service"

    if node_type:
        cypher = f"""
        MATCH (n:{node_type})
        {where_clause}
        RETURN labels(n)[0] AS type, COALESCE(n.name, n.path) AS name,
               n.service AS service, n.file_path AS file
        ORDER BY n.name
        LIMIT $limit
        """
    else:
        cypher = f"""
        MATCH (n)
        {where_clause}
        RETURN labels(n)[0] AS type, COALESCE(n.name, n.path) AS name,
               n.service AS service, n.file_path AS file
        ORDER BY n.name
        LIMIT $limit
        """

    nodes = []
    params = {"search_term": query, "limit": limit}
    if repo_key:
        params["service"] = repo_key

    with graph_service.driver.session() as session:
        for rec in session.run(cypher, **params):
            nodes.append({
                "type": rec["type"],
                "name": rec["name"],
                "service": rec["service"] or "",
                "file": rec["file"] or "",
            })
    return nodes
