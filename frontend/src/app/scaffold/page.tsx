"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
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
  Container,
  GitBranch,
  Zap,
  Globe,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

const LANG_COLORS: Record<string, string> = {
  python: "bg-blue-100 text-blue-700 border-blue-200",
  typescript: "bg-yellow-100 text-yellow-700 border-yellow-200",
  go: "bg-cyan-100 text-cyan-700 border-cyan-200",
  java: "bg-orange-100 text-orange-700 border-orange-200",
};

const DB_COLORS: Record<string, string> = {
  postgres: "text-blue-700",
  mongodb: "text-green-700",
  redis: "text-red-700",
  mysql: "text-orange-700",
  none: "text-slate-500",
};

const PROTO_COLORS: Record<string, string> = {
  REST: "bg-emerald-100 text-emerald-700",
  gRPC: "bg-purple-100 text-purple-700",
  events: "bg-amber-100 text-amber-700",
};

const METHOD_COLORS: Record<string, string> = {
  GET: "text-emerald-600",
  POST: "text-blue-600",
  PUT: "text-amber-600",
  DELETE: "text-red-600",
  PATCH: "text-purple-600",
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
    <div className="bg-slate-100/60 border border-slate-300/50 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-200/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
            <Server size={16} className="text-indigo-400" />
          </div>
          <div>
            <div className="font-mono font-semibold text-slate-900 text-sm">{svc.name}</div>
            <div className="text-xs text-slate-600 mt-0.5">{svc.role}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded border ${LANG_COLORS[svc.language] ?? "bg-slate-300/20 text-slate-700"}`}>
            {svc.framework}
          </span>
          <span className="text-xs text-slate-500">:{svc.port}</span>
          {open ? <ChevronDown size={14} className="text-slate-600" /> : <ChevronRight size={14} className="text-slate-600" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-300/50 pt-3">
          {/* Database */}
          <div className="flex items-center gap-2 text-xs">
            <Database size={12} className="text-slate-600" />
            <span className="text-slate-600">Database:</span>
            <span className={DB_COLORS[svc.database?.type] ?? "text-slate-700"}>
              {svc.database?.type ?? "none"} {svc.database?.name ? `(${svc.database.name})` : ""}
            </span>
          </div>

          {/* Endpoints */}
          {svc.endpoints.length > 0 && (
            <div>
              <div className="text-xs text-slate-600 mb-1.5 flex items-center gap-1">
                <Globe size={11} /> Endpoints
              </div>
              <div className="space-y-1">
                {svc.endpoints.map((ep, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs font-mono">
                    <span className={`w-16 flex-shrink-0 font-bold ${METHOD_COLORS[ep.method] ?? "text-slate-700"}`}>
                      {ep.method}
                    </span>
                    <span className="text-slate-700">{ep.path}</span>
                    {ep.description && <span className="text-slate-500 ml-1">{ep.description}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Communicates with */}
          {svc.communicates_with.length > 0 && (
            <div>
              <div className="text-xs text-slate-600 mb-1.5 flex items-center gap-1">
                <Network size={11} /> Communicates with
              </div>
              <div className="flex flex-wrap gap-1.5">
                {svc.communicates_with.map((c, i) => (
                  <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${PROTO_COLORS[c.protocol] ?? "bg-slate-300/20 text-slate-700"}`}>
                    {c.service} <span className="opacity-60">via {c.protocol}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Env vars */}
          {svc.env_vars.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {svc.env_vars.map((v) => (
                <span key={v} className="text-xs font-mono bg-white text-slate-600 px-1.5 py-0.5 rounded">
                  {v}
                </span>
              ))}
            </div>
          )}

          {/* Responsibilities */}
          {svc.responsibilities?.length > 0 && (
            <ul className="text-xs text-slate-600 space-y-0.5 list-disc list-inside">
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
  // Group files by top-level folder
  const groups: Record<string, FileNode[]> = {};
  for (const f of files) {
    const parts = f.path.split("/");
    const group = parts.length > 1 ? parts[0] : "__root__";
    (groups[group] ??= []).push(f);
  }

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <div className="font-mono text-xs space-y-0.5">
      {Object.entries(groups).map(([group, groupFiles]) => (
        <div key={group}>
          {group !== "__root__" && (
            <button
              onClick={() => setCollapsed((c) => ({ ...c, [group]: !c[group] }))}
              className="flex items-center gap-1 text-slate-600 hover:text-slate-900 w-full text-left py-1 px-2 rounded hover:bg-slate-200/40 transition-colors"
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
                className={`w-full text-left py-1 px-2 pl-${group !== "__root__" ? "6" : "2"} rounded flex items-center gap-2 transition-colors ${
                  active ? "bg-indigo-500/20 text-slate-900" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/30"
                }`}
              >
                <span>{fileIcon(f.path)}</span>
                <span className={active ? "text-indigo-300" : ""}>{filename}</span>
                <span className="ml-auto text-slate-600 text-[10px]">{(f.size / 1024).toFixed(1)}kb</span>
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
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors text-sm">
              <ArrowLeft size={16} />
              Back
            </Link>
            <div className="w-px h-4 bg-slate-200" />
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-amber-400" />
              <span className="font-semibold text-slate-900">Architecture Scaffolding Agent</span>
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 text-xs">
            {[
              { key: "input", label: "Requirements" },
              { key: "blueprint", label: "Blueprint" },
              { key: "scaffold", label: "Scaffold" },
            ].map((s, i) => (
              <div key={s.key} className="flex items-center gap-2">
                {i > 0 && <div className="w-6 h-px bg-slate-200" />}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all ${
                  step === s.key
                    ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                    : (["blueprint", "scaffold"].indexOf(step) > i - 1
                      ? "text-slate-600"
                      : "text-slate-600")
                }`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    step === s.key ? "bg-indigo-500 text-slate-900" : "bg-slate-200 text-slate-600"
                  }`}>{i + 1}</span>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 flex items-start gap-3 p-4 rounded-xl border bg-red-500/10 border-red-500/20 text-red-300 text-sm">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <div className="font-mono">{error}</div>
          </div>
        )}

        {/* ── STEP 1: Requirements Input ─────────────────────────────────── */}
        {step === "input" && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
                Describe Your System
              </h1>
              <p className="text-slate-600">
                The Staff Engineer Agent will design your microservices architecture, then generate
                production-ready code, Docker, and Kubernetes files.
              </p>
            </div>

            <div className="space-y-4">
              <textarea
                value={requirements}
                onChange={(e) => setRequirements(e.target.value)}
                placeholder="Describe your system in natural language and detailed…"
                rows={8}
                className="w-full bg-slate-100/60 border border-slate-300 rounded-xl p-4 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 resize-none font-mono transition-colors"
              />

              {/* Reference service */}
              <div>
                <label className="block text-xs text-slate-600 mb-1.5">
                  Reference service from knowledge graph <span className="text-slate-600">(optional)</span>
                </label>
                <input
                  value={referenceService}
                  onChange={(e) => setReferenceService(e.target.value)}
                  placeholder="e.g. auth-service (name of a previously ingested service)"
                  className="w-full bg-slate-100/60 border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <p className="text-xs text-slate-600 mt-1">
                  If provided, the agent will analyse its architecture pattern from the knowledge graph and use it as a template.
                </p>
              </div>

              {/* Reference GitHub repo */}
              <div>
                <label className="block text-xs text-slate-600 mb-1.5">
                  Reference GitHub repo <span className="text-slate-600">(optional)</span>
                </label>
                <input
                  value={referenceRepoUrl}
                  onChange={(e) => setReferenceRepoUrl(e.target.value)}
                  placeholder="e.g. https://github.com/org/repo"
                  className="w-full bg-slate-100/60 border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <p className="text-xs text-slate-600 mt-1">
                  The agent will fetch this repo&apos;s file structure and use it as a naming and layout template.
                </p>
              </div>

              <button
                onClick={handleDesign}
                disabled={designing || requirements.trim().length < 20}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-amber-500/20"
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
              <p className="text-xs text-slate-500 mb-2">Quick examples:</p>
              <div className="space-y-2">
                {EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => setRequirements(ex)}
                    className="w-full text-left text-xs text-slate-600 hover:text-slate-900 bg-slate-100/40 hover:bg-slate-200/40 border border-slate-300/50 rounded-lg px-3 py-2 transition-colors"
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
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{blueprint.system_name}</h1>
                <p className="text-slate-600 mt-1 text-sm max-w-2xl">{blueprint.summary}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep("input")}
                  className="px-4 py-2 rounded-lg text-sm border border-slate-300 text-slate-600 hover:text-slate-900 hover:border-slate-500 transition-colors"
                >
                  Redesign
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-900 disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/20"
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
                { icon: <Server size={16} className="text-indigo-400" />, label: "Services", value: blueprint.services.length },
                { icon: <Globe size={16} className="text-emerald-400" />, label: "Total Endpoints", value: blueprint.services.reduce((a, s) => a + s.endpoints.length, 0) },
                { icon: <Database size={16} className="text-blue-400" />, label: "Databases", value: new Set(blueprint.services.filter(s => s.database?.type !== "none").map(s => s.database.name)).size },
                { icon: <Zap size={16} className="text-amber-400" />, label: "API Gateway", value: `${blueprint.api_gateway.type}:${blueprint.api_gateway.port}` },
              ].map((c, i) => (
                <div key={i} className="bg-slate-100/60 border border-slate-300/50 rounded-xl p-4 flex items-center gap-3">
                  {c.icon}
                  <div>
                    <div className="text-xs text-slate-600">{c.label}</div>
                    <div className="font-bold text-slate-900 text-sm">{c.value}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Services */}
            <div>
              <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Server size={14} className="text-indigo-400" /> Services
              </h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {blueprint.services.map((svc) => <ServiceCard key={svc.name} svc={svc} />)}
              </div>
            </div>

            {/* Rationale */}
            <div className="bg-slate-100/40 border border-slate-300/50 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <Sparkles size={14} className="text-amber-400" /> Design Rationale
              </h2>
              <p className="text-sm text-slate-700 leading-relaxed">{blueprint.rationale}</p>
            </div>

            {/* Global decisions */}
            {blueprint.global_decisions && (
              <div className="bg-slate-100/40 border border-slate-300/50 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <GitBranch size={14} className="text-purple-400" /> Cross-Cutting Concerns
                </h2>
                <p className="text-sm text-slate-700 leading-relaxed">{blueprint.global_decisions}</p>
              </div>
            )}

            {/* Message queues */}
            {blueprint.message_queues?.length > 0 && (
              <div className="bg-slate-100/40 border border-slate-300/50 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-slate-700 mb-2">Message Queues</h2>
                <div className="flex flex-wrap gap-2">
                  {blueprint.message_queues.map((q) => (
                    <div key={q.name} className="text-xs bg-amber-500/10 border border-amber-500/20 text-amber-300 px-3 py-1 rounded-full">
                      {q.name} <span className="text-amber-500/60">used by {q.used_by.join(", ")}</span>
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
                  <CheckCircle2 size={18} className="text-emerald-400" />
                  <h1 className="text-xl font-bold text-slate-900">Scaffold Ready</h1>
                </div>
                <p className="text-slate-600 text-sm">
                  {scaffold.file_count} files generated for <span className="font-mono text-slate-900">{scaffold.system_name}</span>
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep("blueprint")}
                  className="px-4 py-2 rounded-lg text-sm border border-slate-300 text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Back to Blueprint
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-slate-900 transition-all shadow-lg shadow-indigo-500/20"
                >
                  <Download size={14} />
                  Download .zip
                </button>
              </div>
            </div>

            {/* File browser */}
            <div className="grid grid-cols-12 gap-4" style={{ height: "calc(100vh - 260px)" }}>
              {/* File tree panel */}
              <div className="col-span-3 bg-slate-100/60 border border-slate-300/50 rounded-xl p-3 overflow-y-auto">
                <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-3 px-2">
                  Project Files
                </div>
                <FileTree
                  files={scaffold.files}
                  onSelect={setSelectedFile}
                  selected={selectedFile}
                />
              </div>

              {/* File viewer */}
              <div className="col-span-9 bg-white border border-slate-300/50 rounded-xl overflow-hidden flex flex-col">
                {selectedFile ? (
                  <>
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-100/60">
                      <span className="text-sm">{fileIcon(selectedFile.path)}</span>
                      <span className="font-mono text-sm text-slate-700">{selectedFile.path}</span>
                      <span className="ml-auto text-xs text-slate-500">{selectedFile.size} bytes</span>
                    </div>
                    <div className="flex-1 overflow-auto p-4">
                      <pre className="text-xs text-slate-700 font-mono leading-relaxed whitespace-pre-wrap">
                        {selectedFile.content}
                      </pre>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
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
                  <div key={t.label} className="bg-slate-100/40 border border-slate-300/40 rounded-lg p-2.5 text-center">
                    <div className="text-xl mb-0.5">{t.icon}</div>
                    <div className="text-slate-900 font-bold text-sm">{count}</div>
                    <div className="text-slate-500 text-xs">{t.label}</div>
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
