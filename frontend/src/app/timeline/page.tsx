"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Loader2, Zap, Plus, RefreshCcw, Trash2,
  ArrowRight, Calendar, Camera, ChevronLeft, Box,
  Network, Diff, GitCompare
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────

interface GraphSnapshotSummary {
  id: number;
  commit_hash: string | null;
  commit_message: string | null;
  author: string | null;
  repo_url: string | null;
  service: string | null;
  node_count: number;
  edge_count: number;
  label: string | null;
  taken_at: string;
}

interface GraphSnapshotFull extends GraphSnapshotSummary {
  nodes: { id: number; label: string; name: string; props: Record<string, unknown> }[];
  edges: { source: number; target: number; type: string }[];
}

interface SnapshotDiff {
  before: { id: number; label: string; taken_at: string };
  after: { id: number; label: string; taken_at: string };
  summary: {
    nodes_added: number;
    nodes_removed: number;
    nodes_changed: number;
    edges_added: number;
    edges_removed: number;
  };
  nodes_added: { id: number; label: string; name: string }[];
  nodes_removed: { id: number; label: string; name: string }[];
  nodes_changed: { id: number; label: string; name: string; before: Record<string, unknown>; after: Record<string, unknown> }[];
  edges_added: { source: number; target: number; type: string }[];
  edges_removed: { source: number; target: number; type: string }[];
}

export default function TimeTravelPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Graph Snapshots</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Capture and compare graph states over time.</p>
      </div>
      <GraphSnapshotsView />
    </div>
  );
}

const LABEL_COLORS: Record<string, string> = {
  Service: "text-indigo-400 border-indigo-500/30 bg-indigo-500/10",
  Module: "text-violet-400 border-violet-500/30 bg-violet-500/10",
  File: "text-purple-400 border-purple-500/30 bg-purple-500/10",
  Class: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10",
  Function: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  Schema: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  Endpoint: "text-red-400 border-red-500/30 bg-red-500/10",
  Database: "text-orange-400 border-orange-500/30 bg-orange-500/10",
};

function NodeTag({ label, name }: { label: string; name: string }) {
  const cls = LABEL_COLORS[label] ?? "text-slate-600 border-slate-400 bg-slate-200/40";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-medium ${cls}`}>
      <span className="opacity-60">{label}</span>
      <span className="font-semibold truncate max-w-[120px]">{name}</span>
    </span>
  );
}

function GraphSnapshotsView() {
  const { token } = useAuth();
  const authHeaders = useMemo(() => {
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }, [token]);
  const [snapshots, setSnapshots] = useState<GraphSnapshotSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<GraphSnapshotFull | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [diffIds, setDiffIds] = useState<[number | null, number | null]>([null, null]);
  const [diff, setDiff] = useState<SnapshotDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [mode, setMode] = useState<"list" | "detail" | "diff">("list");

  const fetchSnapshots = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/snapshots/`, { headers: authHeaders });
      if (r.ok) setSnapshots(await r.json());
    } catch { /* ignore */ }
    setLoading(false);
  };

  const captureNow = async () => {
    setCapturing(true);
    try {
      await fetch(`${API}/snapshots/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ label: `Manual — ${new Date().toLocaleString()}` }),
      });
      setTimeout(fetchSnapshots, 1500);
    } catch { /* ignore */ }
    setCapturing(false);
  };

  const openDetail = async (id: number) => {
    setSelectedId(id);
    setDetail(null);
    setMode("detail");
    setDetailLoading(true);
    try {
      const r = await fetch(`${API}/snapshots/${id}`, { headers: authHeaders });
      if (r.ok) setDetail(await r.json());
    } catch { /* ignore */ }
    setDetailLoading(false);
  };

  const runDiff = async () => {
    const [a, b] = diffIds;
    if (!a || !b) return;
    setDiffLoading(true);
    setDiff(null);
    try {
      const r = await fetch(`${API}/snapshots/diff/${a}/${b}`, { headers: authHeaders });
      if (r.ok) setDiff(await r.json());
    } catch { /* ignore */ }
    setDiffLoading(false);
  };

  useEffect(() => { fetchSnapshots(); }, []);

  // Group nodes by label for the detail view
  const nodesByLabel = detail
    ? detail.nodes.reduce<Record<string, typeof detail.nodes>>((acc, n) => {
        (acc[n.label] = acc[n.label] || []).push(n);
        return acc;
      }, {})
    : {};

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {mode !== "list" && (
            <button
              onClick={() => { setMode("list"); setDetail(null); setDiff(null); }}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
          )}
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Camera size={18} className="text-purple-400" />
              Graph Snapshots
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Full Neo4j graph state captured automatically on each commit
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mode === "list" && snapshots.length >= 2 && (
            <button
              onClick={() => { setMode("diff"); setDiff(null); }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors flex items-center gap-1.5"
            >
              <Diff size={14} /> Compare Two
            </button>
          )}
          <button
            onClick={captureNow}
            disabled={capturing}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {capturing ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
            Capture Now
          </button>
          <button
            onClick={fetchSnapshots}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
          >
            <RefreshCcw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ── LIST view ─────────────────────────────────────────── */}
      {mode === "list" && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={28} className="animate-spin text-purple-400" />
            </div>
          ) : snapshots.length === 0 ? (
            <div className="text-center py-16 bg-white/30 border border-slate-200 rounded-xl">
              <Camera size={32} className="mx-auto text-slate-600 mb-3" />
              <p className="text-slate-600 text-sm">No graph snapshots yet.</p>
              <p className="text-xs text-slate-600 mt-1">
                Snapshots are captured automatically when a commit webhook fires, or click "Capture Now".
              </p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline spine */}
              <div className="absolute left-5 top-0 bottom-0 w-px bg-gradient-to-b from-purple-500/40 to-transparent" />
              <div className="space-y-3">
                {snapshots.map((snap) => (
                  <button
                    key={snap.id}
                    onClick={() => openDetail(snap.id)}
                    className="w-full flex items-start gap-4 pl-2 text-left group"
                  >
                    {/* Dot */}
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-purple-500/20 border border-purple-500/40 flex-shrink-0 z-10 group-hover:bg-purple-500/30 transition-colors">
                      <Camera size={13} className="text-purple-400" />
                    </div>
                    {/* Card */}
                    <div className="flex-1 bg-white/40 border border-slate-200/60 rounded-xl px-4 py-3 hover:border-purple-500/30 hover:bg-white/70 transition-all">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="text-sm font-medium text-slate-900 leading-snug">
                            {snap.label || `Snapshot #${snap.id}`}
                          </p>
                          {snap.commit_hash && (
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="font-mono text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                                {snap.commit_hash.slice(0, 7)}
                              </span>
                              {snap.author && (
                                <span className="text-[11px] text-slate-500">{snap.author}</span>
                              )}
                              {snap.service && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                                  {snap.service}
                                </span>
                              )}
                            </div>
                          )}
                          {snap.commit_message && (
                            <p className="text-[11px] text-slate-500 mt-1 italic truncate max-w-sm">
                              "{snap.commit_message}"
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-right flex-shrink-0">
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-600 flex items-center gap-1">
                              <Box size={11} className="text-purple-400" />
                              {snap.node_count} nodes
                            </span>
                            <span className="text-xs text-slate-600 flex items-center gap-1">
                              <Network size={11} className="text-blue-400" />
                              {snap.edge_count} edges
                            </span>
                          </div>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-2 flex items-center gap-1">
                        <Calendar size={10} />
                        {new Date(snap.taken_at).toLocaleString()}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── DETAIL view ───────────────────────────────────────── */}
      {mode === "detail" && (
        <div className="space-y-4">
          {detailLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={28} className="animate-spin text-purple-400" />
            </div>
          ) : detail ? (
            <>
              {/* Summary bar */}
              <div className="bg-white border border-purple-500/20 rounded-xl p-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <Camera size={16} className="text-purple-400" />
                  <span className="text-sm font-semibold text-slate-900">{detail.label}</span>
                  {detail.commit_hash && (
                    <span className="font-mono text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                      {detail.commit_hash.slice(0, 7)}
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-4 text-xs text-slate-600">
                    <span className="flex items-center gap-1"><Box size={12} className="text-purple-400" />{detail.node_count} nodes</span>
                    <span className="flex items-center gap-1"><Network size={12} className="text-blue-400" />{detail.edge_count} edges</span>
                  </span>
                </div>
                {detail.commit_message && (
                  <p className="text-xs text-slate-500 mt-2 italic pl-7">"{detail.commit_message}"</p>
                )}
                <p className="text-[11px] text-slate-600 mt-2 pl-7 flex items-center gap-1">
                  <Calendar size={10} /> {new Date(detail.taken_at).toLocaleString()}
                </p>
              </div>

              {/* Node type pills */}
              <div className="flex flex-wrap gap-2">
                {Object.entries(nodesByLabel).map(([label, nodes]) => {
                  const cls = LABEL_COLORS[label] ?? "text-slate-600 border-slate-400 bg-slate-200/40";
                  return (
                    <span key={label} className={`px-3 py-1 rounded-full border text-xs font-medium flex items-center gap-1.5 ${cls}`}>
                      {label} <span className="font-bold">{nodes.length}</span>
                    </span>
                  );
                })}
              </div>

              {/* Nodes by label */}
              {Object.entries(nodesByLabel).map(([label, nodes]) => (
                <div key={label} className="bg-white/40 border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-200 flex items-center gap-2">
                    <span className={`text-xs font-semibold ${LABEL_COLORS[label]?.split(" ")[0] ?? "text-slate-700"}`}>
                      {label}s
                    </span>
                    <span className="text-xs text-slate-500">({nodes.length})</span>
                  </div>
                  <div className="p-3 flex flex-wrap gap-1.5">
                    {nodes.map(n => <NodeTag key={n.id} label={label} name={n.name} />)}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="text-center py-16 text-slate-500">Failed to load snapshot detail.</div>
          )}
        </div>
      )}

      {/* ── DIFF view ─────────────────────────────────────────── */}
      {mode === "diff" && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Diff size={16} className="text-blue-400" />
              Compare Two Snapshots
            </h3>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs text-slate-600 mb-1">Before (older)</label>
                <select
                  value={diffIds[0] ?? ""}
                  onChange={e => setDiffIds([e.target.value ? +e.target.value : null, diffIds[1]])}
                  className="w-full bg-slate-100/60 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select snapshot…</option>
                  {[...snapshots].reverse().map(s => (
                    <option key={s.id} value={s.id}>
                      #{s.id} — {s.label || `Snapshot #${s.id}`} ({s.node_count} nodes)
                    </option>
                  ))}
                </select>
              </div>
              <ArrowRight size={18} className="text-slate-500 mb-2" />
              <div className="flex-1">
                <label className="block text-xs text-slate-600 mb-1">After (newer)</label>
                <select
                  value={diffIds[1] ?? ""}
                  onChange={e => setDiffIds([diffIds[0], e.target.value ? +e.target.value : null])}
                  className="w-full bg-slate-100/60 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select snapshot…</option>
                  {snapshots.map(s => (
                    <option key={s.id} value={s.id}>
                      #{s.id} — {s.label || `Snapshot #${s.id}`} ({s.node_count} nodes)
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={runDiff}
                disabled={diffLoading || !diffIds[0] || !diffIds[1] || diffIds[0] === diffIds[1]}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-blue-500 to-cyan-500 text-slate-900 disabled:opacity-50 flex items-center gap-2"
              >
                {diffLoading ? <Loader2 size={14} className="animate-spin" /> : <GitCompare size={14} />}
                Diff
              </button>
            </div>
          </div>

          {diff && (
            <div className="space-y-4">
              {/* Stat pills */}
              <div className="grid grid-cols-5 gap-3">
                {[
                  { label: "Nodes Added", val: diff.summary.nodes_added, color: "text-green-400 bg-green-500/10 border-green-500/20" },
                  { label: "Nodes Removed", val: diff.summary.nodes_removed, color: "text-red-400 bg-red-500/10 border-red-500/20" },
                  { label: "Nodes Changed", val: diff.summary.nodes_changed, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
                  { label: "Edges Added", val: diff.summary.edges_added, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
                  { label: "Edges Removed", val: diff.summary.edges_removed, color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
                ].map(s => (
                  <div key={s.label} className={`border rounded-xl p-3 text-center ${s.color}`}>
                    <p className="text-xl font-bold">{s.val}</p>
                    <p className="text-[10px] mt-0.5 opacity-70">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Nodes added */}
              {diff.nodes_added.length > 0 && (
                <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-green-400 mb-2 flex items-center gap-1.5">
                    <Plus size={13} /> Nodes Added ({diff.nodes_added.length})
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {diff.nodes_added.map(n => <NodeTag key={n.id} label={n.label} name={n.name} />)}
                  </div>
                </div>
              )}

              {/* Nodes removed */}
              {diff.nodes_removed.length > 0 && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-1.5">
                    <Trash2 size={13} /> Nodes Removed ({diff.nodes_removed.length})
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {diff.nodes_removed.map(n => <NodeTag key={n.id} label={n.label} name={n.name} />)}
                  </div>
                </div>
              )}

              {/* Nodes changed */}
              {diff.nodes_changed.length > 0 && (
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-blue-400 mb-3 flex items-center gap-1.5">
                    <RefreshCcw size={13} /> Nodes Changed ({diff.nodes_changed.length})
                  </h4>
                  <div className="space-y-2">
                    {diff.nodes_changed.slice(0, 10).map(n => (
                      <div key={n.id} className="bg-slate-100/40 rounded-lg px-3 py-2 text-xs">
                        <NodeTag label={n.label} name={n.name} />
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-[10px] text-slate-500 mb-1">Before</p>
                            <pre className="text-[10px] text-red-300/80 whitespace-pre-wrap">
                              {JSON.stringify(n.before, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500 mb-1">After</p>
                            <pre className="text-[10px] text-green-300/80 whitespace-pre-wrap">
                              {JSON.stringify(n.after, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Edges diff */}
              {(diff.edges_added.length > 0 || diff.edges_removed.length > 0) && (
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-slate-700 mb-2">Edge Changes</h4>
                  <div className="space-y-1">
                    {diff.edges_added.map((e, i) => (
                      <div key={`a${i}`} className="text-[11px] text-green-400 flex items-center gap-2">
                        <Plus size={10} />
                        <span>{e.source} → {e.target}</span>
                        <span className="text-green-600">[{e.type}]</span>
                      </div>
                    ))}
                    {diff.edges_removed.map((e, i) => (
                      <div key={`r${i}`} className="text-[11px] text-red-400 flex items-center gap-2">
                        <Trash2 size={10} />
                        <span>{e.source} → {e.target}</span>
                        <span className="text-red-600">[{e.type}]</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}