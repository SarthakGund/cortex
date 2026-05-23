"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  Network,
  Download,
  FileJson,
  FileText,
  Code2,
  Filter,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
  ArrowLeft,
  BarChart3,
  Database,
  Sparkles,
  Activity,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

import { API_BASE as API } from "@/lib/api";

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface SearchResult {
  name: string;
  type: string;
  service?: string;
  path?: string;
  properties?: Record<string, unknown>;
}

interface GraphStats {
  label: string;
  count: number;
}

/* ── Constants ──────────────────────────────────────────────────────────────── */

const TYPE_COLORS: Record<string, string> = {
  Service: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  Module: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  File: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  Class: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  Function: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Schema: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Endpoint: "bg-red-500/15 text-red-400 border-red-500/30",
  Database: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  Table: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  MessageQueue: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  Event: "bg-teal-500/15 text-teal-400 border-teal-500/30",
};

const TYPE_ICONS: Record<string, string> = {
  Service: "🧩",
  Module: "📦",
  File: "📄",
  Class: "🏛️",
  Function: "⚡",
  Schema: "🗂️",
  Endpoint: "🔗",
  Database: "🗄️",
  Table: "📋",
  MessageQueue: "📨",
  Event: "📅",
};

/* ── Page ───────────────────────────────────────────────────────────────────── */

export default function SearchPage() {
  const { token } = useAuth();
  const authHeaders = useMemo((): Record<string, string> => {
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }, [token]);
  const [query, setQuery] = useState("");
  const [nodeType, setNodeType] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [graphStats, setGraphStats] = useState<GraphStats[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState("");
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch graph stats on mount
  useEffect(() => {
    fetch(`${API}/graph/stats`, { headers: authHeaders, credentials: "include" })
      .then((r) => r.json())
      .then((d) => setGraphStats(d.stats || []))
      .catch(() => {});
    // Fetch services for filter
    fetch(`${API}/impact/search?q=&node_type=Service&limit=100`, { headers: authHeaders, credentials: "include" })
      .then((r) => r.json())
      .then((d) => setServices((d.results || []).map((r: SearchResult) => r.name)))
      .catch(() => {});
  }, []);

  const doSearch = useCallback(
    async (q: string, type: string) => {
      if (!q.trim() && !type) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("q", q || " ");
        if (type) params.set("node_type", type);
        params.set("limit", "50");
        const r = await fetch(`${API}/impact/search?${params}`, { headers: authHeaders, credentials: "include" });
        const d = await r.json();
        setResults(d.results || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Debounced search
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => doSearch(query, nodeType), 300);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [query, nodeType, doSearch]);

  // Filter results by service locally
  const filtered = serviceFilter
    ? results.filter((r) => r.service === serviceFilter)
    : results;

  // Group by type
  const grouped = filtered.reduce<Record<string, SearchResult[]>>((acc, r) => {
    const t = r.type || "Unknown";
    if (!acc[t]) acc[t] = [];
    acc[t].push(r);
    return acc;
  }, {});

  // Export functions
  const handleExport = async (format: "csv" | "json" | "cypher") => {
    setExportLoading(format);
    try {
      const params = new URLSearchParams();
      if (nodeType) params.set("node_type", nodeType);
      if (serviceFilter) params.set("service", serviceFilter);
      const url = `${API}/graph/export/${format}?${params}`;

      if (format === "json") {
        const r = await fetch(url, { headers: authHeaders, credentials: "include" });
        const d = await r.json();
        const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
        downloadBlob(blob, `graph_export.json`);
      } else {
        const r = await fetch(url, { headers: authHeaders, credentials: "include" });
        const text = await r.text();
        const mimeType = format === "csv" ? "text/csv" : "text/plain";
        const blob = new Blob([text], { type: mimeType });
        downloadBlob(blob, `graph_export.${format}`);
      }
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExportLoading("");
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const totalNodes = graphStats.reduce((s, g) => s + g.count, 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Graph Search & Export</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Find, filter, and export knowledge graph data.</p>
      </div>
        {/* Stats overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="col-span-2 sm:col-span-4 lg:col-span-2 bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-4 flex flex-col gap-1">
            <div className="flex items-center justify-between mb-1">
              <Database size={18} className="text-blue-400" />
              <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">Total</span>
            </div>
            <p className="text-2xl font-bold text-[var(--color-text-primary)]">{totalNodes}</p>
            <p className="text-xs text-[var(--color-text-muted)]">nodes in graph</p>
          </div>
          {graphStats.slice(0, 4).map((s) => (
            <div
              key={s.label}
              className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-4 flex flex-col gap-1 cursor-pointer hover:border-[var(--color-accent)] transition-colors"
              onClick={() => setNodeType(nodeType === s.label ? "" : s.label)}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-lg">{TYPE_ICONS[s.label] || "📌"}</span>
                <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">
                  {s.label}
                </span>
              </div>
              <p className="text-xl font-bold text-[var(--color-text-primary)]">{s.count}</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {nodeType === s.label ? "✓ filtering" : "click to filter"}
              </p>
            </div>
          ))}
        </div>

        {/* Search + Filters */}
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search input */}
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search nodes by name, path, or keyword…"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-all text-sm"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Type filter */}
            <select
              value={nodeType}
              onChange={(e) => setNodeType(e.target.value)}
              className="px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent)] min-w-[140px]"
            >
              <option value="">All Types</option>
              {graphStats.map((s) => (
                <option key={s.label} value={s.label}>
                  {TYPE_ICONS[s.label] || "📌"} {s.label} ({s.count})
                </option>
              ))}
            </select>

            {/* Service filter */}
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent)] min-w-[140px]"
            >
              <option value="">All Services</option>
              {services.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Active filters */}
          {(nodeType || serviceFilter) && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <Filter size={14} className="text-[var(--color-text-muted)]" />
              {nodeType && (
                <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border ${TYPE_COLORS[nodeType] || "bg-slate-500/15 text-slate-600 border-slate-500/30"}`}>
                  {TYPE_ICONS[nodeType] || "📌"} {nodeType}
                  <button onClick={() => setNodeType("")} className="ml-1 opacity-60 hover:opacity-100">
                    <X size={10} />
                  </button>
                </span>
              )}
              {serviceFilter && (
                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border bg-indigo-500/15 text-indigo-400 border-indigo-500/30">
                  🧩 {serviceFilter}
                  <button onClick={() => setServiceFilter("")} className="ml-1 opacity-60 hover:opacity-100">
                    <X size={10} />
                  </button>
                </span>
              )}
              <button
                onClick={() => {
                  setNodeType("");
                  setServiceFilter("");
                }}
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Export Bar */}
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-2xl p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Download size={16} className="text-[var(--color-text-muted)]" />
              <span className="text-sm font-medium text-[var(--color-text-primary)]">
                Export Graph
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {nodeType || serviceFilter
                  ? `(filtered: ${nodeType || "all types"}${serviceFilter ? ` / ${serviceFilter}` : ""})`
                  : "(full graph)"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExport("csv")}
                disabled={!!exportLoading}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
              >
                {exportLoading === "csv" ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <FileText size={12} />
                )}
                CSV
              </button>
              <button
                onClick={() => handleExport("json")}
                disabled={!!exportLoading}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 disabled:opacity-50 transition-colors"
              >
                {exportLoading === "json" ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <FileJson size={12} />
                )}
                JSON
              </button>
              <button
                onClick={() => handleExport("cypher")}
                disabled={!!exportLoading}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20 disabled:opacity-50 transition-colors"
              >
                {exportLoading === "cypher" ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Code2 size={12} />
                )}
                Cypher
              </button>
            </div>
          </div>
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-[var(--color-accent)]" />
          </div>
        ) : filtered.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--color-text-muted)]">
                {filtered.length} result{filtered.length !== 1 ? "s" : ""}
                {Object.keys(grouped).length > 1 &&
                  ` across ${Object.keys(grouped).length} types`}
              </span>
            </div>

            {Object.entries(grouped).map(([type, items]) => (
              <div
                key={type}
                className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden"
              >
                <button
                  onClick={() => setExpanded(expanded === type ? null : type)}
                  className="w-full flex items-center justify-between p-4 hover:bg-black/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{TYPE_ICONS[type] || "📌"}</span>
                    <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                      {type}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${TYPE_COLORS[type] || "bg-slate-500/15 text-slate-600 border-slate-500/30"}`}
                    >
                      {items.length}
                    </span>
                  </div>
                  {expanded === type ? (
                    <ChevronUp size={16} className="text-[var(--color-text-muted)]" />
                  ) : (
                    <ChevronDown size={16} className="text-[var(--color-text-muted)]" />
                  )}
                </button>

                {expanded === type && (
                  <div className="border-t border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                    {items.map((item, i) => (
                      <div
                        key={`${item.name}-${i}`}
                        className="px-4 py-3 hover:bg-black/5 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                              {item.name}
                            </span>
                            {item.service && (
                              <span className="text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] px-2 py-0.5 rounded-full border border-[var(--color-border)]">
                                {item.service}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {item.path && (
                              <span className="text-xs text-[var(--color-text-muted)] font-mono truncate max-w-[200px]">
                                {item.path}
                              </span>
                            )}
                            <Link
                              href={`/impact?node=${encodeURIComponent(item.name)}&type=${item.type}`}
                              className="text-[10px] font-medium px-2 py-1 rounded bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/20 transition-colors whitespace-nowrap"
                            >
                              What-If →
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : query || nodeType ? (
          <div className="text-center py-12 text-[var(--color-text-muted)]">
            <Search size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No results found</p>
            <p className="text-xs mt-1">Try a different search term or clear filters</p>
          </div>
        ) : (
          <div className="text-center py-12 text-[var(--color-text-muted)]">
            <Search size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Start typing to search the knowledge graph</p>
            <p className="text-xs mt-1">
              Or click a node type above to browse by category
            </p>
          </div>
        )}
    </div>
  );
}
