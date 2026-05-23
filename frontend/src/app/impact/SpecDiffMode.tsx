"use client";
import { useState, useRef } from "react";
import { GitCompare, Upload, Loader2, CheckCircle2, AlertTriangle, Minus, Plus } from "lucide-react";
import type { SpecDiffResult } from "./types";
import { BreakingChangeRow, CollapsibleSection, SeverityBadge, StatCard } from "./components";

import { API_BASE as API } from "@/lib/api";

const EXAMPLE_OLD = `openapi: "3.0.0"
info:
  title: User API
  version: "1.0.0"
paths:
  /users/{id}:
    get:
      operationId: getUser
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/User"
components:
  schemas:
    User:
      type: object
      required: [id, name]
      properties:
        id:
          type: string
        name:
          type: string
        email:
          type: string`;

const EXAMPLE_NEW = `openapi: "3.0.0"
info:
  title: User API
  version: "2.0.0"
paths:
  /users/{id}:
    get:
      operationId: getUser
      deprecated: true
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/User"
components:
  schemas:
    User:
      type: object
      required: [id, name, email]
      properties:
        id:
          type: integer
        name:
          type: string
        email:
          type: string
        createdAt:
          type: string
          format: date-time`;

export function SpecDiffMode({ authHeaders }: { authHeaders: Record<string, string> }) {
    const [oldSpec, setOldSpec] = useState("");
    const [newSpec, setNewSpec] = useState("");
    const [data, setData] = useState<SpecDiffResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [tab, setTab] = useState<"paste" | "upload">("paste");
    const oldFileRef = useRef<HTMLInputElement>(null);
    const newFileRef = useRef<HTMLInputElement>(null);

    const compare = async () => {
        if (!oldSpec.trim() || !newSpec.trim()) return;
        setLoading(true); setData(null);
        try {
            const r = await fetch(`${API}/impact/spec-diff`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify({ old_spec_content: oldSpec, new_spec_content: newSpec }),
            });
            if (r.ok) setData(await r.json());
        } catch { /* ignore */ }
        setLoading(false);
    };

    const uploadCompare = async () => {
        const oldFile = oldFileRef.current?.files?.[0];
        const newFile = newFileRef.current?.files?.[0];
        if (!oldFile || !newFile) return;
        setLoading(true); setData(null);
        try {
            const form = new FormData();
            form.append("old_file", oldFile);
            form.append("new_file", newFile);
            const r = await fetch(`${API}/impact/spec-diff/upload`, { method: "POST", headers: authHeaders, body: form });
            if (r.ok) setData(await r.json());
        } catch { /* ignore */ }
        setLoading(false);
    };

    const loadExample = () => { setOldSpec(EXAMPLE_OLD); setNewSpec(EXAMPLE_NEW); };

    return (
        <div className="space-y-5">
            {/* Input */}
            <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold text-sm flex items-center gap-2">
                        <GitCompare size={16} className="text-[var(--color-chart-2)]" /> OpenAPI Spec Diff
                    </h2>
                    <div className="flex gap-1">
                        {(["paste", "upload"] as const).map(t => (
                            <button key={t} onClick={() => setTab(t)}
                                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${tab === t ? "bg-[var(--color-chart-2)]/15 text-[var(--color-chart-2)]" : "opacity-50 hover:opacity-80"}`}>
                                {t === "paste" ? "📋 Paste" : "📁 Upload"}
                            </button>
                        ))}
                    </div>
                </div>

                {tab === "paste" ? (
                    <>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-[10px] uppercase tracking-wider opacity-50 mb-1.5">Old Spec (YAML / JSON)</label>
                                <textarea value={oldSpec} onChange={e => setOldSpec(e.target.value)} rows={12}
                                    placeholder="Paste old OpenAPI spec here…"
                                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-[var(--color-chart-2)]/60 resize-y placeholder:opacity-30" />
                            </div>
                            <div>
                                <label className="block text-[10px] uppercase tracking-wider opacity-50 mb-1.5">New Spec (YAML / JSON)</label>
                                <textarea value={newSpec} onChange={e => setNewSpec(e.target.value)} rows={12}
                                    placeholder="Paste new OpenAPI spec here…"
                                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-[var(--color-chart-2)]/60 resize-y placeholder:opacity-30" />
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={compare} disabled={loading || !oldSpec.trim() || !newSpec.trim()}
                                className="px-5 py-2.5 rounded-lg text-sm font-bold bg-[var(--color-chart-2)] hover:opacity-90 text-[var(--color-primary-foreground)] disabled:opacity-40 transition-all flex items-center gap-2">
                                {loading ? <Loader2 size={14} className="animate-spin" /> : <GitCompare size={14} />} Compare Specs
                            </button>
                            <button onClick={loadExample}
                                className="px-4 py-2 rounded-lg text-xs font-medium border border-white/10 hover:bg-white/5 transition-colors">
                                Load Example
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            {[
                                { label: "Old Spec File", ref: oldFileRef },
                                { label: "New Spec File", ref: newFileRef },
                            ].map(({ label, ref }) => (
                                <div key={label}>
                                    <label className="block text-[10px] uppercase tracking-wider opacity-50 mb-1.5">{label}</label>
                                    <div className="border-2 border-dashed border-white/10 rounded-xl p-6 text-center cursor-pointer hover:border-[var(--color-chart-2)]/40 transition-colors"
                                        onClick={() => ref.current?.click()}>
                                        <Upload size={20} className="mx-auto opacity-30 mb-2" />
                                        <p className="text-xs opacity-50">.yaml / .yml / .json</p>
                                        <input ref={ref} type="file" accept=".yaml,.yml,.json" className="hidden" />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button onClick={uploadCompare} disabled={loading}
                            className="px-5 py-2.5 rounded-lg text-sm font-bold bg-[var(--color-chart-2)] hover:opacity-90 text-[var(--color-primary-foreground)] disabled:opacity-40 transition-all flex items-center gap-2">
                            {loading ? <Loader2 size={14} className="animate-spin" /> : <GitCompare size={14} />} Compare Files
                        </button>
                    </div>
                )}
            </div>

            {/* Results */}
            {data && <SpecDiffResults data={data} />}
        </div>
    );
}

function SpecDiffResults({ data }: { data: SpecDiffResult }) {
    const bySeverity = data.summary.by_severity ?? {};
    const severityOrder = ["critical", "high", "medium", "low"];

    return (
        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard icon={<AlertTriangle size={16} className="text-[var(--color-destructive)]" />} label="Breaking Changes" value={String(data.summary.total_breaking)} accent={data.summary.total_breaking > 0 ? "border-[var(--color-destructive)]/30" : undefined} />
                <StatCard icon={<GitCompare size={16} className="text-[var(--color-chart-2)]" />} label="Endpoints Affected" value={String(data.summary.endpoints_affected)} />
                <StatCard icon={<GitCompare size={16} className="text-[var(--color-accent)]" />} label="Schemas Affected" value={String(data.summary.schemas_affected)} />
                <StatCard icon={<CheckCircle2 size={16} className="text-[var(--color-chart-4)]" />} label="Endpoints Added" value={String(data.added_endpoints.length)} />
            </div>

            {/* Severity breakdown */}
            {data.summary.total_breaking > 0 && (
                <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-5">
                    <p className="text-[10px] uppercase tracking-wider opacity-50 mb-3">Severity Breakdown</p>
                    <div className="space-y-2">
                        {severityOrder.map(sev => {
                            const count = bySeverity[sev] ?? 0;
                            const pct = data.summary.total_breaking > 0 ? (count / data.summary.total_breaking) * 100 : 0;
                            const bars: Record<string, string> = {
                                critical: "var(--color-destructive)",
                                high: "var(--color-primary)",
                                medium: "var(--color-accent)",
                                low: "var(--color-chart-4)",
                            };
                            return (
                                <div key={sev} className="flex items-center gap-3">
                                    <SeverityBadge severity={sev} />
                                    <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: bars[sev] }} />
                                    </div>
                                    <span className="text-xs opacity-50 w-6 text-right">{count}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Breaking changes list */}
            {data.breaking_changes.length > 0 && (
                <CollapsibleSection title="All Breaking Changes" icon={<AlertTriangle size={14} className="text-[var(--color-destructive)]" />} badge={String(data.breaking_changes.length)} defaultOpen>
                    <div className="space-y-2">
                        {data.breaking_changes.map((bc, i) => <BreakingChangeRow key={i} bc={bc} />)}
                    </div>
                </CollapsibleSection>
            )}

            {/* Added endpoints */}
            {data.added_endpoints.length > 0 && (
                <CollapsibleSection title="Added Endpoints" icon={<Plus size={14} className="text-[var(--color-chart-4)]" />} badge={String(data.added_endpoints.length)}>
                    <div className="space-y-1.5">
                        {data.added_endpoints.map((ep, i) => (
                            <div key={i} className="flex items-center gap-3 bg-[var(--color-chart-4)]/5 border border-[var(--color-chart-4)]/20 rounded-lg px-3 py-2 text-xs">
                                <Plus size={10} className="text-[var(--color-chart-4)] flex-shrink-0" />
                                <code className="font-bold text-[var(--color-chart-4)]">{ep.method}</code>
                                <code>{ep.path}</code>
                                {ep.summary && <span className="opacity-50 truncate">{ep.summary}</span>}
                            </div>
                        ))}
                    </div>
                </CollapsibleSection>
            )}

            {/* Removed endpoints */}
            {data.removed_endpoints.length > 0 && (
                <CollapsibleSection title="Removed Endpoints" icon={<Minus size={14} className="text-[var(--color-destructive)]" />} badge={String(data.removed_endpoints.length)}>
                    <div className="space-y-1.5">
                        {data.removed_endpoints.map((ep, i) => (
                            <div key={i} className="flex items-center gap-3 bg-[var(--color-destructive)]/5 border border-[var(--color-destructive)]/20 rounded-lg px-3 py-2 text-xs">
                                <Minus size={10} className="text-[var(--color-destructive)] flex-shrink-0" />
                                <code className="font-bold text-[var(--color-destructive)]">{ep.method}</code>
                                <code>{ep.path}</code>
                                {ep.summary && <span className="opacity-50 truncate">{ep.summary}</span>}
                            </div>
                        ))}
                    </div>
                </CollapsibleSection>
            )}

            {/* Impacted services from graph */}
            {data.impacted_services && data.impacted_services.length > 0 && (
                <CollapsibleSection title="Graph-Matched Impacted Services" icon={<CheckCircle2 size={14} className="text-[var(--color-chart-5)]" />} badge={String(data.impacted_services.length)}>
                    <div className="space-y-1.5">
                        {data.impacted_services.map((s, i) => (
                            <div key={i} className="flex items-center gap-3 bg-[var(--color-chart-5)]/5 border border-[var(--color-chart-5)]/20 rounded-lg px-3 py-2 text-xs">
                                <span className="px-1.5 py-0.5 rounded-full border border-[var(--color-chart-5)]/30 text-[var(--color-chart-5)] text-[10px]">{s.type}</span>
                                <span className="font-medium">{s.service}</span>
                                <span className="opacity-50 truncate">{s.detail}</span>
                            </div>
                        ))}
                    </div>
                </CollapsibleSection>
            )}
        </div>
    );
}
