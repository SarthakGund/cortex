'use client'

import React, { useState, useEffect } from 'react'
import {
  Zap,
  Target,
  AlertTriangle,
  CheckCircle2,
  Info,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  List,
  Wrench,
  User,
  Clock,
} from 'lucide-react'
import type { ScenarioImpact, ScenarioType as ScenarioTypeEnum, BreakingChange, CascadingFailure } from '../types/impact'

interface WhatIfScenarioPanelProps {
  impact: ScenarioImpact | null
  loading: boolean
  onRunScenario: (scenario: ScenarioConfig) => void
  availableScenarios: ScenarioTypeEnum[]
  targetNode: { name: string; type: string }
}

export interface ScenarioConfig {
  type: string
  target: string
  target_type: string
  parameters?: Record<string, any>
}

const RISK_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  LOW: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  MEDIUM: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  HIGH: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
  CRITICAL: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
}

export function WhatIfScenarioPanel({
  impact,
  loading,
  onRunScenario,
  availableScenarios,
  targetNode,
}: WhatIfScenarioPanelProps) {
  const [selectedScenario, setSelectedScenario] = useState<string>('')
  const [customParams, setCustomParams] = useState<Record<string, string>>({})
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview', 'recommendations']))

  useEffect(() => {
    if (availableScenarios.length > 0 && !selectedScenario) {
      setSelectedScenario(availableScenarios[0].type)
    }
  }, [availableScenarios, selectedScenario])

  const scenario = availableScenarios.find(s => s.type === selectedScenario)
  const riskStyle = impact ? RISK_COLORS[impact.risk_level] ?? RISK_COLORS.LOW : null

  const handleRun = () => {
    if (!selectedScenario || !targetNode.name) return

    const params: Record<string, any> = {}
    if (scenario?.parameters) {
      scenario.parameters.forEach(p => {
        if (customParams[p]) {
          if (p === 'old_type' || p === 'new_type') {
            params[p] = customParams[p]
          } else {
            params[p] = customParams[p]
          }
        }
      })
    }

    onRunScenario({
      type: selectedScenario,
      target: targetNode.name,
      target_type: targetNode.type,
      parameters: params,
    })
  }

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  return (
    <div className="space-y-4">
      {/* Scenario Selector */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Zap size={16} className="text-yellow-500" />
          Run What-If Scenario
        </h3>

        <p className="text-xs text-slate-500 mb-4">
          Simulate the impact of architectural changes to{' '}
          <span className="font-mono bg-slate-100 px-1 rounded">{targetNode.name || 'selected node'}</span>
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-600 mb-1">Scenario Type</label>
            <select
              value={selectedScenario}
              onChange={(e) => setSelectedScenario(e.target.value)}
              className="w-full bg-slate-100 border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              {availableScenarios.map(s => (
                <option key={s.type} value={s.type}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {scenario?.parameters && scenario.parameters.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {scenario.parameters.map(param => (
                <div key={param}>
                  <label className="block text-xs text-slate-600 mb-1 capitalize">
                    {param.replace(/_/g, ' ')}
                  </label>
                  <input
                    type="text"
                    value={customParams[param] || ''}
                    onChange={(e) => setCustomParams(prev => ({ ...prev, [param]: e.target.value }))}
                    placeholder={param === 'old_type' || param === 'new_type' ? 'e.g. string, integer' : ''}
                    className="w-full bg-slate-100 border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                  />
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-slate-500 italic">
            {scenario?.description}
          </p>

          <button
            onClick={handleRun}
            disabled={loading || !targetNode.name}
            className="w-full px-4 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="animate-spin">⟳</span>
            ) : (
              <Zap size={14} />
            )}
            Run Simulation
          </button>
        </div>
      </div>

      {/* Results */}
      {impact && (
        <div className="space-y-3">
          {/* Risk Summary */}
          <div className={`border rounded-xl p-5 ${riskStyle?.bg} ${riskStyle?.border}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {impact.risk_level === 'LOW' && <CheckCircle2 size={20} className={riskStyle?.text} />}
                {impact.risk_level === 'MEDIUM' && <Info size={20} className={riskStyle?.text} />}
                {(impact.risk_level === 'HIGH' || impact.risk_level === 'CRITICAL') && (
                  <AlertTriangle size={20} className={riskStyle?.text} />
                )}
                <span className={`font-semibold ${riskStyle?.text}`}>
                  Risk Level: {impact.risk_level}
                </span>
              </div>
              <span className={`text-xs font-medium ${riskStyle?.text}`}>
                {impact.affected_services.length} services affected
              </span>
            </div>
            <p className="text-sm text-slate-700">{impact.impact_summary}</p>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-slate-900">
                {impact.affected_nodes?.total_affected ?? 0}
              </div>
              <div className="text-xs text-slate-500">Components Affected</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-slate-900">
                {impact.breaking_changes?.length ?? 0}
              </div>
              <div className="text-xs text-slate-500">Breaking Changes</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-slate-900">
                {impact.cascading_failures?.length ?? 0}
              </div>
              <div className="text-xs text-slate-500">Cascade Paths</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-slate-900">
                {impact.migration_steps?.length ?? 0}
              </div>
              <div className="text-xs text-slate-500">Migration Steps</div>
            </div>
          </div>

          {/* Collapsible Sections */}
          {impact.breaking_changes && impact.breaking_changes.length > 0 && (
            <ScenarioSection
              title={`Breaking Changes (${impact.breaking_changes.length})`}
              icon={<AlertTriangle size={14} className="text-red-500" />}
              expanded={expandedSections.has('breaking')}
              onToggle={() => toggleSection('breaking')}
            >
              <div className="space-y-2">
                {impact.breaking_changes.map((bc, i) => (
                  <BreakingChangeRow key={i} change={bc} />
                ))}
              </div>
            </ScenarioSection>
          )}

          {impact.cascading_failures && impact.cascading_failures.length > 0 && (
            <ScenarioSection
              title={`Cascading Failures (${impact.cascading_failures.length})`}
              icon={<ArrowRight size={14} className="text-orange-500" />}
              expanded={expandedSections.has('cascade')}
              onToggle={() => toggleSection('cascade')}
            >
              <div className="space-y-2">
                {impact.cascading_failures.map((cf, i) => (
                  <CascadeRow key={i} failure={cf} />
                ))}
              </div>
            </ScenarioSection>
          )}

          {impact.recommendations && impact.recommendations.length > 0 && (
            <ScenarioSection
              title={`Recommendations (${impact.recommendations.length})`}
              icon={<CheckCircle2 size={14} className="text-green-500" />}
              expanded={expandedSections.has('recommendations')}
              onToggle={() => toggleSection('recommendations')}
            >
              <ol className="space-y-2">
                {impact.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 text-green-700 text-xs flex items-center justify-center font-medium">
                      {i + 1}
                    </span>
                    <span className="text-slate-700">{rec}</span>
                  </li>
                ))}
              </ol>
            </ScenarioSection>
          )}

          {impact.migration_steps && impact.migration_steps.length > 0 && (
            <ScenarioSection
              title={`Migration Steps (${impact.migration_steps.length})`}
              icon={<List size={14} className="text-blue-500" />}
              expanded={expandedSections.has('migration')}
              onToggle={() => toggleSection('migration')}
            >
              <div className="space-y-2">
                {impact.migration_steps.map((step, i) => (
                  <div key={i} className="text-sm text-slate-700 flex items-start gap-2">
                    <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                      {step.split('.')[0]}
                    </span>
                    <span>{step.substring(step.indexOf('.') + 1).trim()}</span>
                  </div>
                ))}
              </div>
            </ScenarioSection>
          )}

          {impact.affected_nodes && (
            <ScenarioSection
              title="Affected Components"
              icon={<Target size={14} className="text-slate-500" />}
              expanded={expandedSections.has('components')}
              onToggle={() => toggleSection('components')}
            >
              <div className="space-y-4">
                {/* Upstream */}
                {impact.affected_nodes.upstream && impact.affected_nodes.upstream.items?.length > 0 && (
                  <div>
                    <h5 className="text-xs font-medium text-slate-500 uppercase mb-2 flex items-center gap-1">
                      <ArrowLeft size={12} className="text-red-400" />
                      Upstream (depends on this)
                    </h5>
                    <ComponentList items={impact.affected_nodes.upstream.items} />
                  </div>
                )}

                {/* Downstream */}
                {impact.affected_nodes.downstream && impact.affected_nodes.downstream.items?.length > 0 && (
                  <div>
                    <h5 className="text-xs font-medium text-slate-500 uppercase mb-2 flex items-center gap-1">
                      <ArrowRight size={12} className="text-blue-400" />
                      Downstream (this depends on)
                    </h5>
                    <ComponentList items={impact.affected_nodes.downstream.items} />
                  </div>
                )}
              </div>
            </ScenarioSection>
          )}
        </div>
      )}
    </div>
  )
}

function ScenarioSection({
  title,
  icon,
  expanded,
  onToggle,
  children,
}: {
  title: string
  icon: React.ReactNode
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-5 py-3.5 text-sm font-medium hover:bg-slate-50 transition-colors"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {icon}
        {title}
      </button>
      {expanded && <div className="px-5 pb-4">{children}</div>}
    </div>
  )
}

function BreakingChangeRow({ change }: { change: BreakingChange }) {
  const severityColors: Record<string, string> = {
    critical: 'text-red-700 bg-red-50',
    high: 'text-orange-700 bg-orange-50',
    medium: 'text-yellow-700 bg-yellow-50',
    low: 'text-blue-700 bg-blue-50',
  }
  const color = severityColors[change.severity] || 'text-slate-700 bg-slate-50'

  return (
    <div className={`p-2 rounded ${color}`}>
      <span className="font-medium text-xs">{change.type}</span>
      <span className="mx-2">—</span>
      <span className="text-sm">{change.description}</span>
    </div>
  )
}

function CascadeRow({ failure }: { failure: CascadingFailure }) {
  const severityColors: Record<string, string> = {
    HIGH: 'text-red-700 bg-red-50 border-red-200',
    MEDIUM: 'text-yellow-700 bg-yellow-50 border-yellow-200',
    LOW: 'text-blue-700 bg-blue-50 border-blue-200',
  }
  const color = severityColors[failure.severity] || 'text-slate-700 bg-slate-50'

  return (
    <div className={`p-2 rounded border ${color}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono">{failure.source}</span>
        <ArrowRight size={10} />
        <span className="text-xs text-slate-500">{failure.chain}</span>
      </div>
      <p className="text-xs mt-1">{failure.description}</p>
    </div>
  )
}

function ComponentList({ items }: { items: any[] }) {
  const groupedByType = items.reduce((acc, item) => {
    acc.setdefault(item.type, []).push(item)
    return acc
  }, new Map())

  return (
    <div className="space-y-2">
      {Array.from(groupedByType.entries()).map(([type, items]) => (
        <div key={type}>
          <span className="text-[10px] font-mono bg-slate-200 px-1.5 py-0.5 rounded">
            {type} ({items.length})
          </span>
          <div className="ml-2 space-y-1 mt-1">
            {items.slice(0, 5).map((item: any, i: number) => (
              <div key={i} className="text-xs text-slate-600 flex items-center gap-2">
                <span className="truncate">{item.name}</span>
                {item.service && (
                  <span className="text-slate-400">({item.service})</span>
                )}
              </div>
            ))}
            {items.length > 5 && (
              <span className="text-xs text-slate-400">+{items.length - 5} more</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}