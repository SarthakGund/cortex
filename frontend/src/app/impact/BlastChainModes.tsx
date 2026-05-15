"use client";
import { useState } from "react";
import { Search, Loader2, Target, ArrowLeft, ArrowRight, Network, Shield, Zap } from "lucide-react";
import type { BlastRadius, ChainResult, SearchResult } from "./types";
import { StatCard, HeatBar, RiskBanner, CollapsibleSection, DirectionList, TypeGroupedList } from "./components";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Blast Radius Mode ──────────────────────────────────────────────────────

export function BlastRadiusMode({ authHeaders }: { authHeaders: Record<string, string> }) {
    const [q, setQ] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [selected, setSelected] = useState<SearchResult | null>(null);
    const [data, setData] = useState<BlastRadius | null>(null);
    const [loading, setLoading] = useState(false);
    const [depth, setDepth] = useState(4);
    const [withSummary, setWithSummary] = useState(false);
    const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

    const doSearch = async (val: string) => {
        if (val.length < 2) { setResults([]); return; }
        setSearching(true);
        try {
            const r = await fetch(`${API}/impact/search?q=${encodeURIComponent(val)}&limit=15`, { headers: authHeaders });
            if (r.ok) { const d = await r.json(); setResults(d.results ?? []); }
        } catch { /* ignore */ }
        setSearching(false);
    };

    const onType = (val: string) => {
        setQ(val);
        if (timer) clearTimeout(timer);
        setTimer(setTimeout(() => doSearch(val), 280));
    };

    const analyze = async (node?: SearchResult) => {
        const target = node ?? selected ?? (q.trim() ? { name: q.trim(), type: "", service: "", file: "" } : null);
        if (!target) return;
        setSelected(target); setResults([]); setQ(target.name); setLoading(true); setData(null);
        try {
            const ep = withSummary ? "/impact/summary" : "/impact/blast-radius";
            const params = new URLSearchParams({ node: target.name, depth: depth.toString(), ...(target.type ? { node_type: target.type } : {}) });
            const r = await fetch(`${API}${ep}?${params}`, { headers: authHeaders });
            if (r.ok) setData(await r.json());
        } catch { /* ignore */ }
        setLoading(false);
    };

    return (
        <div className="space-y-5">
            {/* Controls */}
            <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-5">
                <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
                    <Target size={16} className="text-orange-400" /> Select a Component to Analyze
                </h2>
                <div className="flex gap-3 flex-wrap">
                    <div className="flex-1 min-w-[200px] relative">
                        <Search size={14} className="absolute left-3 top-3 opacity-40" />
                        <input value={q} onChange={e => onType(e.target.value)} onKeyDown={e => e.key === "Enter" && analyze()}
                            placeholder="Search by name, endpoint, function, schema…"
                            className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-orange-500/60 placeholder:opacity-40 transition-colors" />
                        {results.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto">
                                {results.map((r, i) => (
                                    <button key={i} onClick={() => analyze(r)}
                                        className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center gap-3 text-sm border-b border-white/5 last:border-0">
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${r.type ? `bg-slate-700 text-slate-300 border-slate-600` : ""}`}>{r.type}</span>
                                        <span className="flex-1 truncate">{r.name}</span>
                                        {r.service && <span className="text-[10px] opacity-40">{r.service}</span>}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <label className="flex items-center gap-1.5 text-xs opacity-70">
                            Depth:
                            <select value={depth} onChange={e => setDepth(Number(e.target.value))}
                                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs">
                                {[1, 2, 3, 4, 5, 6].map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </label>
                        <label className="flex items-center gap-1.5 text-xs opacity-70 cursor-pointer select-none">
                            <input type="checkbox" checked={withSummary} onChange={e => setWithSummary(e.target.checked)} className="rounded" />
                            AI Summary
                        </label>
                        <button onClick={() => analyze()} disabled={loading || !q.trim()}
                            className="px-4 py-2 rounded-lg text-sm font-bold bg-orange-500 hover:bg-orange-400 text-black disabled:opacity-40 transition-all flex items-center gap-2">
                            {loading ? <Loader2 size={14} className="animate-spin" /> : <Target size={14} />} Analyze
                        </button>
                    </div>
                </div>
                {searching && <p className="text-xs opacity-40 mt-2 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Searching…</p>}
            </div>

            {/* Results */}
            {data && <BlastRadiusResult data={data} />}
        </div>
    );
}

function BlastRadiusResult({ data }: { data: BlastRadius }) {
    return (
        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard icon={<Target size={16} className="text-orange-400" />} label="Target" value={data.node} sub={data.node_type ?? "Auto-detected"} />
                <StatCard icon={<ArrowLeft size={16} className="text-red-400" />} label="Upstream" value={String(data.upstream.count)} sub="Components that depend on this" accent="border-red-500/20" />
                <StatCard icon={<ArrowRight size={16} className="text-blue-400" />} label="Downstream" value={String(data.downstream.count)} sub="This component's dependencies" accent="border-blue-500/20" />
                <StatCard icon={<Shield size={16} className="text-amber-400" />} label="Services" value={String(data.affected_services.length)} sub={data.affected_services.slice(0, 2).join(", ") || "none"} accent="border-amber-500/20" />
            </div>

            {/* Heat Map */}
            <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-5">
                <h3 className="text-xs uppercase tracking-wider opacity-50 mb-4 flex items-center gap-2"><Zap size={12} /> Impact Heat Map</h3>
                <HeatBar items={data.upstream.items} label="Upstream (affected by changes)" />
                <HeatBar items={data.downstream.items} label="Downstream (dependencies)" />
            </div>

            {/* AIRisk */}
            {data.risk_level && (
                <RiskBanner risk={data.risk_level} summary={data.summary} areas={data.affected_areas} recs={data.recommendations} breaking={data.breaking_change_risk} />
            )}

            {/* Direct */}
            {data.direct.length > 0 && (
                <CollapsibleSection title="Direct Connections" icon={<Network size={14} className="text-purple-400" />} badge={String(data.direct.length)}>
                    <DirectionList items={data.direct} />
                </CollapsibleSection>
            )}

            {/* Upstream */}
            <CollapsibleSection title={`Upstream — depends on "${data.node}"`} icon={<ArrowLeft size={14} className="text-red-400" />} badge={String(data.upstream.count)} defaultOpen>
                <TypeGroupedList by_type={data.upstream.by_type} direction="upstream" />
            </CollapsibleSection>

            {/* Downstream */}
            <CollapsibleSection title={`Downstream — "${data.node}" depends on`} icon={<ArrowRight size={14} className="text-blue-400" />} badge={String(data.downstream.count)}>
                <TypeGroupedList by_type={data.downstream.by_type} direction="downstream" />
            </CollapsibleSection>
        </div>
    );
}

// ── Dependency Chain Mode ──────────────────────────────────────────────────

export function ChainMode({ authHeaders }: { authHeaders: Record<string, string> }) {
    const [source, setSource] = useState("");
    const [target, setTarget] = useState("");
    const [data, setData] = useState<ChainResult | null>(null);
    const [loading, setLoading] = useState(false);

    const find = async () => {
        if (!source.trim() || !target.trim()) return;
        setLoading(true); setData(null);
        try {
            const r = await fetch(`${API}/impact/chain?source=${encodeURIComponent(source)}&target=${encodeURIComponent(target)}`, { headers: authHeaders });
            if (r.ok) setData(await r.json());
        } catch { /* ignore */ }
        setLoading(false);
    };

    return (
        <div className="space-y-5">
            <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-5">
                <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
                    <Network size={16} className="text-blue-400" /> Find Dependency Chain
                </h2>
                <div className="flex gap-3 items-end flex-wrap">
                    <div className="flex-1 min-w-[150px]">
                        <label className="block text-[10px] uppercase tracking-wider opacity-50 mb-1.5">Source</label>
                        <input value={source} onChange={e => setSource(e.target.value)} placeholder="e.g. auth-service"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500/60 placeholder:opacity-40" />
                    </div>
                    <ArrowRight size={18} className="opacity-30 mb-3" />
                    <div className="flex-1 min-w-[150px]">
                        <label className="block text-[10px] uppercase tracking-wider opacity-50 mb-1.5">Target</label>
                        <input value={target} onChange={e => setTarget(e.target.value)} placeholder="e.g. payment-service"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500/60 placeholder:opacity-40" />
                    </div>
                    <button onClick={find} disabled={loading || !source.trim() || !target.trim()}
                        className="px-4 py-2.5 rounded-lg text-sm font-bold bg-blue-500 hover:bg-blue-400 text-black disabled:opacity-40 transition-all flex items-center gap-2">
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Network size={14} />} Find Path
                    </button>
                </div>
            </div>

            {data && (
                data.found ? (
                    <div className="space-y-3 animate-in slide-in-from-bottom-4 duration-300">
                        {data.chains.map((chain, ci) => (
                            <div key={ci} className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-5">
                                <p className="text-xs uppercase tracking-wider opacity-50 mb-4">Path {ci + 1} — {chain.hops} hop{chain.hops !== 1 ? "s" : ""}</p>
                                <div className="flex items-center flex-wrap gap-2">
                                    {chain.steps.map((step, si) => (
                                        <div key={si} className="flex items-center gap-2">
                                            <div className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-sm flex items-center gap-1.5">
                                                <span className="text-[10px] opacity-40 font-mono">{step.type}</span>
                                                <span>{step.name}</span>
                                            </div>
                                            {step.edge && (
                                                <div className="flex items-center gap-1 text-[10px] opacity-40">
                                                    <ArrowRight size={10} />
                                                    <code>{step.edge}</code>
                                                    <ArrowRight size={10} />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-10 text-center">
                        <p className="opacity-40 text-sm">No path found between <strong className="opacity-80">{data.source}</strong> and <strong className="opacity-80">{data.target}</strong></p>
                    </div>
                )
            )}
        </div>
    );
}
