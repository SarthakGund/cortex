from fastapi import APIRouter, Query as QParam
from fastapi.responses import PlainTextResponse
from services.graph_service import graph_service
import json

router = APIRouter(prefix="/graph", tags=["Graph"])


def _node_id(node) -> str:
    """Stable string ID for a Neo4j node."""
    return str(node.element_id)


def _node_label(node) -> str:
    """Best human-readable label for a node."""
    props = dict(node.items())
    for key in ("name", "path", "title", "username", "topic_name"):
        if key in props and props[key]:
            return str(props[key])
    return str(list(node.labels)[0]) if node.labels else "Node"


def _node_color(node) -> str:
    """Color-code nodes by their primary label."""
    label = list(node.labels)[0] if node.labels else ""
    palette = {
        "Service":       "#6366f1",  # indigo
        "Module":        "#8b5cf6",  # violet
        "File":          "#a78bfa",  # purple-light
        "Class":         "#22d3ee",  # cyan
        "Function":      "#34d399",  # emerald
        "Schema":        "#fbbf24",  # amber
        "Endpoint":      "#f87171",  # red
        "Database":      "#fb923c",  # orange
        "Table":         "#fdba74",  # orange-light
        "MessageQueue":  "#f472b6",  # pink
        "Developer":     "#a3e635",  # lime
        "ADR":           "#38bdf8",  # sky
        "Incident":      "#ef4444",  # red-strong
        "Documentation": "#4ade80",  # green
    }
    return palette.get(label, "#94a3b8")  # default slate


@router.get("/")
def get_full_graph(limit: int = QParam(default=500, le=2000)):
    """
    Returns the full knowledge graph as React Flow-compatible nodes + edges.
    Each node carries all Neo4j properties for the tooltip/sidebar panel.
    Query: MATCH (n)-[r]->(m) RETURN n, r, m  LIMIT $limit
    """
    with graph_service.driver.session() as session:
        result = session.run(
            "MATCH (n)-[r]->(m) RETURN n, r, m LIMIT $limit",
            limit=limit
        )

        seen_nodes: dict[str, dict] = {}
        edges: list[dict] = []

        for record in result:
            n = record["n"]
            m = record["m"]
            r = record["r"]

            # ---- source node ----
            nid = _node_id(n)
            if nid not in seen_nodes:
                seen_nodes[nid] = {
                    "id":   nid,
                    "type": "spit",
                    "data": {
                        "label":  _node_label(n),
                        "nodeType": list(n.labels)[0] if n.labels else "Unknown",
                        "color":  _node_color(n),
                        "props":  dict(n.items()),
                    },
                    "position": {"x": 0, "y": 0},   # layout done client-side
                }

            # ---- target node ----
            mid = _node_id(m)
            if mid not in seen_nodes:
                seen_nodes[mid] = {
                    "id":   mid,
                    "type": "spit",
                    "data": {
                        "label":  _node_label(m),
                        "nodeType": list(m.labels)[0] if m.labels else "Unknown",
                        "color":  _node_color(m),
                        "props":  dict(m.items()),
                    },
                    "position": {"x": 0, "y": 0},
                }

            # ---- edge ----
            edges.append({
                "id":     str(r.element_id),
                "source": nid,
                "target": mid,
                "label":  r.type,
                "animated": r.type in ("CALLS", "DEPENDS_ON", "EXPOSES"),
            })

    return {
        "nodes": list(seen_nodes.values()),
        "edges": edges,
    }


@router.get("/service/{service_name}")
def get_service_subgraph(service_name: str):
    """
    Returns the subgraph rooted at a specific Service node —
    all nodes reachable within 4 hops. Used for per-service drill-down.
    """
    with graph_service.driver.session() as session:
        result = session.run(
            """
            MATCH path = (s:Service {name: $name})-[*1..4]->(m)
            UNWIND relationships(path) AS r
            RETURN startNode(r) AS n, r, endNode(r) AS m
            """,
            name=service_name
        )

        seen_nodes: dict[str, dict] = {}
        edges: list[dict] = []

        for record in result:
            n = record["n"]
            m = record["m"]
            r = record["r"]

            for node in (n, m):
                nid = _node_id(node)
                if nid not in seen_nodes:
                    seen_nodes[nid] = {
                        "id":   nid,
                        "type": "spit",
                        "data": {
                            "label":  _node_label(node),
                            "nodeType": list(node.labels)[0] if node.labels else "Unknown",
                            "color":  _node_color(node),
                            "props":  dict(node.items()),
                        },
                        "position": {"x": 0, "y": 0},
                    }

            edges.append({
                "id":     str(r.element_id),
                "source": _node_id(n),
                "target": _node_id(m),
                "label":  r.type,
                "animated": r.type in ("CALLS", "DEPENDS_ON", "EXPOSES"),
            })

    return {
        "nodes": list(seen_nodes.values()),
        "edges": edges,
    }


@router.get("/stats")
def get_graph_stats():
    """Dashboard stats: total count of each node label."""
    with graph_service.driver.session() as session:
        result = session.run("""
            MATCH (n)
            UNWIND labels(n) AS lbl
            RETURN lbl AS label, count(*) AS count
            ORDER BY count DESC
        """)
        return {"stats": [{"label": r["label"], "count": r["count"]} for r in result]}


@router.get("/export/csv")
def export_graph_csv(
    node_type: str | None = QParam(None, description="Filter by node label"),
    service: str | None = QParam(None, description="Filter by service name"),
):
    """Export graph nodes as CSV."""
    conditions = []
    params: dict = {}
    if node_type:
        conditions.append(f"n:{node_type}")
    if service:
        conditions.append("n.service = $service")
        params["service"] = service

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    query = f"MATCH (n) {where} RETURN n LIMIT 5000"

    with graph_service.driver.session() as session:
        result = session.run(query, **params)
        lines = ["label,name,service,path,properties"]
        for record in result:
            node = record["n"]
            lbl = list(node.labels)[0] if node.labels else ""
            props = dict(node.items())
            name = props.get("name", props.get("path", ""))
            svc = props.get("service", "")
            path = props.get("path", "")
            props_json = json.dumps(props, default=str).replace('"', '""')
            lines.append(f'{lbl},"{name}","{svc}","{path}","{props_json}"')

    return PlainTextResponse(
        content="\n".join(lines),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=graph_export.csv"},
    )


@router.get("/export/json")
def export_graph_json(
    node_type: str | None = QParam(None, description="Filter by node label"),
    service: str | None = QParam(None, description="Filter by service name"),
    include_edges: bool = QParam(True),
):
    """Export graph as JSON (nodes + optional edges)."""
    conditions = []
    params: dict = {}
    if node_type:
        conditions.append(f"n:{node_type}")
    if service:
        conditions.append("n.service = $service")
        params["service"] = service

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    with graph_service.driver.session() as session:
        # Nodes
        result = session.run(f"MATCH (n) {where} RETURN n LIMIT 5000", **params)
        nodes = []
        node_ids = set()
        for record in result:
            node = record["n"]
            nid = str(node.element_id)
            node_ids.add(nid)
            nodes.append({
                "id": nid,
                "labels": list(node.labels),
                "properties": {k: str(v) if not isinstance(v, (str, int, float, bool)) else v for k, v in dict(node.items()).items()},
            })

        edges = []
        if include_edges and nodes:
            edge_result = session.run(
                f"MATCH (n)-[r]->(m) {where} RETURN n, r, m LIMIT 10000", **params
            )
            for rec in edge_result:
                sid = str(rec["n"].element_id)
                tid = str(rec["m"].element_id)
                if sid in node_ids or tid in node_ids:
                    edges.append({
                        "source": sid,
                        "target": tid,
                        "type": rec["r"].type,
                        "properties": dict(rec["r"].items()),
                    })

    return {"nodes": nodes, "edges": edges, "node_count": len(nodes), "edge_count": len(edges)}


@router.get("/export/cypher")
def export_graph_cypher(
    node_type: str | None = QParam(None, description="Filter by node label"),
    service: str | None = QParam(None, description="Filter by service name"),
):
    """Export graph as Cypher CREATE statements for reimport."""
    conditions = []
    params: dict = {}
    if node_type:
        conditions.append(f"n:{node_type}")
    if service:
        conditions.append("n.service = $service")
        params["service"] = service

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    with graph_service.driver.session() as session:
        result = session.run(f"MATCH (n) {where} RETURN n LIMIT 5000", **params)
        statements = []
        id_map: dict[str, str] = {}
        for i, record in enumerate(result):
            node = record["n"]
            nid = str(node.element_id)
            var = f"n{i}"
            id_map[nid] = var
            label = list(node.labels)[0] if node.labels else "Node"
            props = dict(node.items())
            props_str = ", ".join(f'{k}: {json.dumps(str(v))}' for k, v in props.items())
            statements.append(f"CREATE ({var}:{label} {{{props_str}}})")

        edge_result = session.run(f"MATCH (n)-[r]->(m) {where} RETURN n, r, m LIMIT 10000", **params)
        for rec in edge_result:
            sid = str(rec["n"].element_id)
            tid = str(rec["m"].element_id)
            if sid in id_map and tid in id_map:
                rel_type = rec["r"].type
                statements.append(f"CREATE ({id_map[sid]})-[:{rel_type}]->({id_map[tid]})")

    return PlainTextResponse(
        content=";\n".join(statements) + ";\n" if statements else "// Empty graph",
        media_type="text/plain",
        headers={"Content-Disposition": "attachment; filename=graph_export.cypher"},
    )
