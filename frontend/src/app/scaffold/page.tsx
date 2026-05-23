"use client";

import { useState, useMemo } from "react";
import {
  Sparkles,
  Code2,
  Database,
  Network,
  Server,
  Download,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileCode2,
  GitBranch,
  Zap,
  Globe,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

import { API_BASE as API } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ServiceBlueprint {
  name: string;
  role: string;
  language: string;
  framework: string;
  database: { type: string; name: string };
  endpoints: { path: string; method: string; description: string }[];
  port: number;
  communicates_with: { service: string; protocol: string }[];
  env_vars: string[];
  responsibilities: string[];
}

interface Blueprint {
  system_name: string;
  summary: string;
  rationale: string;
  services: ServiceBlueprint[];
  api_gateway: { type: string; port: number };
  message_queues: { name: string; used_by: string[] }[];
  global_decisions: string;
  directory_structure_notes: string;
}

interface FileNode {
  path: string;
  content: string;
  size: number;
}

interface GenerateResponse {
  job_id: string;
  file_count: number;
  files: FileNode[];
  zip_base64: string;
  system_name: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const LANG_COLORS: Record<string, { borderColor: string }> = {
  python:     { borderColor: "#3b7dd8" },
  typescript: { borderColor: "#ffbf00" },
  go:         { borderColor: "#00acd7" },
  java:       { borderColor: "#e76f00" },
};

const DB_COLORS: Record<string, string> = {
  postgres: "text-[var(--color-foreground)] font-semibold",
  mongodb:  "text-[var(--color-foreground)] font-semibold",
  redis:    "text-[var(--color-primary)] font-semibold",
  mysql:    "text-[var(--color-foreground)] font-semibold",
  none:     "text-[var(--color-muted-foreground)]",
};

const PROTO_BASE = "border border-[var(--color-border)] shadow-[var(--shadow-xs)]";
const PROTO_COLORS: Record<string, string> = {
  REST:   `bg-[var(--color-card)] text-[var(--color-foreground)] ${PROTO_BASE}`,
  gRPC:   `bg-[var(--color-accent)] text-[var(--color-accent-foreground)] ${PROTO_BASE}`,
  events: `bg-[var(--color-primary)] text-[var(--color-primary-foreground)] ${PROTO_BASE}`,
};

const METHOD_COLORS: Record<string, string> = {
  GET:    "text-[var(--color-foreground)] font-bold",
  POST:   "text-[var(--color-accent-foreground)] bg-[var(--color-accent)] px-1",
  PUT:    "text-[var(--color-muted-foreground)] font-bold",
  DELETE: "text-[var(--color-primary)] font-bold",
  PATCH:  "text-[var(--color-muted-foreground)] font-semibold",
};

function fileIcon(path: string) {
  if (path.endsWith("Dockerfile")) return "🐳";
  if (path.endsWith(".yml") || path.endsWith(".yaml")) return "☸️";
  if (path.endsWith(".conf")) return "⚙️";
  if (path.endsWith(".md")) return "📄";
  if (path.endsWith(".json")) return "📦";
  if (path.endsWith(".py")) return "🐍";
  if (path.endsWith(".ts") || path.endsWith(".js")) return "🟨";
  if (path.endsWith(".go")) return "🔵";
  if (path.endsWith(".env.example")) return "🔑";
  return "📝";
}

function downloadBase64Zip(base64: string, filename: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ServiceCard({ svc }: { svc: ServiceBlueprint }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="swiss-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-[var(--color-muted)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[var(--color-primary)] border border-[var(--color-border)] flex items-center justify-center shadow-[var(--shadow-xs)]">
            <Server size={16} className="text-[var(--color-primary-foreground)]" />
          </div>
          <div>
            <div className="font-mono font-semibold text-[var(--color-foreground)] text-sm">{svc.name}</div>
            <div className="text-xs text-[var(--color-muted-foreground)] mt-0.5">{svc.role}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-xs px-2 py-0.5 font-mono border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)] shadow-[var(--shadow-xs)]"
            style={{
              borderLeftColor: LANG_COLORS[svc.language]?.borderColor ?? "var(--color-border)",
              borderLeftWidth: "4px",
            }}
          >
            {svc.framework}
          </span>
          <span className="text-xs text-[var(--color-muted-foreground)] font-mono">:{svc.port}</span>
          {open
            ? <ChevronDown size={14} className="text-[var(--color-muted-foreground)]" />
            : <ChevronRight size={14} className="text-[var(--color-muted-foreground)]" />
          }
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-[var(--color-border)] pt-3 bg-[var(--color-muted)]">
          {/* Database */}
          <div className="flex items-center gap-2 text-xs">
            <Database size={12} className="text-[var(--color-muted-foreground)]" />
            <span className="text-[var(--color-muted-foreground)]">Database:</span>
            <span className={DB_COLORS[svc.database?.type] ?? "text-[var(--color-foreground)] font-semibold"}>
              {svc.database?.type ?? "none"} {svc.database?.name ? `(${svc.database.name})` : ""}
            </span>
          </div>

          {/* Endpoints */}
          {svc.endpoints.length > 0 && (
            <div>
              <div className="text-xs text-[var(--color-muted-foreground)] mb-1.5 flex items-center gap-1 uppercase tracking-wide">
                <Globe size={11} /> Endpoints
              </div>
              <div className="space-y-1">
                {svc.endpoints.map((ep, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs font-mono">
                    <span className={`w-16 flex-shrink-0 ${METHOD_COLORS[ep.method] ?? "text-[var(--color-foreground)] font-bold"}`}>
                      {ep.method}
                    </span>
                    <span className="text-[var(--color-foreground)]">{ep.path}</span>
                    {ep.description && <span className="text-[var(--color-muted-foreground)] ml-1">{ep.description}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Communicates with */}
          {svc.communicates_with.length > 0 && (
            <div>
              <div className="text-xs text-[var(--color-muted-foreground)] mb-1.5 flex items-center gap-1 uppercase tracking-wide">
                <Network size={11} /> Communicates with
              </div>
              <div className="flex flex-wrap gap-1.5">
                {svc.communicates_with.map((c, i) => (
                  <span key={i} className={`text-xs px-2 py-0.5 ${PROTO_COLORS[c.protocol] ?? "bg-[var(--color-muted)] border border-[var(--color-border)] text-[var(--color-foreground)]"}`}>
                    {c.service} <span className="text-[var(--color-muted-foreground)] opacity-80">via {c.protocol}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Env vars */}
          {svc.env_vars.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {svc.env_vars.map((v) => (
                <span key={v} className="text-xs font-mono bg-[var(--color-muted)] text-[var(--color-foreground)] px-1.5 py-0.5 border border-[var(--color-border)]">
                  {v}
                </span>
              ))}
            </div>
          )}

          {/* Responsibilities */}
          {svc.responsibilities?.length > 0 && (
            <ul className="text-xs text-[var(--color-muted-foreground)] space-y-0.5 list-disc list-inside">
              {svc.responsibilities.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function FileTree({ files, onSelect, selected }: {
  files: FileNode[];
  onSelect: (f: FileNode) => void;
  selected: FileNode | null;
}) {
  const groups = useMemo(() => {
    const g: Record<string, FileNode[]> = {};
    for (const f of files) {
      const parts = f.path.split("/");
      const group = parts.length > 1 ? parts[0] : "__root__";
      (g[group] ??= []).push(f);
    }
    return g;
  }, [files]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <div className="font-mono text-xs space-y-0.5">
      {Object.entries(groups).map(([group, groupFiles]) => (
        <div key={group}>
          {group !== "__root__" && (
            <button
              onClick={() => setCollapsed((c) => ({ ...c, [group]: !c[group] }))}
              className="flex items-center gap-1 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] w-full text-left py-1 px-2 hover:bg-[var(--color-muted)] transition-colors"
            >
              {collapsed[group] ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              📁 <span className="font-semibold">{group}/</span>
            </button>
          )}
          {!collapsed[group] && groupFiles.map((f) => {
            const filename = f.path.split("/").pop()!;
            const active = selected?.path === f.path;
            return (
              <button
                key={f.path}
                onClick={() => onSelect(f)}
                className={`w-full text-left py-1 border-0 flex items-center gap-2 transition-colors ${
                  group !== "__root__" ? "pl-6 pr-2" : "px-2"
                } ${
                  active
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                    : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
                }`}
              >
                <span>{fileIcon(f.path)}</span>
                <span className={active ? "text-[var(--color-primary-foreground)] font-semibold" : ""}>{filename}</span>
                <span className={`ml-auto text-[10px] font-mono ${active ? "text-[var(--color-primary-foreground)] opacity-70" : "text-[var(--color-muted-foreground)]"}`}>
                  {(f.size / 1024).toFixed(1)}kb
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ScaffoldPage() {
  const { token } = useAuth();
  const authHeaders = useMemo((): Record<string, string> => {
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }, [token]);
  const [step, setStep] = useState<"input" | "blueprint" | "scaffold">("input");
  const [requirements, setRequirements] = useState("");
  const [referenceService, setReferenceService] = useState("");
  const [referenceRepoUrl, setReferenceRepoUrl] = useState("");
  const [designing, setDesigning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [scaffold, setScaffold] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);

  const EXAMPLES = [
    "An e-commerce platform with user authentication, product catalog, shopping cart, order management, and email notifications.",
    "A real-time chat application with user presence, message history, file uploads, and push notifications.",
    "A SaaS analytics dashboard with data ingestion, metric aggregation, user management, and reporting API.",
  ];

  const handleDesign = async () => {
    if (!requirements.trim()) return;
    setDesigning(true);
    setError(null);
    setBlueprint(null);
    try {
      const res = await fetch(`${API}/scaffold/design`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        credentials: "include",
        body: JSON.stringify({
          requirements,
          reference_service: referenceService.trim() || undefined,
          reference_repo_url: referenceRepoUrl.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail ?? "Design failed");
      }
      const bp: Blueprint = await res.json();
      setBlueprint(bp);
      setStep("blueprint");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDesigning(false);
    }
  };

  const handleGenerate = async () => {
    if (!blueprint) return;
    setGenerating(true);
    setError(null);
    setScaffold(null);
    try {
      const res = await fetch(`${API}/scaffold/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        credentials: "include",
        body: JSON.stringify({ blueprint }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail ?? "Scaffold failed");
      }
      const data: GenerateResponse = await res.json();
      setScaffold(data);
      setStep("scaffold");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!scaffold) return;
    downloadBase64Zip(scaffold.zip_base64, `${scaffold.system_name}.zip`);
  };

  const stepOrder = ["input", "blueprint", "scaffold"] as const;
  const currentIdx = stepOrder.indexOf(step);

  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)] bg-grid">
      {/* Sub-header */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-card)] shadow-[var(--shadow-sm)]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-[var(--color-accent)]" />
            <span className="font-semibold text-[var(--color-foreground)]">Architecture Scaffolding Agent</span>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 text-xs">
            {[
              { key: "input", label: "Requirements" },
              { key: "blueprint", label: "Blueprint" },
              { key: "scaffold", label: "Scaffold" },
            ].map((s, i) => {
              const isActive = step === s.key;
              const isComplete = i < currentIdx;
              return (
                <div key={s.key} className="flex items-center gap-2">
                  {i > 0 && <div className="w-6 h-px bg-[var(--color-border)]" />}
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 transition-all ${
                    isActive
                      ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] border border-[var(--color-border)] shadow-[var(--shadow-xs)]"
                      : isComplete
                        ? "text-[var(--color-foreground)] border border-[var(--color-border)] bg-[var(--color-card)]"
                        : "text-[var(--color-muted-foreground)] border border-[var(--color-border)] bg-[var(--color-muted)]"
                  }`}>
                    <span className={`w-4 h-4 flex items-center justify-center text-[10px] font-bold ${
                      isActive
                        ? "bg-[var(--color-primary-foreground)] text-[var(--color-primary)]"
                        : isComplete
                          ? "bg-[var(--color-border)] text-[var(--color-card)]"
                          : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
                    }`}>{i + 1}</span>
                    {s.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 flex items-start gap-3 p-4 border border-[var(--color-border)] bg-[var(--color-destructive)] text-[var(--color-destructive-foreground)] text-sm shadow-[var(--shadow-md)]">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <div className="font-mono">{error}</div>
          </div>
        )}

        {/* ── STEP 1: Requirements Input ─────────────────────────────────── */}
        {step === "input" && (
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Hero identity block */}
            <div className="swiss-panel p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-[var(--color-primary)] border border-[var(--color-border)] flex items-center justify-center shadow-[var(--shadow-md)]">
                  <Sparkles size={18} className="text-[var(--color-primary-foreground)]" />
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-[var(--color-muted-foreground)] mb-0.5">
                    Staff Engineer Agent
                  </div>
                  <h1 className="text-2xl font-bold text-[var(--color-foreground)] leading-tight">
                    Describe Your System
                  </h1>
                </div>
              </div>
              <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed border-l-4 border-[var(--color-primary)] pl-3">
                Interprets natural language requirements and designs your microservices architecture.
                Generates production-ready code, Dockerfiles, and Kubernetes manifests.
              </p>
            </div>

            <div className="space-y-4">
              <textarea
                value={requirements}
                onChange={(e) => setRequirements(e.target.value)}
                placeholder="Describe your system in natural language and detailed…"
                rows={8}
                className="w-full p-4 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] transition-colors"
              />

              {/* Reference service */}
              <div>
                <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5 uppercase tracking-wider">
                  Reference service from knowledge graph <span className="normal-case opacity-60">(optional)</span>
                </label>
                <input
                  value={referenceService}
                  onChange={(e) => setReferenceService(e.target.value)}
                  placeholder="e.g. auth-service (name of a previously ingested service)"
                  className="w-full px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
                <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
                  If provided, the agent will analyse its architecture pattern from the knowledge graph and use it as a template.
                </p>
              </div>

              {/* Reference GitHub repo */}
              <div>
                <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5 uppercase tracking-wider">
                  Reference GitHub repo <span className="normal-case opacity-60">(optional)</span>
                </label>
                <input
                  value={referenceRepoUrl}
                  onChange={(e) => setReferenceRepoUrl(e.target.value)}
                  placeholder="e.g. https://github.com/org/repo"
                  className="w-full px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
                <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
                  The agent will fetch this repo&apos;s file structure and use it as a naming and layout template.
                </p>
              </div>

              <button
                onClick={handleDesign}
                disabled={designing || requirements.trim().length < 20}
                className="w-full flex items-center justify-center gap-2 py-3.5 font-semibold text-sm swiss-button disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                {designing ? (
                  <><Loader2 size={16} className="animate-spin" /> Designing Architecture…</>
                ) : (
                  <><Sparkles size={16} /> Design Architecture</>
                )}
              </button>
            </div>

            {/* Examples */}
            <div>
              <p className="text-xs text-[var(--color-muted-foreground)] mb-2 uppercase tracking-wider font-medium">Quick examples:</p>
              <div className="space-y-2">
                {EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => setRequirements(ex)}
                    className="w-full text-left text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] bg-[var(--color-muted)] hover:bg-[var(--color-card)] px-3 py-2 transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: Blueprint Review ───────────────────────────────────── */}
        {step === "blueprint" && blueprint && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="border-l-4 border-[var(--color-primary)] pl-4">
                <h1 className="text-2xl font-bold text-[var(--color-foreground)] font-mono">{blueprint.system_name}</h1>
                <p className="text-[var(--color-muted-foreground)] mt-1 text-sm max-w-2xl">{blueprint.summary}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep("input")}
                  className="px-4 py-2 text-sm swiss-button-ghost hover:bg-[var(--color-muted)] transition-colors"
                >
                  Redesign
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-semibold swiss-button disabled:opacity-50 hover:opacity-90 transition-opacity"
                >
                  {generating ? (
                    <><Loader2 size={14} className="animate-spin" /> Generating…</>
                  ) : (
                    <><Code2 size={14} /> Generate Scaffold</>
                  )}
                </button>
              </div>
            </div>

            {/* Stats bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: <Server size={16} className="text-[var(--color-primary)]" />, label: "Services", value: blueprint.services.length },
                { icon: <Globe size={16} className="text-[var(--color-foreground)]" />, label: "Total Endpoints", value: blueprint.services.reduce((a, s) => a + s.endpoints.length, 0) },
                { icon: <Database size={16} className="text-[var(--color-foreground)]" />, label: "Databases", value: new Set(blueprint.services.filter(s => s.database?.type !== "none").map(s => s.database.name)).size },
                { icon: <Zap size={16} className="text-[var(--color-accent)]" />, label: "API Gateway", value: `${blueprint.api_gateway.type}:${blueprint.api_gateway.port}` },
              ].map((c, i) => (
                <div key={i} className="swiss-panel p-4 flex items-center gap-3">
                  {c.icon}
                  <div>
                    <div className="text-xs text-[var(--color-muted-foreground)]">{c.label}</div>
                    <div className="font-bold text-[var(--color-foreground)] text-sm font-mono">{c.value}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Services */}
            <div>
              <h2 className="text-xs font-bold text-[var(--color-muted-foreground)] mb-3 flex items-center gap-2 uppercase tracking-widest">
                <Server size={14} className="text-[var(--color-primary)]" /> Services
              </h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {blueprint.services.map((svc) => <ServiceCard key={svc.name} svc={svc} />)}
              </div>
            </div>

            {/* Rationale */}
            <div className="swiss-panel p-5">
              <h2 className="text-xs font-bold text-[var(--color-muted-foreground)] mb-3 flex items-center gap-2 uppercase tracking-widest">
                <Sparkles size={14} className="text-[var(--color-accent)]" /> Design Rationale
              </h2>
              <p className="text-sm text-[var(--color-foreground)] leading-relaxed">{blueprint.rationale}</p>
            </div>

            {/* Global decisions */}
            {blueprint.global_decisions && (
              <div className="swiss-panel p-5">
                <h2 className="text-xs font-bold text-[var(--color-muted-foreground)] mb-3 flex items-center gap-2 uppercase tracking-widest">
                  <GitBranch size={14} className="text-[var(--color-foreground)]" /> Cross-Cutting Concerns
                </h2>
                <p className="text-sm text-[var(--color-foreground)] leading-relaxed">{blueprint.global_decisions}</p>
              </div>
            )}

            {/* Message queues */}
            {blueprint.message_queues?.length > 0 && (
              <div className="swiss-panel p-5">
                <h2 className="text-xs font-bold text-[var(--color-muted-foreground)] mb-3 uppercase tracking-widest">Message Queues</h2>
                <div className="flex flex-wrap gap-2">
                  {blueprint.message_queues.map((q) => (
                    <div key={q.name} className="swiss-chip text-xs px-3 py-1">
                      {q.name} <span className="text-[var(--color-muted-foreground)] opacity-70">used by {q.used_by.join(", ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Generated Scaffold ─────────────────────────────────── */}
        {step === "scaffold" && scaffold && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 size={18} className="text-[var(--color-accent)]" />
                  <h1 className="text-xl font-bold text-[var(--color-foreground)]">Scaffold Ready</h1>
                </div>
                <p className="text-[var(--color-muted-foreground)] text-sm">
                  {scaffold.file_count} files generated for <span className="font-mono text-[var(--color-foreground)]">{scaffold.system_name}</span>
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep("blueprint")}
                  className="px-4 py-2 text-sm swiss-button-ghost hover:bg-[var(--color-muted)] transition-colors"
                >
                  Back to Blueprint
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-semibold swiss-button hover:opacity-90 transition-opacity"
                >
                  <Download size={14} />
                  Download .zip
                </button>
              </div>
            </div>

            {/* File browser */}
            <div className="grid grid-cols-12 gap-4" style={{ height: "calc(100vh - 260px)" }}>
              {/* File tree panel */}
              <div className="col-span-3 swiss-panel p-3 overflow-y-auto">
                <div className="text-xs text-[var(--color-muted-foreground)] font-bold uppercase tracking-widest mb-3 px-2">
                  Project Files
                </div>
                <FileTree
                  files={scaffold.files}
                  onSelect={setSelectedFile}
                  selected={selectedFile}
                />
              </div>

              {/* File viewer */}
              <div className="col-span-9 swiss-card overflow-hidden flex flex-col">
                {selectedFile ? (
                  <>
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-muted)]">
                      <span className="text-sm">{fileIcon(selectedFile.path)}</span>
                      <span className="font-mono text-sm text-[var(--color-foreground)]">{selectedFile.path}</span>
                      <span className="ml-auto text-xs text-[var(--color-muted-foreground)] font-mono">{selectedFile.size} bytes</span>
                    </div>
                    <div className="flex-1 overflow-auto p-4">
                      <pre className="text-xs text-[var(--color-foreground)] font-mono leading-relaxed whitespace-pre-wrap">
                        {selectedFile.content}
                      </pre>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-[var(--color-muted-foreground)]">
                    <FileCode2 size={48} className="mb-3 opacity-30" />
                    <p className="text-sm">Select a file to preview</p>
                  </div>
                )}
              </div>
            </div>

            {/* File type summary */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {[
                { icon: "🐍", label: "Python", ext: ".py" },
                { icon: "🐳", label: "Docker", match: "Dockerfile" },
                { icon: "☸️", label: "K8s", ext: ".yaml" },
                { icon: "⚙️", label: "Nginx", ext: ".conf" },
                { icon: "📦", label: "Deps", match: "requirements.txt" },
                { icon: "📄", label: "Readme", ext: ".md" },
              ].map((t) => {
                const count = scaffold.files.filter(f =>
                  t.ext ? f.path.endsWith(t.ext) : f.path.includes(t.match!)
                ).length;
                if (!count) return null;
                return (
                  <div key={t.label} className="swiss-panel p-2.5 text-center">
                    <div className="text-xl mb-0.5">{t.icon}</div>
                    <div className="text-[var(--color-foreground)] font-bold text-sm font-mono">{count}</div>
                    <div className="text-[var(--color-muted-foreground)] text-xs">{t.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
