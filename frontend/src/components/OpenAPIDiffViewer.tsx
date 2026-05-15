'use client'

import React, { useState } from 'react'
import {
  Diff,
  Plus,
  Minus,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  FileText,
  GitCompare,
  CheckCircle2,
  XCircle,
  Info,
  ArrowRight,
} from 'lucide-react'
import type { SpecDiffResult, BreakingChange } from '../types/impact'

interface OpenAPIDiffViewerProps {
  diff: SpecDiffResult
  onViewImpact?: (item: any) => void
}

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; icon: typeof AlertTriangle }> = {
  critical: { color: 'text-red-700', bg: 'bg-red-100 border-red-300', icon: XCircle },
  high: { color: 'text-orange-700', bg: 'bg-orange-100 border-orange-300', icon: AlertTriangle },
  medium: { color: 'text-yellow-700', bg: 'bg-yellow-100 border-yellow-300', icon: AlertTriangle },
  low: { color: 'text-blue-700', bg: 'bg-blue-100 border-blue-300', icon: Info },
  none: { color: 'text-gray-700', bg: 'bg-gray-100 border-gray-300', icon: CheckCircle2 },
}

export function OpenAPIDiffViewer({ diff, onViewImpact }: OpenAPIDiffViewerProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>('breaking')

  const severityCounts = diff.summary?.by_severity ?? {}
  const totalBreaking = diff.summary?.total_breaking ?? diff.breaking_changes?.length ?? 0

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <GitCompare size={20} className="text-slate-600" />
            <h3 className="font-semibold">OpenAPI Spec Diff</h3>
            {diff.versions && (
              <span className="text-xs text-slate-500">
                {diff.versions.old} → {diff.versions.new}
              </span>
            )}
            {diff.files && (
              <span className="text-xs text-slate-500">
                {diff.files.old} → {diff.files.new}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {totalBreaking > 0 ? (
              <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-medium flex items-center gap-1">
                <AlertTriangle size={12} />
                {totalBreaking} Breaking
              </span>
            ) : (
              <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium flex items-center gap-1">
                <CheckCircle2 size={12} />
                No Breaking
              </span>
            )}
          </div>
        </div>

        {/* Severity Breakdown */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {(['critical', 'high', 'medium', 'low'] as const).map(severity => {
            const count = severityCounts[severity] ?? 0
            const config = SEVERITY_CONFIG[severity]
            const Icon = config.icon
            return (
              <div
                key={severity}
                className={`px-3 py-2 rounded-lg border ${config.bg}`}
              >
                <div className="flex items-center gap-2">
                  <Icon size={14} className={config.color} />
                  <span className={`text-xs font-medium uppercase ${config.color}`}>
                    {severity}
                  </span>
                </div>
                <p className={`text-2xl font-bold ${config.color}`}>{count}</p>
              </div>
            )
          })}
        </div>

        {/* Impacted Services */}
        {diff.impacted_services && diff.impacted_services.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-slate-500 uppercase mb-2">
              Impacted Services ({diff.impacted_services.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {diff.impacted_services.map((svc, i) => (
                <span
                  key={i}
                  className="px-2 py-1 rounded bg-slate-100 text-slate-700 text-xs"
                >
                  {svc.service}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Breaking Changes Section */}
      {diff.breaking_changes && diff.breaking_changes.length > 0 && (
        <CollapsibleSection
          title={`Breaking Changes (${diff.breaking_changes.length})`}
          icon={<AlertTriangle size={16} className="text-red-500" />}
          open={expandedSection === 'breaking'}
          onToggle={() => setExpandedSection(expandedSection === 'breaking' ? null : 'breaking')}
        >
          <div className="space-y-2">
            {diff.breaking_changes.map((bc, i) => (
              <BreakingChangeCard key={i} change={bc} onViewImpact={onViewImpact} />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Added Endpoints */}
      {diff.added_endpoints && diff.added_endpoints.length > 0 && (
        <CollapsibleSection
          title={`Added Endpoints (${diff.added_endpoints.length})`}
          icon={<Plus size={16} className="text-green-500" />}
          open={expandedSection === 'added-endpoints'}
          onToggle={() => setExpandedSection(expandedSection === 'added-endpoints' ? null : 'added-endpoints')}
        >
          <div className="space-y-2">
            {diff.added_endpoints.map((ep, i) => (
              <EndpointCard key={i} endpoint={ep} type="added" onViewImpact={onViewImpact} />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Removed Endpoints */}
      {diff.removed_endpoints && diff.removed_endpoints.length > 0 && (
        <CollapsibleSection
          title={`Removed Endpoints (${diff.removed_endpoints.length})`}
          icon={<Minus size={16} className="text-red-500" />}
          open={expandedSection === 'removed-endpoints'}
          onToggle={() => setExpandedSection(expandedSection === 'removed-endpoints' ? null : 'removed-endpoints')}
        >
          <div className="space-y-2">
            {diff.removed_endpoints.map((ep, i) => (
              <EndpointCard key={i} endpoint={ep} type="removed" onViewImpact={onViewImpact} />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Modified Endpoints */}
      {diff.modified_endpoints && diff.modified_endpoints.length > 0 && (
        <CollapsibleSection
          title={`Modified Endpoints (${diff.modified_endpoints.length})`}
          icon={<Diff size={16} className="text-yellow-500" />}
          open={expandedSection === 'modified-endpoints'}
          onToggle={() => setExpandedSection(expandedSection === 'modified-endpoints' ? null : 'modified-endpoints')}
        >
          <div className="space-y-3">
            {diff.modified_endpoints.map((ep, i) => (
              <ModifiedEndpointCard key={i} endpoint={ep} onViewImpact={onViewImpact} />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Added Schemas */}
      {diff.added_schemas && diff.added_schemas.length > 0 && (
        <CollapsibleSection
          title={`Added Schemas (${diff.added_schemas.length})`}
          icon={<Plus size={16} className="text-green-500" />}
          open={expandedSection === 'added-schemas'}
          onToggle={() => setExpandedSection(expandedSection === 'added-schemas' ? null : 'added-schemas')}
        >
          <div className="space-y-2">
            {diff.added_schemas.map((sc, i) => (
              <SchemaCard key={i} schema={sc} type="added" />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Removed Schemas */}
      {diff.removed_schemas && diff.removed_schemas.length > 0 && (
        <CollapsibleSection
          title={`Removed Schemas (${diff.removed_schemas.length})`}
          icon={<Minus size={16} className="text-red-500" />}
          open={expandedSection === 'removed-schemas'}
          onToggle={() => setExpandedSection(expandedSection === 'removed-schemas' ? null : 'removed-schemas')}
        >
          <div className="space-y-2">
            {diff.removed_schemas.map((sc, i) => (
              <SchemaCard key={i} schema={sc} type="removed" />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Modified Schemas */}
      {diff.modified_schemas && diff.modified_schemas.length > 0 && (
        <CollapsibleSection
          title={`Modified Schemas (${diff.modified_schemas.length})`}
          icon={<Diff size={16} className="text-yellow-500" />}
          open={expandedSection === 'modified-schemas'}
          onToggle={() => setExpandedSection(expandedSection === 'modified-schemas' ? null : 'modified-schemas')}
        >
          <div className="space-y-3">
            {diff.modified_schemas.map((sc, i) => (
              <ModifiedSchemaCard key={i} schema={sc} />
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  )
}

function CollapsibleSection({
  title,
  icon,
  open,
  onToggle,
  children
}: {
  title: string
  icon: React.ReactNode
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-5 py-3.5 text-sm font-medium hover:bg-slate-50 transition-colors"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {icon}
        {title}
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  )
}

function BreakingChangeCard({ change, onViewImpact }: { change: BreakingChange; onViewImpact?: (item: any) => void }) {
  const config = SEVERITY_CONFIG[change.severity] ?? SEVERITY_CONFIG.none
  const Icon = config.icon

  return (
    <div className={`p-3 rounded-lg border ${config.bg}`}>
      <div className="flex items-start gap-3">
        <Icon size={16} className={config.color} />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {change.path && (
              <span className="px-1.5 py-0.5 rounded text-xs font-mono bg-slate-200 text-slate-700">
                {change.method} {change.path}
              </span>
            )}
            {change.schema_name && (
              <span className="px-1.5 py-0.5 rounded text-xs font-mono bg-amber-200 text-amber-700">
                {change.schema_name}
              </span>
            )}
            {change.field_name && (
              <span className="text-xs text-slate-600">{change.field_name}</span>
            )}
          </div>
          <p className={`text-sm ${config.color}`}>{change.description}</p>
          {change.type && (
            <span className="text-xs text-slate-500 mt-1 block">Type: {change.type}</span>
          )}
        </div>
        <button
          onClick={() => onViewImpact?.(change)}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          View Impact
        </button>
      </div>
    </div>
  )
}

function EndpointCard({ endpoint, type, onViewImpact }: {
  endpoint: any
  type: 'added' | 'removed'
  onViewImpact?: (item: any) => void
}) {
  const typeColors = {
    added: 'bg-green-100 text-green-700 border-green-200',
    removed: 'bg-red-100 text-red-700 border-red-200',
  }

  const typeIcons = {
    added: Plus,
    removed: Minus,
  }

  const Icon = typeIcons[type]

  return (
    <div className={`p-3 rounded-lg border flex items-center gap-3 ${typeColors[type]}`}>
      <Icon size={14} />
      <div className="flex-1">
        <span className="px-1.5 py-0.5 rounded text-xs font-mono bg-white/50">
          {endpoint.method}
        </span>
        <span className="ml-2 text-sm font-medium">{endpoint.path}</span>
        {endpoint.summary && (
          <span className="ml-2 text-xs text-slate-500">{endpoint.summary}</span>
        )}
      </div>
      <button
        onClick={() => onViewImpact?.(endpoint)}
        className="text-xs text-current opacity-70 hover:opacity-100"
      >
        Analyze
      </button>
    </div>
  )
}

function ModifiedEndpointCard({ endpoint, onViewImpact }: {
  endpoint: any
  onViewImpact?: (item: any) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="px-1.5 py-0.5 rounded text-xs font-mono bg-yellow-100 text-yellow-700">
            {endpoint.method}
          </span>
          <span className="text-sm font-medium">{endpoint.path}</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-orange-100 text-orange-600">
            {endpoint.changes?.length || 0} changes
          </span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          {expanded ? 'Hide' : 'Show'} details
        </button>
      </div>
      {expanded && endpoint.changes && (
        <div className="mt-3 space-y-1">
          {endpoint.changes.map((change: any, i: number) => (
            <div key={i} className="text-xs text-slate-600 flex items-center gap-2">
              <ArrowRight size={10} />
              <span className="font-medium">{change.type}</span>
              {change.name && <span>{change.name}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SchemaCard({ schema, type }: { schema: any; type: 'added' | 'removed' }) {
  const typeColors = {
    added: 'bg-green-100 text-green-700 border-green-200',
    removed: 'bg-red-100 text-red-700 border-red-200',
  }

  const Icon = type === 'added' ? Plus : Minus
  const fields = schema.schema?.properties ? Object.keys(schema.schema.properties) : []

  return (
    <div className={`p-3 rounded-lg border flex items-center gap-3 ${typeColors[type]}`}>
      <Icon size={14} />
      <div className="flex-1">
        <span className="text-sm font-medium">{schema.name}</span>
        {fields.length > 0 && (
          <span className="ml-2 text-xs text-slate-500">
            {fields.length} fields
          </span>
        )}
      </div>
    </div>
  )
}

function ModifiedSchemaCard({ schema }: { schema: any }) {
  const [expanded, setExpanded] = useState(false)
  const fieldChanges = schema.field_changes || []

  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText size={14} className="text-slate-500" />
          <span className="text-sm font-medium">{schema.schema}</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-yellow-100 text-yellow-700">
            {fieldChanges.length} field changes
          </span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          {expanded ? 'Hide' : 'Show'} fields
        </button>
      </div>
      {expanded && (
        <div className="mt-3 space-y-2">
          {fieldChanges.map((change: any, i: number) => {
            const changeTypeColors: Record<string, string> = {
              field_added: 'text-green-600 bg-green-50',
              field_removed: 'text-red-600 bg-red-50',
              field_type_changed: 'text-yellow-600 bg-yellow-50',
              field_required_added: 'text-orange-600 bg-orange-50',
            }
            const colorStyle = changeTypeColors[change.type] || 'text-slate-600 bg-slate-50'

            return (
              <div key={i} className={`p-2 rounded text-xs ${colorStyle}`}>
                <span className="font-medium">{change.type}:</span>{' '}
                <span className="font-mono">{change.name}</span>
                {change.old_type && <span> ({change.old_type} → {change.new_type})</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}