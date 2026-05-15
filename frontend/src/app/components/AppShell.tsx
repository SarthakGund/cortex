"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Database,
  FolderOpen,
  GitBranch,
  LogOut,
  MessageSquare,
  Network,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type RepoItem = {
  id: number;
  repo_url: string;
  repo_full_name: string;
  default_branch: string;
  repo_key: string;
  is_active: boolean;
};

const HOME_TABS = new Set(["chat", "ingest", "commits", "explorer"]);

function getActiveTab(tab: string | null) {
  return HOME_TABS.has(tab ?? "") ? (tab as "chat" | "ingest" | "commits" | "explorer") : "chat";
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { token, logout } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [activeRepoId, setActiveRepoId] = useState<number | null>(null);
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoDeleting, setRepoDeleting] = useState(false);
  const [repoStatus, setRepoStatus] = useState<null | { type: "success" | "error" | "info"; text: string }>(null);
  const repoStatusTimeout = useRef<number | null>(null);

  const authHeaders = useMemo(() => {
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }, [token]);

  const loadRepos = useCallback(async () => {
    if (!token) return;
    setRepoLoading(true);
    try {
      const r = await fetch(`${API}/repos`, { headers: authHeaders });
      if (!r.ok) return;
      const data = await r.json();
      const list: RepoItem[] = data.repos ?? [];
      setRepos(list);
      const active = list.find((repo) => repo.is_active);
      setActiveRepoId(active?.id ?? null);
    } finally {
      setRepoLoading(false);
    }
  }, [token, authHeaders]);

  useEffect(() => {
    loadRepos();
  }, [loadRepos]);

  useEffect(() => {
    const handler = () => loadRepos();
    if (typeof window === "undefined") return;
    window.addEventListener("repos:updated", handler);
    return () => window.removeEventListener("repos:updated", handler);
  }, [loadRepos]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && repoStatusTimeout.current) {
        window.clearTimeout(repoStatusTimeout.current);
      }
    };
  }, []);

  const showRepoStatus = useCallback((next: { type: "success" | "error" | "info"; text: string }) => {
    setRepoStatus(next);
    if (typeof window === "undefined") return;
    if (repoStatusTimeout.current) window.clearTimeout(repoStatusTimeout.current);
    repoStatusTimeout.current = window.setTimeout(() => setRepoStatus(null), 4000);
  }, []);

  const handleRepoChange = useCallback(
    async (repoId: number) => {
      if (!token) return;
      setActiveRepoId(repoId);
      await fetch(`${API}/repos/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ repo_id: repoId }),
      });
      await loadRepos();
    },
    [token, authHeaders, loadRepos]
  );

  const handleRepoDelete = useCallback(async () => {
    if (!token || !activeRepoId) return;
    const repo = repos.find((item) => item.id === activeRepoId);
    const repoName = repo?.repo_full_name ?? "this repo";
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`Delete ${repoName} from ingested repos?`);
      if (!confirmed) return;
    }
    setRepoDeleting(true);
    showRepoStatus({ type: "info", text: "Deleting repo..." });
    try {
      const r = await fetch(`${API}/repos/${activeRepoId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!r.ok) {
        let message = `Delete failed (${r.status})`;
        try {
          const data = await r.json();
          if (typeof data?.message === "string") message = data.message;
        } catch {
          /* ignore */
        }
        showRepoStatus({ type: "error", text: message });
        return;
      }
      await loadRepos();
      showRepoStatus({ type: "success", text: "Repo deleted." });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("repos:updated"));
      }
    } finally {
      setRepoDeleting(false);
    }
  }, [token, activeRepoId, repos, authHeaders, loadRepos, showRepoStatus]);

  const activeTab = getActiveTab(searchParams.get("tab"));

  const navItems = [
    { key: "chat", label: "Q&A Chat", href: "/?tab=chat", icon: <MessageSquare size={16} /> },
    { key: "ingest", label: "Ingest & Sync", href: "/?tab=ingest", icon: <Database size={16} /> },
    { key: "commits", label: "Commit Logs", href: "/?tab=commits", icon: <GitBranch size={16} /> },
    { key: "explorer", label: "Repo Explorer", href: "/?tab=explorer", icon: <FolderOpen size={16} /> },
    { key: "graph", label: "Graph", href: "/graph", icon: <Network size={16} /> },
    { key: "impact", label: "What-If", href: "/impact", icon: <AlertCircle size={16} /> },
    { key: "scaffold", label: "Scaffold", href: "/scaffold", icon: <Sparkles size={16} /> },
    { key: "timeline", label: "Timeline", href: "/timeline", icon: <Activity size={16} /> },
    { key: "health", label: "Health", href: "/health", icon: <ShieldCheck size={16} /> },
    { key: "search", label: "Search", href: "/search", icon: <Search size={16} /> },
  ];

  const isActive = (item: (typeof navItems)[number]) => {
    if (item.href.startsWith("/graph")) return pathname.startsWith("/graph");
    if (item.href.startsWith("/impact")) return pathname.startsWith("/impact");
    if (item.href.startsWith("/scaffold")) return pathname.startsWith("/scaffold");
    if (item.href.startsWith("/timeline")) return pathname.startsWith("/timeline");
    if (item.href.startsWith("/health")) return pathname.startsWith("/health");
    if (item.href.startsWith("/search")) return pathname.startsWith("/search");
    if (pathname === "/") {
      return item.key === activeTab;
    }
    return false;
  };

  return (
    <div className="min-h-screen bg-grid">
      <header className="sticky top-0 z-50 border-b-2 border-[var(--color-border)] bg-[var(--color-background)]">
        <div className="max-w-[1400px] mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center swiss-panel">
              <Network size={18} className="text-[var(--color-foreground)]" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-[var(--color-foreground)] leading-none">Weavr</h1>
              <p className="text-[10px] text-[var(--color-muted-foreground)] mt-0.5 leading-none">Knowledge Graph Intelligence</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--color-muted-foreground)] uppercase tracking-wider">Repo</span>
              <select
                value={activeRepoId ?? ""}
                onChange={(e) => handleRepoChange(Number(e.target.value))}
                disabled={repoLoading || repos.length === 0 || repoDeleting}
                className="text-xs bg-[var(--color-card)] border-2 border-[var(--color-border)] px-2.5 py-2 text-[var(--color-foreground)] min-w-[200px]"
              >
                {repos.length === 0 ? (
                  <option value="">Add a repo to start</option>
                ) : (
                  repos.map((repo) => (
                    <option key={repo.id} value={repo.id}>
                      {repo.repo_full_name}
                    </option>
                  ))
                )}
              </select>
              <button
                onClick={handleRepoDelete}
                disabled={!activeRepoId || repoLoading || repoDeleting}
                title="Delete ingested repo"
                className="h-9 w-9 flex items-center justify-center border-2 border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)] hover:bg-[var(--color-muted)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X size={14} />
              </button>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 swiss-button-ghost hover:bg-[var(--color-muted)] transition-all"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        </div>
      </header>

      {repoStatus && (
        <div className="fixed top-20 right-6 z-[60]">
          <div
            className={`min-w-[220px] max-w-[320px] text-[11px] px-3 py-2 rounded-md border shadow-lg bg-[var(--color-card)] text-[var(--color-foreground)] ${repoStatus.type === "success"
              ? "border-emerald-500/40"
              : repoStatus.type === "error"
                ? "border-red-500/40"
                : "border-blue-500/40"
              }`}
          >
            <div
              className={`h-1.5 w-10 rounded-full mb-2 ${repoStatus.type === "success"
                ? "bg-emerald-400"
                : repoStatus.type === "error"
                  ? "bg-red-400"
                  : "bg-blue-400"
                }`}
            />
            {repoStatus.text}
          </div>
        </div>
      )}

      <div className="flex">
        <aside
          className={`sticky top-16 h-[calc(100vh-4rem)] border-r-2 border-[var(--color-border)] bg-[var(--color-card)] transition-all duration-200 ${
            collapsed ? "w-16" : "w-64"
          }`}
        >
          <div className="flex items-center justify-between px-3 py-3">
            <span className={`text-xs font-semibold uppercase tracking-widest text-[var(--color-muted-foreground)] ${collapsed ? "hidden" : "block"}`}>
              Navigation
            </span>
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="p-1.5 swiss-button-ghost hover:bg-[var(--color-muted)] transition-colors"
              title={collapsed ? "Expand" : "Collapse"}
            >
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          </div>

          <nav className="px-2 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 text-sm transition-all border-2 border-transparent ${
                  isActive(item)
                    ? "swiss-button"
                    : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
                }`}
                title={item.label}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                <span className={`${collapsed ? "hidden" : "block"} truncate`}>{item.label}</span>
              </Link>
            ))}
          </nav>
        </aside>

        <main className="flex-1 min-w-0 px-4 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
