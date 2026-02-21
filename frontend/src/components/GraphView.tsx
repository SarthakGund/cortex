'use client'

import React, { useCallback, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  NodeProps,
  Handle,
  Position,
  MarkerType,
  ConnectionLineType,
} from 'reactflow'
import dagre from '@dagrejs/dagre'
const { graphlib: dagreGraphlib, layout: dagreLayout } = dagre
import 'reactflow/dist/style.css'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SpitNodeData {
  label: string
  nodeType: string
  color: string
  props: Record<string, unknown>
}

export interface GraphViewProps {
  nodes: Node[]
  edges: Edge[]
  stats: { label: string; count: number }[]
}

// ─── Auto-layout via Dagre ─────────────────────────────────────────────────
// dagre assigns x/y coordinates to each node so the graph renders with a
// clean left-to-right ranked layout instead of all nodes stacked at (0,0).

const NODE_W = 180
const NODE_H = 48

function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagreGraphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 120 })
  nodes.forEach(n => g.setNode(n.id, { width: NODE_W, height: NODE_H }))
  edges.forEach(e => g.setEdge(e.source, e.target))
  dagreLayout(g)
  return nodes.map(n => {
    const pos = g.node(n.id)
    return {
      ...n,
      position: {
        x: (pos?.x ?? 0) - NODE_W / 2,
        y: (pos?.y ?? 0) - NODE_H / 2,
      },
    }
  })
}

// styleEdges attaches visual attributes (arrow, color, curve) to raw edges
// returned by the backend so React Flow renders them nicely.
function styleEdges(raw: Edge[]): Edge[] {
  return raw.map(e => ({
    ...e,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
    style: { stroke: e.animated ? '#6366f1' : '#4b5563', strokeWidth: 1.5 },
    labelStyle: { fill: '#9ca3af', fontSize: 10 },
    labelBgStyle: { fill: '#111827' },
  }))
}

// ─── Custom Node ──────────────────────────────────────────────────────────────
// SpitNode renders a single Neo4j node as a color-coded card with connection
// handles on the left (target) and right (source) sides.

function SpitNode({ data }: NodeProps<SpitNodeData>) {
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <div
        className="rounded-lg px-3 py-2 shadow-lg border border-white/20 text-white text-xs font-medium min-w-[120px] max-w-[180px] truncate"
        style={{ background: data.color }}
        title={data.label}
      >
        <div className="text-white/60 text-[10px] uppercase tracking-wider mb-0.5">
          {data.nodeType}
        </div>
        <div className="truncate">{data.label}</div>
      </div>
      <Handle type="source" position={Position.Right} />
    </>
  )
}

const nodeTypes = { spit: SpitNode }

// ─── Sidebar ──────────────────────────────────────────────────────────────────
// Opens when the user clicks a node; shows all Neo4j properties.

function NodeSidebar({
  node,
  onClose,
}: {
  node: Node<SpitNodeData> | null
  onClose: () => void
}) {
  if (!node) return null
  const { label, nodeType, color, props } = node.data
  return (
    <div className="absolute right-4 top-4 z-10 w-72 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-4 text-sm text-gray-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
          <span className="font-bold text-white">{label}</span>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white leading-none text-lg">&times;</button>
      </div>
      <div className="text-xs text-indigo-400 uppercase tracking-wider mb-2">{nodeType}</div>
      <div className="space-y-1.5 max-h-80 overflow-y-auto">
        {Object.entries(props).map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <span className="text-gray-500 w-28 flex-shrink-0 truncate">{k}</span>
            <span className="text-gray-200 break-all">{String(v)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────
// Shows colored badge pills counting nodes per type (fetched from /graph/stats).

const PALETTE: Record<string, string> = {
  Service: '#6366f1', Module: '#8b5cf6', File: '#a78bfa', Class: '#22d3ee',
  Function: '#34d399', Schema: '#fbbf24', Endpoint: '#f87171',
  Database: '#fb923c', Table: '#fdba74', MessageQueue: '#f472b6',
  Developer: '#a3e635', ADR: '#38bdf8', Incident: '#ef4444',
  Documentation: '#4ade80',
}

function StatsBar({ stats }: { stats: { label: string; count: number }[] }) {
  return (
    <div className="absolute left-4 top-4 z-10 flex flex-wrap gap-2 max-w-[calc(100%-20rem)]">
      {stats.map(s => (
        <div
          key={s.label}
          className="flex items-center gap-1.5 bg-gray-900/80 border border-gray-700 rounded-full px-2.5 py-1 text-xs text-gray-200"
        >
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PALETTE[s.label] ?? '#94a3b8' }} />
          {s.label} <span className="font-bold text-white">{s.count}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
// IMPORTANT: The parent page passes `key={nodes.length + "-" + edges.length}`
// so this component fully remounts whenever data changes from Neo4j.  That
// means useNodesState / useEdgesState always start from fresh, correctly-laid-
// out data — no stale sync needed via useEffect.

export default function GraphView({ nodes: rawNodes, edges: rawEdges, stats }: GraphViewProps) {
  // Compute layout + styling once, at mount time (data is fresh because of key=)
  const [nodes, , onNodesChange] = useNodesState(applyDagreLayout(rawNodes, rawEdges))
  const [edges, , onEdgesChange] = useEdgesState(styleEdges(rawEdges))
  const [selected, setSelected] = useState<Node<SpitNodeData> | null>(null)

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelected(node as Node<SpitNodeData>)
  }, [])

  return (
    <div className="w-full h-full relative">
      {stats.length > 0 && <StatsBar stats={stats} />}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        minZoom={0.05}
        maxZoom={3}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1e293b" gap={24} />
        <Controls className="!bg-gray-900 !border-gray-700 !shadow-lg" />
        <MiniMap
          nodeColor={(n: Node<SpitNodeData>) => n.data.color ?? '#94a3b8'}
          maskColor="rgba(0,0,0,0.6)"
          className="!bg-gray-900 !border-gray-700"
        />
      </ReactFlow>
      <NodeSidebar node={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
