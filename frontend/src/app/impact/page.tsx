"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Search, AlertTriangle, GitBranch, ArrowRight, ArrowLeft,
  Loader2, Shield, Target, Zap, ChevronDown, ChevronRight,
  Network, AlertCircle, CheckCircle2, Info, X
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────

interface SearchResult {
  type: string;
  name: string;
  service: string;
  file: string;
}

interface BlastItem {
  type: string;
  name: string;
  service: string;
  file: string;
  rel_chain: string[];
  node_chain: string[];
  label_chain: string[];
}

interface DirectItem {
  type: string;
  name: string;
  service: string;
  relationship: string;
  direction: string;
}

interface BlastRadius {
  node: string;
  node_type: string;
  depth: number;
  upstream: { count: number; by_type: Record<string, BlastItem[]>; items: BlastItem[] };
  downstream: { count: number; by_type: Record<string, BlastItem[]>; items: BlastItem[] };
  direct: DirectItem[];
  affected_services: string[];
  total_affected: number;
  risk_level?: string;
  summary?: string;
  affected_areas?: string[];
  recommendations?: string[];
  breaking_change_risk?: string;
}

interface ChainStep {
  name: string;
  type: string;
  edge?: string;
}

interface Chain {
  steps: ChainStep[];
  hops: number;
}

interface ChainResult {
  source: string;
  target: string;
  chains: Chain[];
  found: boolean;
}

// ── Colors ─────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  Service: "bg-indigo-100 text-indigo-700 border-indigo-200",
  Module: "bg-violet-100 text-violet-700 border-violet-200",
  File: "bg-purple-100 text-purple-700 border-purple-200",
  Class: "bg-cyan-100 text-cyan-700 border-cyan-200",
  Function: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Schema: "bg-amber-100 text-amber-700 border-amber-200",
  Endpoint: "bg-red-100 text-red-700 border-red-200",
  Database: "bg-orange-100 text-orange-700 border-orange-200",
  Table: "bg-orange-100 text-orange-700 border-orange-200",
  MessageQueue: "bg-pink-100 text-pink-700 border-pink-200",
  Developer: "bg-lime-100 text-lime-700 border-lime-200",
};

const RISK_COLORS: Record<string, string> = {
  LOW: "bg-green-100 text-green-700 border-green-200",
  MEDIUM: "bg-yellow-100 text-yellow-700 border-yellow-200",
  HIGH: "bg-orange-100 text-orange-700 border-orange-200",
  CRITICAL: "bg-red-100 text-red-700 border-red-200",
};

const RISK_ICONS: Record<string, typeof CheckCircle2> = {
  LOW: CheckCircle2,
  MEDIUM: Info,
  HIGH: AlertTriangle,
  CRITICAL: AlertCircle,
};

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ImpactPage() {
  const { token } = useAuth();
  const authHeaders = useMemo(() => {
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }, [token]);
  const [mode, setMode] = useState<"blast" | "chain">("blast");

  // Blast radius state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedNode, setSelectedNode] = useState<SearchResult | null>(null);
  const [blastResult, setBlastResult] = useState<BlastRadius | null>(null);
  const [loading, setLoading] = useState(false);
  const [withSummary, setWithSummary] = useState(false);
  const [depth, setDepth] = useState(4);

  // Chain state
  const [chainSource, setChainSource] = useState("");
  const [chainTarget, setChainTarget] = useState("");
  const [chainResult, setChainResult] = useState<ChainResult | null>(null);
  const [chainLoading, setChainLoading] = useState(false);

  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ── Debounced search ──────────────────────────────────────────────────

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`${API}/impact/search?q=${encodeURIComponent(q)}&limit=15`, {
        headers: authHeaders,
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || data);
      }
    } catch { /* ignore */ }
    setSearching(false);
  }, []);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => doSearch(searchQuery), 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery, doSearch]);

  // ── Blast radius ─────────────────────────────────────────────────────

  const handleBlastRadius = async (node?: SearchResult) => {
    const target = node ?? selectedNode ?? (searchQuery.trim() ? { name: searchQuery.trim(), type: "", service: "", file: "" } as SearchResult : null);
    if (!target) return;
    setSelectedNode(target);
    setSearchResults([]);
    setSearchQuery(target.name);
    setLoading(true);
    setBlastResult(null);
    try {
      const endpoint = withSummary ? "/impact/summary" : "/impact/blast-radius";
      const params = new URLSearchParams({
        node: target.name,
        ...(target.type ? { node_type: target.type } : {}),
        depth: depth.toString(),
      });
      const res = await fetch(`${API}${endpoint}?${params}`, { headers: authHeaders });
      if (res.ok) {
        setBlastResult(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  // ── Dependency chain ─────────────────────────────────────────────────

  const handleChainFind = async () => {
    if (!chainSource.trim() || !chainTarget.trim()) return;
    setChainLoading(true);
    setChainResult(null);
    try {
      const params = new URLSearchParams({ source: chainSource, target: chainTarget });
      const res = await fetch(`${API}/impact/chain?${params}`, { headers: authHeaders });
      if (res.ok) {
        setChainResult(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
    setChainLoading(false);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">What-If Analyzer</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Analyze blast radius and dependency chains.</p>
        </div>
        <div className="flex items-center gap-1 bg-[var(--color-card)] rounded-lg p-0.5 border border-[var(--color-border)]">
          <button
            onClick={() => setMode("blast")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === "blast" ? "bg-orange-500/20 text-orange-400" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}
          >
            <Target size={12} className="inline mr-1" /> Blast Radius
          </button>
          <button
            onClick={() => setMode("chain")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === "chain" ? "bg-blue-500/20 text-blue-400" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}
          >
            <GitBranch size={12} className="inline mr-1" /> Dep Chain
          </button>
        </div>
      </div>

      {mode === "blast" ? (
        <div className="space-y-6">
            {/* Search + Controls */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Target size={20} className="text-orange-400" />
                Select a Component to Analyze
              </h2>

              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <Search size={16} className="absolute left-3 top-3 text-slate-500" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleBlastRadius()}
                    placeholder="Search by function, service, endpoint, class name..."
                    className="w-full bg-slate-100/60 border border-slate-300 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
                  />

                  {/* Autocomplete dropdown */}
                  {searchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-slate-100 border border-slate-300 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                      {searchResults.map((r, i) => (
                        <button
                          key={`${r.name}-${i}`}
                          onClick={() => handleBlastRadius(r)}
                          className="w-full text-left px-3 py-2 hover:bg-slate-200/50 flex items-center gap-3 text-sm border-b border-slate-300/50 last:border-0"
                        >
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${TYPE_COLORS[r.type] ?? "bg-slate-200 text-slate-700"}`}>
                            {r.type}
                          </span>
                          <span className="text-slate-900 flex-1 truncate">{r.name}</span>
                          {r.service && <span className="text-slate-500 text-xs">{r.service}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <span>Depth:</span>
                    <select
                      value={depth}
                      onChange={(e) => setDepth(Number(e.target.value))}
                      className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs text-slate-900"
                    >
                      {[1, 2, 3, 4, 5, 6].map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={withSummary}
                      onChange={(e) => setWithSummary(e.target.checked)}
                      className="rounded border-slate-400 bg-slate-100"
                    />
                    AI Summary
                  </label>

                  <button
                    onClick={() => handleBlastRadius()}
                    disabled={loading || !searchQuery.trim()}
                    className="px-4 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-slate-900 disabled:opacity-50 transition-all flex items-center gap-2"
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Target size={14} />}
                    Analyze
                  </button>
                </div>
              </div>
            </div>

            {/* Results */}
            {blastResult && <BlastRadiusView data={blastResult} />}
          </div>
      ) : (
        <div className="space-y-6">
            {/* Chain input */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <GitBranch size={20} className="text-blue-400" />
                Find Dependency Chain
              </h2>
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-xs text-slate-600 mb-1">Source</label>
                  <input
                    value={chainSource}
                    onChange={(e) => setChainSource(e.target.value)}
                    placeholder="e.g. auth-service"
                    className="w-full bg-slate-100/60 border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <ArrowRight size={20} className="text-slate-500 mb-3" />
                <div className="flex-1">
                  <label className="block text-xs text-slate-600 mb-1">Target</label>
                  <input
                    value={chainTarget}
                    onChange={(e) => setChainTarget(e.target.value)}
                    placeholder="e.g. payment-service"
                    className="w-full bg-slate-100/60 border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <button
                  onClick={handleChainFind}
                  disabled={chainLoading || !chainSource.trim() || !chainTarget.trim()}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-slate-900 disabled:opacity-50 transition-all flex items-center gap-2"
                >
                  {chainLoading ? <Loader2 size={14} className="animate-spin" /> : <Network size={14} />}
                  Find Path
                </button>
              </div>
            </div>

            {chainResult && <ChainView data={chainResult} />}
          </div>
      )}
    </div>
  );
}

// ── Blast Radius View ──────────────────────────────────────────────────────

function BlastRadiusView({ data }: { data: BlastRadius }) {
  const [expandedSection, setExpandedSection] = useState<string | null>("upstream");

  const RiskIcon = data.risk_level ? RISK_ICONS[data.risk_level] ?? Info : Info;

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Target size={18} className="text-orange-400" />}
          label="Target"
          value={data.node}
          sub={data.node_type ?? "Auto-detected"}
        />
        <StatCard
          icon={<ArrowLeft size={18} className="text-red-400" />}
          label="Upstream (depends on this)"
          value={String(data.upstream.count)}
        />
        <StatCard
          icon={<ArrowRight size={18} className="text-blue-400" />}
          label="Downstream (this depends on)"
          value={String(data.downstream.count)}
        />
        <StatCard
          icon={<Shield size={18} className="text-amber-400" />}
          label="Affected Services"
          value={String(data.affected_services.length)}
          sub={data.affected_services.slice(0, 3).join(", ")}
        />
      </div>

      {/* AI Risk Assessment (if requested) */}
      {data.risk_level && (
        <div className={`border rounded-xl p-5 ${RISK_COLORS[data.risk_level] ?? "border-slate-300"}`}>
          <div className="flex items-center gap-3 mb-3">
            <RiskIcon size={20} />
            <span className="font-semibold">Risk Level: {data.risk_level}</span>
          </div>
          {data.summary && <p className="text-sm text-slate-700 mb-3">{data.summary}</p>}
          {data.breaking_change_risk && (
            <p className="text-sm text-slate-600 mb-3">
              <strong className="text-slate-700">Breaking change risk:</strong> {data.breaking_change_risk}
            </p>
          )}
          {data.recommendations && data.recommendations.length > 0 && (
            <div className="mt-3">
              <h4 className="text-xs font-medium text-slate-600 mb-2 uppercase tracking-wider">Recommendations</h4>
              <ul className="space-y-1">
                {data.recommendations.map((r, i) => (
                  <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                    <span className="text-xs text-slate-500 mt-0.5">{i + 1}.</span> {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.affected_areas && data.affected_areas.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {data.affected_areas.map((a, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full bg-slate-100 text-xs text-slate-700 border border-slate-300">
                  {a}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Direct connections */}
      {data.direct.length > 0 && (
        <CollapsibleSection
          title={`Direct Connections (${data.direct.length})`}
          icon={<Network size={16} className="text-purple-400" />}
          defaultOpen={false}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {data.direct.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-sm bg-slate-100/40 rounded-lg px-3 py-2 border border-slate-300/50">
                {d.direction === "incoming" ? (
                  <ArrowLeft size={12} className="text-red-400 flex-shrink-0" />
                ) : (
                  <ArrowRight size={12} className="text-blue-400 flex-shrink-0" />
                )}
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${TYPE_COLORS[d.type] ?? "bg-slate-200 text-slate-700"}`}>
                  {d.type}
                </span>
                <span className="text-slate-900 truncate flex-1">{d.name}</span>
                <span className="text-xs text-slate-500 font-mono">{d.relationship}</span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Upstream */}
      <CollapsibleSection
        title={`Upstream — Depends on "${data.node}" (${data.upstream.count})`}
        icon={<ArrowLeft size={16} className="text-red-400" />}
        defaultOpen={expandedSection === "upstream"}
      >
        <TypeGroupedList items={data.upstream.by_type} direction="upstream" />
      </CollapsibleSection>

      {/* Downstream */}
      <CollapsibleSection
        title={`Downstream — "${data.node}" depends on (${data.downstream.count})`}
        icon={<ArrowRight size={16} className="text-blue-400" />}
        defaultOpen={false}
      >
        <TypeGroupedList items={data.downstream.by_type} direction="downstream" />
      </CollapsibleSection>
    </div>
  );
}

// ── Chain View ─────────────────────────────────────────────────────────────

function ChainView({ data }: { data: ChainResult }) {
  if (!data.found) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <X size={32} className="mx-auto text-slate-600 mb-3" />
        <p className="text-slate-600">No dependency chain found between <strong className="text-slate-900">{data.source}</strong> and <strong className="text-slate-900">{data.target}</strong></p>
        <p className="text-xs text-slate-600 mt-1">Try different node names or increase the max depth.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.chains.map((chain, ci) => (
        <div key={ci} className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <GitBranch size={16} className="text-blue-400" />
            <span className="text-sm font-medium">Path {ci + 1} — {chain.hops} hop{chain.hops > 1 ? "s" : ""}</span>
          </div>
          <div className="flex items-center flex-wrap gap-2">
            {chain.steps.map((step, si) => (
              <div key={si} className="flex items-center gap-2">
                <div className={`px-3 py-1.5 rounded-lg border text-sm ${TYPE_COLORS[step.type] ?? "bg-slate-100 text-slate-700 border-slate-300"}`}>
                  <span className="text-[10px] font-mono opacity-60 mr-1.5">{step.type}</span>
                  {step.name}
                </div>
                {step.edge && (
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <ArrowRight size={12} />
                    <span className="font-mono">{step.edge}</span>
                    <ArrowRight size={12} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Shared Components ──────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-xl font-bold truncate">{value}</p>
      {sub && <p className="text-xs text-slate-500 truncate mt-0.5">{sub}</p>}
    </div>
  );
}

function CollapsibleSection({ title, icon, defaultOpen, children }: {
  title: string; icon: React.ReactNode; defaultOpen: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-5 py-3.5 text-sm font-medium hover:bg-slate-100/30 transition-colors"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {icon}
        {title}
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  );
}

function TypeGroupedList({ items, direction }: { items: Record<string, BlastItem[]>; direction: string }) {
  if (Object.keys(items).length === 0) {
    return <p className="text-sm text-slate-500 italic">No {direction} dependencies found.</p>;
  }
  return (
    <div className="space-y-3">
      {Object.entries(items).map(([type, list]) => (
        <div key={type}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-0.5 rounded text-[11px] font-mono border ${TYPE_COLORS[type] ?? "bg-slate-200 text-slate-700 border-slate-400"}`}>
              {type}
            </span>
            <span className="text-xs text-slate-500">({list.length})</span>
          </div>
          <div className="space-y-1 ml-3">
            {list.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-slate-700">
                <span className="text-slate-900">{item.name}</span>
                {item.service && <span className="text-xs text-slate-600">({item.service})</span>}
                {item.rel_chain.length > 0 && (
                  <span className="text-[10px] text-slate-600 font-mono ml-auto">{item.rel_chain.join(" → ")}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
