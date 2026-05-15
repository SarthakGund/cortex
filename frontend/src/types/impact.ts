export interface SpecDiffResult {
  added_endpoints: EndpointChange[]
  removed_endpoints: EndpointChange[]
  modified_endpoints: ModifiedEndpoint[]
  added_schemas: SchemaChange[]
  removed_schemas: SchemaChange[]
  modified_schemas: ModifiedSchema[]
  breaking_changes: BreakingChange[]
  summary: DiffSummary
  impacted_services: ImpactedService[]
  versions?: { old: string; new: string }
  files?: { old: string; new: string }
}

export interface EndpointChange {
  path: string
  method: string
  summary?: string
  description?: string
  operation_id?: string
  deprecated?: boolean
  request_body?: any
  response_schemas: Record<number, string | null>
}

export interface ModifiedEndpoint {
  path: string
  method: string
  changes: FieldChange[]
  breaking_changes: BreakingChange[]
}

export interface SchemaChange {
  name: string
  schema: Record<string, any>
}

export interface ModifiedSchema {
  schema: string
  field_changes: FieldChange[]
  breaking_changes: BreakingChange[]
}

export interface FieldChange {
  type: string
  name?: string
  field?: Record<string, any>
  old_field?: Record<string, any>
  old_type?: string
  new_type?: string
  old_format?: string
  new_format?: string
  removed_values?: string[]
}

export interface BreakingChange {
  type: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'none'
  path?: string
  method?: string
  schema_name?: string
  field_name?: string
  description: string
}

export interface DiffSummary {
  total_breaking: number
  by_severity: Record<string, number>
  endpoints_affected: number
  schemas_affected: number
}

export interface ImpactedService {
  service: string
  type: string
  detail: string
}

export interface WhatIfScenario {
  type: string
  target: string
  target_type?: string
  parameters?: Record<string, any>
}

export interface ScenarioImpact {
  scenario: WhatIfScenario
  affected_nodes: AffectedNodes
  affected_services: string[]
  breaking_changes: BreakingChange[]
  risk_level: string
  impact_summary: string
  recommendations: string[]
  cascading_failures: CascadingFailure[]
  migration_steps: string[]
}

export interface AffectedNodes {
  upstream: { count: number; by_type: Record<string, any[]>; items: any[] }
  downstream: { count: number; by_type: Record<string, any[]>; items: any[] }
  affected_services: string[]
  total_affected: number
}

export interface CascadingFailure {
  source: string
  source_type: string
  chain: string
  severity: string
  description: string
}

export interface ScenarioType {
  type: string
  name: string
  description: string
  parameters: string[]
}