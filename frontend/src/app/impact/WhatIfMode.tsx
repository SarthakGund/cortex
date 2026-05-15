"use client";
import { useState } from "react";
import { FlaskConical, Loader2, ChevronDown, AlertTriangle, GitMerge, Layers } from "lucide-react";
import type { WhatIfResult, SearchResult } from "./types";
import { SeverityBadge, RiskBanner, CollapsibleSection, BreakingChangeRow, MigrationSteps, StatCard } from "./components";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const SCENARIO_TYPES = [
    { value: "deprecate_endpoint", label: "Deprecate Endpoint", icon: "⚠️", color: "text-yellow-400" },
    { value: "remove_endpoint", label: "Remove Endpoint", icon: "🗑️", color: "text-red-400" },
    { value: "change_field_type", label: "Change Field Type", icon: "🔄", color: "text-orange-400" },
    { value: "remove_schema", label: "Remove Schema", icon: "💀", color: "text-red-500" },
    { value: "add_schema", label: "Add New Schema", icon: "✨", color: "text-green-400" },
    { value: "add_endpoint", label: "Add New Endpoint", icon: "➕", color: "text-green-400" },
    { value: "change_endpoint_signature", "label": "Change Endpoint Signature", icon: "📝", color: "text-blue-400" },
];

export function WhatIfMode({ authHeaders }: { authHeaders: Record<string, string> }) {
    const [target, setTarget] = useState("");
    const [targetType, setTargetType] = useState("");
    const [scenarioType, setScenarioType] = useState("deprecate_endpoint");
    const [fieldName, setFieldName] = useState("");
    const [oldType, setOldType] = useState("");
    const [newType, setNewType] = useState("");
    const [changeDesc, setChangeDesc] = useState("");
    const [data, setData] = useState<WhatIfResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [searchQ, setSearchQ] = useState("");
    const [searchRes, setSearchRes] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

    const doSearch = async (val: string) => {
        if (val.length < 2) { setSearchRes([]); return; }
        setSearching(true);
        try {
            const r = await fetch(`${API}/impact/search?q=${encodeURIComponent(val)}&limit=12`, { headers: authHeaders });
            if (r.ok) { const d = await r.json(); setSearchRes(d.results ?? []); }
        } catch { /* ignore */ }
        setSearching(false);
    };

    const onSearchType = (val: string) => {
        setSearchQ(val); setTarget(val);
        if (timer) clearTimeout(timer);
        setTimer(setTimeout(() => doSearch(val), 280));
    };

    const selectNode = (r: SearchResult) => {
        setTarget(r.name); setSearchQ(r.name); setTargetType(r.type); setSearchRes([]);
    };

    const needsFieldParams = scenarioType === "change_field_type";
    const needsChangeDesc = scenarioType === "change_endpoint_signature";

    const run = async () => {
        if (!target.trim()) return;
        setLoading(true); setData(null);
        const parameters: Record<string, string> = {};
        if (needsFieldParams) { parameters.field = fieldName; parameters.old_type = oldType; parameters.new_type = newType; }
        if (needsChangeDesc) { parameters.change_description = changeDesc; }
        try {
            const r = await fetch(`${API}/impact/whatif`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify({ type: scenarioType, target, target_type: targetType, parameters }),
            });
            if (r.ok) setData(await r.json());
        } catch { /* ignore */ }
        setLoading(false);
    };

    const selectedScenario = SCENARIO_TYPES.find(s => s.value === scenarioType);

    return (
        <div className="space-y-5">
            {/* Config panel */}
            <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-5">
                <h2 className="font-semibold text-sm mb-5 flex items-center gap-2">
                    <FlaskConical size={16} className="text-purple-400" /> Configure What-If Scenario
                </h2>

                {/* Scenario picker */}
                <div className="mb-4">
                    <label className="block text-[10px] uppercase tracking-wider opacity-50 mb-2">Scenario Type</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                        {SCENARIO_TYPES.map(s => (
                            <button key={s.value} onClick={() => setScenarioType(s.value)}
                                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${scenarioType === s.value
                                    ? "border-[var(--color-primary)]/60 bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                                    : "border-white/10 bg-white/5 opacity-60 hover:opacity-100"}`}>
                                <span>{s.icon}</span>
                                <span className="truncate">{s.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Target node search */}
                <div className="mb-4 relative">
                    <label className="block text-[10px] uppercase tracking-wider opacity-50 mb-2">Target Node</label>
                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                            <input value={searchQ} onChange={e => onSearchType(e.target.value)}
                                placeholder="Search for a service, endpoint, schema…"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500/60 placeholder:opacity-40" />
                            {searching && <Loader2 size={12} className="animate-spin absolute right-3 top-3 opacity-40" />}
                            {searchRes.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl shadow-2xl z-50 max-h-52 overflow-y-auto">
                                    {searchRes.map((r, i) => (
                                        <button key={i} onClick={() => selectNode(r)}
                                            className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center gap-2 text-xs border-b border-white/5 last:border-0">
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono border bg-white/5 border-white/10">{r.type}</span>
                                            <span className="flex-1 truncate">{r.name}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase tracking-wider opacity-50 mb-0 sr-only">Type</label>
                            <select value={targetType} onChange={e => setTargetType(e.target.value)}
                                className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs h-full">
                                <option value="">Any Type</option>
                                {["Service", "Endpoint", "Schema", "Function", "Module", "Class"].map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Scenario-specific params */}
                {needsFieldParams && (
                    <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-white/5 border border-white/10 rounded-lg">
                        <div>
                            <label className="block text-[10px] uppercase tracking-wider opacity-50 mb-1.5">Field Name</label>
                            <input value={fieldName} onChange={e => setFieldName(e.target.value)} placeholder="e.g. userId"
                                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-xs focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase tracking-wider opacity-50 mb-1.5">Old Type</label>
                            <input value={oldType} onChange={e => setOldType(e.target.value)} placeholder="e.g. string"
                                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-xs focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase tracking-wider opacity-50 mb-1.5">New Type</label>
                            <input value={newType} onChange={e => setNewType(e.target.value)} placeholder="e.g. integer"
                                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-xs focus:outline-none" />
                        </div>
                    </div>
                )}
                {needsChangeDesc && (
                    <div className="mb-4">
                        <label className="block text-[10px] uppercase tracking-wider opacity-50 mb-1.5">Change Description</label>
                        <textarea value={changeDesc} onChange={e => setChangeDesc(e.target.value)} rows={2}
                            placeholder="Describe the signature change…"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none resize-none" />
                    </div>
                )}

                <button onClick={run} disabled={loading || !target.trim()}
                    className="px-5 py-2.5 rounded-lg text-sm font-bold bg-purple-500 hover:bg-purple-400 text-black disabled:opacity-40 transition-all flex items-center gap-2">
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}
                    Simulate Scenario
                </button>
            </div>

            {/* Results */}
            {data && <WhatIfResults data={data} />}
        </div>
    );
}

function WhatIfResults({ data }: { data: WhatIfResult }) {
    return (
        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard icon={<FlaskConical size={16} className="text-purple-400" />} label="Scenario" value={data.scenario.type.replace(/_/g, " ")} />
                <StatCard icon={<AlertTriangle size={16} className="text-red-400" />} label="Breaking Changes" value={String(data.breaking_changes.length)} accent="border-red-500/20" />
                <StatCard icon={<GitMerge size={16} className="text-orange-400" />} label="Affected Nodes" value={String(data.affected_nodes.total_affected)} accent="border-orange-500/20" />
                <StatCard icon={<Layers size={16} className="text-blue-400" />} label="Affected Services" value={String(data.affected_services.length)} sub={data.affected_services.slice(0, 2).join(", ")} />
            </div>

            {/* Risk */}
            <RiskBanner risk={data.risk_level} summary={data.impact_summary} recs={data.recommendations} />

            {/* Breaking changes */}
            {data.breaking_changes.length > 0 && (
                <CollapsibleSection title="Breaking Changes" icon={<AlertTriangle size={14} className="text-red-400" />} badge={String(data.breaking_changes.length)} defaultOpen>
                    <div className="space-y-2">
                        {data.breaking_changes.map((bc, i) => (
                            <BreakingChangeRow key={i} bc={{ ...bc, severity: bc.severity as "critical" | "high" | "medium" | "low" | "none" }} />
                        ))}
                    </div>
                </CollapsibleSection>
            )}

            {/* Cascading failures */}
            {data.cascading_failures.length > 0 && (
                <CollapsibleSection title="Cascading Failure Paths" icon={<ChevronDown size={14} className="text-orange-400" />} badge={String(data.cascading_failures.length)}>
                    <div className="space-y-2">
                        {data.cascading_failures.map((cf, i) => (
                            <div key={i} className="flex gap-3 rounded-lg border border-orange-500/20 bg-orange-500/5 px-3 py-2.5 text-xs">
                                <div className="w-1 bg-orange-500 rounded-full flex-shrink-0" />
                                <div>
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <SeverityBadge severity={cf.severity.toLowerCase()} />
                                        <code className="opacity-60">{cf.source}</code>
                                    </div>
                                    <p className="opacity-70">{cf.description}</p>
                                    {cf.chain && <code className="text-[10px] opacity-40 mt-1 block">{cf.chain}</code>}
                                </div>
                            </div>
                        ))}
                    </div>
                </CollapsibleSection>
            )}

            {/* Migration plan */}
            {data.migration_steps.length > 0 && (
                <CollapsibleSection title="Migration Plan" icon={<GitMerge size={14} className="text-green-400" />} defaultOpen>
                    <MigrationSteps steps={data.migration_steps} />
                </CollapsibleSection>
            )}
        </div>
    );
}
