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
    Service: "bg-[var(--color-chart-4)]/15 text-[var(--color-chart-4)] border-[var(--color-chart-4)]/40",
    Module: "bg-[var(--color-chart-5)]/15 text-[var(--color-chart-5)] border-[var(--color-chart-5)]/40",
    File: "bg-[var(--color-chart-3)]/15 text-[var(--color-chart-3)] border-[var(--color-chart-3)]/40",
    Class: "bg-[var(--color-chart-2)]/15 text-[var(--color-chart-2)] border-[var(--color-chart-2)]/40",
    Function: "bg-[var(--color-chart-1)]/10 text-[var(--color-foreground)] border-[var(--color-border)]",
    Schema: "bg-[var(--color-accent)]/15 text-[var(--color-accent)] border-[var(--color-accent)]/40",
    Endpoint: "bg-[var(--color-destructive)]/15 text-[var(--color-destructive)] border-[var(--color-destructive)]/40",
    Database: "bg-[var(--color-primary)]/15 text-[var(--color-primary)] border-[var(--color-primary)]/40",
    Table: "bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-[var(--color-primary)]/30",
    MessageQueue: "bg-[var(--color-secondary)]/10 text-[var(--color-foreground)] border-[var(--color-border)]",
    Developer: "bg-[var(--color-accent)]/10 text-[var(--color-accent)] border-[var(--color-accent)]/30",
};

export const SEVERITY_CONFIG: Record<string, { color: string; bar: string; label: string }> = {
    critical: { color: "text-[var(--color-destructive)] border-[var(--color-destructive)]/50 bg-[var(--color-destructive)]/10", bar: "bg-[var(--color-destructive)]", label: "CRITICAL" },
    high: { color: "text-[var(--color-primary)] border-[var(--color-primary)]/50 bg-[var(--color-primary)]/10", bar: "bg-[var(--color-primary)]", label: "HIGH" },
    medium: { color: "text-[var(--color-accent)] border-[var(--color-accent)]/50 bg-[var(--color-accent)]/10", bar: "bg-[var(--color-accent)]", label: "MEDIUM" },
    low: { color: "text-[var(--color-chart-4)] border-[var(--color-chart-4)]/50 bg-[var(--color-chart-4)]/10", bar: "bg-[var(--color-chart-4)]", label: "LOW" },
    none: { color: "text-[var(--color-muted-foreground)] border-[var(--color-border)] bg-[var(--color-muted)]", bar: "bg-[var(--color-border)]", label: "NONE" },
};

export const RISK_CONFIG: Record<string, { color: string; glow: string }> = {
    LOW: { color: "text-[var(--color-chart-4)] bg-[var(--color-chart-4)]/10 border-[var(--color-chart-4)]/30", glow: "shadow-md" },
    MEDIUM: { color: "text-[var(--color-accent)] bg-[var(--color-accent)]/10 border-[var(--color-accent)]/30", glow: "shadow-md" },
    HIGH: { color: "text-[var(--color-primary)] bg-[var(--color-primary)]/10 border-[var(--color-primary)]/30", glow: "shadow-md" },
    CRITICAL: { color: "text-[var(--color-destructive)] bg-[var(--color-destructive)]/10 border-[var(--color-destructive)]/30", glow: "shadow-md" },
};
