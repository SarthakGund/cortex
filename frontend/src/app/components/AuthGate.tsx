"use client";

import { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { Network, Github, Sparkles, Database, GitBranch, Loader2 } from "lucide-react";

import { API_BASE as API } from "@/lib/api";

export default function AuthGate({ children }: { children: ReactNode }) {
  const { user, token, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-primary opacity-40" />
      </div>
    );
  }

  if (!user && !token) {
    return <LoginScreen />;
  }

  return <>{children}</>;
}

function LoginScreen() {
  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col items-center justify-center px-4">
      {/* Background grid */}
      <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />

      <div className="relative z-10 w-full max-w-md m-5">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="relative mb-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-blue-500/30">
              <Network size={32} className="text-white" />
            </div>
            <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-emerald-400 rounded-full border-4 border-[var(--color-background)]" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
            Weavr
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Knowledge Graph Intelligence
          </p>
        </div>

        {/* Card */}
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-2xl p-8 shadow-xl">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-1">
            Sign in to continue
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] mb-8">
            Connect your GitHub account to ingest repos, explore code, and query your knowledge graph.
          </p>

          {/* GitHub OAuth Button */}
          <a
            href={`${API}/auth/github/login`}
            className="w-full flex items-center justify-center gap-3 py-3 px-6 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Continue with GitHub
          </a>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--color-border)]" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 text-xs text-[var(--color-text-muted)] bg-[var(--color-card)]">
                What you get access to
              </span>
            </div>
          </div>

          {/* Feature list */}
          <div className="space-y-3">
            {[
              { icon: <GitBranch size={14} className="text-blue-400" />, label: "Ingest public & private repositories" },
              { icon: <Database size={14} className="text-purple-400" />, label: "Query the Neo4j knowledge graph" },
              { icon: <Sparkles size={14} className="text-amber-400" />, label: "AI-powered Q&A via Gemini" },
              { icon: <Network size={14} className="text-cyan-400" />, label: "Visualise cross-service architecture" },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)]">
                <div className="w-7 h-7 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0">
                  {f.icon}
                </div>
                {f.label}
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-[var(--color-text-muted)] mt-6">
          
        </p>
      </div>
    </div>
  );
}
