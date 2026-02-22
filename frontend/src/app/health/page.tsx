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
  GitMerge,
  Bug,
  PackageX,
  Terminal,
  Upload,
  Trash2,
  KeyRound,
  UserCheck,
  LogIn,
  Eye,
  EyeOff,
  ExternalLink,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────────────

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

// ── Gauge ──────────────────────────────────────────────────────────────────────

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

// ── Stat Card ──────────────────────────────────────────────────────────────────

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

// ── Section wrapper ────────────────────────────────────────────────────────────

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

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-8 text-[var(--color-text-muted)] text-sm gap-2">
      <CheckCircle2 size={14} className="text-emerald-400" />
      {text}
    </div>
  );
}

// ── Repo Scanner ──────────────────────────────────────────────────────────────

interface IngestedRepo {
  name: string;
  repo_url: string;
  language: string;
  last_ingested: string | null;
}

interface RepoIssue {
  id: string;
  issue_type: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  file_path: string;
  line: number | null;
  suggested_fix: string;
  can_delete: boolean;
  status: string;
}

function issueSeverityBadge(severity: RepoIssue["severity"]) {
  switch (severity) {
    case "critical": return "bg-red-500/15 text-red-400 border border-red-500/25";
    case "warning":  return "bg-amber-500/15 text-amber-400 border border-amber-500/25";
    default:         return "bg-slate-500/15 text-slate-400 border border-slate-500/25";
  }
}

function issueTypeIcon(type: string) {
  switch (type) {
    case "vulnerable_dep":   return <PackageX size={13} className="text-red-400 shrink-0" />;
    case "missing_docstring":
    case "missing_readme":   return <FileText  size={13} className="text-amber-400 shrink-0" />;
    case "todo_comment":     return <AlertTriangle size={13} className="text-yellow-400 shrink-0" />;
    case "high_complexity":  return <Network size={13} className="text-purple-400 shrink-0" />;
    case "redundant_file":   return <Trash2  size={13} className="text-slate-400 shrink-0" />;
    default:                 return <Bug     size={13} className="text-sky-400 shrink-0" />;
  }
}

// ── Page ───────────────────────────────────────────────────────────────────────

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

  // ── auto-doc state ────────────────────────────────────────────────────────
  const [docSuggestions, setDocSuggestions] = useState<Record<string, string>>({});
  const [loadingDoc,     setLoadingDoc]     = useState<Record<string, boolean>>({});
  const [docUpdates,     setDocUpdates]     = useState<Record<string, string>>({});
  const [loadingUpdate,  setLoadingUpdate]  = useState<Record<string, boolean>>({});

  // ── template state ────────────────────────────────────────────────────────
  const [activeTemplate,  setActiveTemplate]  = useState<{ type: string; name: string; description: string; content: string } | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  // ── copy-to-clipboard state ───────────────────────────────────────────────
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
      setDocSuggestions(prev => ({ ...prev, [key]: "Failed to generate — check API connection." }));
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
      setDocUpdates(prev => ({ ...prev, [key]: "Failed to generate — check API connection." }));
    } finally {
      setLoadingUpdate(prev => ({ ...prev, [key]: false }));
    }
  }, []);

  // ── repo scanner state ─────────────────────────────────────────────────────
  const [ingestedRepos,  setIngestedRepos]  = useState<IngestedRepo[]>([]);
  const [reposLoading,   setReposLoading]   = useState(false);
  const [selectedRepo,   setSelectedRepo]   = useState<IngestedRepo | null>(null);
  const [scanLoading,    setScanLoading]    = useState(false);
  const [scanIssues,     setScanIssues]     = useState<RepoIssue[]>([]);
  const [cloneDir,       setCloneDir]       = useState("");
  const [scanError,      setScanError]      = useState<string | null>(null);
  const [accepting,      setAccepting]      = useState<Record<string, boolean>>({});
  const [accepted,       setAccepted]       = useState<Record<string, "ok" | "fail">>({});

  // ── GitHub auth + push state ───────────────────────────────────────────
  type PushStep = "idle" | "confirm" | "auth" | "verifying" | "verified" | "pushing" | "done";
  const [pushStep, setPushStep]   = useState<PushStep>("idle");
  const [ghToken,       setGhToken]       = useState("");
  const [ghUsername,    setGhUsername]    = useState("");
  const [showToken,     setShowToken]     = useState(false);
  const [ghUser,        setGhUser]        = useState<{
    login: string; name: string; avatar_url: string;
    scopes: string[]; has_repo_scope: boolean;
  } | null>(null);
  const [tokenError,    setTokenError]    = useState<string | null>(null);
  const [pushMessage,   setPushMessage]   = useState("");
  const [pushResult,    setPushResult]    = useState<{ success: boolean; stdout: string; stderr: string } | null>(null);

  const resetPushFlow = useCallback(() => {
    setPushStep("idle");
    setGhToken("");
    setGhUser(null);
    setTokenError(null);
    setPushResult(null);
    setPushMessage("");
  }, []);

  // Load ingested repos on mount
  useEffect(() => {
    setReposLoading(true);
    fetch(`${API}/knowledge-health/ingested-repos`)
      .then(r => r.json())
      .then(j => setIngestedRepos(j.repos ?? []))
      .catch(() => {})
      .finally(() => setReposLoading(false));
  }, []);

  const handleSelectRepo = useCallback((repo: IngestedRepo) => {
    setSelectedRepo(repo);
    setScanIssues([]);
    setAccepted({});
    setScanError(null);
    resetPushFlow();
  }, [resetPushFlow]);

  const runScan = useCallback(async () => {
    if (!selectedRepo) return;
    setScanLoading(true);
    setScanError(null);
    setScanIssues([]);
    setAccepted({});
    setPushResult(null);
    resetPushFlow();
    try {
      const res = await fetch(`${API}/knowledge-health/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_url: selectedRepo.repo_url }),
      });
      if (!res.ok) throw new Error(`Scan failed: ${res.status}`);
      const json = await res.json();
      setScanIssues(json.issues ?? []);
      setCloneDir(json.clone_dir ?? "");
    } catch (e: unknown) {
      setScanError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanLoading(false);
    }
  }, [selectedRepo, resetPushFlow]);

  const acceptFix = useCallback(async (issue: RepoIssue) => {
    setAccepting(prev => ({ ...prev, [issue.id]: true }));
    try {
      const res = await fetch(`${API}/knowledge-health/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issue, clone_dir: cloneDir }),
      });
      const json = await res.json();
      setAccepted(prev => ({ ...prev, [issue.id]: json.applied ? "ok" : "fail" }));
    } catch {
      setAccepted(prev => ({ ...prev, [issue.id]: "fail" }));
    } finally {
      setAccepting(prev => ({ ...prev, [issue.id]: false }));
    }
  }, [cloneDir]);

  const verifyToken = useCallback(async () => {
    if (!ghToken.trim()) return;
    setPushStep("verifying");
    setTokenError(null);
    try {
      const res = await fetch(`${API}/knowledge-health/verify-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ github_token: ghToken.trim(), github_username: ghUsername.trim() }),
      });
      const json = await res.json();
      if (json.valid) {
        setGhUser(json);
        setPushStep("verified");
      } else {
        setTokenError(json.error ?? "Token validation failed.");
        setPushStep("auth");
      }
    } catch (e: unknown) {
      setTokenError(e instanceof Error ? e.message : "Network error");
      setPushStep("auth");
    }
  }, [ghToken, ghUsername]);

  const pushFixes = useCallback(async () => {
    setPushStep("pushing");
    setPushResult(null);
    try {
      const res = await fetch(`${API}/knowledge-health/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clone_dir:       cloneDir,
          message:         pushMessage.trim(),
          github_token:    ghToken.trim(),
          github_username: ghUsername.trim(),
        }),
      });
      const json = await res.json();
      setPushResult(json);
      setPushStep("done");
    } catch (e: unknown) {
      setPushResult({ success: false, stdout: "", stderr: e instanceof Error ? e.message : "Push failed" });
      setPushStep("done");
    }
  }, [cloneDir, ghToken, ghUsername, pushMessage]);

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
                  Documentation coverage · Gaps · Staleness
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
            <span className="text-sm">Analysing knowledge graph…</span>
          </div>
        )}

        {/* ── Repo Scanner ─────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <GitMerge size={12} className="text-white" />
            </div>
            <h2 className="text-sm font-semibold">Repo Health Scanner</h2>
            <span className="text-[10px] text-[var(--color-text-muted)] ml-1">
              Clone · Detect · Fix · Commit
            </span>
          </div>

          <div className="p-5 space-y-4">
            {/* Ingested repo picker */}
            {reposLoading ? (
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] py-2">
                <Loader2 size={12} className="animate-spin" /> Loading ingested repositories…
              </div>
            ) : ingestedRepos.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
                <AlertTriangle size={13} />
                No ingested repositories found. Ingest a repository first from the main dashboard.
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                  Select an ingested repository to scan
                </p>
                <div className="grid gap-2">
                  {ingestedRepos.map(repo => (
                    <button
                      key={repo.repo_url}
                      onClick={() => handleSelectRepo(repo)}
                      className={`w-full flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
                        selectedRepo?.repo_url === repo.repo_url
                          ? "border-violet-500/60 bg-violet-500/10"
                          : "border-[var(--color-border)] bg-[var(--color-background)] hover:border-violet-500/30 hover:bg-white/2"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${
                          selectedRepo?.repo_url === repo.repo_url ? "bg-violet-400" : "bg-slate-600"
                        }`} />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[var(--color-text-primary)] truncate">{repo.name}</p>
                          <p className="text-[10px] text-[var(--color-text-muted)] font-mono truncate">{repo.repo_url}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        {repo.language && (
                          <span className="text-[10px] bg-white/5 border border-[var(--color-border)] px-1.5 py-0.5 rounded text-[var(--color-text-muted)]">
                            {repo.language}
                          </span>
                        )}
                        {selectedRepo?.repo_url === repo.repo_url && (
                          <button
                            onClick={e => { e.stopPropagation(); runScan(); }}
                            disabled={scanLoading}
                            className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors disabled:opacity-50"
                          >
                            {scanLoading
                              ? <Loader2 size={10} className="animate-spin" />
                              : <Terminal size={10} />}
                            {scanLoading ? "Scanning…" : "Scan"}
                          </button>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Scan error */}
            {scanError && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <XCircle size={13} /> {scanError}
              </div>
            )}

            {/* Summary bar */}
            {scanIssues.length > 0 && (() => {
              const critical = scanIssues.filter(i => i.severity === "critical").length;
              const warning  = scanIssues.filter(i => i.severity === "warning").length;
              const info     = scanIssues.filter(i => i.severity === "info").length;
              const acceptedCount = Object.values(accepted).filter(v => v === "ok").length;
              return (
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-[var(--color-text-muted)]">Found {scanIssues.length} issues:</span>
                  {critical > 0 && <span className="bg-red-500/15 text-red-400 border border-red-500/25 px-2 py-0.5 rounded-full">{critical} critical</span>}
                  {warning  > 0 && <span className="bg-amber-500/15 text-amber-400 border border-amber-500/25 px-2 py-0.5 rounded-full">{warning} warning</span>}
                  {info     > 0 && <span className="bg-slate-500/15 text-slate-400 border border-slate-500/25 px-2 py-0.5 rounded-full">{info} info</span>}
                  {acceptedCount > 0 && <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 px-2 py-0.5 rounded-full">{acceptedCount} fix{acceptedCount > 1 ? "es" : ""} applied</span>}
                </div>
              );
            })()}

            {/* Issues list */}
            {scanIssues.length > 0 && (
              <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                {(["critical", "warning", "info"] as const).map(sev =>
                  scanIssues
                    .filter(i => i.severity === sev)
                    .map(issue => (
                      <div
                        key={issue.id}
                        className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 hover:border-violet-500/20 transition-colors"
                      >
                        <div className="mt-0.5">{issueTypeIcon(issue.issue_type)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-0.5">
                            <span className="text-xs font-medium text-[var(--color-text-primary)] truncate">
                              {issue.title}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${issueSeverityBadge(issue.severity)}`}>
                              {issue.severity}
                            </span>
                          </div>
                          {issue.file_path && (
                            <p className="text-[10px] text-[var(--color-text-muted)] font-mono mb-1">
                              {issue.file_path}{issue.line ? `:${issue.line}` : ""}
                            </p>
                          )}
                          <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">
                            {issue.suggested_fix}
                          </p>
                        </div>
                        <div className="shrink-0">
                          {accepted[issue.id] === "ok" ? (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                              <CheckCircle2 size={12} /> Applied
                            </span>
                          ) : accepted[issue.id] === "fail" ? (
                            <span className="flex items-center gap-1 text-[10px] text-red-400">
                              <XCircle size={12} /> Failed
                            </span>
                          ) : (
                            <button
                              onClick={() => acceptFix(issue)}
                              disabled={accepting[issue.id]}
                              className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded bg-violet-600/20 hover:bg-violet-600/40 text-violet-300 border border-violet-500/25 transition-colors disabled:opacity-50"
                            >
                              {accepting[issue.id]
                                ? <Loader2 size={10} className="animate-spin" />
                                : <Check size={10} />}
                              Apply Fix
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                )}
              </div>
            )}

            {/* ── GitHub Auth + Commit/Push wizard ─────────────────────────────── */}
            {accepted && Object.values(accepted).some(v => v === "ok") && (              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] overflow-hidden">

                {/* ── idle: entry button ── */}
                {pushStep === "idle" && (
                  <button
                    onClick={() => setPushStep("confirm")}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/3 transition-colors group"
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Upload size={14} className="text-emerald-400" />
                      <span>Commit &amp; Push fixes to GitHub</span>
                      <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 px-1.5 py-0.5 rounded-full">
                        {Object.values(accepted).filter(v => v === "ok").length} fix{Object.values(accepted).filter(v => v === "ok").length > 1 ? "es" : ""} ready
                      </span>
                    </div>
                    <ChevronDown size={14} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)] transition-colors" />
                  </button>
                )}

                {/* ── confirm step ── */}
                {pushStep === "confirm" && (
                  <div className="p-5 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
                        <Upload size={14} className="text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[var(--color-text-primary)]">Push fixes to the remote repository?</p>
                        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                          {Object.values(accepted).filter(v => v === "ok").length} fix{Object.values(accepted).filter(v => v === "ok").length > 1 ? "es have" : " has"} been applied to the local clone.
                          This will commit them and push to <span className="font-mono text-[var(--color-text-primary)]">origin</span>.
                        </p>
                      </div>
                    </div>

                    {/* Applied fixes summary */}
                    <div className="rounded-lg bg-white/3 border border-[var(--color-border)] divide-y divide-[var(--color-border)] max-h-40 overflow-y-auto">
                      {scanIssues
                        .filter(i => accepted?.[i.id] === "ok")
                        .map(i => (
                          <div key={i.id} className="flex items-center gap-2 px-3 py-2">
                            {issueTypeIcon(i.issue_type)}
                            <span className="text-xs text-[var(--color-text-primary)] truncate flex-1">{i.title}</span>
                            <span className="text-[10px] text-emerald-400 shrink-0">✓ applied</span>
                          </div>
                        ))}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setPushStep("auth")}
                        className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
                      >
                        <LogIn size={12} /> Yes, authenticate &amp; push
                      </button>
                      <button
                        onClick={resetPushFlow}
                        className="text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-[var(--color-text-muted)] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* ── auth step ── */}
                {pushStep === "auth" && (
                  <div className="p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <KeyRound size={14} className="text-amber-400" />
                      <h3 className="text-sm font-semibold">GitHub Authentication</h3>
                    </div>

                    <div className="rounded-lg bg-amber-500/8 border border-amber-500/20 px-4 py-3 text-xs text-amber-300 space-y-1">
                      <p className="font-medium">A Personal Access Token (PAT) is required to push.</p>
                      <p className="text-amber-400/70">
                        Your token is never stored — it is used only to authenticate this single push and then discarded.
                      </p>
                      <a
                        href="https://github.com/settings/tokens/new?scopes=repo&description=SPIT+Health+Scanner"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200 underline underline-offset-2 mt-1"
                      >
                        Create a token on GitHub <ExternalLink size={10} />
                      </a>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-1 block">
                          GitHub Username <span className="normal-case font-normal">(optional — used in remote URL)</span>
                        </label>
                        <input
                          type="text"
                          placeholder="your-github-username"
                          value={ghUsername}
                          onChange={e => setGhUsername(e.target.value)}
                          autoComplete="username"
                          className="w-full text-sm px-3 py-2 rounded-lg bg-[var(--color-background)] border border-[var(--color-border)] focus:outline-none focus:border-amber-500/60 placeholder:text-[var(--color-text-muted)]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-1 block">
                          Personal Access Token <span className="text-red-400">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showToken ? "text" : "password"}
                            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                            value={ghToken}
                            onChange={e => setGhToken(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && ghToken.trim() && verifyToken()}
                            autoComplete="current-password"
                            className="w-full text-sm px-3 py-2 pr-9 rounded-lg bg-[var(--color-background)] border border-[var(--color-border)] focus:outline-none focus:border-amber-500/60 font-mono placeholder:font-sans placeholder:text-[var(--color-text-muted)]"
                          />
                          <button
                            type="button"
                            onClick={() => setShowToken(p => !p)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                          >
                            {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {tokenError && (
                      <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                        <XCircle size={12} /> {tokenError}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={verifyToken}
                        disabled={!ghToken.trim()}
                        className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <UserCheck size={12} /> Verify Token
                      </button>
                      <button
                        onClick={resetPushFlow}
                        className="text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-[var(--color-text-muted)] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* ── verifying ── */}
                {pushStep === "verifying" && (
                  <div className="flex items-center justify-center gap-3 py-8 text-[var(--color-text-muted)] text-sm">
                    <Loader2 size={16} className="animate-spin text-amber-400" />
                    Verifying token with GitHub…
                  </div>
                )}

                {/* ── verified: confirm push ── */}
                {pushStep === "verified" && ghUser && (
                  <div className="p-5 space-y-4">
                    {/* User card */}
                    <div className="flex items-center gap-3 rounded-lg bg-emerald-500/8 border border-emerald-500/20 px-4 py-3">
                      {ghUser.avatar_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={ghUser.avatar_url} alt={ghUser.login} className="w-8 h-8 rounded-full border border-emerald-500/30" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-emerald-300">{ghUser.name || ghUser.login}</p>
                        <p className="text-[10px] text-emerald-400/70 font-mono">@{ghUser.login}</p>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-emerald-400">
                        <UserCheck size={11} />
                        Authenticated
                      </div>
                    </div>

                    {!ghUser.has_repo_scope && (
                      <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                        <span>This token does not have the <code className="font-mono">repo</code> scope. The push may fail for private repositories.</span>
                      </div>
                    )}

                    <div>
                      <label className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-1 block">
                        Commit message <span className="normal-case font-normal">(optional)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="chore: apply SPIT health fixes"
                        value={pushMessage}
                        onChange={e => setPushMessage(e.target.value)}
                        className="w-full text-sm px-3 py-2 rounded-lg bg-[var(--color-background)] border border-[var(--color-border)] focus:outline-none focus:border-emerald-500/60 placeholder:text-[var(--color-text-muted)]"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={pushFixes}
                        className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
                      >
                        <Upload size={12} /> Commit &amp; Push
                      </button>
                      <button
                        onClick={() => setPushStep("auth")}
                        className="text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-[var(--color-text-muted)] transition-colors"
                      >
                        Use different token
                      </button>
                      <button
                        onClick={resetPushFlow}
                        className="text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-[var(--color-text-muted)] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* ── pushing ── */}
                {pushStep === "pushing" && (
                  <div className="flex items-center justify-center gap-3 py-8 text-[var(--color-text-muted)] text-sm">
                    <Loader2 size={16} className="animate-spin text-emerald-400" />
                    Committing and pushing to GitHub…
                  </div>
                )}

                {/* ── done ── */}
                {pushStep === "done" && pushResult && (
                  <div className="p-5 space-y-3">
                    <div className={`rounded-lg border px-4 py-3 text-xs space-y-1.5 ${
                      pushResult.success
                        ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                        : "bg-red-500/10 border-red-500/25 text-red-300"
                    }`}>
                      <p className="font-semibold text-sm">
                        {pushResult.success ? "✓ Push successful!" : "✗ Push failed"}
                      </p>
                      {pushResult.stdout && (
                        <pre className="font-mono text-[10px] opacity-70 whitespace-pre-wrap">{pushResult.stdout}</pre>
                      )}
                      {pushResult.stderr && (
                        <pre className="font-mono text-[10px] opacity-70 whitespace-pre-wrap">{pushResult.stderr}</pre>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {!pushResult.success && (
                        <button
                          onClick={() => setPushStep("verified")}
                          className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[var(--color-text-muted)] transition-colors"
                        >
                          Retry
                        </button>
                      )}
                      <button
                        onClick={resetPushFlow}
                        className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[var(--color-text-muted)] transition-colors"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Empty state after scan */}
            {!scanLoading && scanIssues.length === 0 && !scanError && !selectedRepo && (
              <p className="text-xs text-[var(--color-text-muted)] text-center py-3">
                Select a repository above to scan for missing docs, vulnerable deps, TODO markers, and more.
              </p>
            )}
            {!scanLoading && scanIssues.length === 0 && !scanError && selectedRepo && cloneDir !== "" && (
              <div className="flex items-center justify-center gap-2 py-4 text-emerald-400 text-sm">
                <CheckCircle2 size={15} /> No issues found — repository is healthy!
              </div>
            )}
          </div>
        </div>

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
                            {g.parent || "—"}
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
                <EmptyState text="All docs are current — nothing outdated!" />
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
                          <div className="col-span-2 text-[11px] text-[var(--color-text-muted)] truncate">{d.service || "—"}</div>
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
                              : "—"}
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
                  <EmptyState text="Every node is connected — great!" />
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
                    <span className="text-xs">Loading template…</span>
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
