'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Node, Edge } from 'reactflow'

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
        fetch(url),
        fetch(`${API_BASE}/graph/stats`),
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
    <div className="flex flex-col h-screen bg-gray-50 text-gray-100">
      {/* ── Top bar ─────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-indigo-400 hover:text-indigo-300 text-sm">← Home</Link>
          <h1 className="text-lg font-bold text-slate-900">
            Knowledge Graph
            {service && (
              <span className="ml-2 text-indigo-400 text-sm font-normal">— {service}</span>
            )}
          </h1>
        </div>

        <form onSubmit={handleFilter} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter by service name…"
            value={serviceInput}
            onChange={e => setServiceInput(e.target.value)}
            className="bg-gray-100 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-52"
          />
          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-500 text-slate-900 text-sm rounded-lg px-3 py-1.5 transition-colors"
          >
            Filter
          </button>
          {service && (
            <button
              type="button"
              onClick={() => { setService(''); setServiceInput(''); fetchGraph() }}
              className="text-gray-500 hover:text-gray-700 text-sm px-2 py-1.5 transition-colors"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => fetchGraph(service || undefined)}
            className="text-gray-500 hover:text-gray-700 text-sm px-2 py-1.5 transition-colors"
            title="Refresh"
          >
            ↻
          </button>
        </form>
      </header>

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
