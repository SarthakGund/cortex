"""
Event Sourcing Service
======================
Tracks all changes to the knowledge graph as immutable events.
Supports:
  - Record events on node/edge creation, update, deletion
  - Time-travel queries: "What did the graph look like at time T?"
  - Visual diff: "What changed between T1 and T2?"

Events are stored as Neo4j nodes (:Event) with timestamps,
linked to the affected graph nodes via :AFFECTED edges.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

from services.graph_service import graph_service


# ── Event Recording ──────────────────────────────────────────────────────────

def record_event(
    action: str,           # "CREATE" | "UPDATE" | "DELETE"
    entity_type: str,      # "Service" | "Function" | "Endpoint" | etc.
    entity_name: str,      # name or path of the affected entity
    service: str = "",     # which service it belongs to
    details: Optional[dict] = None,  # extra metadata
    source: str = "ingestion",       # "ingestion" | "manual" | "webhook" | "api"
) -> dict:
    """Record an event in the knowledge graph."""
    ts = datetime.now(timezone.utc).isoformat()
    detail_json = json.dumps(details or {}, default=str)

    cypher = """
    CREATE (e:Event {
        action:      $action,
        entity_type: $entity_type,
        entity_name: $entity_name,
        service:     $service,
        details:     $details,
        source:      $source,
        timestamp:   datetime($ts),
        ts_str:      $ts
    })
    WITH e
    OPTIONAL MATCH (n)
    WHERE (n.name = $entity_name OR n.path = $entity_name)
      AND NOT n:Event
    WITH e, collect(n)[0] AS target
    FOREACH (_ IN CASE WHEN target IS NOT NULL THEN [1] ELSE [] END |
        MERGE (e)-[:AFFECTED]->(target)
    )
    RETURN e.timestamp AS timestamp
    """

    with graph_service.driver.session() as session:
        result = session.run(cypher,
            action=action, entity_type=entity_type,
            entity_name=entity_name, service=service,
            details=detail_json, source=source, ts=ts,
        )
        rec = result.single()

    return {
        "action": action,
        "entity_type": entity_type,
        "entity_name": entity_name,
        "timestamp": ts,
    }


# ── Event Timeline ───────────────────────────────────────────────────────────

def get_timeline(
    service: Optional[str] = None,
    entity_type: Optional[str] = None,
    action: Optional[str] = None,
    since: Optional[str] = None,
    until: Optional[str] = None,
    limit: int = 100,
) -> list[dict]:
    """
    Query the event timeline with optional filters.
    """
    conditions = []
    params: dict = {"limit": limit}

    if service:
        conditions.append("e.service = $service")
        params["service"] = service
    if entity_type:
        conditions.append("e.entity_type = $entity_type")
        params["entity_type"] = entity_type
    if action:
        conditions.append("e.action = $action")
        params["action"] = action
    if since:
        conditions.append("e.ts_str >= $since")
        params["since"] = since
    if until:
        conditions.append("e.ts_str <= $until")
        params["until"] = until

    where = "WHERE " + " AND ".join(conditions) if conditions else ""

    cypher = f"""
    MATCH (e:Event)
    {where}
    RETURN e.action AS action,
           e.entity_type AS entity_type,
           e.entity_name AS entity_name,
           e.service AS service,
           e.details AS details,
           e.source AS source,
           e.ts_str AS timestamp
    ORDER BY e.ts_str DESC
    LIMIT $limit
    """

    events = []
    with graph_service.driver.session() as session:
        for rec in session.run(cypher, **params):
            events.append({
                "action": rec["action"],
                "entity_type": rec["entity_type"],
                "entity_name": rec["entity_name"],
                "service": rec["service"] or "",
                "details": rec["details"] or "{}",
                "source": rec["source"] or "",
                "timestamp": rec["timestamp"],
            })
    return events


# ── Time Travel: Graph Snapshot ──────────────────────────────────────────────

def graph_snapshot_at(timestamp: str) -> dict:
    """
    Reconstruct what entities existed at a given point in time.
    Uses the event log to determine which entities were created before
    the timestamp and not deleted before it.
    """
    cypher = """
    MATCH (e:Event)
    WHERE e.ts_str <= $timestamp
    WITH e.entity_name AS name, e.entity_type AS type, e.service AS service,
         collect({action: e.action, ts: e.ts_str}) AS history
    WITH name, type, service, history,
         [h IN history WHERE h.action = 'DELETE'] AS deletes,
         [h IN history WHERE h.action IN ['CREATE', 'UPDATE']] AS creates
    WHERE size(creates) > 0
      AND (size(deletes) = 0 OR
           ANY(c IN creates WHERE ALL(d IN deletes WHERE c.ts > d.ts)))
    RETURN type, name, service, size(creates) AS changes
    ORDER BY type, name
    """

    entities: dict[str, list] = {}
    with graph_service.driver.session() as session:
        for rec in session.run(cypher, timestamp=timestamp):
            entity_type = rec["type"]
            entities.setdefault(entity_type, []).append({
                "name": rec["name"],
                "service": rec["service"] or "",
                "changes": rec["changes"],
            })

    return {
        "timestamp": timestamp,
        "entity_types": {k: len(v) for k, v in entities.items()},
        "entities": entities,
        "total": sum(len(v) for v in entities.values()),
    }


# ── Visual Diff ──────────────────────────────────────────────────────────────

def diff_between(start: str, end: str) -> dict:
    """
    Show all changes (creations, updates, deletions) between two timestamps.
    """
    cypher = """
    MATCH (e:Event)
    WHERE e.ts_str >= $start AND e.ts_str <= $end
    RETURN e.action AS action,
           e.entity_type AS entity_type,
           e.entity_name AS entity_name,
           e.service AS service,
           e.details AS details,
           e.source AS source,
           e.ts_str AS timestamp
    ORDER BY e.ts_str ASC
    """

    created = []
    updated = []
    deleted = []

    with graph_service.driver.session() as session:
        for rec in session.run(cypher, start=start, end=end):
            item = {
                "entity_type": rec["entity_type"],
                "entity_name": rec["entity_name"],
                "service": rec["service"] or "",
                "timestamp": rec["timestamp"],
                "source": rec["source"] or "",
            }
            if rec["action"] == "CREATE":
                created.append(item)
            elif rec["action"] == "UPDATE":
                updated.append(item)
            elif rec["action"] == "DELETE":
                deleted.append(item)

    return {
        "period": {"start": start, "end": end},
        "summary": {
            "created": len(created),
            "updated": len(updated),
            "deleted": len(deleted),
            "total_changes": len(created) + len(updated) + len(deleted),
        },
        "created": created,
        "updated": updated,
        "deleted": deleted,
    }


# ── Stats ────────────────────────────────────────────────────────────────────

def event_stats() -> dict:
    """High-level stats about the event log."""
    cypher = """
    MATCH (e:Event)
    WITH count(e) AS total,
         min(e.ts_str) AS first_event,
         max(e.ts_str) AS last_event
    OPTIONAL MATCH (e2:Event)
    WITH total, first_event, last_event,
         e2.action AS action, count(e2) AS cnt
    RETURN total, first_event, last_event,
           collect({action: action, count: cnt}) AS by_action
    """

    with graph_service.driver.session() as session:
        rec = session.run(cypher).single()
        if not rec:
            return {"total": 0, "first_event": None, "last_event": None, "by_action": {}}

        by_action = {}
        for item in rec["by_action"]:
            if item["action"]:
                by_action[item["action"]] = item["count"]

        return {
            "total_events": rec["total"],
            "first_event": rec["first_event"],
            "last_event": rec["last_event"],
            "by_action": by_action,
        }
