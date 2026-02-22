"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  FileText,
  AlertTriangle,
  Circle,
  CheckCircle2,
  XCircle,
  Clock,
  Network,
  Loader2,
  ChevronDown,
  ChevronUp,
  Zap,
  BookOpen,
  GitBranch,
  Wand2,
  Copy,
  Check,
  FileCode2,
  LayoutTemplate,
  ExternalLink,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface CoverageEntry {
  total: number;
  documented: number;
  undocumented: number;
  coverage_pct: number;
}

interface HealthScore {
  score: number;
  grade: string;
  breakdown: {
    coverage_score: number;
    orphan_penalty: number;
    stale_penalty: number;
  };
}

interface GapNode {
  name: string;
  node_type: string;
  degree: number;
  parent: string;
  file_path: string | null;
  severity: "critical" | "moderate" | "low";
}

interface StaleDoc {
  doc_name: string;
  service: string | null;
  last_updated: string | null;
  status: "stale" | "missing";
}

interface OrphanedNode {
  name: string;
  node_type: string;
  degree: number;
}

interface UndocumentedService {
  name: string;
  language: string | null;
  description: string | null;
  gap_type: string;
}

interface DashboardData {
  health_score: HealthScore;
  overview: {
    total_nodes: number;
    total_edges: number;
    node_distribution: Record<string, number>;
  };
  documentation_coverage: {
    by_type: Record<string, CoverageEntry>;
    overall: CoverageEntry;
  };
  top_knowledge_gaps: GapNode[];
  stale_docs: StaleDoc[];
  orphaned_nodes: OrphanedNode[];
  undocumented_services: UndocumentedService[];
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function gradeColor(grade: string) {
  switch (grade) {
    case "A": return "text-emerald-400";
    case "B": return "text-blue-400";
    case "C": return "text-amber-400";
    default:  return "text-red-400";
  }
}

function gradeRingColor(grade: string) {
  switch (grade) {
    case "A": return "#34d399";
    case "B": return "#60a5fa";
    case "C": return "#fbbf24";
    default:  return "#f87171";
  }
}

function scoreGlow(grade: string) {
  switch (grade) {
    case "A": return "shadow-emerald-500/30";
    case "B": return "shadow-blue-500/30";
    case "C": return "shadow-amber-500/30";
    default:  return "shadow-red-500/30";
  }
}

function severityBadge(severity: GapNode["severity"]) {
  switch (severity) {
    case "critical": return "bg-red-500/15 text-red-400 border border-red-500/25";
    case "moderate": return "bg-amber-500/15 text-amber-400 border border-amber-500/25";
    default:         return "bg-slate-500/15 text-slate-400 border border-slate-500/25";
  }
}

function coverageBar(pct: number) {
  const color =
    pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function NodeTypePill({ type }: { type: string }) {
  const colors: Record<string, string> = {
    Service:       "bg-indigo-500/15 text-indigo-400",
    Module:        "bg-violet-500/15 text-violet-400",
    File:          "bg-purple-400/15 text-purple-300",
    Class:         "bg-cyan-500/15 text-cyan-400",
    Function:      "bg-emerald-500/15 text-emerald-400",
    Schema:        "bg-amber-500/15 text-amber-400",
    Endpoint:      "bg-red-500/15 text-red-400",
    Documentation: "bg-green-500/15 text-green-400",
  };
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${colors[type] ?? "bg-slate-500/15 text-slate-400"}`}>
      {type}
    </span>
  );
}

// â”€â”€ Gauge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ScoreGauge({ score, grade }: { score: number; grade: string }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color = gradeRingColor(grade);

  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      {/* track */}
      <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
      {/* arc */}
      <circle
        cx="70" cy="70" r={r}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circ}`}
        strokeDashoffset={circ / 4}
        style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: "stroke-dasharray 0.7s ease" }}
      />
      <text x="70" y="74" textAnchor="middle" fill={color} fontSize="28" fontWeight="700" fontFamily="monospace">
        {score}
      </text>
      <text x="70" y="91" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="10">
        / 100
      </text>
    </svg>
  );
}

// â”€â”€ Stat Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function StatCard({
  icon, label, value, sub, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
}) {
  return (
    <div className={`rounded-xl border bg-[var(--color-card)] p-4 flex flex-col gap-2 ${accent}`}>
      <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-[var(--color-text-primary)]">{value}</p>
      {sub && <p className="text-xs text-[var(--color-text-muted)]">{sub}</p>}
    </div>
  );
}

// â”€â”€ Section wrapper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function Section({
  title, icon, count, children, defaultOpen = true,
}: {
  title: string;
  icon: React.ReactNode;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/3 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
          {icon}
          {title}
          {count !== undefined && (
            <span className="ml-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-white/10 text-[var(--color-text-muted)]">
              {count}
            </span>
          )}
        </div>
        {open ? <ChevronUp size={15} className="text-[var(--color-text-muted)]" /> : <ChevronDown size={15} className="text-[var(--color-text-muted)]" />}
      </button>
      {open && <div className="border-t border-[var(--color-border)]">{children}</div>}
    </div>
  );
}

// â”€â”€ Empty state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-8 text-[var(--color-text-muted)] text-sm gap-2">
      <CheckCircle2 size={14} className="text-emerald-400" />
      {text}
    </div>
  );
}

// â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function HealthPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/knowledge-health/dashboard`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastRefresh(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load health data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // â”€â”€ auto-doc state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [docSuggestions, setDocSuggestions] = useState<Record<string, string>>({});
  const [loadingDoc,     setLoadingDoc]     = useState<Record<string, boolean>>({});
  const [docUpdates,     setDocUpdates]     = useState<Record<string, string>>({});
  const [loadingUpdate,  setLoadingUpdate]  = useState<Record<string, boolean>>({});

  // â”€â”€ template state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [activeTemplate,  setActiveTemplate]  = useState<{ type: string; name: string; description: string; content: string } | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  // â”€â”€ copy-to-clipboard state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(prev => (prev === key ? null : prev)), 2000);
    });
  }, []);

  const generateDoc = useCallback(async (name: string, nodeType: string) => {
    const key = `${name}-${nodeType}`;
    setLoadingDoc(prev => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(`${API}/knowledge-health/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, node_type: nodeType }),
      });
      const json = await res.json();
      setDocSuggestions(prev => ({ ...prev, [key]: json.suggestion ?? "No suggestion returned." }));
    } catch {
      setDocSuggestions(prev => ({ ...prev, [key]: "Failed to generate â€” check API connection." }));
    } finally {
      setLoadingDoc(prev => ({ ...prev, [key]: false }));
    }
  }, []);

  const suggestUpdate = useCallback(async (docName: string, service: string) => {
    const key = `update-${docName}`;
    setLoadingUpdate(prev => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(`${API}/knowledge-health/suggest-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_name: docName, service }),
      });
      const json = await res.json();
      setDocUpdates(prev => ({ ...prev, [key]: json.suggestion ?? "No suggestion returned." }));
    } catch {
      setDocUpdates(prev => ({ ...prev, [key]: "Failed to generate â€” check API connection." }));
    } finally {
      setLoadingUpdate(prev => ({ ...prev, [key]: false }));
    }
  }, []);

  const loadTemplate = useCallback(async (type: string) => {
    if (activeTemplate?.type === type) { setActiveTemplate(null); return; }
    setLoadingTemplate(true);
    try {
      const res = await fetch(`${API}/knowledge-health/templates/${type}`);
      const json = await res.json();
      setActiveTemplate(json);
    } catch {
      // ignore
    } finally {
      setLoadingTemplate(false);
    }
  }, [activeTemplate]);

  const score = data?.health_score;
  const coverage = data?.documentation_coverage;
  const gaps = data?.top_knowledge_gaps ?? [];
  const stale = data?.stale_docs ?? [];
  const orphaned = data?.orphaned_nodes ?? [];
  const services = data?.undocumented_services ?? [];

  return (
    <div className="min-h-screen bg-grid text-[var(--color-text-primary)]">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-background)]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <ArrowLeft size={14} />
              Back
            </Link>
            <div className="w-px h-4 bg-[var(--color-border)]" />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <ShieldCheck size={14} className="text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold leading-none">System Knowledge Health</h1>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 leading-none">
                  Documentation coverage Â· Gaps Â· Staleness
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {lastRefresh && (
              <span className="text-[10px] text-[var(--color-text-muted)]">
                Updated {lastRefresh.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--color-card)] border border-[var(--color-border)] hover:border-emerald-500/40 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <ShieldX size={15} />
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !data && (
          <div className="flex items-center justify-center py-24 gap-3 text-[var(--color-text-muted)]">
            <Loader2 size={18} className="animate-spin text-emerald-400" />
            <span className="text-sm">Analysing knowledge graphâ€¦</span>
          </div>
        )}

        {data && (
          <>
            {/* Hero row: score + stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Score card */}
              <div
                className={`lg:col-span-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 flex flex-col items-center gap-2 shadow-xl ${scoreGlow(score?.grade ?? "D")}`}
              >
                <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] mb-1">
                  <ShieldCheck size={12} />
                  Overall Health Score
                </div>
                <ScoreGauge score={score?.score ?? 0} grade={score?.grade ?? "D"} />
                <span className={`text-4xl font-black ${gradeColor(score?.grade ?? "D")}`}>
                  Grade {score?.grade}
                </span>
                <div className="w-full mt-3 space-y-2 text-xs">
                  {[
                    { label: "Coverage", value: score?.breakdown.coverage_score ?? 0, of: 100 },
                    { label: "Isolated nodes", value: score?.breakdown.orphan_penalty ?? 0, invert: true },
                    { label: "Outdated docs",  value: score?.breakdown.stale_penalty  ?? 0, invert: true },
                  ].map(({ label, value, invert }) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="text-[var(--color-text-muted)] w-28 shrink-0">{label}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${invert ? "bg-red-500" : "bg-emerald-500"}`}
                          style={{ width: `${Math.min(value, 100)}%` }}
                        />
                      </div>
                      <span className="text-[var(--color-text-muted)] w-8 text-right">{value}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stat cards grid */}
              <div className="lg:col-span-3 grid grid-cols-2 gap-4">
                <StatCard
                  icon={<BookOpen size={13} />}
                  label="Doc Coverage"
                  value={`${coverage?.overall.coverage_pct ?? 0}%`}
                  sub={`${coverage?.overall.documented ?? 0} / ${coverage?.overall.total ?? 0} nodes`}
                  accent="border-emerald-500/20"
                />
                <StatCard
                  icon={<AlertTriangle size={13} />}
                  label="Knowledge Gaps"
                  value={gaps.length}
                  sub={`${gaps.filter(g => g.severity === "critical").length} critical`}
                  accent="border-red-500/20"
                />
                <StatCard
                  icon={<Clock size={13} />}
                  label="Outdated Docs"
                  value={stale.length}
                  sub={`${stale.filter(d => d.status === "missing").length} have no date recorded`}
                  accent="border-amber-500/20"
                />
                <StatCard
                  icon={<Circle size={13} />}
                  label="Isolated Nodes"
                  value={orphaned.length}
                  sub="not linked to anything"
                  accent="border-slate-500/20"
                />
              </div>
            </div>

            {/* Documentation Coverage by type */}
            <Section
              title="Documentation Coverage by Type"
              icon={<BookOpen size={14} />}
              count={Object.keys(coverage?.by_type ?? {}).length}
            >
              <div className="divide-y divide-[var(--color-border)]">
                {Object.entries(coverage?.by_type ?? {}).map(([type, entry]) => (
                  <div key={type} className="flex items-center gap-3 px-5 py-3">
                    <NodeTypePill type={type} />
                    <div className="flex-1">
                      {coverageBar(entry.coverage_pct)}
                    </div>
                    <span className="text-xs font-mono text-[var(--color-text-muted)] w-10 text-right">
                      {entry.coverage_pct}%
                    </span>
                    <span className="text-[11px] text-[var(--color-text-muted)] w-24 text-right">
                      {entry.documented}/{entry.total} documented
                    </span>
                  </div>
                ))}
                {Object.keys(coverage?.by_type ?? {}).length === 0 && (
                  <EmptyState text="No nodes found in graph" />
                )}
              </div>
            </Section>

            {/* Knowledge Gaps */}
            <Section
              title="Knowledge Gaps"
              icon={<ShieldAlert size={14} />}
              count={gaps.length}
            >
              {gaps.length === 0 ? (
                <EmptyState text="All nodes are documented!" />
              ) : (
                <div className="divide-y divide-[var(--color-border)]">
                  {/* header */}
                  <div className="grid grid-cols-12 gap-2 px-5 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    <span className="col-span-3">Node</span>
                    <span className="col-span-2">Type</span>
                    <span className="col-span-2">Severity</span>
                    <span className="col-span-1 text-center">Links</span>
                    <span className="col-span-2">Parent</span>
                    <span className="col-span-2 text-right">Action</span>
                  </div>
                  {gaps.map((g, i) => {
                    const key = `${g.name}-${g.node_type}`;
                    return (
                      <div key={i} className="border-b border-[var(--color-border)] last:border-0">
                        <div className="grid grid-cols-12 gap-2 px-5 py-3 items-center hover:bg-white/2 transition-colors">
                          <div className="col-span-3 flex items-center gap-2 min-w-0">
                            {g.severity === "critical" ? (
                              <XCircle size={12} className="text-red-400 shrink-0" />
                            ) : g.severity === "moderate" ? (
                              <AlertTriangle size={12} className="text-amber-400 shrink-0" />
                            ) : (
                              <Circle size={12} className="text-slate-500 shrink-0" />
                            )}
                            <span className="text-xs font-mono truncate text-[var(--color-text-primary)]" title={g.name}>
                              {g.name}
                            </span>
                          </div>
                          <div className="col-span-2">
                            <NodeTypePill type={g.node_type} />
                          </div>
                          <div className="col-span-2">
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${severityBadge(g.severity)}`}>
                              {g.severity}
                            </span>
                          </div>
                          <div className="col-span-1 text-center">
                            <span className="text-xs font-mono text-[var(--color-text-muted)]">{g.degree}</span>
                          </div>
                          <div className="col-span-2 truncate text-[11px] text-[var(--color-text-muted)]" title={g.parent}>
                            {g.parent || "â€”"}
                          </div>
                          <div className="col-span-2 flex justify-end">
                            <button
                              onClick={() => generateDoc(g.name, g.node_type)}
                              disabled={loadingDoc[key]}
                              className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                            >
                              {loadingDoc[key] ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
                              Write Doc
                            </button>
                          </div>
                        </div>
                        {docSuggestions[key] && (
                          <div className="mx-5 mb-3 rounded-lg bg-blue-500/5 border border-blue-500/15 overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-2 border-b border-blue-500/10">
                              <span className="text-[10px] font-semibold text-blue-400 flex items-center gap-1">
                                <Wand2 size={10} /> AI-Generated Documentation
                              </span>
                              <button
                                onClick={() => copyToClipboard(docSuggestions[key], key)}
                                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[var(--color-text-muted)] transition-colors"
                              >
                                {copied === key ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                                {copied === key ? "Copied!" : "Copy"}
                              </button>
                            </div>
                            <pre className="px-3 py-2.5 text-xs text-[var(--color-text-primary)] whitespace-pre-wrap font-mono leading-relaxed">
                              {docSuggestions[key]}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            {/* Stale / Missing Docs */}
            <Section
              title="Outdated & Missing Documentation"
              icon={<Clock size={14} />}
              count={stale.length}
              defaultOpen={false}
            >
              {stale.length === 0 ? (
                <EmptyState text="All docs are current â€” nothing outdated!" />
              ) : (
                <div className="divide-y divide-[var(--color-border)]">
                  <div className="grid grid-cols-12 gap-2 px-5 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    <span className="col-span-4">Document</span>
                    <span className="col-span-2">Service</span>
                    <span className="col-span-2">Status</span>
                    <span className="col-span-2">Last Updated</span>
                    <span className="col-span-2 text-right">Action</span>
                  </div>
                  {stale.map((d, i) => {
                    const key = `update-${d.doc_name}`;
                    return (
                      <div key={i} className="border-b border-[var(--color-border)] last:border-0">
                        <div className="grid grid-cols-12 gap-2 px-5 py-3 items-center hover:bg-white/2 transition-colors">
                          <div className="col-span-4 flex items-center gap-2 min-w-0">
                            <FileText size={12} className="text-[var(--color-text-muted)] shrink-0" />
                            <span className="text-xs font-mono truncate" title={d.doc_name}>{d.doc_name}</span>
                          </div>
                          <div className="col-span-2 text-[11px] text-[var(--color-text-muted)] truncate">{d.service || "â€”"}</div>
                          <div className="col-span-2">
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                              d.status === "missing"
                                ? "bg-red-500/15 text-red-400 border border-red-500/25"
                                : "bg-amber-500/15 text-amber-400 border border-amber-500/25"
                            }`}>
                              {d.status}
                            </span>
                          </div>
                          <div className="col-span-2 text-[11px] text-[var(--color-text-muted)]">
                            {d.last_updated
                              ? new Date(d.last_updated).toLocaleDateString()
                              : "â€”"}
                          </div>
                          <div className="col-span-2 flex justify-end">
                            <button
                              onClick={() => suggestUpdate(d.doc_name, d.service ?? "")}
                              disabled={loadingUpdate[key]}
                              className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                            >
                              {loadingUpdate[key] ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
                              Rewrite
                            </button>
                          </div>
                        </div>
                        {docUpdates[key] && (
                          <div className="mx-5 mb-3 rounded-lg bg-amber-500/5 border border-amber-500/15 overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-2 border-b border-amber-500/10">
                              <span className="text-[10px] font-semibold text-amber-400 flex items-center gap-1">
                                <Wand2 size={10} /> AI-Suggested Update
                              </span>
                              <button
                                onClick={() => copyToClipboard(docUpdates[key], key)}
                                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[var(--color-text-muted)] transition-colors"
                              >
                                {copied === key ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                                {copied === key ? "Copied!" : "Copy"}
                              </button>
                            </div>
                            <pre className="px-3 py-2.5 text-xs text-[var(--color-text-primary)] whitespace-pre-wrap font-mono leading-relaxed">
                              {docUpdates[key]}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            {/* Orphaned Nodes + Undocumented Services (side by side) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Orphaned */}
              <Section
              title="Isolated Nodes (no connections)"
                icon={<GitBranch size={14} />}
                count={orphaned.length}
                defaultOpen={false}
              >
                {orphaned.length === 0 ? (
                  <EmptyState text="Every node is connected â€” great!" />
                ) : (
                  <div className="divide-y divide-[var(--color-border)] max-h-72 overflow-y-auto">
                    {orphaned.map((n, i) => (
                      <div key={i} className="flex items-center gap-3 px-5 py-2.5 hover:bg-white/2 transition-colors">
                        <Circle size={10} className="text-slate-500 shrink-0" />
                        <span className="text-xs font-mono flex-1 truncate text-[var(--color-text-primary)]">{n.name}</span>
                        <NodeTypePill type={n.node_type} />
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Undocumented services */}
              <Section
                title="Undocumented Services"
                icon={<Zap size={14} />}
                count={services.length}
                defaultOpen={false}
              >
                {services.length === 0 ? (
                  <EmptyState text="All services documented" />
                ) : (
                  <div className="divide-y divide-[var(--color-border)] max-h-72 overflow-y-auto">
                    {services.map((s, i) => (
                      <div key={i} className="flex items-center gap-3 px-5 py-2.5 hover:bg-white/2 transition-colors">
                        <Network size={10} className="text-indigo-400 shrink-0" />
                        <span className="text-xs font-mono flex-1 truncate text-[var(--color-text-primary)]">{s.name}</span>
                        {s.language && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-[var(--color-text-muted)]">{s.language}</span>
                        )}
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          s.gap_type === "no_description"
                            ? "bg-red-500/15 text-red-400 border border-red-500/25"
                            : "bg-amber-500/15 text-amber-400 border border-amber-500/25"
                        }`}>
                          {s.gap_type === "no_description" ? "no description" : "no doc node"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>

            {/* Document Templates */}
            <Section
              title="Document Templates"
              icon={<LayoutTemplate size={14} />}
              defaultOpen={false}
            >
              <div className="p-5 space-y-4">
                <p className="text-xs text-[var(--color-text-muted)]">
                  Standardized templates for ADRs, incident postmortems, and service READMEs.
                  Click a template to preview it, then copy it to your clipboard.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {([
                    { type: "adr",      label: "Architecture Decision Record", sub: "Document key design choices",        color: "border-blue-500/30 hover:border-blue-500/60 text-blue-400" },
                    { type: "incident", label: "Incident Postmortem",           sub: "Log and learn from outages",         color: "border-red-500/30 hover:border-red-500/60 text-red-400" },
                    { type: "service",  label: "Service README",               sub: "Standard service documentation",    color: "border-emerald-500/30 hover:border-emerald-500/60 text-emerald-400" },
                  ] as const).map(({ type, label, sub, color }) => (
                    <button
                      key={type}
                      onClick={() => loadTemplate(type)}
                      className={`flex flex-col gap-1 p-4 rounded-xl border bg-white/3 text-left transition-all ${
                        activeTemplate?.type === type ? color.replace("hover:", "").replace("30", "60") + " bg-white/6" : color
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <FileCode2 size={14} />
                        {loadingTemplate && activeTemplate?.type !== type ? null : (
                          activeTemplate?.type === type
                            ? <Check size={12} className="text-emerald-400" />
                            : <ChevronDown size={12} className="text-[var(--color-text-muted)]" />
                        )}
                      </div>
                      <span className="text-xs font-semibold text-[var(--color-text-primary)] mt-1">{label}</span>
                      <span className="text-[10px] text-[var(--color-text-muted)]">{sub}</span>
                    </button>
                  ))}
                </div>

                {loadingTemplate && (
                  <div className="flex items-center justify-center py-8 text-[var(--color-text-muted)] gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    <span className="text-xs">Loading templateâ€¦</span>
                  </div>
                )}

                {activeTemplate && !loadingTemplate && (
                  <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-white/3 border-b border-[var(--color-border)]">
                      <div>
                        <p className="text-xs font-semibold text-[var(--color-text-primary)]">{activeTemplate.name}</p>
                        <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{activeTemplate.description}</p>
                      </div>
                      <button
                        onClick={() => copyToClipboard(activeTemplate.content, `tpl-${activeTemplate.type}`)}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                      >
                        {copied === `tpl-${activeTemplate.type}` ? <Check size={12} /> : <Copy size={12} />}
                        {copied === `tpl-${activeTemplate.type}` ? "Copied!" : "Copy to clipboard"}
                      </button>
                    </div>
                    <pre className="p-4 text-xs text-[var(--color-text-primary)] whitespace-pre-wrap font-mono leading-relaxed max-h-[500px] overflow-y-auto">
                      {activeTemplate.content}
                    </pre>
                  </div>
                )}
              </div>
            </Section>

            {/* Graph overview (node distribution) */}
            <Section
              title="Graph Overview"
              icon={<Network size={14} />}
              defaultOpen={false}
            >
              <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {Object.entries(data.overview.node_distribution).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between rounded-lg bg-white/3 border border-[var(--color-border)] px-3 py-2">
                    <NodeTypePill type={type} />
                    <span className="text-xs font-mono text-[var(--color-text-muted)]">{count}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2">
                  <span className="text-[10px] font-medium text-blue-400">Total Nodes</span>
                  <span className="text-xs font-mono text-blue-400">{data.overview.total_nodes}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-purple-500/10 border border-purple-500/20 px-3 py-2">
                  <span className="text-[10px] font-medium text-purple-400">Total Edges</span>
                  <span className="text-xs font-mono text-purple-400">{data.overview.total_edges}</span>
                </div>
              </div>
            </Section>
          </>
        )}
      </main>
    </div>
  );
}
