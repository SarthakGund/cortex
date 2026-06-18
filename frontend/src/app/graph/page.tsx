'use client'

import { useEffect, useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Node, Edge } from 'reactflow'
import {
  Network, Search, RotateCw, X, Share2, Spline, Layers, AlertTriangle,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

// React Flow must be client-only (no SSR)
import type { GraphViewProps } from '@/components/GraphView'

const GraphView = dynamic<GraphViewProps>(() => import('@/components/GraphView'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-[var(--color-muted-foreground)]">
      <div className="w-10 h-10 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      <p className="text-sm">Rendering graph…</p>
    </div>
  ),
})

import { API_BASE } from "@/lib/api"

// ─── KPI tile ──────────────────────────────────────────────────────────────
function StatTile({
  icon, label, value, accent,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  accent?: string
}) {
  return (
    <div className="swiss-card px-4 py-3 flex items-center gap-3 min-w-0">
      <div
        className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
        style={{
          background: accent ? `${accent}18` : 'var(--color-muted)',
          color: accent ?? 'var(--color-foreground)',
        }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold leading-none text-[var(--color-foreground)] tabular-nums">
          {value}
        </div>
        <div className="text-[10px] uppercase tracking-widest text-[var(--color-muted-foreground)] mt-1 truncate">
          {label}
        </div>
      </div>
    </div>
  )
}

export default function GraphPage() {
  const { token } = useAuth()
  const authHeaders = useMemo((): Record<string, string> => {
    if (!token) return {}
    return { Authorization: `Bearer ${token}` }
  }, [token])
  const [nodes, setNodes]   = useState<Node[]>([])
  const [edges, setEdges]   = useState<Edge[]>([])
  const [stats, setStats]   = useState<{ label: string; count: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')
  const [service, setService] = useState('')
  const [serviceInput, setServiceInput] = useState('')

  async function fetchGraph(svcName?: string) {
    setLoading(true)
    setError('')
    try {
      const url = svcName
        ? `${API_BASE}/graph/service/${encodeURIComponent(svcName)}`
        : `${API_BASE}/graph/`

      const [graphRes, statsRes] = await Promise.all([
        fetch(url, { headers: authHeaders, credentials: "include" }),
        fetch(`${API_BASE}/graph/stats`, { headers: authHeaders, credentials: "include" }),
      ])

      if (!graphRes.ok) throw new Error(`Graph API returned ${graphRes.status}`)
      const graphData = await graphRes.json()
      const statsData = await statsRes.json()

      setNodes(graphData.nodes ?? [])
      setEdges(graphData.edges ?? [])
      setStats(statsData.stats ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load graph')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchGraph() }, [])

  function handleFilter(e: React.FormEvent) {
    e.preventDefault()
    const s = serviceInput.trim()
    setService(s)
    fetchGraph(s || undefined)
  }

  const typeCount = stats.length

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-4">
      {/* ── Header / toolbar ───────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 swiss-panel flex items-center justify-center flex-shrink-0">
            <Network size={18} className="text-[var(--color-foreground)]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[var(--color-foreground)] leading-tight flex items-center gap-2">
              Knowledge Graph
              {service && (
                <span className="swiss-chip px-2 py-0.5 text-[11px] font-medium text-[var(--color-primary)]">
                  {service}
                </span>
              )}
            </h1>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Explore nodes and relationships across your codebase.
            </p>
          </div>
        </div>

        <form onSubmit={handleFilter} className="flex items-center gap-2">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)] pointer-events-none"
            />
            <input
              type="text"
              placeholder="Filter by service name…"
              value={serviceInput}
              onChange={e => setServiceInput(e.target.value)}
              className="bg-[var(--color-input)] border border-[var(--color-border)] rounded-md pl-9 pr-3 py-2 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] w-56"
            />
          </div>
          <button
            type="submit"
            className="swiss-button text-sm font-semibold px-4 py-2 hover:opacity-90 transition-opacity"
          >
            Filter
          </button>
          {service && (
            <button
              type="button"
              onClick={() => { setService(''); setServiceInput(''); fetchGraph() }}
              title="Clear filter"
              className="swiss-button-ghost h-9 w-9 flex items-center justify-center hover:bg-[var(--color-muted)] transition-colors"
            >
              <X size={15} />
            </button>
          )}
          <button
            type="button"
            onClick={() => fetchGraph(service || undefined)}
            title="Refresh"
            className="swiss-button-ghost h-9 w-9 flex items-center justify-center hover:bg-[var(--color-muted)] transition-colors"
          >
            <RotateCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </form>
      </div>

      {/* ── KPI tiles ──────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatTile
          icon={<Share2 size={16} />}
          label="Nodes"
          value={loading ? '—' : nodes.length}
          accent="#6366f1"
        />
        <StatTile
          icon={<Spline size={16} />}
          label="Relationships"
          value={loading ? '—' : edges.length}
          accent="#8b5cf6"
        />
        <StatTile
          icon={<Layers size={16} />}
          label="Node Types"
          value={loading ? '—' : typeCount}
          accent="#f59e0b"
        />
      </div>

      {/* ── Graph canvas ───────────────────────────────── */}
      <main className="swiss-card relative overflow-hidden min-h-[75vh] h-[calc(100vh-180px)]">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-[var(--color-background)]/70 backdrop-blur-sm gap-4 text-[var(--color-muted-foreground)]">
            <div className="w-10 h-10 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">Loading knowledge graph…</p>
          </div>
        )}

        {error && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-20 gap-3 p-6">
            <div className="swiss-card border-[var(--color-destructive)]/40 px-6 py-5 text-center max-w-sm">
              <div className="w-10 h-10 mx-auto rounded-full flex items-center justify-center bg-[var(--color-destructive)]/10 text-[var(--color-destructive)] mb-3">
                <AlertTriangle size={18} />
              </div>
              <p className="text-[var(--color-foreground)] font-semibold mb-1">Failed to load graph</p>
              <p className="text-[var(--color-muted-foreground)] text-sm">{error}</p>
              <p className="text-[var(--color-muted-foreground)] text-xs mt-2">
                Make sure Neo4j is running and you&apos;ve ingested at least one repo.
              </p>
              <button
                onClick={() => fetchGraph(service || undefined)}
                className="swiss-button mt-4 text-sm font-semibold px-4 py-1.5 hover:opacity-90 transition-opacity"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {!loading && !error && nodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[var(--color-muted-foreground)] p-6 text-center">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center swiss-panel">
              <Network size={24} className="text-[var(--color-muted-foreground)]" />
            </div>
            <p className="text-lg font-semibold text-[var(--color-foreground)]">Graph is empty</p>
            <p className="text-sm max-w-xs">
              Ingest a repo from the{' '}
              <Link href="/" className="text-[var(--color-primary)] hover:underline font-medium">home page</Link>{' '}
              to populate the knowledge graph.
            </p>
          </div>
        )}

        {!loading && !error && nodes.length > 0 && (
          <GraphView
            key={`${nodes.length}-${edges.length}`}
            nodes={nodes}
            edges={edges}
            stats={stats}
          />
        )}
      </main>

      {/* ── Footer summary ─────────────────────────────── */}
      <footer className="flex items-center justify-between text-xs text-[var(--color-muted-foreground)] px-1">
        <span className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className={`absolute inline-flex h-full w-full rounded-full ${loading ? 'bg-[var(--color-accent)]' : error ? 'bg-[var(--color-destructive)]' : 'bg-emerald-500'} opacity-75 ${loading ? 'animate-ping' : ''}`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${loading ? 'bg-[var(--color-accent)]' : error ? 'bg-[var(--color-destructive)]' : 'bg-emerald-500'}`} />
          </span>
          {loading ? 'Syncing…' : error ? 'Disconnected' : `${nodes.length} nodes · ${edges.length} edges`}
        </span>
        <span className="font-medium">Cortex · Living Knowledge Graph</span>
      </footer>
    </div>
  )
}
