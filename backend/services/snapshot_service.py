"""
Graph Snapshot Service
======================
Captures the full Neo4j graph state (all nodes + edges) as JSON at a point
in time and persists it in SQLite, linked to the triggering commit.

Each snapshot stores:
  - nodes: [{id, label, props}]
  - edges: [{source_id, target_id, type, props}]

This allows "time-travel" replays of the exact graph structure at any commit.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional

from core.database import SessionLocal
from core.models import GraphSnapshot

logger = logging.getLogger(__name__)


class SnapshotService:
    def _get_neo4j_driver(self):
        """Lazy import to avoid circular deps."""
        try:
            from services.graph_service import graph_service
            return graph_service.driver
        except Exception:
            return None

    # ── Capture ──────────────────────────────────────────────────────────────

    def capture(
        self,
        label: Optional[str] = None,
        commit_hash: Optional[str] = None,
        commit_message: Optional[str] = None,
        author: Optional[str] = None,
        repo_url: Optional[str] = None,
        service_name: Optional[str] = None,
    ) -> Optional[dict]:
        """
        Query Neo4j for all non-Event nodes and all relationships,
        serialize to JSON, and store in SQLite.
        Returns the snapshot summary dict (without node/edge data).
        """
        driver = self._get_neo4j_driver()
        if driver is None:
            logger.warning("Neo4j not available — skipping snapshot")
            return None

        try:
            nodes, edges = self._fetch_graph(driver)
        except Exception as e:
            logger.exception("Failed to fetch graph from Neo4j")
            return None

        snap_label = label or (
            f"After commit {commit_hash[:7]}" if commit_hash else
            f"Manual snapshot {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}"
        )

        db = SessionLocal()
        try:
            snap = GraphSnapshot(
                commit_hash=commit_hash,
                commit_message=commit_message,
                author=author,
                repo_url=repo_url,
                service_name=service_name,
                nodes_json=json.dumps(nodes),
                edges_json=json.dumps(edges),
                node_count=len(nodes),
                edge_count=len(edges),
                label=snap_label,
            )
            db.add(snap)
            db.commit()
            db.refresh(snap)
            logger.info("Saved snapshot #%s: %s (%d nodes, %d edges)", snap.id, snap_label, len(nodes), len(edges))
            return snap.to_dict()
        except Exception as e:
            db.rollback()
            logger.exception("Error saving snapshot")
            return None
        finally:
            db.close()

    def _fetch_graph(self, driver) -> tuple[list[dict], list[dict]]:
        """Return (nodes, edges) from Neo4j, skipping :Event nodes."""
        nodes = []
        edges = []

        node_query = """
        MATCH (n)
        WHERE NOT n:Event
        RETURN id(n) AS neo_id,
               labels(n) AS labels,
               properties(n) AS props
        LIMIT 2000
        """

        edge_query = """
        MATCH (a)-[r]->(b)
        WHERE NOT a:Event AND NOT b:Event
        RETURN id(a) AS src_id,
               id(b)  AS tgt_id,
               type(r) AS rel_type,
               properties(r) AS props
        LIMIT 5000
        """

        with driver.session() as session:
            for rec in session.run(node_query):
                props = dict(rec["props"])
                # Convert non-serializable Neo4j types
                for k, v in props.items():
                    if hasattr(v, "isoformat"):
                        props[k] = v.isoformat()
                    elif not isinstance(v, (str, int, float, bool, type(None))):
                        props[k] = str(v)

                nodes.append({
                    "id": rec["neo_id"],
                    "label": rec["labels"][0] if rec["labels"] else "Unknown",
                    "name": props.get("name") or props.get("path") or str(rec["neo_id"]),
                    "props": props,
                })

            for rec in session.run(edge_query):
                props = dict(rec["props"])
                for k, v in props.items():
                    if hasattr(v, "isoformat"):
                        props[k] = v.isoformat()
                    elif not isinstance(v, (str, int, float, bool, type(None))):
                        props[k] = str(v)

                edges.append({
                    "source": rec["src_id"],
                    "target": rec["tgt_id"],
                    "type": rec["rel_type"],
                    "props": props,
                })

        return nodes, edges

    # ── Query ─────────────────────────────────────────────────────────────────

    def list_snapshots(self, limit: int = 50, service_name: Optional[str] = None) -> list[dict]:
        """Return recent snapshots (summary only, no graph data), optionally filtered by repo."""
        db = SessionLocal()
        try:
            q = db.query(GraphSnapshot)
            if service_name:
                q = q.filter(GraphSnapshot.service_name == service_name)
            snaps = q.order_by(GraphSnapshot.taken_at.desc()).limit(limit).all()
            return [s.to_dict() for s in snaps]
        except Exception as e:
            logger.exception("Error listing snapshots")
            return []
        finally:
            db.close()

    def get_snapshot(self, snapshot_id: int, service_name: Optional[str] = None) -> Optional[dict]:
        """Return a full snapshot (including nodes + edges), scoped to repo if provided."""
        db = SessionLocal()
        try:
            q = db.query(GraphSnapshot).filter(GraphSnapshot.id == snapshot_id)
            if service_name:
                q = q.filter(GraphSnapshot.service_name == service_name)
            snap = q.first()
            return snap.to_full_dict() if snap else None
        except Exception as e:
            logger.exception("Error fetching snapshot #%s", snapshot_id)
            return None
        finally:
            db.close()

    def diff_snapshots(self, id_before: int, id_after: int, service_name: Optional[str] = None) -> dict:
        """Compare two snapshots (scoped to repo) and return added/removed/changed nodes and edges."""
        before = self.get_snapshot(id_before, service_name=service_name)
        after = self.get_snapshot(id_after, service_name=service_name)

        if not before or not after:
            return {"error": "One or both snapshots not found"}

        before_nodes = {n["id"]: n for n in before["nodes"]}
        after_nodes = {n["id"]: n for n in after["nodes"]}
        before_edges = {(e["source"], e["target"], e["type"]) for e in before["edges"]}
        after_edges = {(e["source"], e["target"], e["type"]) for e in after["edges"]}

        added_ids = set(after_nodes) - set(before_nodes)
        removed_ids = set(before_nodes) - set(after_nodes)
        common_ids = set(before_nodes) & set(after_nodes)

        changed = []
        for nid in common_ids:
            if before_nodes[nid]["props"] != after_nodes[nid]["props"]:
                changed.append({
                    "id": nid,
                    "label": after_nodes[nid]["label"],
                    "name": after_nodes[nid]["name"],
                    "before": before_nodes[nid]["props"],
                    "after": after_nodes[nid]["props"],
                })

        added_edges = [
            {"source": s, "target": t, "type": tp}
            for s, t, tp in (after_edges - before_edges)
        ]
        removed_edges = [
            {"source": s, "target": t, "type": tp}
            for s, t, tp in (before_edges - after_edges)
        ]

        return {
            "before": {"id": id_before, "label": before["label"], "taken_at": before["taken_at"]},
            "after": {"id": id_after, "label": after["label"], "taken_at": after["taken_at"]},
            "summary": {
                "nodes_added": len(added_ids),
                "nodes_removed": len(removed_ids),
                "nodes_changed": len(changed),
                "edges_added": len(added_edges),
                "edges_removed": len(removed_edges),
            },
            "nodes_added": [after_nodes[i] for i in added_ids],
            "nodes_removed": [before_nodes[i] for i in removed_ids],
            "nodes_changed": changed,
            "edges_added": added_edges,
            "edges_removed": removed_edges,
        }


snapshot_service = SnapshotService()
