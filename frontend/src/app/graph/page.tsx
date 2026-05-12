'use client'

import { useEffect, useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Node, Edge } from 'reactflow'
import { useAuth } from '../context/AuthContext'

// React Flow must be client-only (no SSR)
import type { GraphViewProps } from '@/components/GraphView'

const GraphView = dynamic<GraphViewProps>(() => import('@/components/GraphView'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-600">
      <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      <p>Rendering graph…</p>
    </div>
  ),
})

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export default function GraphPage() {
  const { token } = useAuth()
  const authHeaders = useMemo(() => {
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
        fetch(url, { headers: authHeaders }),
        fetch(`${API_BASE}/graph/stats`, { headers: authHeaders }),
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
            Knowledge Graph
            {service && (
              <span className="ml-2 text-blue-400 text-sm font-medium">— {service}</span>
            )}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">Explore nodes and relationships in Neo4j.</p>
        </div>

        <form onSubmit={handleFilter} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter by service name…"
            value={serviceInput}
            onChange={e => setServiceInput(e.target.value)}
            className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
          />
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg px-3 py-2 transition-colors"
          >
            Filter
          </button>
          {service && (
            <button
              type="button"
              onClick={() => { setService(''); setServiceInput(''); fetchGraph() }}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-sm px-2 py-2 transition-colors"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => fetchGraph(service || undefined)}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-sm px-2 py-2 transition-colors"
            title="Refresh"
          >
            ↻
          </button>
        </form>
      </div>

      {/* ── Graph canvas ────────────────────────────────── */}
      <main className="flex-1 min-h-0 relative">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-gray-50/80 gap-4 text-gray-600">
            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">Loading knowledge graph…</p>
          </div>
        )}

        {error && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-20 gap-3">
            <div className="bg-red-900/40 border border-red-700 rounded-xl px-6 py-4 text-center max-w-sm">
              <p className="text-red-400 font-medium mb-1">Failed to load graph</p>
              <p className="text-red-300 text-sm">{error}</p>
              <p className="text-gray-500 text-xs mt-2">
                Make sure Neo4j is running and you've ingested at least one repo.
              </p>
              <button
                onClick={() => fetchGraph(service || undefined)}
                className="mt-3 bg-red-700 hover:bg-red-600 text-slate-900 text-sm rounded-lg px-4 py-1.5 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {!loading && !error && nodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-500">
            <p className="text-4xl">𝗚</p>
            <p className="text-lg font-medium text-gray-600">Graph is empty</p>
            <p className="text-sm">
              Ingest a repo from the{' '}
              <Link href="/" className="text-indigo-400 hover:underline">home page</Link>{' '}
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

      {/* ── Footer summary ──────────────────────────────── */}
      <footer className="px-6 py-2 border-t border-gray-200 flex items-center justify-between text-xs text-gray-600 flex-shrink-0">
        <span>
          {nodes.length} nodes · {edges.length} edges
        </span>
        <span>SPIT · Living Knowledge Graph</span>
      </footer>
    </div>
  )
}
