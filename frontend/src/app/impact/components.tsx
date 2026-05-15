"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TYPE_COLORS, SEVERITY_CONFIG, RISK_CONFIG } from "./types";
import type { BlastItem, DirectItem, BreakingChange } from "./types";

// ── TypeBadge ──────────────────────────────────────────────────────────────

export function TypeBadge({ type }: { type: string }) {
    return (
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${TYPE_COLORS[type] ?? "bg-slate-700 text-slate-300 border-slate-600"}`}>
            {type}
        </span>
    );
}

// ── SeverityBadge ──────────────────────────────────────────────────────────

export function SeverityBadge({ severity }: { severity: string }) {
    const cfg = SEVERITY_CONFIG[severity?.toLowerCase()] ?? SEVERITY_CONFIG.none;
    return (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${cfg.color}`}>
            {cfg.label}
        </span>
    );
}

// ── RiskBanner ─────────────────────────────────────────────────────────────

export function RiskBanner({ risk, summary, areas, recs, breaking }: {
    risk: string; summary?: string; areas?: string[]; recs?: string[]; breaking?: string;
}) {
    const cfg = RISK_CONFIG[risk] ?? RISK_CONFIG.MEDIUM;
    return (
        <div className={`rounded-xl border p-5 shadow-lg ${cfg.color} ${cfg.glow}`}>
            <div className="flex items-center gap-3 mb-3">
                <RiskDot risk={risk} />
                <span className="font-bold text-sm uppercase tracking-widest">{risk} Risk</span>
            </div>
            {summary && <p className="text-sm mb-3 leading-relaxed opacity-90">{summary}</p>}
            {breaking && (
                <p className="text-xs mb-3 opacity-80">
                    <span className="font-semibold">Breaking change risk: </span>{breaking}
                </p>
            )}
            {areas && areas.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                    {areas.map((a, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-full text-[10px] bg-black/20 border border-white/10">{a}</span>
                    ))}
                </div>
            )}
            {recs && recs.length > 0 && (
                <div>
                    <p className="text-[10px] uppercase tracking-wider opacity-60 mb-2">Recommendations</p>
                    <ol className="space-y-1">
                        {recs.map((r, i) => (
                            <li key={i} className="text-xs flex gap-2 opacity-80">
                                <span className="opacity-50 flex-shrink-0">{i + 1}.</span> {r}
                            </li>
                        ))}
                    </ol>
                </div>
            )}
        </div>
    );
}

function RiskDot({ risk }: { risk: string }) {
    const colors: Record<string, string> = {
        LOW: "bg-green-400", MEDIUM: "bg-yellow-400", HIGH: "bg-orange-400", CRITICAL: "bg-red-400",
    };
    return <span className={`w-3 h-3 rounded-full ${colors[risk] ?? "bg-slate-400"} shadow-lg`} />;
}

// ── CollapsibleSection ─────────────────────────────────────────────────────

export function CollapsibleSection({ title, icon, defaultOpen = false, badge, children }: {
    title: string; icon: React.ReactNode; defaultOpen?: boolean; badge?: string; children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl overflow-hidden">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center gap-2 px-5 py-3.5 text-sm font-medium hover:bg-white/5 transition-colors text-left"
            >
                {open ? <ChevronDown size={14} className="opacity-60" /> : <ChevronRight size={14} className="opacity-60" />}
                {icon}
                <span className="flex-1">{title}</span>
                {badge && (
                    <span className="px-2 py-0.5 rounded-full bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-[10px] font-bold">
                        {badge}
                    </span>
                )}
            </button>
            {open && <div className="px-5 pb-4">{children}</div>}
        </div>
    );
}

// ── StatCard ───────────────────────────────────────────────────────────────

export function StatCard({ icon, label, value, sub, accent }: {
    icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string;
}) {
    return (
        <div className={`bg-[var(--color-card)] border rounded-xl p-4 ${accent ?? "border-[var(--color-border)]"}`}>
            <div className="flex items-center gap-2 mb-2">
                {icon}
                <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">{label}</span>
            </div>
            <p className="text-2xl font-black">{value}</p>
            {sub && <p className="text-[10px] text-[var(--color-text-muted)] truncate mt-0.5">{sub}</p>}
        </div>
    );
}

// ── HeatBar ────────────────────────────────────────────────────────────────

export function HeatBar({ items, label }: { items: BlastItem[]; label: string }) {
    const byType: Record<string, number> = {};
    for (const item of items) byType[item.type] = (byType[item.type] ?? 0) + 1;
    const total = items.length;
    const colors = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-emerald-500", "bg-cyan-500", "bg-indigo-500", "bg-purple-500", "bg-pink-500"];
    const types = Object.entries(byType);
    return (
        <div className="mb-3">
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">{label} ({total})</p>
            {total > 0 ? (
                <>
                    <div className="flex h-3 rounded-full overflow-hidden gap-px">
                        {types.map(([type, count], i) => (
                            <div
                                key={type}
                                className={`${colors[i % colors.length]} transition-all`}
                                style={{ width: `${(count / total) * 100}%` }}
                                title={`${type}: ${count}`}
                            />
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                        {types.map(([type, count], i) => (
                            <span key={type} className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
                                <span className={`w-2 h-2 rounded-full ${colors[i % colors.length]}`} />
                                {type} ({count})
                            </span>
                        ))}
                    </div>
                </>
            ) : (
                <p className="text-xs text-[var(--color-text-muted)] italic">None</p>
            )}
        </div>
    );
}

// ── DirectionList ──────────────────────────────────────────────────────────

export function DirectionList({ items }: { items: DirectItem[] }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {items.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-white/5 rounded-lg px-3 py-2 border border-white/10">
                    <span className={`text-[10px] font-mono ${d.direction === "incoming" ? "text-red-400" : "text-blue-400"}`}>
                        {d.direction === "incoming" ? "←" : "→"}
                    </span>
                    <TypeBadge type={d.type} />
                    <span className="flex-1 truncate">{d.name}</span>
                    <span className="text-[10px] opacity-40 font-mono">{d.relationship}</span>
                </div>
            ))}
        </div>
    );
}

// ── ItemRow ────────────────────────────────────────────────────────────────

export function ItemRow({ item }: { item: BlastItem }) {
    return (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-white/5 bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
            <TypeBadge type={item.type} />
            <span className="flex-1 truncate">{item.name}</span>
            {item.service && <span className="text-[10px] opacity-40 truncate max-w-[80px]">{item.service}</span>}
            {item.rel_chain.length > 0 && (
                <span className="text-[10px] font-mono opacity-30 hidden lg:block">{item.rel_chain.slice(0, 2).join(" → ")}</span>
            )}
        </div>
    );
}

// ── TypeGroupedList ───────────────────────────────────────────────────────

export function TypeGroupedList({ by_type, direction }: { by_type: Record<string, BlastItem[]>; direction: string }) {
    if (Object.keys(by_type).length === 0) {
        return <p className="text-sm opacity-40 italic py-2">No {direction} dependencies found.</p>;
    }
    return (
        <div className="space-y-4">
            {Object.entries(by_type).map(([type, items]) => (
                <div key={type}>
                    <div className="flex items-center gap-2 mb-2">
                        <TypeBadge type={type} />
                        <span className="text-xs opacity-50">({items.length})</span>
                    </div>
                    <div className="space-y-1 pl-2">
                        {items.slice(0, 20).map((item, i) => <ItemRow key={i} item={item} />)}
                        {items.length > 20 && (
                            <p className="text-[10px] opacity-40 pl-3">+ {items.length - 20} more</p>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ── BreakingChangeRow ─────────────────────────────────────────────────────

export function BreakingChangeRow({ bc }: { bc: BreakingChange }) {
    const cfg = SEVERITY_CONFIG[bc.severity?.toLowerCase()] ?? SEVERITY_CONFIG.none;
    return (
        <div className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${cfg.color}`}>
            <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${cfg.bar}`} />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <SeverityBadge severity={bc.severity} />
                    <code className="text-[10px] opacity-60">{bc.type}</code>
                    {bc.path && <code className="text-[10px] opacity-50">{bc.method} {bc.path}</code>}
                    {bc.field_name && <code className="text-[10px] opacity-50">.{bc.field_name}</code>}
                </div>
                <p className="text-xs opacity-80">{bc.description}</p>
            </div>
        </div>
    );
}

// ── MigrationSteps ────────────────────────────────────────────────────────

export function MigrationSteps({ steps }: { steps: string[] }) {
    if (!steps.length) return null;
    return (
        <div className="space-y-2">
            {steps.map((step, i) => (
                <div key={i} className="flex gap-3 text-xs">
                    <span className="w-5 h-5 rounded-full bg-[var(--color-primary)]/20 text-[var(--color-primary)] flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">
                        {i + 1}
                    </span>
                    <span className="opacity-80 leading-relaxed">{step.replace(/^\d+\.\s*/, "")}</span>
                </div>
            ))}
        </div>
    );
}
