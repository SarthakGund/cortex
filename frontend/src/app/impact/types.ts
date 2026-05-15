// ── Shared Types ──────────────────────────────────────────────────────────────

export interface SearchResult {
    type: string;
    name: string;
    service: string;
    file: string;
}

export interface BlastItem {
    type: string;
    name: string;
    service: string;
    file: string;
    rel_chain: string[];
    node_chain: string[];
    label_chain: string[];
    distance?: number;
}

export interface DirectItem {
    type: string;
    name: string;
    service: string;
    relationship: string;
    direction: string;
}

export interface BlastRadius {
    node: string;
    node_type: string;
    depth: number;
    upstream: { count: number; by_type: Record<string, BlastItem[]>; items: BlastItem[] };
    downstream: { count: number; by_type: Record<string, BlastItem[]>; items: BlastItem[] };
    direct: DirectItem[];
    affected_services: string[];
    total_affected: number;
    risk_level?: string;
    summary?: string;
    affected_areas?: string[];
    recommendations?: string[];
    breaking_change_risk?: string;
}

export interface ChainStep {
    name: string;
    type: string;
    edge?: string;
}

export interface Chain {
    steps: ChainStep[];
    hops: number;
}

export interface ChainResult {
    source: string;
    target: string;
    chains: Chain[];
    found: boolean;
}

export interface BreakingChange {
    type: string;
    severity: "critical" | "high" | "medium" | "low" | "none";
    path?: string;
    method?: string;
    schema_name?: string;
    field_name?: string;
    description: string;
}

export interface SpecDiffResult {
    added_endpoints: Array<{ path: string; method: string; summary?: string }>;
    removed_endpoints: Array<{ path: string; method: string; summary?: string }>;
    modified_endpoints: Array<{ path: string; method: string; changes: unknown[] }>;
    added_schemas: Array<{ name: string }>;
    removed_schemas: Array<{ name: string }>;
    modified_schemas: Array<{ schema: string; field_changes: unknown[] }>;
    breaking_changes: BreakingChange[];
    summary: {
        total_breaking: number;
        by_severity: Record<string, number>;
        endpoints_affected: number;
        schemas_affected: number;
    };
    impacted_services?: Array<{ service: string; type: string; detail: string }>;
    versions?: { old: string; new: string };
}

export interface WhatIfResult {
    scenario: { type: string; target: string; target_type: string; parameters: Record<string, string> };
    affected_nodes: {
        upstream: { count: number; by_type: Record<string, BlastItem[]>; items: BlastItem[] };
        downstream: { count: number; by_type: Record<string, BlastItem[]>; items: BlastItem[] };
        affected_services: string[];
        total_affected: number;
    };
    affected_services: string[];
    breaking_changes: Array<{
        type: string; severity: string; description: string;
        path?: string; method?: string; schema_name?: string; field_name?: string;
    }>;
    risk_level: string;
    impact_summary: string;
    recommendations: string[];
    cascading_failures: Array<{ source: string; source_type: string; chain: string; severity: string; description: string }>;
    migration_steps: string[];
}

export type ImpactMode = "blast" | "chain" | "whatif" | "specdiff";

export const TYPE_COLORS: Record<string, string> = {
    Service: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
    Module: "bg-violet-500/20 text-violet-300 border-violet-500/40",
    File: "bg-purple-500/20 text-purple-300 border-purple-500/40",
    Class: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
    Function: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    Schema: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    Endpoint: "bg-red-500/20 text-red-300 border-red-500/40",
    Database: "bg-orange-500/20 text-orange-300 border-orange-500/40",
    Table: "bg-orange-500/20 text-orange-300 border-orange-500/40",
    MessageQueue: "bg-pink-500/20 text-pink-300 border-pink-500/40",
    Developer: "bg-lime-500/20 text-lime-300 border-lime-500/40",
};

export const SEVERITY_CONFIG: Record<string, { color: string; bar: string; label: string }> = {
    critical: { color: "text-red-400 border-red-500/50 bg-red-500/10", bar: "bg-red-500", label: "CRITICAL" },
    high: { color: "text-orange-400 border-orange-500/50 bg-orange-500/10", bar: "bg-orange-500", label: "HIGH" },
    medium: { color: "text-yellow-400 border-yellow-500/50 bg-yellow-500/10", bar: "bg-yellow-500", label: "MEDIUM" },
    low: { color: "text-green-400 border-green-500/50 bg-green-500/10", bar: "bg-green-500", label: "LOW" },
    none: { color: "text-slate-400 border-slate-500/50 bg-slate-500/10", bar: "bg-slate-500", label: "NONE" },
};

export const RISK_CONFIG: Record<string, { color: string; glow: string }> = {
    LOW: { color: "text-green-400 bg-green-500/10 border-green-500/30", glow: "shadow-green-500/20" },
    MEDIUM: { color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30", glow: "shadow-yellow-500/20" },
    HIGH: { color: "text-orange-400 bg-orange-500/10 border-orange-500/30", glow: "shadow-orange-500/20" },
    CRITICAL: { color: "text-red-400 bg-red-500/10 border-red-500/30", glow: "shadow-red-500/20" },
};
