"use client";

import { useState, useEffect } from "react";
import {
  Clock, History, GitCompare, BarChart3, Loader2, Zap,
  Plus, RefreshCcw, Trash2, ChevronDown, ChevronRight,
  ArrowRight, Filter, Calendar, AlertCircle, Webhook, CheckCircle2,
  XCircle, Github
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────

interface TimelineEvent {
  action: string;
  entity_type: string;
  entity_name: string;
  service: string;
  details: string;
  source: string;
  timestamp: string;
}

interface DiffResult {
  period: { start: string; end: string };
  summary: { created: number; updated: number; deleted: number; total_changes: number };
  created: DiffItem[];
  updated: DiffItem[];
  deleted: DiffItem[];
}

interface DiffItem {
  entity_type: string;
  entity_name: string;
  service: string;
  timestamp: string;
  source: string;
}

interface SnapshotResult {
  timestamp: string;
  entity_types: Record<string, number>;
  entities: Record<string, { name: string; service: string; changes: number }[]>;
  total: number;
}

interface EventStats {
  total_events: number;
  first_event: string | null;
  last_event: string | null;
  by_action: Record<string, number>;
}

// ── Colors ─────────────────────────────────────────────────────────────────

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-green-500/20 text-green-400 border-green-500/30",
  UPDATE: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  DELETE: "bg-red-500/20 text-red-400 border-red-500/30",
};

const ACTION_ICONS: Record<string, typeof Plus> = {
  CREATE: Plus,
  UPDATE: RefreshCcw,
  DELETE: Trash2,
};

const TYPE_COLORS: Record<string, string> = {
  Service: "text-indigo-400", Module: "text-violet-400", File: "text-purple-400",
  Class: "text-cyan-400", Function: "text-emerald-400", Schema: "text-amber-400",
  Endpoint: "text-red-400", Database: "text-orange-400",
};

// ── Main Page ──────────────────────────────────────────────────────────────

export default function TimeTravelPage() {
  const [tab, setTab] = useState<"timeline" | "diff" | "snapshot">("timeline");
  const [stats, setStats] = useState<EventStats | null>(null);

  useEffect(() => {
    fetch(`${API}/events/stats`).then(r => r.json()).then(setStats).catch(() => {});
  }, []);

  const tabs = [
    { id: "timeline" as const, label: "Timeline", icon: <History size={14} /> },
    { id: "diff" as const, label: "Visual Diff", icon: <GitCompare size={14} /> },
    { id: "snapshot" as const, label: "Snapshot", icon: <Clock size={14} /> },
  ];

  return (
    <div className="min-h-screen bg-[#080c14] text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#080c14]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
              <Zap size={18} className="text-indigo-400" />
              <span className="font-semibold">SPIT</span>
            </a>
            <span className="text-slate-700">/</span>
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-emerald-400" />
              <span className="font-semibold text-white">Time Machine</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Stats badges */}
            {stats && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <BarChart3 size={12} />
                <span>{stats.total_events} events</span>
                {stats.first_event && (
                  <>
                    <span className="text-slate-700">|</span>
                    <span>Since {new Date(stats.first_event).toLocaleDateString()}</span>
                  </>
                )}
              </div>
            )}
            <div className="flex items-center gap-0.5 bg-slate-800/50 rounded-lg p-0.5">
              {tabs.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    tab === t.id ? "bg-emerald-500/20 text-emerald-400" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {tab === "timeline" && <TimelineView />}
        {tab === "diff" && <DiffView />}
        {tab === "snapshot" && <SnapshotView />}
      </main>
    </div>
  );
}

// ── Timeline View ──────────────────────────────────────────────────────────

function TimelineView() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    service: "", entity_type: "", action: "", limit: 100,
  });

  // Webhook management state
  const [repoUrl, setRepoUrl] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [webhookStatus, setWebhookStatus] = useState<{
    checking: boolean;
    creating: boolean;
    exists?: boolean;
    webhook?: any;
    message?: string;
  }>({ checking: false, creating: false });

  const fetchEvents = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.service) params.set("service", filters.service);
    if (filters.entity_type) params.set("entity_type", filters.entity_type);
    if (filters.action) params.set("action", filters.action);
    params.set("limit", String(filters.limit));

    try {
      const res = await fetch(`${API}/events/timeline?${params}`);
      if (res.ok) setEvents(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  };

  const checkWebhook = async () => {
    if (!repoUrl) return;
    setWebhookStatus({ ...webhookStatus, checking: true, message: undefined });
    
    try {
      const res = await fetch(`${API}/webhook/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_url: repoUrl, github_token: githubToken || undefined }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setWebhookStatus({
          checking: false,
          creating: false,
          exists: data.exists,
          webhook: data.webhook,
          message: data.exists
            ? `✅ Webhook is active for ${data.repository}`
            : `⚠️ No webhook found for ${data.repository}`,
        });
      } else {
        const error = await res.json();
        setWebhookStatus({
          checking: false,
          creating: false,
          message: `❌ Error: ${error.detail || "Failed to check webhook"}`,
        });
      }
    } catch (error) {
      setWebhookStatus({
        checking: false,
        creating: false,
        message: `❌ Network error: ${error}`,
      });
    }
  };

  const createWebhook = async () => {
    if (!repoUrl) return;
    setWebhookStatus({ ...webhookStatus, creating: true, message: undefined });
    
    try {
      const res = await fetch(`${API}/webhook/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_url: repoUrl, github_token: githubToken || undefined }),
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.status === "success") {
          setWebhookStatus({
            checking: false,
            creating: false,
            exists: true,
            message: "✅ Webhook created successfully!",
          });
        } else if (data.status === "exists") {
          setWebhookStatus({
            checking: false,
            creating: false,
            exists: true,
            message: "✅ Webhook already exists!",
          });
        } else {
          setWebhookStatus({
            checking: false,
            creating: false,
            message: `⚠️ ${data.message}`,
          });
        }
      } else {
        const error = await res.json();
        setWebhookStatus({
          checking: false,
          creating: false,
          message: `❌ Error: ${error.detail || "Failed to create webhook"}`,
        });
      }
    } catch (error) {
      setWebhookStatus({
        checking: false,
        creating: false,
        message: `❌ Network error: ${error}`,
      });
    }
  };

  useEffect(() => { fetchEvents(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      {/* Webhook Management Section */}
      <div className="bg-gradient-to-br from-slate-900/80 to-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Webhook size={18} className="text-purple-400" />
          <h3 className="text-sm font-semibold text-white">Webhook Management</h3>
        </div>
        
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              GitHub Repository URL
            </label>
            <div className="relative">
              <Github size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="url"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/username/repository"
                className="w-full pl-9 pr-3 py-2 bg-slate-800/60 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              GitHub Token (optional, leave empty to use server config)
            </label>
            <input
              type="password"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxx"
              className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={checkWebhook}
              disabled={!repoUrl || webhookStatus.checking}
              className="flex-1 px-4 py-2 rounded-lg text-xs font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {webhookStatus.checking ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  Check Webhook
                </>
              )}
            </button>
            
            <button
              onClick={createWebhook}
              disabled={!repoUrl || webhookStatus.creating}
              className="flex-1 px-4 py-2 rounded-lg text-xs font-medium bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {webhookStatus.creating ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus size={14} />
                  Create Webhook
                </>
              )}
            </button>
          </div>

          {webhookStatus.message && (
            <div className={`px-3 py-2 rounded-lg text-xs ${
              webhookStatus.exists
                ? "bg-green-500/10 border border-green-500/30 text-green-400"
                : "bg-amber-500/10 border border-amber-500/30 text-amber-400"
            }`}>
              {webhookStatus.message}
              {webhookStatus.webhook && (
                <div className="mt-2 text-[10px] text-slate-500 space-y-0.5">
                  <div>Events: {webhookStatus.webhook.events.join(", ")}</div>
                  <div>Created: {new Date(webhookStatus.webhook.created_at).toLocaleString()}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <Filter size={14} className="text-slate-500" />
        <input
          value={filters.service}
          onChange={e => setFilters({...filters, service: e.target.value})}
          placeholder="Service..."
          className="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 w-36 focus:outline-none focus:border-emerald-500"
        />
        <select
          value={filters.entity_type}
          onChange={e => setFilters({...filters, entity_type: e.target.value})}
          className="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
        >
          <option value="">All Types</option>
          {["Service","Module","File","Class","Function","Endpoint","Schema","Database"].map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={filters.action}
          onChange={e => setFilters({...filters, action: e.target.value})}
          className="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
        >
          <option value="">All Actions</option>
          <option value="CREATE">Create</option>
          <option value="UPDATE">Update</option>
          <option value="DELETE">Delete</option>
        </select>
        <button
          onClick={fetchEvents}
          disabled={loading}
          className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors flex items-center gap-1.5"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />}
          Refresh
        </button>
      </div>

      {/* Event list */}
      {events.length === 0 && !loading ? (
        <div className="text-center py-16">
          <AlertCircle size={32} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400">No events recorded yet.</p>
          <p className="text-xs text-slate-600 mt-1">Events are automatically created during ingestion.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-6 top-0 bottom-0 w-px bg-slate-800" />

          <div className="space-y-1">
            {events.map((evt, i) => {
              const Icon = ACTION_ICONS[evt.action] ?? Plus;
              return (
                <div key={i} className="flex items-start gap-4 pl-2 group">
                  {/* Dot */}
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center border flex-shrink-0 z-10 ${ACTION_COLORS[evt.action] ?? "border-slate-700 bg-slate-800"}`}>
                    <Icon size={14} />
                  </div>
                  {/* Content */}
                  <div className="flex-1 bg-slate-900/30 border border-slate-800/50 rounded-lg px-4 py-2.5 hover:border-slate-700 transition-colors group-hover:bg-slate-900/50">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${ACTION_COLORS[evt.action] ?? "border-slate-700"}`}>
                        {evt.action}
                      </span>
                      <span className={`text-sm font-medium ${TYPE_COLORS[evt.entity_type] ?? "text-slate-300"}`}>
                        {evt.entity_type}
                      </span>
                      <span className="text-sm text-white">{evt.entity_name}</span>
                      {evt.service && (
                        <span className="text-xs text-slate-500 ml-auto">{evt.service}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-600">
                      <span className="flex items-center gap-1">
                        <Calendar size={10} />
                        {new Date(evt.timestamp).toLocaleString()}
                      </span>
                      {evt.source && <span>via {evt.source}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Diff View ──────────────────────────────────────────────────────────────

function DiffView() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [result, setResult] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleDiff = async () => {
    if (!start || !end) return;
    setLoading(true);
    try {
      const startISO = new Date(start).toISOString();
      const endISO = new Date(end).toISOString();
      const res = await fetch(`${API}/events/diff?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`);
      if (res.ok) setResult(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <GitCompare size={20} className="text-blue-400" />
          Compare Two Points in Time
        </h2>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-xs text-slate-400 mb-1">From</label>
            <input
              type="datetime-local"
              value={start}
              onChange={e => setStart(e.target.value)}
              className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <ArrowRight size={20} className="text-slate-500 mb-2.5" />
          <div className="flex-1">
            <label className="block text-xs text-slate-400 mb-1">To</label>
            <input
              type="datetime-local"
              value={end}
              onChange={e => setEnd(e.target.value)}
              className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={handleDiff}
            disabled={loading || !start || !end}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-blue-500 to-cyan-500 text-white disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <GitCompare size={14} />}
            Compare
          </button>
        </div>
      </div>

      {result && (
        <div className="space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-white">{result.summary.total_changes}</p>
              <p className="text-xs text-slate-500">Total Changes</p>
            </div>
            <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-green-400">+{result.summary.created}</p>
              <p className="text-xs text-green-500/70">Created</p>
            </div>
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-blue-400">~{result.summary.updated}</p>
              <p className="text-xs text-blue-500/70">Updated</p>
            </div>
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-red-400">-{result.summary.deleted}</p>
              <p className="text-xs text-red-500/70">Deleted</p>
            </div>
          </div>

          {/* Change lists */}
          {result.created.length > 0 && (
            <DiffSection title="Created" items={result.created} color="green" />
          )}
          {result.updated.length > 0 && (
            <DiffSection title="Updated" items={result.updated} color="blue" />
          )}
          {result.deleted.length > 0 && (
            <DiffSection title="Deleted" items={result.deleted} color="red" />
          )}
        </div>
      )}
    </div>
  );
}

function DiffSection({ title, items, color }: { title: string; items: DiffItem[]; color: string }) {
  const [open, setOpen] = useState(true);
  const cls = color === "green" ? "border-green-500/20" : color === "blue" ? "border-blue-500/20" : "border-red-500/20";
  const txt = color === "green" ? "text-green-400" : color === "blue" ? "text-blue-400" : "text-red-400";

  return (
    <div className={`bg-slate-900/50 border ${cls} rounded-xl overflow-hidden`}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-5 py-3 text-sm font-medium hover:bg-slate-800/30">
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className={txt}>{title}</span>
        <span className="text-xs text-slate-500">({items.length})</span>
      </button>
      {open && (
        <div className="px-5 pb-4 space-y-1">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-3 text-sm py-1 border-b border-slate-800/50 last:border-0">
              <span className={`text-xs ${TYPE_COLORS[item.entity_type] ?? "text-slate-400"}`}>{item.entity_type}</span>
              <span className="text-white">{item.entity_name}</span>
              {item.service && <span className="text-xs text-slate-600 ml-auto">{item.service}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Snapshot View ──────────────────────────────────────────────────────────

function SnapshotView() {
  const [timestamp, setTimestamp] = useState("");
  const [result, setResult] = useState<SnapshotResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSnapshot = async () => {
    if (!timestamp) return;
    setLoading(true);
    try {
      const ts = new Date(timestamp).toISOString();
      const res = await fetch(`${API}/events/snapshot?timestamp=${encodeURIComponent(ts)}`);
      if (res.ok) setResult(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Clock size={20} className="text-emerald-400" />
          Graph Snapshot at Point in Time
        </h2>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-xs text-slate-400 mb-1">Timestamp</label>
            <input
              type="datetime-local"
              value={timestamp}
              onChange={e => setTimestamp(e.target.value)}
              className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
          <button
            onClick={handleSnapshot}
            disabled={loading || !timestamp}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-emerald-500 to-green-500 text-white disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />}
            View Snapshot
          </button>
        </div>
      </div>

      {result && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <Clock size={16} className="text-emerald-400" />
              <span className="text-sm font-medium">
                Snapshot at {new Date(result.timestamp).toLocaleString()}
              </span>
              <span className="text-xs text-slate-500 ml-auto">{result.total} total entities</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(result.entity_types).map(([type, count]) => (
                <span
                  key={type}
                  className="px-3 py-1 rounded-full bg-slate-800 text-xs border border-slate-700 flex items-center gap-1.5"
                >
                  <span className={TYPE_COLORS[type] ?? "text-slate-400"}>{type}</span>
                  <span className="text-white font-medium">{count}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Entity lists */}
          {Object.entries(result.entities).map(([type, items]) => (
            <div key={type} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <h3 className={`text-sm font-medium mb-2 ${TYPE_COLORS[type] ?? "text-slate-300"}`}>
                {type}s ({items.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1">
                {items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-slate-800/30">
                    <span className="text-white truncate">{item.name}</span>
                    {item.service && <span className="text-slate-600 ml-auto flex-shrink-0">{item.service}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
