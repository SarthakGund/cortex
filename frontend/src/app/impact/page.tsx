"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Target, GitBranch, FlaskConical, GitCompare, Download,
  FileText, Code2, Zap
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import type { ImpactMode } from "./types";
import { BlastRadiusMode, ChainMode } from "./BlastChainModes";
import { WhatIfMode } from "./WhatIfMode";
import { SpecDiffMode } from "./SpecDiffMode";

import { API_BASE as API } from "@/lib/api";

// ── Mode config ────────────────────────────────────────────────────────────

const MODES: Array<{
  id: ImpactMode;
  label: string;
  icon: typeof Target;
  color: string;
  activeClass: string;
  description: string;
}> = [
    {
      id: "blast",
      label: "Blast Radius",
      icon: Target,
      color: "text-[var(--color-primary)]",
      activeClass: "bg-[var(--color-primary)]/15 text-[var(--color-primary)] border-[var(--color-primary)]/30",
      description: "Upstream + downstream dependency map",
    },
    {
      id: "chain",
      label: "Dep Chain",
      icon: GitBranch,
      color: "text-[var(--color-accent)]",
      activeClass: "bg-[var(--color-accent)]/15 text-[var(--color-accent)] border-[var(--color-accent)]/30",
      description: "Shortest path between two nodes",
    },
    {
      id: "whatif",
      label: "What-If",
      icon: FlaskConical,
      color: "text-[var(--color-chart-5)]",
      activeClass: "bg-[var(--color-chart-5)]/15 text-[var(--color-chart-5)] border-[var(--color-chart-5)]/30",
      description: "Simulate hypothetical changes",
    },
    {
      id: "specdiff",
      label: "Spec Diff",
      icon: GitCompare,
      color: "text-[var(--color-chart-2)]",
      activeClass: "bg-[var(--color-chart-2)]/15 text-[var(--color-chart-2)] border-[var(--color-chart-2)]/30",
      description: "Compare OpenAPI spec versions",
    },
  ];

// ── Export Panel ────────────────────────────────────────────────────────────

function ExportPanel({ authHeaders, target }: { authHeaders: Record<string, string>; target: string }) {
  const [exporting, setExporting] = useState<"md" | "json" | null>(null);
  const [exported, setExported] = useState("");
  const [type, setType] = useState<"md" | "json">("md");

  const doExport = useCallback(async (fmt: "md" | "json") => {
    if (!target.trim()) return;
    setExporting(fmt);
    try {
      const endpoint = fmt === "md" ? "/impact/report/markdown" : "/impact/report/json";
      const r = await fetch(`${API}${endpoint}?target=${encodeURIComponent(target)}&depth=4`, { headers: authHeaders, credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        const content = fmt === "md" ? d.markdown : JSON.stringify(d, null, 2);
        setExported(content);
        setType(fmt);
      }
    } catch { /* ignore */ }
    setExporting(null);
  }, [target, authHeaders]);

  const download = () => {
    const blob = new Blob([exported], { type: type === "md" ? "text/markdown" : "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `impact-report-${target}.${type}`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-4">
      <p className="text-[10px] uppercase tracking-wider opacity-50 mb-3 flex items-center gap-2">
        <Download size={10} /> Export Report
      </p>
      <div className="mb-3">
        <input value={target} readOnly placeholder="Run an analysis first to export"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs opacity-60 cursor-not-allowed" />
      </div>
      <div className="flex gap-2 mb-3">
        <button onClick={() => doExport("md")} disabled={!target.trim() || !!exporting}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-white/10 hover:bg-white/5 disabled:opacity-40 transition-colors">
          {exporting === "md" ? "…" : <FileText size={12} />} Markdown
        </button>
        <button onClick={() => doExport("json")} disabled={!target.trim() || !!exporting}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-white/10 hover:bg-white/5 disabled:opacity-40 transition-colors">
          {exporting === "json" ? "…" : <Code2 size={12} />} JSON
        </button>
      </div>
      {exported && (
        <div>
          <div className="max-h-40 overflow-auto bg-black/30 rounded-lg p-3 mb-2 border border-white/5">
            <pre className="text-[10px] font-mono opacity-70 whitespace-pre-wrap">{exported.slice(0, 1200)}{exported.length > 1200 ? "\n…" : ""}</pre>
          </div>
          <button onClick={download}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold bg-[var(--color-primary)] hover:opacity-90 transition-opacity text-black">
            <Download size={12} /> Download .{type}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ImpactPage() {
  const { token } = useAuth();
  const authHeaders = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}) as Record<string, string>, [token]);
  const [mode, setMode] = useState<ImpactMode>("blast");

  // We track the last analyzed target for export
  const [exportTarget, setExportTarget] = useState("");

  const activeMode = MODES.find(m => m.id === mode)!;
  const Icon = activeMode.icon;

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-lg bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20">
              <Zap size={18} className="text-[var(--color-primary)]" />
            </div>
            <h1 className="text-xl font-black tracking-tight">API-Aware What-If Analyzer</h1>
          </div>
          <p className="text-xs opacity-50 pl-12">
            Forecast the impact of architectural decisions before they are made.
          </p>
        </div>

        {/* Mode switcher */}
        <div className="flex items-center gap-1 bg-[var(--color-card)] rounded-xl p-1 border border-[var(--color-border)]">
          {MODES.map(m => {
            const MIcon = m.icon;
            return (
              <button key={m.id} onClick={() => setMode(m.id)}
                title={m.description}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${mode === m.id ? m.activeClass : "border-transparent opacity-50 hover:opacity-80"
                  }`}>
                <MIcon size={13} />
                <span className="hidden sm:inline">{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active mode label */}
      <div className="flex items-center gap-2 text-xs opacity-60">
        <Icon size={13} className={activeMode.color} />
        <span>{activeMode.description}</span>
      </div>

      {/* Two-column layout on large screens: main + sidebar */}
      <div className="flex gap-5 items-start">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {mode === "blast" && <BlastRadiusMode authHeaders={authHeaders} />}
          {mode === "chain" && <ChainMode authHeaders={authHeaders} />}
          {mode === "whatif" && <WhatIfMode authHeaders={authHeaders} />}
          {mode === "specdiff" && <SpecDiffMode authHeaders={authHeaders} />}
        </div>

        {/* Sidebar: Export panel (only shown on blast/chain/whatif) */}
        {mode !== "specdiff" && (
          <div className="w-64 flex-shrink-0 hidden xl:block">
            <ExportPanel authHeaders={authHeaders} target={exportTarget} />
            <div className="mt-4 bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-4">
              <p className="text-[10px] uppercase tracking-wider opacity-50 mb-2">Set Export Target</p>
              <input value={exportTarget} onChange={e => setExportTarget(e.target.value)}
                placeholder="Enter node name to export"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none" />
              <p className="text-[10px] opacity-30 mt-2">Reports are generated from blast radius + what-if data.</p>
            </div>
          </div>
        )}
      </div>

      {/* Mobile export (below content) */}
      {mode !== "specdiff" && (
        <div className="xl:hidden">
          <details className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl">
            <summary className="px-5 py-3.5 text-sm font-medium cursor-pointer flex items-center gap-2 list-none">
              <Download size={14} className="opacity-60" /> Export Report
            </summary>
            <div className="px-5 pb-5">
              <div className="mb-3">
                <input value={exportTarget} onChange={e => setExportTarget(e.target.value)}
                  placeholder="Enter node name to export"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none" />
              </div>
              <ExportPanel authHeaders={authHeaders} target={exportTarget} />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
