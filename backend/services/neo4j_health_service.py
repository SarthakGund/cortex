"""
System Knowledge Health Service
================================
Analyses the Neo4j knowledge graph and surfaces documentation coverage,
knowledge gaps, stale documentation, and orphaned nodes.
"""

from neo4j import GraphDatabase
from core.config import settings
from typing import Any

# ── node types that are expected to carry docs ────────────────────────────────
DOCUMENTED_TYPES = ["Service", "Module", "File", "Class", "Function", "Endpoint", "Schema"]
# ── minimum degree to be considered a "critical" undocumented node ───────────
CRITICAL_DEGREE_THRESHOLD = 3


class Neo4jHealthService:
    def __init__(self):
        self.driver = GraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
        )

    def close(self):
        self.driver.close()

    def _session(self):
        return self.driver.session()

    # ── helpers ────────────────────────────────────────────────────────────────

    def _q(self, cypher: str, **params) -> list[dict[str, Any]]:
        """Run a Cypher query and return all records as dicts."""
        with self._session() as s:
            result = s.run(cypher, **params)
            return [dict(r) for r in result]

    def _scalar(self, cypher: str, key: str, **params) -> Any:
        with self._session() as s:
            result = s.run(cypher, **params)
            record = result.single(strict=False)
            return record[key] if record else None

    # ── public API ─────────────────────────────────────────────────────────────

    def get_overview(self) -> dict:
        """High-level counts: nodes per type, total edges, health score."""
        node_counts = self._q("""
            MATCH (n)
            WITH labels(n)[0] AS label, count(n) AS cnt
            RETURN label, cnt
            ORDER BY cnt DESC
        """)
        total_nodes = sum(r["cnt"] for r in node_counts)
        total_edges = self._scalar("MATCH ()-[r]->() RETURN count(r) AS c", "c") or 0

        return {
            "total_nodes": total_nodes,
            "total_edges": total_edges,
            "node_distribution": {r["label"]: r["cnt"] for r in node_counts if r["label"]},
        }

    def get_documentation_coverage(self) -> dict:
        """
        For each documentable node type, returns:
          - total count
          - documented count (has non-empty description / docstring)
          - coverage percentage
        """
        results = {}
        for node_type in DOCUMENTED_TYPES:
            total = self._scalar(
                f"MATCH (n:{node_type}) RETURN count(n) AS c", "c"
            ) or 0

            documented = self._scalar(
                f"""
                MATCH (n:{node_type})
                WHERE (n.description IS NOT NULL AND trim(n.description) <> '')
                   OR (n.docstring    IS NOT NULL AND trim(n.docstring)    <> '')
                RETURN count(n) AS c
                """,
                "c",
            ) or 0

            coverage_pct = round((documented / total * 100) if total else 0, 1)
            results[node_type] = {
                "total": total,
                "documented": documented,
                "undocumented": total - documented,
                "coverage_pct": coverage_pct,
            }

        # overall coverage across all documented types
        all_total = sum(v["total"] for v in results.values())
        all_doc = sum(v["documented"] for v in results.values())
        overall_pct = round((all_doc / all_total * 100) if all_total else 0, 1)

        return {
            "by_type": results,
            "overall": {
                "total": all_total,
                "documented": all_doc,
                "undocumented": all_total - all_doc,
                "coverage_pct": overall_pct,
            },
        }

    def get_knowledge_gaps(self, limit: int = 50) -> list[dict]:
        """
        Returns undocumented nodes sorted by connectivity (highest degree first).
        High-degree undocumented nodes are the most critical knowledge gaps.
        """
        rows = self._q(
            """
            MATCH (n)
            WHERE labels(n)[0] IN $types
              AND (n.description IS NULL OR trim(n.description) = '')
              AND (n.docstring    IS NULL OR trim(n.docstring)   = '')
            OPTIONAL MATCH (n)-[r]-()
            WITH n, count(r) AS degree
            ORDER BY degree DESC
            RETURN
              coalesce(n.name, n.path, n.title, toString(id(n))) AS name,
              labels(n)[0]  AS node_type,
              degree,
              coalesce(n.service, n.module, '') AS parent,
              n.file_path   AS file_path,
              CASE WHEN degree >= $critical THEN 'critical'
                   WHEN degree >= 1         THEN 'moderate'
                   ELSE                          'low'
              END           AS severity
            LIMIT $limit
            """,
            types=DOCUMENTED_TYPES,
            critical=CRITICAL_DEGREE_THRESHOLD,
            limit=limit,
        )
        return rows

    def get_stale_docs(self) -> list[dict]:
        """
        Returns Documentation nodes that are either:
          - Missing a last_updated timestamp
          - Have last_updated more than 30 days ago (relative to current time)
        """
        rows = self._q("""
            MATCH (d:Documentation)
            WITH d,
                 coalesce(d.name, d.title, d.path, toString(id(d))) AS doc_name,
                 d.last_updated AS updated_at
            WHERE updated_at IS NULL
               OR duration.between(updated_at, datetime()).days > 30
            RETURN
              doc_name,
              d.service   AS service,
              updated_at  AS last_updated,
              CASE WHEN updated_at IS NULL THEN 'missing'
                   ELSE 'stale'
              END AS status
            ORDER BY updated_at ASC
            LIMIT 100
        """)
        return rows

    def get_orphaned_nodes(self) -> list[dict]:
        """Nodes with zero connections — completely isolated in the graph."""
        rows = self._q("""
            MATCH (n)
            WHERE NOT (n)-[]-()
            RETURN
              coalesce(n.name, n.path, n.title, toString(id(n))) AS name,
              labels(n)[0]  AS node_type,
              0             AS degree
            ORDER BY node_type, name
            LIMIT 100
        """)
        return rows

    def get_undocumented_services(self) -> list[dict]:
        """Service nodes that have no linked Documentation node."""
        rows = self._q("""
            MATCH (s:Service)
            WHERE NOT exists {
                MATCH (s)-[:HAS_DOC|DOCUMENTS|DESCRIBES]->(d:Documentation)
            }
            RETURN
              s.name        AS name,
              s.language    AS language,
              s.description AS description,
              CASE WHEN (s.description IS NULL OR trim(s.description) = '')
                   THEN 'no_description'
                   ELSE 'no_doc_node'
              END AS gap_type
            ORDER BY name
        """)
        return rows

    def get_health_score(self) -> dict:
        """
        Composite health score (0–100).
        Weights:
          - documentation coverage  60 %
          - orphaned nodes penalty   20 %
          - stale docs penalty       20 %
        """
        cov = self.get_documentation_coverage()
        coverage_score = cov["overall"]["coverage_pct"]  # already 0-100

        overview = self.get_overview()
        total_nodes = max(overview["total_nodes"], 1)
        orphan_count = len(self.get_orphaned_nodes())
        orphan_penalty = min(orphan_count / total_nodes * 100, 100)

        stale_count = len(self.get_stale_docs())
        stale_penalty = min(stale_count * 2, 100)  # each stale doc costs 2 pts

        score = round(
            0.60 * coverage_score
            + 0.20 * (100 - orphan_penalty)
            + 0.20 * (100 - stale_penalty),
            1,
        )
        return {
            "score": score,
            "grade": "A" if score >= 85 else "B" if score >= 70 else "C" if score >= 50 else "D",
            "breakdown": {
                "coverage_score": coverage_score,
                "orphan_penalty": round(orphan_penalty, 1),
                "stale_penalty": round(stale_penalty, 1),
            },
        }

    def get_full_dashboard(self) -> dict:
        """Returns all health metrics in one call."""
        overview = self.get_overview()
        coverage = self.get_documentation_coverage()
        gaps = self.get_knowledge_gaps(limit=20)
        stale = self.get_stale_docs()
        orphaned = self.get_orphaned_nodes()
        undoc_services = self.get_undocumented_services()
        health = self.get_health_score()

        return {
            "health_score": health,
            "overview": overview,
            "documentation_coverage": coverage,
            "top_knowledge_gaps": gaps,
            "stale_docs": stale,
            "orphaned_nodes": orphaned,
            "undocumented_services": undoc_services,
        }

    # ── Auto-Documentation ────────────────────────────────────────────────────

    def _get_node_context(self, name: str, node_type: str) -> dict:
        """Fetch full context for a node: all properties + neighbour edges."""
        rows = self._q(
            """
            MATCH (n)
            WHERE labels(n)[0] = $node_type
              AND (n.name = $name OR n.path = $name OR n.title = $name)
            OPTIONAL MATCH (n)-[r]->(m)
            OPTIONAL MATCH (p)-[rr]->(n)
            RETURN n,
                   collect(DISTINCT {rel: type(r),  target: coalesce(m.name, m.path, m.title, ''), target_type: labels(m)[0]}) AS outgoing,
                   collect(DISTINCT {rel: type(rr), source: coalesce(p.name, p.path, p.title, ''), source_type: labels(p)[0]}) AS incoming
            LIMIT 1
            """,
            name=name,
            node_type=node_type,
        )
        return rows[0] if rows else {}

    def generate_doc_suggestion(self, name: str, node_type: str) -> dict:
        """
        Use the knowledge graph context + Gemini to write documentation for a
        node that currently has no description or docstring.
        """
        from services.llm_service import llm_service  # lazy import avoids circular deps

        ctx = self._get_node_context(name, node_type)
        node_obj = ctx.get("n")
        node_props = dict(node_obj.items()) if node_obj else {}
        outgoing: list = ctx.get("outgoing") or []
        incoming: list = ctx.get("incoming") or []

        out_str = ", ".join(
            f"{r['rel']} → {r['target']} ({r['target_type']})"
            for r in outgoing if r.get("target")
        ) or "none"
        in_str = ", ".join(
            f"{r['source']} ({r['source_type']}) → {r['rel']}"
            for r in incoming if r.get("source")
        ) or "none"
        props_str = "\n".join(
            f"  {k}: {v}"
            for k, v in node_props.items()
            if k not in ("description", "docstring") and v
        ) or "  (none)"

        prompt = f"""You are a technical documentation writer for a software system.
Generate clear, concise documentation for the following {node_type} based on its knowledge graph context.

Node: {name}
Type: {node_type}
Properties:
{props_str}

Relationships:
  Calls / depends on : {out_str}
  Called by / used by: {in_str}

Write:
1. A 1-2 sentence description of what this {node_type} does.
2. Key responsibilities (up to 4 bullet points).
3. Notable dependencies, if any.

Keep the tone technical but concise. Do NOT use markdown headers or code fences."""

        if not llm_service.enabled:
            return {
                "name": name,
                "node_type": node_type,
                "suggestion": (
                    f"{name} is a {node_type} component in the system.\n\n"
                    "• Connects to: " + out_str + "\n"
                    "• Used by: " + in_str + "\n\n"
                    "(LLM not configured — add GROQ_API_KEY for richer suggestions.)"
                ),
                "source": "fallback",
            }

        try:
            response = llm_service.model.generate_content(prompt)
            return {"name": name, "node_type": node_type, "suggestion": response.text.strip(), "source": "llm"}
        except Exception as e:
            return {"name": name, "node_type": node_type, "suggestion": f"Generation failed: {e}", "source": "error"}

    def suggest_stale_doc_update(self, doc_name: str, service: str = "") -> dict:
        """
        Given an outdated or missing Documentation node, fetch the current
        service state from the graph and generate an up-to-date doc draft.
        """
        from services.llm_service import llm_service

        service_context = ""
        if service:
            rows = self._q(
                """
                MATCH (s:Service {name: $service})
                OPTIONAL MATCH (s)-[:EXPOSES]->(e:Endpoint)
                OPTIONAL MATCH (s)-[:CONTAINS]->(m:Module)
                RETURN s,
                       collect(DISTINCT {path: e.path, method: e.method}) AS endpoints,
                       collect(DISTINCT m.name)                            AS modules
                LIMIT 1
                """,
                service=service,
            )
            if rows:
                r = rows[0]
                endpoints = [
                    f"{ep.get('method','?')} {ep.get('path','?')}"
                    for ep in (r.get("endpoints") or []) if ep.get("path")
                ]
                modules = [m for m in (r.get("modules") or []) if m]
                service_context = (
                    f"Service: {service}\n"
                    f"Exposed endpoints: {', '.join(endpoints) or 'none'}\n"
                    f"Modules: {', '.join(modules) or 'none'}"
                )

        prompt = f"""You are a technical documentation writer.
The documentation entry "{doc_name}" is outdated or missing.
{f'Current system state from the knowledge graph:{chr(10)}{service_context}' if service_context else ''}

Write an updated documentation entry that:
1. Clearly describes the purpose and scope.
2. Lists key features or API endpoints (if a service).
3. Notes any important usage patterns or configuration.
4. Is production-ready with no placeholders.

Keep it concise and professional. Do NOT use code fences."""

        if not llm_service.enabled:
            return {
                "doc_name": doc_name,
                "suggestion": (
                    f"# {doc_name}\n\n"
                    "This documentation has been flagged as outdated. "
                    "Please review and update the following sections:\n\n"
                    "• Overview\n• API reference\n• Configuration\n\n"
                    "(Add GROQ_API_KEY for AI-generated content.)"
                ),
                "source": "fallback",
            }

        try:
            response = llm_service.model.generate_content(prompt)
            return {"doc_name": doc_name, "suggestion": response.text.strip(), "source": "llm"}
        except Exception as e:
            return {"doc_name": doc_name, "suggestion": f"Generation failed: {e}", "source": "error"}

    # ── Standardized templates ─────────────────────────────────────────────────

    _TEMPLATES: dict[str, dict] = {
        "adr": {
            "name": "Architecture Decision Record (ADR)",
            "description": "Document a significant architectural decision with context, options, and consequences.",
            "content": """\
# ADR-[NUMBER]: [Short title of the decision]

**Date:** [YYYY-MM-DD]
**Status:** [Proposed | Accepted | Deprecated | Superseded by ADR-XXX]
**Deciders:** [List of people involved in the decision]

---

## Context

[Describe the situation that requires a decision. What is the problem?
What constraints or forces are at play?]

## Decision

[State the decision in full sentences. "We will ..."]

## Options Considered

### Option 1: [Name]
- **Pros:** [...]
- **Cons:** [...]

### Option 2: [Name]
- **Pros:** [...]
- **Cons:** [...]

## Consequences

### Positive
- [...]

### Negative / Trade-offs
- [...]

### Risks
- [...]

## Related Decisions
- [ADR-XXX: Related decision title]
""",
        },
        "incident": {
            "name": "Incident Postmortem",
            "description": "Document a production incident: timeline, root cause, impact, and action items.",
            "content": """\
# Incident Postmortem: [Title]

**Date of Incident:** [YYYY-MM-DD]
**Duration:** [e.g. 1h 23m]
**Severity:** [P1 / P2 / P3]
**Status:** Resolved
**Author(s):** [Names]

---

## Summary

[1-2 sentences: what happened and the business impact.]

## Timeline

| Time (UTC) | Event |
|------------|-------|
| HH:MM | First sign of issue |
| HH:MM | Alert triggered |
| HH:MM | On-call engineer notified |
| HH:MM | Root cause identified |
| HH:MM | Fix deployed to production |
| HH:MM | Incident fully resolved |

## Root Cause

[Detailed, factual explanation of why this happened.]

## Impact

- **Services affected:** [List]
- **Users impacted:** [Number / percentage / none]
- **Data loss or corruption:** [Yes / No — details]

## What Went Well

- [...]

## What Went Wrong

- [...]

## Action Items

| Action | Owner | Due Date |
|--------|-------|----------|
| [Fix root cause] | [Name] | [Date] |
| [Add monitoring / alert] | [Name] | [Date] |
| [Update runbook] | [Name] | [Date] |

## Lessons Learned

[Key takeaways to prevent or detect similar incidents faster.]
""",
        },
        "service": {
            "name": "Service README",
            "description": "Standard README template for a microservice or backend component.",
            "content": """\
# [Service Name]

> [One-line summary of what this service does.]

---

## Overview

[Describe the service's purpose, the problem it solves, and where it sits
in the broader architecture.]

## Responsibilities

- [Primary responsibility]
- [Secondary responsibility]

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /healthz | None | Liveness check |
| POST | /v1/... | JWT | [Description] |

## Dependencies

| Type | Name | Purpose |
|------|------|---------|
| Upstream service | [Name] | [Why] |
| Database | [Name] | [What data] |
| Message queue | [Name] | [Events consumed / produced] |

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP listen port | `8000` |
| `DATABASE_URL` | Connection string | — |

## Running Locally

```bash
# Install deps
pip install -r requirements.txt

# Start
uvicorn main:app --reload
```

## Key Design Decisions

- [Link to ADR-XXX]

## On-Call Notes

- [Common alert: how to diagnose and fix]
- [Runbook link]
""",
        },
    }

    def get_template(self, template_type: str) -> dict:
        """Return a standardized documentation template by type."""
        t = self._TEMPLATES.get(template_type)
        if not t:
            available = list(self._TEMPLATES.keys())
            return {"error": f"Unknown template '{template_type}'. Available: {available}"}
        return {"type": template_type, **t}

    def list_templates(self) -> list[dict]:
        """Return metadata for all available templates (no content)."""
        return [
            {"type": k, "name": v["name"], "description": v["description"]}
            for k, v in self._TEMPLATES.items()
        ]


# ── singleton ──────────────────────────────────────────────────────────────────
neo4j_health_service = Neo4jHealthService()
