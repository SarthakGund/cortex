from fastapi import APIRouter, Query as QParam
from services.graph_service import graph_service

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
