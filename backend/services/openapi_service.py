"""
OpenAPI Spec Parser Service
===========================
Parses OpenAPI specifications (YAML/JSON) and extracts structured data
for impact analysis, schema evolution tracking, and breaking change detection.
"""

from __future__ import annotations

import json
import yaml
from typing import Optional, Any
from dataclasses import dataclass, field
from enum import Enum


class ChangeType(str, Enum):
    ADDED = "added"
    REMOVED = "removed"
    MODIFIED = "modified"
    NONE = "none"


class BreakingChangeSeverity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    NONE = "none"


@dataclass
class SchemaField:
    name: str
    type: str
    format: Optional[str] = None
    required: bool = False
    nullable: bool = False
    default: Optional[Any] = None
    description: Optional[str] = None
    enum_values: Optional[list] = None
    ref: Optional[str] = None  # $ref to another schema
    items: Optional[dict] = None  # For array types


@dataclass
class EndpointSpec:
    path: str
    method: str
    summary: Optional[str] = None
    description: Optional[str] = None
    operation_id: Optional[str] = None
    deprecated: bool = False
    request_body: Optional[dict] = None
    response_schemas: dict[int, Optional[str]] = field(default_factory=dict)  # status_code -> schema_ref
    security: list[dict] = field(default_factory=list)
    parameters: list[dict] = field(default_factory=list)


@dataclass
class OpenAPISpec:
    version: str
    title: str
    description: Optional[str] = None
    version_string: Optional[str] = None
    endpoints: list[EndpointSpec] = field(default_factory=list)
    schemas: dict[str, dict] = field(default_factory=dict)  # schema_name -> field_definitions
    raw: Optional[dict] = None

    def get_endpoint(self, path: str, method: str) -> Optional[EndpointSpec]:
        for ep in self.endpoints:
            if ep.path == path and ep.method.lower() == method.lower():
                return ep
        return None

    def get_schema(self, name: str) -> Optional[dict]:
        return self.schemas.get(name)


def parse_openapi_spec(content: str | dict, format: str = "auto") -> OpenAPISpec:
    """
    Parse an OpenAPI spec from raw content (YAML or JSON string, or already-parsed dict).

    Args:
        content: Raw spec content as string or already-parsed dict
        format: 'yaml', 'json', or 'auto' to detect

    Returns:
        OpenAPISpec with structured endpoint and schema data
    """
    if isinstance(content, str):
        content = _parse_raw_content(content, format)

    version = content.get("openapi", content.get("swagger", "unknown"))
    info = content.get("info", {})
    title = info.get("title", "Untitled API")
    description = info.get("description")

    endpoints = _extract_endpoints(content)
    schemas = _extract_schemas(content)

    return OpenAPISpec(
        version=version,
        title=title,
        description=description,
        version_string=info.get("version"),
        endpoints=endpoints,
        schemas=schemas,
        raw=content,
    )


def _parse_raw_content(content: str, format: str) -> dict:
    """Parse raw YAML or JSON content."""
    if format == "json":
        return json.loads(content)
    elif format == "yaml":
        return yaml.safe_load(content)
    else:  # auto-detect
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            return yaml.safe_load(content)


def _extract_endpoints(spec: dict) -> list[EndpointSpec]:
    """Extract all endpoints from an OpenAPI spec."""
    endpoints = []
    paths = spec.get("paths", {})

    for path, path_item in paths.items():
        for method, operation in path_item.items():
            if method not in ("get", "post", "put", "patch", "delete", "options", "head"):
                continue

            ep = EndpointSpec(
                path=path,
                method=method.upper(),
                summary=operation.get("summary"),
                description=operation.get("description"),
                operation_id=operation.get("operationId"),
                deprecated=operation.get("deprecated", False),
                parameters=operation.get("parameters", []),
                security=operation.get("security", []),
            )

            # Extract request body
            request_body = operation.get("requestBody")
            if request_body:
                ep.request_body = request_body

            # Extract response schemas
            responses = operation.get("responses", {})
            for status_code, response_obj in responses.items():
                if status_code == "default":
                    continue
                try:
                    code = int(status_code.replace("X", "0"))
                except ValueError:
                    continue

                content = response_obj.get("content", {})
                schema_ref = None
                if "application/json" in content:
                    json_schema = content["application/json"].get("schema", {})
                    schema_ref = _extract_schema_ref(json_schema)
                ep.response_schemas[code] = schema_ref

            endpoints.append(ep)

    return endpoints


def _extract_schemas(spec: dict) -> dict[str, dict]:
    """Extract all schemas from an OpenAPI spec (supports nested $ref resolution)."""
    schemas = {}
    raw_schemas = spec.get("components", {}).get("schemas", {})

    for name, schema_def in raw_schemas.items():
        schemas[name] = _parse_schema_definition(schema_def, raw_schemas)

    return schemas


def _parse_schema_definition(schema: dict, all_schemas: dict, resolved: bool = True) -> dict:
    """Parse a schema definition into a structured format."""
    if not schema:
        return {}

    result = {
        "type": schema.get("type"),
        "format": schema.get("format"),
        "description": schema.get("description"),
        "nullable": schema.get("nullable", False),
        "default": schema.get("default"),
        "enum": schema.get("enum"),
        "properties": {},
        "required": schema.get("required", []),
        "items": schema.get("items"),
        "additional_properties": schema.get("additionalProperties"),
        "all_of": schema.get("allOf"),
        "one_of": schema.get("oneOf"),
        "any_of": schema.get("anyOf"),
    }

    # Handle object properties
    if schema.get("type") == "object" or "properties" in schema:
        for prop_name, prop_def in schema.get("properties", {}).items():
            result["properties"][prop_name] = _parse_schema_definition(prop_def, all_schemas)

    # Handle array items
    if "items" in schema:
        result["items"] = _parse_schema_definition(schema["items"], all_schemas)

    # Resolve $ref if present
    ref = schema.get("$ref")
    if ref:
        resolved_name = ref.split("/")[-1]
        result["ref"] = resolved_name
        if resolved and resolved_name in all_schemas:
            result = _resolve_ref(resolved_name, all_schemas)

    return result


def _resolve_ref(ref_name: str, all_schemas: dict) -> dict:
    """Resolve a $ref to its full schema definition."""
    if ref_name not in all_schemas:
        return {"$ref": ref_name}

    schema = all_schemas[ref_name]
    resolved = _parse_schema_definition(schema, all_schemas)
    resolved["$ref"] = ref_name
    return resolved


def _extract_schema_ref(schema: dict) -> Optional[str]:
    """Extract the schema name from a schema definition or $ref."""
    if "$ref" in schema:
        return schema["$ref"].split("/")[-1]
    return schema.get("type")


def generate_diff(
    old_spec: OpenAPISpec,
    new_spec: OpenAPISpec,
) -> SpecDiff:
    """
    Compare two OpenAPI specs and generate a detailed diff.

    Returns a SpecDiff with all changes categorized by breaking vs non-breaking.
    """
    diff = SpecDiff()

    # Endpoints
    old_endpoints = {(e.path, e.method) for e in old_spec.endpoints}
    new_endpoints = {(e.path, e.method) for e in new_spec.endpoints}

    # Added endpoints
    for ep in new_spec.endpoints:
        key = (ep.path, ep.method)
        if key not in old_endpoints:
            diff.added_endpoints.append(_endpoint_to_dict(ep))

    # Removed endpoints
    for ep in old_spec.endpoints:
        key = (ep.path, ep.method)
        if key not in new_endpoints:
            diff.removed_endpoints.append(_endpoint_to_dict(ep))
            diff.breaking_changes.append(BreakingChange(
                type="endpoint_removed",
                severity=BreakingChangeSeverity.CRITICAL,
                path=ep.path,
                method=ep.method,
                description=f"Endpoint {ep.method.upper()} {ep.path} has been removed",
            ))

    # Modified endpoints (check for breaking changes)
    for old_ep in old_spec.endpoints:
        new_ep = new_spec.get_endpoint(old_ep.path, old_ep.method)
        if not new_ep:
            continue

        ep_changes = _compare_endpoints(old_ep, new_ep)
        if ep_changes:
            diff.modified_endpoints.append(ep_changes)
            diff.breaking_changes.extend(ep_changes.get("breaking_changes", []))

    # Schemas
    old_schemas = set(old_spec.schemas.keys())
    new_schemas = set(new_spec.schemas.keys())

    # Added schemas
    for name in new_schemas - old_schemas:
        diff.added_schemas.append({
            "name": name,
            "schema": new_spec.schemas[name],
        })

    # Removed schemas
    for name in old_schemas - new_schemas:
        diff.removed_schemas.append({
            "name": name,
            "schema": old_spec.schemas[name],
        })
        diff.breaking_changes.append(BreakingChange(
            type="schema_removed",
            severity=BreakingChangeSeverity.HIGH,
            schema_name=name,
            description=f"Schema '{name}' has been removed",
        ))

    # Modified schemas (field-level diff)
    for name in old_schemas & new_schemas:
        old_fields = _flatten_fields(old_spec.schemas[name])
        new_fields = _flatten_fields(new_spec.schemas[name])

        schema_changes = _compare_fields(name, old_fields, new_fields)
        if schema_changes:
            diff.modified_schemas.append(schema_changes)
            for bc in schema_changes.get("breaking_changes", []):
                diff.breaking_changes.append(bc)

    return diff


@dataclass
class BreakingChange:
    type: str  # endpoint_removed, field_type_changed, field_required_added, etc.
    severity: BreakingChangeSeverity
    path: Optional[str] = None
    method: Optional[str] = None
    schema_name: Optional[str] = None
    field_name: Optional[str] = None
    old_value: Optional[Any] = None
    new_value: Optional[Any] = None
    description: str = ""


def _endpoint_to_dict(ep: EndpointSpec) -> dict:
    return {
        "path": ep.path,
        "method": ep.method,
        "summary": ep.summary,
        "description": ep.description,
        "operation_id": ep.operation_id,
        "deprecated": ep.deprecated,
        "request_body": ep.request_body,
        "response_schemas": ep.response_schemas,
    }


def _compare_endpoints(old: EndpointSpec, new: EndpointSpec) -> dict:
    """Compare two endpoints for changes."""
    changes = {
        "path": old.path,
        "method": old.method,
        "changes": [],
        "breaking_changes": [],
    }

    # Check deprecation status
    if not old.deprecated and new.deprecated:
        changes["changes"].append({
            "type": "deprecated",
            "detail": "Endpoint is now deprecated",
        })
        changes["breaking_changes"].append(BreakingChange(
            type="endpoint_deprecated",
            severity=BreakingChangeSeverity.MEDIUM,
            path=new.path,
            method=new.method,
            description=f"Endpoint {new.method} {new.path} is now deprecated",
        ))

    # Check for parameter changes
    old_params = {p["name"]: p for p in old.parameters}
    new_params = {p["name"]: p for p in new.parameters}

    for name, new_param in new_params.items():
        if name not in old_params:
            changes["changes"].append({
                "type": "parameter_added",
                "name": name,
                "param": new_param,
            })
            changes["breaking_changes"].append(BreakingChange(
                type="parameter_added",
                severity=BreakingChangeSeverity.LOW,
                path=new.path,
                method=new.method,
                field_name=name,
                description=f"Parameter '{name}' added to {new.method} {new.path}",
            ))
        else:
            old_param = old_params[name]
            if old_param.get("required") != new_param.get("required"):
                if not old_param.get("required") and new_param.get("required"):
                    changes["breaking_changes"].append(BreakingChange(
                        type="parameter_required_added",
                        severity=BreakingChangeSeverity.HIGH,
                        path=new.path,
                        method=new.method,
                        field_name=name,
                        description=f"Parameter '{name}' is now required on {new.method} {new.path}",
                    ))

    for name in old_params:
        if name not in new_params:
            changes["changes"].append({
                "type": "parameter_removed",
                "name": name,
            })
            changes["breaking_changes"].append(BreakingChange(
                type="parameter_removed",
                severity=BreakingChangeSeverity.HIGH,
                path=new.path,
                method=new.method,
                field_name=name,
                description=f"Parameter '{name}' removed from {new.method} {new.path}",
            ))

    return changes


def _flatten_fields(schema: dict) -> dict[str, dict]:
    """Flatten a schema to a simple field name -> definition map."""
    fields = schema.get("properties", {}).copy()
    required = set(schema.get("required", []))
    for name, field_def in fields.items():
        field_def["_required"] = name in required
    return fields


def _compare_fields(schema_name: str, old_fields: dict, new_fields: dict) -> dict:
    """Compare two schemas' fields for breaking changes."""
    changes = {
        "schema": schema_name,
        "field_changes": [],
        "breaking_changes": [],
    }

    # Added fields
    for name, field_def in new_fields.items():
        if name not in old_fields:
            is_required = field_def.get("_required", False)
            changes["field_changes"].append({
                "type": "field_added",
                "name": name,
                "field": field_def,
            })
            if is_required:
                changes["breaking_changes"].append(BreakingChange(
                    type="required_field_added",
                    severity=BreakingChangeSeverity.HIGH,
                    schema_name=schema_name,
                    field_name=name,
                    description=f"Required field '{name}' added to schema '{schema_name}'",
                ))

    # Removed fields
    for name, field_def in old_fields.items():
        if name not in new_fields:
            changes["field_changes"].append({
                "type": "field_removed",
                "name": name,
                "old_field": field_def,
            })
            changes["breaking_changes"].append(BreakingChange(
                type="field_removed",
                severity=BreakingChangeSeverity.CRITICAL,
                schema_name=schema_name,
                field_name=name,
                description=f"Field '{name}' removed from schema '{schema_name}'",
            ))

    # Modified fields
    for name in old_fields & new_fields:
        old_field = old_fields[name]
        new_field = new_fields[name]

        field_changes = _compare_field_metadata(name, schema_name, old_field, new_field)
        if field_changes:
            changes["field_changes"].extend(field_changes.get("changes", []))
            changes["breaking_changes"].extend(field_changes.get("breaking_changes", []))

    return changes


def _compare_field_metadata(
    field_name: str,
    schema_name: str,
    old_field: dict,
    new_field: dict,
) -> dict:
    """Compare field metadata for breaking changes."""
    result = {"changes": [], "breaking_changes": []}

    # Type changes
    old_type = old_field.get("type")
    new_type = new_field.get("type")
    if old_type != new_type:
        result["changes"].append({
            "type": "field_type_changed",
            "name": field_name,
            "old_type": old_type,
            "new_type": new_type,
        })
        result["breaking_changes"].append(BreakingChange(
            type="field_type_changed",
            severity=BreakingChangeSeverity.CRITICAL,
            schema_name=schema_name,
            field_name=field_name,
            old_value=old_type,
            new_value=new_type,
            description=f"Field '{field_name}' in '{schema_name}' changed from {old_type} to {new_type}",
        ))

    # Required status added
    old_required = old_field.get("_required", False)
    new_required = new_field.get("_required", False)
    if not old_required and new_required:
        result["changes"].append({
            "type": "field_required_added",
            "name": field_name,
        })
        result["breaking_changes"].append(BreakingChange(
            type="field_required_added",
            severity=BreakingChangeSeverity.HIGH,
            schema_name=schema_name,
            field_name=field_name,
            description=f"Field '{field_name}' in '{schema_name}' is now required",
        ))

    # Format changes
    old_format = old_field.get("format")
    new_format = new_field.get("format")
    if old_format != new_format:
        result["changes"].append({
            "type": "field_format_changed",
            "name": field_name,
            "old_format": old_format,
            "new_format": new_format,
        })
        # Format changes are usually breaking
        result["breaking_changes"].append(BreakingChange(
            type="field_format_changed",
            severity=BreakingChangeSeverity.MEDIUM,
            schema_name=schema_name,
            field_name=field_name,
            old_value=old_format,
            new_value=new_format,
            description=f"Field '{field_name}' format changed from {old_format} to {new_format}",
        ))

    # Enum changes
    old_enum = old_field.get("enum") or []
    new_enum = new_field.get("enum") or []
    if old_enum != new_enum:
        removed_values = set(old_enum) - set(new_enum)
        if removed_values:
            result["changes"].append({
                "type": "enum_value_removed",
                "name": field_name,
                "removed_values": list(removed_values),
            })
            result["breaking_changes"].append(BreakingChange(
                type="enum_value_removed",
                severity=BreakingChangeSeverity.HIGH,
                schema_name=schema_name,
                field_name=field_name,
                old_value=list(removed_values),
                description=f"Enum values {removed_values} removed from field '{field_name}' in '{schema_name}'",
            ))

    return result


@dataclass
class SpecDiff:
    added_endpoints: list = field(default_factory=list)
    removed_endpoints: list = field(default_factory=list)
    modified_endpoints: list = field(default_factory=list)

    added_schemas: list = field(default_factory=list)
    removed_schemas: list = field(default_factory=list)
    modified_schemas: list = field(default_factory=list)

    breaking_changes: list[BreakingChange] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "added_endpoints": self.added_endpoints,
            "removed_endpoints": self.removed_endpoints,
            "modified_endpoints": self.modified_endpoints,
            "added_schemas": self.added_schemas,
            "removed_schemas": self.removed_schemas,
            "modified_schemas": self.modified_schemas,
            "breaking_changes": [
                {
                    "type": bc.type,
                    "severity": bc.severity.value if isinstance(bc.severity, BreakingChangeSeverity) else bc.severity,
                    "path": bc.path,
                    "method": bc.method,
                    "schema_name": bc.schema_name,
                    "field_name": bc.field_name,
                    "description": bc.description,
                }
                for bc in self.breaking_changes
            ],
            "summary": {
                "total_breaking": len(self.breaking_changes),
                "by_severity": self._count_by_severity(),
                "endpoints_affected": len(set((bc.path, bc.method) for bc in self.breaking_changes if bc.path)),
                "schemas_affected": len(set(bc.schema_name for bc in self.breaking_changes if bc.schema_name)),
            },
        }

    def _count_by_severity(self) -> dict:
        counts = {s.value: 0 for s in BreakingChangeSeverity if s != BreakingChangeSeverity.NONE}
        for bc in self.breaking_changes:
            severity = bc.severity.value if isinstance(bc.severity, BreakingChangeSeverity) else bc.severity
            if severity in counts:
                counts[severity] += 1
        return counts

    def get_impacted_services(self, graph_service) -> list[dict]:
        """
        Query the graph to find which services are affected by these changes.
        """
        if not graph_service:
            return []

        impacted = []
        # Get services that use affected endpoints
        affected_paths = list(set(e["path"] for e in self.removed_endpoints + self.modified_endpoints))
        affected_schemas = list(set(s["name"] for s in self.removed_schemas + self.modified_schemas))

        if not affected_paths and not affected_schemas:
            return []

        with graph_service.driver.session() as session:
            # Find services with matching endpoints or schemas
            for path in affected_paths[:10]:
                result = session.run(
                    """
                    MATCH (s:Service)-[*1..3]-(e:Endpoint {path: $path})
                    RETURN DISTINCT s.name as service, 'endpoint' as impact_type
                    """,
                    path=path,
                )
                for record in result:
                    impacted.append({
                        "service": record["service"],
                        "type": record["impact_type"],
                        "detail": path,
                    })

            for schema in affected_schemas[:10]:
                result = session.run(
                    """
                    MATCH (s:Service)-[*1..3]-(sc:Schema {name: $schema})
                    RETURN DISTINCT s.name as service, 'schema' as impact_type
                    """,
                    schema=schema,
                )
                for record in result:
                    impacted.append({
                        "service": record["service"],
                        "type": record["impact_type"],
                        "detail": schema,
                    })

        # Dedup and return
        seen = set()
        unique = []
        for item in impacted:
            key = (item["service"], item["type"], item["detail"])
            if key not in seen:
                seen.add(key)
                unique.append(item)

        return unique