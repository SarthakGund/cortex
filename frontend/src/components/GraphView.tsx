'use client'

import React, { useCallback, useMemo, useState } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  NodeProps,
  Handle,
  Position,
  ConnectionLineType,
  Panel,
} from 'reactflow'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from 'd3-force'
import type { SimulationNodeDatum, SimulationLinkDatum } from 'd3-force'
import 'reactflow/dist/style.css'
import {
  Server, Package, FileCode2, Boxes, Zap, Database,
  Globe, Bell, BookOpen, FileText, Table2, MessageSquare,
  User, AlertTriangle, LayoutGrid, X,
  ArrowRight, ArrowLeft,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface BrainNodeData {
  label: string
  nodeType: string
  radius: number
  props: Record<string, unknown>
}

export interface GraphViewProps {
  nodes: Node[]
  edges: Edge[]
  stats: { label: string; count: number }[]
}

interface ForceNode extends SimulationNodeDatum {
  id: string
}

// ─── Palette & Icons ─────────────────────────────────────────────────────────

const PALETTE: Record<string, { color: string; glow: string; text: string }> = {
  Service:       { color: '#6366f1', glow: '#6366f1',  text: '#a5b4fc' },
  Module:        { color: '#8b5cf6', glow: '#8b5cf6',  text: '#c4b5fd' },
  File:          { color: '#a78bfa', glow: '#a78bfa',  text: '#ddd6fe' },
  Class:         { color: '#22d3ee', glow: '#22d3ee',  text: '#67e8f9' },
  Function:      { color: '#34d399', glow: '#34d399',  text: '#6ee7b7' },
  Schema:        { color: '#fbbf24', glow: '#fbbf24',  text: '#fde68a' },
  Endpoint:      { color: '#f87171', glow: '#f87171',  text: '#fca5a5' },
  Database:      { color: '#fb923c', glow: '#fb923c',  text: '#fdba74' },
  Table:         { color: '#f97316', glow: '#f97316',  text: '#fed7aa' },
  MessageQueue:  { color: '#f472b6', glow: '#f472b6',  text: '#f9a8d4' },
  Developer:     { color: '#a3e635', glow: '#a3e635',  text: '#bef264' },
  ADR:           { color: '#38bdf8', glow: '#38bdf8',  text: '#7dd3fc' },
  Incident:      { color: '#ef4444', glow: '#ef4444',  text: '#fca5a5' },
  Documentation: { color: '#4ade80', glow: '#4ade80',  text: '#86efac' },
  Event:         { color: '#facc15', glow: '#facc15',  text: '#fef08a' },
}

const ICONS: Record<string, React.ElementType> = {
  Service: Server, Module: Package, File: FileCode2, Class: Boxes,
  Function: Zap, Schema: Database, Endpoint: Globe, Event: Bell,
  Documentation: BookOpen, ADR: FileText, Table: Table2,
  MessageQueue: MessageSquare, Developer: User, Incident: AlertTriangle,
}

function getStyle(nodeType: string) {
  return PALETTE[nodeType] ?? { color: '#64748b', glow: '#64748b', text: '#94a3b8' }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nodeRadius(degree: number): number {
  return Math.max(8, Math.min(26, 9 + degree * 1.8))
}

// ─── Force-directed layout ───────────────────────────────────────────────────

function computeForceLayout(
  nodes: Node[],
  edges: Edge[],
  degreeMap: Map<string, number>,
): Node[] {
  const W = 1600, H = 1000
  const fnodes: ForceNode[] = nodes.map(n => ({
    id: n.id,
    x: W / 2 + (Math.random() - 0.5) * 300,
    y: H / 2 + (Math.random() - 0.5) * 300,
  }))
  const flinks: SimulationLinkDatum<ForceNode>[] = edges.map(e => ({
    source: e.source,
    target: e.target,
  }))

  forceSimulation<ForceNode>(fnodes)
    .force(
      'link',
      forceLink<ForceNode, SimulationLinkDatum<ForceNode>>(flinks)
        .id(d => d.id)
        .distance(130)
        .strength(0.35),
    )
    .force('charge', forceManyBody<ForceNode>().strength(-500).distanceMax(500))
    .force('center', forceCenter<ForceNode>(W / 2, H / 2).strength(0.08))
    .force(
      'collide',
      forceCollide<ForceNode>(d => nodeRadius(degreeMap.get(d.id) ?? 0) + 28),
    )
    .stop()
    .tick(500)

  const posMap = new Map(fnodes.map(n => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]))
  return nodes.map(n => {
    const pos = posMap.get(n.id) ?? { x: 0, y: 0 }
    const r = nodeRadius(degreeMap.get(n.id) ?? 0)
    return {
      ...n,
      position: { x: pos.x - r, y: pos.y - r },
      data: { ...n.data, radius: r },
    }
  })
}

function styleEdges(raw: Edge[]): Edge[] {
  return raw.map(e => ({
    ...e,
    type: 'default',
    style: { stroke: '#33415580', strokeWidth: 1.8 },
    label: undefined,
  }))
}

// ─── Brain Node (Obsidian-style circle) ──────────────────────────────────────

const HANDLE_STYLE: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  width: 1,
  height: 1,
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  minWidth: 0,
  minHeight: 0,
  opacity: 0,
}

function BrainNode({ data, selected }: NodeProps<BrainNodeData>) {
  const sty = getStyle(data.nodeType)
  const r = data.radius ?? 10
  const d = r * 2

  return (
    <div style={{ width: d, height: d, overflow: 'visible', position: 'relative' }}>
      <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />

      {/* Outer pulse ring when selected */}
      {selected && (
        <div
          style={{
            position: 'absolute',
            inset: -6,
            borderRadius: '50%',
            border: `1.5px solid ${sty.color}60`,
            animation: 'obsidian-ping 1.6s cubic-bezier(0,0,0.2,1) infinite',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Circle body */}
      <div
        style={{
          width: d,
          height: d,
          borderRadius: '50%',
          background: `radial-gradient(circle at 35% 35%, ${sty.color}55, ${sty.color}22)`,
          border: `1.5px solid ${selected ? sty.color : sty.color + 'aa'}`,
          boxShadow: selected
            ? `0 0 0 3px ${sty.color}22, 0 0 ${r * 2.5}px ${sty.color}cc, 0 0 ${r}px ${sty.color}`
            : `0 0 ${r * 1.4}px ${sty.color}55, 0 0 ${r * 0.6}px ${sty.color}30`,
          cursor: 'pointer',
          transition: 'box-shadow 0.2s, border-color 0.2s',
        }}
        title={data.label}
      />

      {/* Label below */}
      <div
        style={{
          position: 'absolute',
          top: d + 5,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 10,
          fontFamily: 'ui-monospace, monospace',
          letterSpacing: '0.01em',
          color: selected ? '#0f172a' : '#64748b',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          textShadow: selected ? `0 0 8px ${sty.color}` : 'none',
          transition: 'color 0.2s, text-shadow 0.2s',
        }}
      >
        {data.label}
      </div>

      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
    </div>
  )
}

const nodeTypes = { cortex: BrainNode }

// ─── Node Detail Sidebar ──────────────────────────────────────────────────────

function formatPropValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') {
    try { return JSON.stringify(v) } catch { return String(v) }
  }
  return String(v)
}

function NodeSidebar({
  node,
  allEdges,
  nodeMap,
  onClose,
}: {
  node: Node<BrainNodeData> | null
  allEdges: Edge[]
  nodeMap: Map<string, Node<BrainNodeData>>
  onClose: () => void
}) {
  if (!node) return null
  const { label, nodeType, props } = node.data
  const sty = getStyle(nodeType)
  const Icon = ICONS[nodeType] ?? LayoutGrid

  // Compute neighbors from all raw edges
  const outgoing = allEdges
    .filter(e => e.source === node.id)
    .map(e => ({ rel: (e.label as string) || (e.data?.label as string) || '', targetId: e.target }))
  const incoming = allEdges
    .filter(e => e.target === node.id)
    .map(e => ({ rel: (e.label as string) || (e.data?.label as string) || '', sourceId: e.source }))

  return (
    <div
      className="absolute right-4 top-4 z-20 w-80 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      style={{
        border: `1px solid ${sty.color}35`,
        background: 'rgba(255,255,255,0.97)',
        backdropFilter: 'blur(16px)',
        boxShadow: `0 0 32px ${sty.color}18, 0 8px 32px #00000018`,
        maxHeight: 'calc(100vh - 120px)',
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between flex-shrink-0"
        style={{
          borderBottom: `1px solid ${sty.color}18`,
          background: `linear-gradient(135deg, ${sty.color}12, transparent)`,
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              background: sty.color + '18',
              color: sty.color,
              boxShadow: `0 0 8px ${sty.color}40`,
            }}
          >
            <Icon size={15} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate" style={{ color: sty.color }}>
              {label}
            </div>
            <div className="text-[10px] uppercase tracking-widest mt-0.5" style={{ color: sty.color + 'aa' }}>
              {nodeType}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-slate-900 hover:bg-black/10 transition-colors ml-2"
        >
          <X size={13} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="overflow-y-auto flex-1 min-h-0">

        {/* Properties */}
        {Object.entries(props).filter(([k]) => k !== "file_path" && k !== "last_updated").length > 0 && (
          <div className="px-4 pt-3 pb-2">
            <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-2 font-semibold">Properties</div>
            <div className="space-y-1.5 text-xs">
              {Object.entries(props).filter(([k]) => k !== "file_path" && k !== "last_updated").map(([k, v]) => (
                <div key={k} className="flex gap-2 items-start">
                  <span className="text-gray-400 w-24 flex-shrink-0 truncate pt-0.5 font-mono">{k}</span>
                  <span className="text-gray-700 break-all">{formatPropValue(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Divider */}
        {(outgoing.length > 0 || incoming.length > 0) && (
          <div className="mx-4 my-1" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }} />
        )}

        {/* Outgoing relationships */}
        {outgoing.length > 0 && (
          <div className="px-4 pt-2 pb-1">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-gray-400 mb-2 font-semibold">
              <ArrowRight size={10} className="text-emerald-500" />
              Outgoing ({outgoing.length})
            </div>
            <div className="space-y-1.5">
              {outgoing.map((r, i) => {
                const target = nodeMap.get(r.targetId)
                const tSty = getStyle(target?.data.nodeType ?? '')
                const TIcon = target ? (ICONS[target.data.nodeType] ?? LayoutGrid) : LayoutGrid
                return (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {/* relation badge */}
                    {r.rel && (
                      <span
                        className="px-1.5 py-0.5 rounded text-[9px] font-mono flex-shrink-0"
                        style={{ background: 'rgba(0,0,0,0.06)', color: '#64748b' }}
                      >
                        {r.rel}
                      </span>
                    )}
                    <ArrowRight size={9} className="flex-shrink-0" style={{ color: '#94a3b8' }} />
                    {/* target node */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: tSty.color + '22', color: tSty.color }}
                      >
                        <TIcon size={9} />
                      </div>
                      <span className="truncate" style={{ color: tSty.color }}>
                        {target?.data.label ?? r.targetId}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Incoming relationships */}
        {incoming.length > 0 && (
          <div className="px-4 pt-2 pb-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-gray-400 mb-2 font-semibold">
              <ArrowLeft size={10} className="text-violet-400" />
              Incoming ({incoming.length})
            </div>
            <div className="space-y-1.5">
              {incoming.map((r, i) => {
                const source = nodeMap.get(r.sourceId)
                const sSty = getStyle(source?.data.nodeType ?? '')
                const SIcon = source ? (ICONS[source.data.nodeType] ?? LayoutGrid) : LayoutGrid
                return (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {/* source node */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: sSty.color + '22', color: sSty.color }}
                      >
                        <SIcon size={9} />
                      </div>
                      <span className="truncate" style={{ color: sSty.color }}>
                        {source?.data.label ?? r.sourceId}
                      </span>
                    </div>
                    <ArrowRight size={9} className="flex-shrink-0" style={{ color: '#374151' }} />
                    {/* relation badge */}
                    {r.rel && (
                      <span
                        className="px-1.5 py-0.5 rounded text-[9px] font-mono flex-shrink-0"
                        style={{ background: 'rgba(0,0,0,0.06)', color: '#64748b' }}
                      >
                        {r.rel}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {outgoing.length === 0 && incoming.length === 0 && Object.entries(props).length === 0 && (
          <p className="text-gray-700 text-center text-xs py-4">No data</p>
        )}
      </div>
    </div>
  )
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

function FilterBar({
  stats,
  active,
  onToggle,
  onSelectAll,
  onClearAll,
}: {
  stats: { label: string; count: number }[]
  active: Set<string>
  onToggle: (label: string) => void
  onSelectAll: () => void
  onClearAll: () => void
}) {
  const allActive = stats.length > 0 && stats.every(s => active.has(s.label))
  return (
    <Panel position="top-left">
      <div
        className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded-2xl"
        style={{
          background: 'rgba(255,255,255,0.90)',
          border: '1px solid rgba(0,0,0,0.08)',
          backdropFilter: 'blur(16px)',
          maxWidth: 'calc(100vw - 320px)',
          boxShadow: '0 4px 24px #00000018',
        }}
      >
        {/* Master toggle */}
        <button
          onClick={allActive ? onClearAll : onSelectAll}
          title={allActive ? 'Hide all' : 'Show all'}
          className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium transition-all"
          style={{
            background: allActive ? 'rgba(0,0,0,0.07)' : 'transparent',
            border: '1px solid rgba(0,0,0,0.10)',
            color: allActive ? '#0f172a' : '#94a3b8',
          }}
        >
          <LayoutGrid size={10} />
          {allActive ? 'All' : 'None'}
        </button>

        <div className="w-px h-4 mx-0.5" style={{ background: 'rgba(0,0,0,0.08)' }} />

        {stats.map(s => {
          const sty = getStyle(s.label)
          const isActive = active.has(s.label)
          return (
            <button
              key={s.label}
              onClick={() => onToggle(s.label)}
              title={`${isActive ? 'Hide' : 'Show'} ${s.label}`}
              className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium transition-all cursor-pointer select-none"
              style={{
                background: isActive ? `${sty.color}18` : 'transparent',
                border: `1px solid ${isActive ? sty.color + '55' : 'rgba(0,0,0,0.08)'}`,
                color: isActive ? sty.color : '#94a3b8',
                boxShadow: isActive ? `0 0 8px ${sty.color}30` : 'none',
                opacity: isActive ? 1 : 0.45,
              }}
            >
              {/* Color dot */}
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: sty.color,
                  boxShadow: isActive ? `0 0 4px ${sty.color}` : 'none',
                  flexShrink: 0,
                }}
              />
              <span>{s.label}</span>
              <span style={{ color: isActive ? sty.color : '#cbd5e1', fontWeight: 700 }}>
                {s.count}
              </span>
            </button>
          )
        })}
      </div>
    </Panel>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function GraphView({ nodes: rawNodes, edges: rawEdges, stats }: GraphViewProps) {
  const allTypes = useMemo(() => {
    if (stats.length > 0) return new Set(stats.map(s => s.label))
    const fallback = new Set<string>()
    rawNodes.forEach(n => {
      const nodeType = (n.data as BrainNodeData)?.nodeType
      if (nodeType) fallback.add(nodeType)
    })
    return fallback
  }, [stats, rawNodes])
  const [activeTypes, setActiveTypes] = useState<Set<string>>(() => new Set())

  React.useEffect(() => {
    if (allTypes.size === 0) return
    setActiveTypes(prev => {
      if (prev.size === 0) return new Set(allTypes)
      const next = new Set<string>()
      allTypes.forEach(t => {
        if (prev.has(t)) next.add(t)
      })
      return next.size === 0 ? new Set(allTypes) : next
    })
  }, [allTypes])

  // Degree map: id → total connections
  const degreeMap = useMemo(() => {
    const m = new Map<string, number>()
    rawEdges.forEach(e => {
      m.set(e.source, (m.get(e.source) ?? 0) + 1)
      m.set(e.target, (m.get(e.target) ?? 0) + 1)
    })
    return m
  }, [rawEdges])

  // Force layout + edge styling (computed once; parent remounts via key=)
  const laidOutNodes = useMemo(
    () => computeForceLayout(rawNodes, rawEdges, degreeMap),
    [rawNodes, rawEdges, degreeMap],
  )
  const styledEdges = useMemo(() => styleEdges(rawEdges), [rawEdges])

  // id → Node lookup used by the sidebar to resolve neighbor labels
  const nodeMap = useMemo(
    () => new Map(laidOutNodes.map(n => [n.id, n as Node<BrainNodeData>])),
    [laidOutNodes],
  )

  // Filter by active types
  const visibleNodes = useMemo(
    () => laidOutNodes.filter(n => activeTypes.has((n.data as BrainNodeData).nodeType)),
    [laidOutNodes, activeTypes],
  )
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map(n => n.id)), [visibleNodes])
  const visibleEdges = useMemo(
    () => styledEdges.filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)),
    [styledEdges, visibleNodeIds],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(visibleNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(visibleEdges)
  const [selected, setSelected] = useState<Node<BrainNodeData> | null>(null)

  React.useEffect(() => {
    setNodes(visibleNodes)
  }, [visibleNodes, setNodes])
  React.useEffect(() => {
    setEdges(visibleEdges)
  }, [visibleEdges, setEdges])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelected(prev => (prev?.id === node.id ? null : (node as Node<BrainNodeData>)))
  }, [])

  const toggleType = useCallback((label: string) => {
    setActiveTypes(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }, [])

  const selectAll = useCallback(() => setActiveTypes(new Set(allTypes)), [allTypes])
  const clearAll  = useCallback(() => setActiveTypes(new Set()), [])

  return (
    <div className="w-full h-full relative" style={{ background: '#f1f5f9' }}>
      {/* Pulse ring keyframe */}
      <style>{`
        @keyframes obsidian-ping {
          0%   { transform: scale(1); opacity: 0.7; }
          100% { transform: scale(2.4); opacity: 0; }
        }
      `}</style>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={() => setSelected(null)}
        nodeTypes={nodeTypes}
        connectionLineType={ConnectionLineType.Straight}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        minZoom={0.03}
        maxZoom={5}
        proOptions={{ hideAttribution: true }}
        style={{ background: '#f1f5f9' }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          color="rgba(0,0,0,0.10)"
          gap={32}
          size={1.2}
        />
        <Controls
          className="!bg-white/80 !border-black/5 !shadow-2xl !rounded-2xl overflow-hidden"
          style={{ backdropFilter: 'blur(12px)' }}
        />
        <MiniMap
          nodeColor={(n: Node) => getStyle((n.data as BrainNodeData).nodeType).color}
          maskColor="rgba(241,245,249,0.75)"
          className="!bg-white/95 !border-black/5 !rounded-2xl !shadow-2xl"
          style={{ backdropFilter: 'blur(12px)' }}
          nodeStrokeWidth={3}
          nodeStrokeColor={(n: Node) => getStyle((n.data as BrainNodeData).nodeType).color}
        />
        {stats.length > 0 && (
          <FilterBar
            stats={stats}
            active={activeTypes}
            onToggle={toggleType}
            onSelectAll={selectAll}
            onClearAll={clearAll}
          />
        )}
      </ReactFlow>
      <NodeSidebar
        node={selected}
        allEdges={rawEdges}
        nodeMap={nodeMap}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
