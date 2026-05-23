"use client";

import {
  MessageSquare,
  Database,
  Network,
  AlertCircle,
  Sparkles,
  Activity,
  GitBranch,
  Search,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { API_BASE as API } from "@/lib/api";

const featureCards = [
  {
    icon: <MessageSquare size={18} className="text-red-500" />,
    label: "Q&A Chat",
    desc: "Ask questions about your codebase in natural language using vector RAG",
  },
  {
    icon: <Network size={18} className="text-purple-500" />,
    label: "Knowledge Graph",
    desc: "Visualize cross-service architecture as an interactive Neo4j graph",
  },
  {
    icon: <AlertCircle size={18} className="text-amber-500" />,
    label: "What-If Analysis",
    desc: "Simulate code changes and trace downstream blast-radius impact",
  },
  {
    icon: <Database size={18} className="text-blue-500" />,
    label: "Ingest & Sync",
    desc: "Index any public or private GitHub repository into the vector store",
  },
  {
    icon: <Sparkles size={18} className="text-cyan-500" />,
    label: "AI Scaffold",
    desc: "Generate boilerplate code from natural language architecture specs",
  },
  {
    icon: <Activity size={18} className="text-emerald-500" />,
    label: "Timeline",
    desc: "Track repository evolution and commit history over time",
  },
  {
    icon: <GitBranch size={18} className="text-orange-500" />,
    label: "Commit Logs",
    desc: "AI-summarized commit history with semantic tagging",
  },
  {
    icon: <Search size={18} className="text-sky-500" />,
    label: "Semantic Search",
    desc: "Find code, functions, and services by meaning, not just keywords",
  },
  {
    icon: <ShieldCheck size={18} className="text-green-500" />,
    label: "Health Check",
    desc: "Monitor pipeline and service health at a glance",
  },
];

const pills = ["Neo4j Knowledge Graph", "RAG Pipeline", "What-If Analysis"];

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none">
      <circle cx="8" cy="8" r="7" stroke="var(--color-primary)" strokeWidth="1.5" />
      <path
        d="M5 8l2 2 4-4"
        stroke="var(--color-primary)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const featureLinks: Record<string, string> = {
  "Q&A Chat": "/?tab=chat",
  "Knowledge Graph": "/graph",
  "What-If Analysis": "/impact",
  "Ingest & Sync": "/?tab=ingest",
  "AI Scaffold": "/scaffold",
  "Timeline": "/timeline",
  "Commit Logs": "/?tab=commits",
  "Semantic Search": "/search",
  "Health Check": "/health",
};

export default function LandingHero({ authenticated = false }: { authenticated?: boolean }) {
  const scrollToFeatures = () => {
    document.getElementById("features-grid")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex flex-col items-center justify-start px-6 py-16 overflow-hidden">
      {/* Ambient glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(230,0,0,0.06) 0%, transparent 70%)",
        }}
      />

      {/* ── Hero section ── */}
      <div className="relative z-10 max-w-2xl mx-auto text-center">
        {/* Status badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] text-[11px] font-medium text-[var(--color-muted-foreground)] mb-8 shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Knowledge-Augmented Generation · Neo4j + Qdrant + Gemini
        </div>

        {/* Headline */}
        <h1
          className="text-5xl sm:text-6xl font-bold leading-[1.07] tracking-tight mb-5"
          style={{ color: "var(--color-foreground)" }}
        >
          Understand Your{" "}
          <em
            className="not-italic font-bold"
            style={{ color: "var(--color-primary)" }}
          >
            Perfect
          </em>
          <br />
          Codebase
        </h1>

        {/* Subtitle */}
        <p
          className="text-base sm:text-lg leading-relaxed max-w-lg mx-auto mb-10"
          style={{ color: "var(--color-muted-foreground)" }}
        >
          Ingest any GitHub repo, query with AI, and explore cross-service
          architecture — powered by knowledge graphs and a RAG pipeline.
        </p>

        {/* CTA buttons */}
        <div className="flex items-center justify-center gap-3 flex-wrap mb-10">
          {authenticated ? (
            <>
              <Link
                href="/?tab=ingest"
                className="swiss-button inline-flex items-center gap-2.5 text-sm font-bold px-6 py-3 no-underline"
              >
                <Database size={16} />
                Ingest a repo
                <span aria-hidden>→</span>
              </Link>
              <Link
                href="/?tab=chat"
                className="inline-flex items-center gap-2 text-sm font-medium px-6 py-3 border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition-colors no-underline"
              >
                <MessageSquare size={16} />
                Ask a question
              </Link>
            </>
          ) : (
            <>
              <a
                href={`${API}/auth/github/login`}
                className="swiss-button inline-flex items-center gap-2.5 text-sm font-bold px-6 py-3 no-underline"
              >
                <GitHubIcon />
                Connect GitHub
                <span aria-hidden>→</span>
              </a>
              <button
                onClick={scrollToFeatures}
                className="inline-flex items-center gap-2 text-sm font-medium px-6 py-3 border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition-colors"
              >
                Browse Features
              </button>
            </>
          )}
        </div>

        {/* Feature pills */}
        <div className="flex items-center justify-center gap-5 flex-wrap text-xs text-[var(--color-muted-foreground)]">
          {pills.map((p) => (
            <span key={p} className="flex items-center gap-1.5">
              <CheckIcon />
              {p}
            </span>
          ))}
        </div>
      </div>

      {/* ── Feature cards grid ── */}
      <div id="features-grid" className="relative z-10 mt-20 w-full max-w-5xl mx-auto">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-muted-foreground)] mb-4 text-center">
          {authenticated ? "Jump to a feature" : "Everything you get after signing in"}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {featureCards.map((f) => {
            const href = authenticated ? featureLinks[f.label] : undefined;
            const inner = (
              <>
                <div className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] flex items-center justify-center flex-shrink-0">
                  {f.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold mb-0.5" style={{ color: "var(--color-foreground)" }}>
                    {f.label}
                  </div>
                  <div className="text-xs leading-snug" style={{ color: "var(--color-muted-foreground)" }}>
                    {f.desc}
                  </div>
                </div>
              </>
            );
            return href ? (
              <Link
                key={f.label}
                href={href}
                className="swiss-card p-4 flex items-start gap-3 transition-all duration-150 hover:border-[var(--color-primary)] hover:shadow-lg no-underline"
              >
                {inner}
              </Link>
            ) : (
              <div
                key={f.label}
                className="swiss-card p-4 flex items-start gap-3 transition-all duration-150 hover:border-[var(--color-primary)] hover:shadow-lg cursor-default select-none"
              >
                {inner}
              </div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div className="mt-10 flex justify-center">
          {authenticated ? (
            <Link
              href="/?tab=ingest"
              className="swiss-button inline-flex items-center gap-2 text-sm font-bold px-8 py-3 no-underline"
            >
              <Database size={16} />
              Start by ingesting a repo
            </Link>
          ) : (
            <a
              href={`${API}/auth/github/login`}
              className="swiss-button inline-flex items-center gap-2 text-sm font-bold px-8 py-3 no-underline"
            >
              <GitHubIcon />
              Get Started — it&apos;s free
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
