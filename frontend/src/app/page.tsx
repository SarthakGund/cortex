"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Send,
  Database,
  RefreshCw,
  GitBranch,
  Zap,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Activity,
  BookOpen,
  Search,
  Sparkles,
  BarChart3,
  Network,
  Code2,
  Info,
  X,
  FolderOpen,
  FileCode2,
  ShieldCheck,
} from "lucide-react";
import { FileTree, TreeNode } from "./components/FileTree";
import { useAuth } from "./context/AuthContext";
import LandingHero from "./components/LandingHero";

import { API_BASE as API } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SourceChunk {
  text: string;
  metadata: { label: string; service: string; name: string };
  score: number;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources?: SourceChunk[];
  contextUsed?: number;
  timestamp: Date;
  isLoading?: boolean;
}

interface VectorStats {
  document_count: number;
  collection_name: string;
  embedding_model: string;
  llm_enabled: boolean;
}

interface CommitSummary {
  hash: string;
  author: string;
  summary: string;
  timestamp: string;
  message: string;
  service: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2);
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function scoreColor(score: number) {
  if (score >= 0.8) return "text-emerald-400 bg-emerald-400/10 border-emerald-400/20";
  if (score >= 0.6) return "text-blue-400 bg-blue-400/10 border-blue-400/20";
  if (score >= 0.4) return "text-amber-400 bg-amber-400/10 border-amber-400/20";
  return "text-[var(--color-text-muted)] bg-[var(--color-surface)] border-[var(--color-border)]";
}

function labelIcon(label: string) {
  const map: Record<string, string> = {
    Service: "🧩",
    Module: "📦",
    File: "📄",
    Class: "🏛️",
    Function: "⚡",
    Schema: "🗂️",
    Endpoint: "🔗",
    Database: "🗄️",
    Relationship: "↔️",
  };
  return map[label] ?? "📌";
}

// ── Simple markdown renderer (no external dep needed) ─────────────────────────

function renderMarkdown(text: string): string {
  return text
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_: string, lang: string, code: string) =>
      `<pre><code class="language-${lang}">${code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>`
    )
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^\- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/^(?!<[hpuol])(.+)$/gm, (m: string) => (m.trim() ? `<p>${m}</p>` : ""));
}

// ── Components ────────────────────────────────────────────────────────────────

function StatusBadge({
  ok,
  label,
}: {
  ok: boolean;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 swiss-pill ${ok
        ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
        : "bg-[var(--color-destructive)] text-[var(--color-destructive-foreground)]"
        }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-red-400"}`} />
      {label}
    </span>
  );
}

function SourceCard({ chunk, index }: { chunk: SourceChunk; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="swiss-card overflow-hidden transition-all duration-200">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-muted)] transition-colors text-left"
        aria-expanded={open}
      >
        <span className="text-lg">{labelIcon(chunk.metadata.label)}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
              {chunk.metadata.label}
            </span>
            {chunk.metadata.name && (
              <span className="text-xs font-medium text-[var(--color-text-secondary)] truncate max-w-[200px]">
                {chunk.metadata.name}
              </span>
            )}
            {chunk.metadata.service && (
              <span className="text-xs text-[var(--color-text-muted)]">
                · {chunk.metadata.service}
              </span>
            )}
          </div>
        </div>
        <span
          className={`text-xs font-bold px-2 py-0.5 rounded-full border ${scoreColor(chunk.score)}`}
        >
          {(chunk.score * 100).toFixed(0)}%
        </span>
        <span className="text-[var(--color-muted-foreground)] ml-1">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>
      {open && (
        <div className="swiss-divider px-4 py-3 fade-in-up">
          <pre className="text-xs text-[var(--color-foreground)] whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
            {chunk.text}
          </pre>
        </div>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 bg-[var(--color-accent)] rounded-full"
          style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
      <style jsx>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: 0.3; }
          50% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  const isSystem = msg.role === "system";
  const [showSources, setShowSources] = useState(false);

  if (isSystem) {
    return (
      <div className="flex justify-center my-2 fade-in-up">
        <div className="flex items-center gap-2 text-xs swiss-pill px-4 py-1.5">
          <Info size={12} />
          <span>{msg.content}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex gap-3 my-4 fade-in-up ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shadow-lg ${isUser
          ? "bg-gradient-to-br from-blue-500 to-purple-600"
          : "bg-gradient-to-br from-slate-700 to-slate-800 border border-[var(--color-border)]"
          }`}
      >
        {isUser ? "U" : <Sparkles size={16} className="text-blue-400" />}
      </div>

      <div className={`flex flex-col gap-1.5 max-w-[80%] ${isUser ? "items-end" : "items-start"}`}>
        {/* Bubble */}
        <div
          className={`px-4 py-3 ${isUser
            ? "swiss-button"
            : "swiss-card"
            }`}
        >
          {msg.isLoading ? (
            <TypingIndicator />
          ) : isUser ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
          ) : (
            <div
              className="prose-answer text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
          <span>{formatTime(msg.timestamp)}</span>
          {msg.sources && msg.sources.length > 0 && (
            <button
              onClick={() => setShowSources((s) => !s)}
              className="flex items-center gap-1 text-[var(--color-primary)] hover:opacity-80 transition-colors"
            >
              <BookOpen size={11} />
              {msg.sources.length} source{msg.sources.length > 1 ? "s" : ""}
              {showSources ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
          )}
          {msg.contextUsed !== undefined && (
            <span className="text-[var(--color-muted-foreground)]">
              {msg.contextUsed} chunks used
            </span>
          )}
        </div>

        {/* Sources */}
        {showSources && msg.sources && (
          <div className="w-full space-y-2 fade-in-up">
            {msg.sources.map((s, i) => (
              <SourceCard key={i} chunk={s} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab: Ingest ────────────────────────────────────────────────────────────────

function IngestTab() {
  const [repoUrl, setRepoUrl] = useState("");
  const [status, setStatus] = useState<null | { type: "success" | "error" | "info"; text: string }>(null);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [stats, setStats] = useState<VectorStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const { user: githubUser, token: githubToken, logout: handleGithubLogout } = useAuth();
  const githubConnected = !!(githubUser || githubToken);
  const authHeaders = useMemo((): Record<string, string> => {
    if (!githubToken) return {};
    return { Authorization: `Bearer ${githubToken}` };
  }, [githubToken]);
  // Multi-repo state
  const [multiMode, setMultiMode] = useState(false);
  const [repoList, setRepoList] = useState<string[]>([""]);
  const [incremental, setIncremental] = useState(true);
  const [ingestResult, setIngestResult] = useState<{ files_processed?: number; files_skipped?: number } | null>(null);
  const [ingestionSuccess, setIngestionSuccess] = useState(false);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const r = await fetch(`${API}/rag/stats`, { headers: authHeaders, credentials: "include" });
      if (r.ok) setStats(await r.json());
    } catch {
      /* ignore */
      
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setIngestResult(null);
    setStatus({ type: "info", text: "Fetching repository from GitHub API and ingesting…" });
    try {
      let repoId: number | null = null;
      if (repoUrl.trim()) {
        const addRepo = await fetch(`${API}/repos`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          credentials: "include",
          body: JSON.stringify({ repo_url: repoUrl.trim() }),
        });
        if (addRepo.ok) {
          const addData = await addRepo.json();
          repoId = addData.repo?.id ?? null;
          if (repoId) {
            await fetch(`${API}/repos/select`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...authHeaders },
              credentials: "include",
              body: JSON.stringify({ repo_id: repoId }),
            });
            if (typeof window !== "undefined") {
              window.dispatchEvent(new Event("repos:updated"));
            }
          }
        }
      }

      const r = await fetch(`${API}/ingest/github`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        credentials: "include",
        body: JSON.stringify({ repo_url: repoUrl, github_token: githubToken, repo_id: repoId ?? undefined }),
        // body: JSON.stringify({ repo_url: repoUrl, incremental }),
      });
      const d = await r.json();
      setStatus({ type: "success", text: d.message });
      setIngestionSuccess(true);
      await fetchStats();
      if (d.files_processed !== undefined) setIngestResult({ files_processed: d.files_processed, files_skipped: d.files_skipped });
    } catch (err) {
      setStatus({ type: "error", text: `Failed: ${err}` });
    } finally {
      setLoading(false);
    }
  };

  const handleMultiIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    const urls = repoList.filter((u) => u.trim());
    if (!urls.length) return;
    setLoading(true);
    setIngestResult(null);
    setStatus({ type: "info", text: `Ingesting ${urls.length} repositories with cross-repo dependency discovery…` });
    try {
      const r = await fetch(`${API}/ingest/multi`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        credentials: "include",
        body: JSON.stringify({ repos: urls.map((u) => ({ repo_url: u, incremental })) }),
      });
      const d = await r.json();
      setStatus({ type: "success", text: d.message || `Multi-repo ingestion started for ${urls.length} repos` });
      setIngestionSuccess(true);
      await fetchStats();
    } catch (err) {
      setStatus({ type: "error", text: `Failed: ${err}` });
    } finally {
      setLoading(false);
    }
  };

  const addRepoSlot = () => setRepoList((prev) => [...prev, ""]);
  const removeRepoSlot = (idx: number) => setRepoList((prev) => prev.filter((_, i) => i !== idx));
  const updateRepoSlot = (idx: number, val: string) => setRepoList((prev) => prev.map((v, i) => (i === idx ? val : v)));

  const handleClearVectorDB = async () => {
    if (!confirm("Delete all documents from the vector store? This cannot be undone.")) return;
    setClearing(true);
    setStatus({ type: "info", text: "Clearing vector store…" });
    try {
      const r = await fetch(`${API}/rag/clear`, { method: "DELETE", headers: authHeaders, credentials: "include" });
      const d = await r.json();
      setStatus({ type: d.status === "success" || d.status === "ok" ? "success" : "error", text: d.message });
      await fetchStats();
    } catch (err) {
      setStatus({ type: "error", text: `Clear failed: ${err}` });
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            icon: <Network size={18} className="text-blue-400" />,
            label: "Vector Docs",
            value: statsLoading ? "…" : (stats?.document_count ?? "—"),
            sub: "stored",
          },
          {
            icon: <Database size={18} className="text-purple-400" />,
            label: "Collection",
            value: stats?.collection_name ?? "—",
            sub: "ChromaDB",
          },
          {
            icon: <Code2 size={18} className="text-cyan-400" />,
            label: "Embeddings",
            value: stats ? "MiniLM" : "—",
            sub: "all-MiniLM-L6-v2",
          },
          // {
          //   icon: <Sparkles size={18} className="text-amber-400" />,
          //   label: "LLM",
          //   value: stats?.llm_enabled ? "Gemini" : "Disabled",
          //   sub: stats?.llm_enabled ? "2.0 Flash" : "set API key",
          // },
        ].map((card, i) => (
          <div
            key={i}
            className="swiss-card p-4 flex flex-col gap-1"
          >
            <div className="flex items-center justify-between mb-1">
              {card.icon}
              <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">
                {card.label}
              </span>
            </div>
            <p className="text-xl font-bold text-[var(--color-text-primary)] truncate">
              {String(card.value)}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Mode Toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setMultiMode(false)}
          className={`flex items-center gap-2 text-xs font-medium px-4 py-2 transition-all ${!multiMode
            ? "swiss-button"
            : "swiss-button-ghost"
          }`}
        >
          <GitBranch size={14} /> Single Repo
        </button>
        <button
          onClick={() => setMultiMode(true)}
          className={`flex items-center gap-2 text-xs font-medium px-4 py-2 transition-all ${multiMode
            ? "swiss-button"
            : "swiss-button-ghost"
          }`}
        >
          <Network size={14} /> Multi-Repo
        </button>
        {/* <label className="ml-auto flex items-center gap-2 text-xs text-[var(--color-text-secondary)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={incremental}
            onChange={(e) => setIncremental(e.target.checked)}
            className="rounded border-[var(--color-border)] bg-[var(--color-surface)] text-blue-500 focus:ring-blue-500"
          />
          Incremental (skip unchanged)
        </label> */}
      </div>

      {/* Ingest Form — Single */}
{!multiMode && (
  <div className="swiss-card p-6">
    {/* Header Section */}
    <div className="flex items-center gap-3 mb-5">
      <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <GitBranch size={18} className="text-blue-400" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
          Ingest Repository
        </h2>
        <p className="text-xs text-[var(--color-text-muted)]">
          Fetch code from GitHub API and build the Knowledge Graph in Neo4j — no local clone needed
        </p>
      </div>
    </div>

    {/* GitHub Connection Status */}
    <div className="swiss-panel flex items-center justify-between mb-5 p-3">
      <div className="flex items-center gap-3">
        <Code2 size={16} className={githubConnected ? "text-emerald-400" : "text-[var(--color-text-muted)]"} />
        <div>
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">
            {githubConnected ? "GitHub Connected" : "GitHub OAuth Not Connected"}
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Connect to access private repos &amp; attach webhooks.
          </p>
        </div>
      </div>
      {githubConnected ? (
        <button
          type="button"
          onClick={handleGithubLogout}
          className="text-xs font-medium px-2 py-1 swiss-button-ghost"
        >
          Disconnect
        </button>
      ) : (
        <a
          href={`${API}/auth/github/login`}
          className="text-xs font-semibold px-3 py-1.5 swiss-button-ghost"
        >
          Connect GitHub
        </a>
      )}
    </div>

    {/* Ingest Form */}
    <form onSubmit={handleIngest} className="space-y-4">
      <div>
        <label htmlFor="repo-url-input" className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
          GitHub Repository URL
        </label>
        <div className="relative">
          <GitBranch
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
          />
          <input
            id="repo-url-input"
            type="url"
            required
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/username/repository"
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-all text-sm"
          />
        </div>
      </div>

      <button
        id="ingest-btn"
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-3 px-6 font-semibold text-sm swiss-button disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Ingesting…
          </>
        ) : (
          <>
            <Zap size={16} />
            Ingest Repository
          </>
        )}
      </button>
    </form>
  </div>
)}

      {/* Ingest Form — Multi-Repo */}
      {multiMode && (
        <div className="swiss-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
              <Network size={18} className="text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                Multi-Repo Ingestion
              </h2>
              <p className="text-xs text-[var(--color-text-muted)]">
                Ingest multiple repositories and discover cross-repo dependencies automatically
              </p>
            </div>
          </div>

          <form onSubmit={handleMultiIngest} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                Repository URLs
              </label>
              {repoList.map((url, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs font-mono text-[var(--color-text-muted)] w-5 text-right">{idx + 1}.</span>
                  <div className="relative flex-1">
                    <GitBranch
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
                    />
                    <input
                      type="url"
                      required
                      value={url}
                      onChange={(e) => updateRepoSlot(idx, e.target.value)}
                      placeholder="https://github.com/org/service"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-all text-sm"
                    />
                  </div>
                  {repoList.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRepoSlot(idx)}
                      className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addRepoSlot}
                className="flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors mt-1"
              >
                <span className="text-lg leading-none">+</span> Add repository
              </button>
            </div>

            <button
              type="submit"
              disabled={loading || repoList.filter((u) => u.trim()).length === 0}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 font-semibold text-sm swiss-button disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Ingesting {repoList.filter((u) => u.trim()).length} repos…
                </>
              ) : (
                <>
                  <Zap size={16} />
                  Ingest {repoList.filter((u) => u.trim()).length} Repositories
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Incremental Ingest Result */}
      {ingestResult && (
        <div className="flex items-center gap-4 p-4 bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl fade-in-up">
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 size={16} />
            <span className="font-semibold">{ingestResult.files_processed}</span>
            <span className="text-[var(--color-text-muted)]">files processed</span>
          </div>
          {!!ingestResult.files_skipped && (
            <div className="flex items-center gap-2 text-sm text-amber-400">
              <Activity size={16} />
              <span className="font-semibold">{ingestResult.files_skipped}</span>
              <span className="text-[var(--color-text-muted)]">unchanged (skipped)</span>
            </div>
          )}
        </div>
      )}

      {/* Vector Store Status */}
      <div className="flex items-center justify-between px-4 py-3 bg-[var(--color-card)] border border-[var(--color-border)] rounded-2xl">
        <div className="flex items-center gap-3">
          <Database size={16} className="text-purple-400" />
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
            <BarChart3 size={14} className="text-purple-400" />
            <span>{stats?.document_count ?? 0} documents indexed</span>
            <span className="text-[var(--color-text-muted)] text-xs">· auto-synced on ingest</span>
          </div>
          <StatusBadge ok={(stats?.document_count ?? 0) > 0} label={(stats?.document_count ?? 0) > 0 ? "Ready" : "Empty"} />
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={ingestionSuccess || (stats?.document_count ?? 0) > 0 ? "/graph" : "#"}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              ingestionSuccess || (stats?.document_count ?? 0) > 0
                ? "text-blue-400 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20"
                : "text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border)] opacity-50 cursor-not-allowed pointer-events-none"
            }`}
          >
            <Network size={13} />
            View Graph
          </Link>
          <button
            onClick={fetchStats}
            disabled={statsLoading}
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-glow)] transition-all"
            title="Refresh stats"
          >
            <RefreshCw size={13} className={statsLoading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={handleClearVectorDB}
            disabled={clearing || (stats?.document_count ?? 0) === 0}
            title="Delete all documents from the vector store"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {clearing ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
            Clear DB
          </button>
        </div>
      </div>

      {/* Status Banner */}
      {status && (
        <div
          className={`flex items-start gap-3 p-4 rounded-xl border fade-in-up ${status.type === "success"
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
            : status.type === "error"
              ? "bg-red-500/10 border-red-500/20 text-red-300"
              : "bg-blue-500/10 border-blue-500/20 text-blue-300"
            }`}
        >
          {status.type === "success" ? (
            <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
          ) : status.type === "error" ? (
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          ) : (
            <Loader2 size={16} className="flex-shrink-0 mt-0.5 animate-spin" />
          )}
          <p className="text-sm">{status.text}</p>
          <button onClick={() => setStatus(null)} className="ml-auto flex-shrink-0 opacity-60 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Tab: Chat (RAG Q&A) ────────────────────────────────────────────────────────

function ChatTab() {
  const { token } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: uid(),
      role: "system",
      content: "Knowledge Graph Q&A active — type a question below",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [topK, setTopK] = useState(8);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const authHeaders = useMemo((): Record<string, string> => {
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }, [token]);

  // useEffect(() => {
  //   bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  // }, [messages]);

  const autoResize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  };

  const handleSend = async () => {
    const q = input.trim();
    if (!q || loading) return;

    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const userMsg: Message = { id: uid(), role: "user", content: q, timestamp: new Date() };
    const placeholderId = uid();
    const placeholder: Message = {
      id: placeholderId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isLoading: true,
    };

    setMessages((m) => [...m, userMsg, placeholder]);
    setLoading(true);

    try {
      const r = await fetch(`${API}/rag/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        credentials: "include",
        body: JSON.stringify({ question: q, top_k: topK }),
      });

      if (!r.ok) throw new Error(`Server error ${r.status}`);
      const data = await r.json();

      setMessages((m) =>
        m.map((msg) =>
          msg.id === placeholderId
            ? {
              ...msg,
              content: data.answer,
              sources: data.sources,
              contextUsed: data.context_used,
              isLoading: false,
            }
            : msg
        )
      );
    } catch (err) {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === placeholderId
            ? {
              ...msg,
              content: `⚠️ Error: ${err instanceof Error ? err.message : String(err)}`,
              isLoading: false,
            }
            : msg
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: uid(),
        role: "system",
        content: "Chat cleared — start a new conversation",
        timestamp: new Date(),
      },
    ]);
  };

  const suggestions = [
    "What services exist in this codebase?",
    "List all API endpoints and their HTTP methods",
    "Which files define database schemas?",
    "What are the dependencies between services?",
    "Show all Python classes and their files",
    "What functions are defined in the root module?",
  ];

  return (
    <div className="flex flex-col h-full" style={{ height: "calc(100vh - 220px)", minHeight: "500px" }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--color-text-muted)]">Top-K results:</label>
          <select
            value={topK}
            onChange={(e) => setTopK(Number(e.target.value))}
            className="text-xs bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-accent)]"
          >
            {[4, 6, 8, 10, 12, 15, 20].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={clearChat}
          className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-red-400 transition-colors"
        >
          <X size={12} />
          Clear chat
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto border-2 border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 min-h-0">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {/* Suggestions (shown when only system msg) */}
        {messages.length <= 1 && (
          <div className="py-6 fade-in-up">
            <p className="text-center text-sm text-[var(--color-muted-foreground)] mb-4">
              Try asking about your codebase:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInput(s);
                    textareaRef.current?.focus();
                  }}
                  className="text-left text-xs border-2 border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2.5 hover:bg-[var(--color-muted)] transition-all"
                >
                  <Search size={11} className="inline mr-1.5 opacity-60" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="mt-3 flex-shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            id="chat-input"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autoResize();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your codebase… (Enter to send, Shift+Enter for new line)"
            rows={1}
            className="flex-1 border-2 border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2.5 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] resize-none focus:outline-none leading-relaxed"
            style={{ minHeight: "36px", maxHeight: "160px" }}
          />
          <button
            id="send-btn"
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="flex-shrink-0 w-9 h-9 border-2 border-[var(--color-border)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all"
          >
            {loading ? (
              <Loader2 size={16} className="text-white animate-spin" />
            ) : (
              <Send size={16} className="text-white" />
            )}
          </button>
        </div>
        {/* <p className="text-center text-xs text-[var(--color-text-muted)] mt-1.5">
          Powered by Neo4j · ChromaDB · Gemini 2.0 Flash
        </p> */}
      </div>
    </div>
  );
}

// ── Tab: Commits (AI Summaries) ────────────────────────────────────────────────

function CommitsTab() {
  const { token } = useAuth();
  const [commits, setCommits] = useState<CommitSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const authHeaders = useMemo((): Record<string, string> => {
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }, [token]);

  const fetchCommits = useCallback(async () => {
    setLoading(true);
    try {
      if (process.env.NODE_ENV === "development") console.log(`[CommitsTab] Fetching commits from: ${API}/webhook/commits`);
      const r = await fetch(`${API}/webhook/commits`, { headers: authHeaders });
      if (r.ok) {
        const data = await r.json();
        if (process.env.NODE_ENV === "development") console.log(`[CommitsTab] Received ${Array.isArray(data) ? data.length : 0} commits:`, data);
        setCommits(data);
      } else {
        console.error(`[CommitsTab] Failed to fetch commits. Status: ${r.status}`);
        const errorText = await r.text();
        console.error(`[CommitsTab] Error response:`, errorText);
      }
    } catch (err) {
      console.error("[CommitsTab] Failed to fetch commits", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCommits();
  }, [fetchCommits]);


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-1">
            System Evolution
          </h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            AI-generated summaries of recent changes across all services
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchCommits}
            disabled={loading}
            className="p-2.5 rounded-xl border border-[var(--color-border)] hover:bg-black/5 disabled:opacity-50 transition-colors"
            title="Refresh commits"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {loading && commits.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-[var(--color-text-muted)]">
          <Loader2 size={40} className="animate-spin mb-4 opacity-20" />
          <p className="text-sm animate-pulse">Analyzing recent commits…</p>
        </div>
      ) : commits.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-[var(--color-card)] border border-[var(--color-border)] rounded-2xl border-dashed">
          <GitBranch size={40} className="mb-4 text-[var(--color-text-muted)] opacity-20" />
          <h3 className="text-sm font-semibold text-[var(--color-text-secondary)]">No commits detected yet</h3>
          <p className="text-xs text-[var(--color-text-muted)] max-w-[250px] mt-2 leading-relaxed">
            Configure a GitHub webhook to your endpoint to see automated summaries here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {commits.map((c, i) => (
            <div
              key={c.hash + i}
              className="group bg-[var(--color-card)] border border-[var(--color-border)] rounded-2xl p-5 hover:border-blue-500/30 transition-all duration-300 relative overflow-hidden"
            >
              {/* Service Tag */}
              <div className="absolute top-0 right-0 px-4 py-1.5 bg-blue-500/10 border-b border-l border-blue-500/20 rounded-bl-xl text-[10px] font-bold text-blue-400 uppercase tracking-widest">
                {c.service}
              </div>

              <div className="flex gap-4">
                <div className="hidden sm:flex flex-col items-center">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 border border-blue-300 flex items-center justify-center text-blue-700 font-bold">
                    {c.author[0]}
                  </div>
                  <div className="w-0.5 flex-1 bg-gradient-to-b from-blue-200 to-transparent mt-2 rounded-full opacity-50" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
                    <span className="text-sm font-bold text-[var(--color-text-primary)]">{c.author}</span>
                    <span className="text-[10px] text-[var(--color-text-muted)] font-mono bg-black/5 px-2 py-0.5 rounded uppercase">
                      {c.hash.slice(0, 7)}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-muted)]">
                      {new Date(c.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  </div>

                  <p className="text-xs text-black font-medium mb-3 bg-blue-500/5 border border-blue-500/10 rounded-lg px-3 py-2 leading-relaxed">
                    <Sparkles size={12} className="inline mr-2 text-blue-400" />
                    {c.summary}
                  </p>

                  <div className="flex items-start gap-2 text-xs text-[var(--color-text-secondary)]">
                    <MessageSquare size={13} className="mt-0.5 flex-shrink-0 opacity-40" />
                    <p className="italic opacity-80 truncate">{c.message}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Repo Explorer ────────────────────────────────────────────────────────

function ExplorerTab() {
  const { token } = useAuth();
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [loading, setLoading] = useState(false);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedFile, setSelectedFile] = useState<TreeNode | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useMemo((): Record<string, string> => {
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }, [token]);

  const handleFetch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setTree([]);
    setSelectedFile(null);
    setFileContent(null);
    try {
      const r = await fetch(
        `${API}/github/tree?repo_url=${encodeURIComponent(repoUrl)}&branch=${encodeURIComponent(branch)}`,
        { headers: authHeaders, credentials: "include" }
      );
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.detail ?? `HTTP ${r.status}`);
      }
      const data = await r.json();
      setTree(data.nested);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleFileClick = async (node: TreeNode) => {
    setSelectedFile(node);
    setFileContent(null);
    setFileLoading(true);
    try {
      const r = await fetch(
        `${API}/github/file?repo_url=${encodeURIComponent(repoUrl)}&file_path=${encodeURIComponent(node.path)}&branch=${encodeURIComponent(branch)}`,
        { headers: authHeaders, credentials: "include" }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setFileContent(data.content);
    } catch (err) {
      setFileContent(`// Error loading file: ${err}`);
    } finally {
      setFileLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-1">Repo Explorer</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Browse any GitHub repository's file structure and view source files — no local clone needed.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleFetch} className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <GitBranch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="url"
            required
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[var(--color-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
          />
        </div>
        <input
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder="Branch"
          className="w-32 px-3 py-2.5 rounded-xl bg-[var(--color-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:opacity-50 transition-all shadow-lg shadow-blue-500/20"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}
          {loading ? "Loading…" : "Explore"}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Tree + Viewer */}
      {tree.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* File tree panel */}
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
              <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                {repoUrl.split("/").slice(-2).join("/")}
              </span>
              <span className="text-[10px] text-[var(--color-text-muted)]">{total} items</span>
            </div>
            <div className="overflow-y-auto p-2" style={{ maxHeight: "480px" }}>
              <FileTree
                nodes={tree}
                onFileClick={handleFileClick}
                selectedPath={selectedFile?.path}
              />
            </div>
          </div>

          {/* File content panel */}
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
              <FileCode2 size={14} className="text-blue-400" />
              <span className="text-xs font-semibold text-[var(--color-text-secondary)] truncate">
                {selectedFile ? selectedFile.path : "Select a file"}
              </span>
              {fileLoading && <Loader2 size={12} className="animate-spin text-[var(--color-text-muted)] ml-auto" />}
            </div>
            <div className="flex-1 overflow-auto p-4" style={{ maxHeight: "480px" }}>
              {!selectedFile && (
                <p className="text-xs text-[var(--color-text-muted)] text-center mt-12">
                  Click a file in the tree to view its contents
                </p>
              )}
              {selectedFile && !fileLoading && fileContent !== null && (
                <pre className="text-xs text-[var(--color-text-secondary)] font-mono leading-relaxed whitespace-pre-wrap break-words">
                  {fileContent}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = "chat" | "ingest" | "commits" | "explorer";
{/* type Tab = "chat" | "ingest" | "explorer"; */}

export default function Home() {
  const { user, token, loading } = useAuth();
  const isAuthed = !!(user || token);
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("chat");
  const [hasExplicitTab, setHasExplicitTab] = useState(false);

  const resolveTab = useCallback((value: string | null): Tab => {
    return value === "ingest" || value === "commits" || value === "explorer" ? value : "chat";
  }, []);

  useEffect(() => {
    const rawTab = searchParams.get("tab");
    setTab(resolveTab(rawTab));
    setHasExplicitTab(rawTab !== null);
  }, [searchParams, resolveTab]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={28} className="animate-spin opacity-30 text-[var(--color-foreground)]" />
      </div>
    );
  }

  if (!isAuthed) {
    return <LandingHero />;
  }

  return (
    <div className="max-w-5xl mx-auto">
        {/* Full landing hero when no tab is explicitly selected */}
        {!hasExplicitTab && <LandingHero authenticated />}

        {tab === "ingest" && (
          <div className="mb-6 fade-in-up">
            <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-1">
              Knowledge Graph Pipeline
            </h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              Ingest a repository into Neo4j, then sync it to the ChromaDB vector store for Q&A.
            </p>
          </div>
        )}

        {/* Tab content */}
        <div className="fade-in-up">
          {/* {tab === "chat" ? <ChatTab /> : tab === "ingest" ? <IngestTab /> : tab === "explorer" ? <ExplorerTab /> : <CommitsTab />} */}
          {tab === "chat" && hasExplicitTab && <ChatTab />}
          {tab === "ingest" && <IngestTab />}
          {tab === "explorer" && <ExplorerTab />}
          {tab === "commits" && <CommitsTab />}

        </div>
    </div>
  );
}
