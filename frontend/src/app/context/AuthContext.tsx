"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

interface GitHubUser {
  github_id: number;
  login: string;
  avatar_url: string;
}

interface AuthContextType {
  user: GitHubUser | null;
  /** @deprecated Use cookie-based auth. Kept for gradual migration of existing API calls. */
  token: string | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  logout: async () => {},
});

import { API_BASE } from "@/lib/api";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If the URL still contains ?token= (legacy fallback for old sessions),
    // store it in sessionStorage and clean the URL.
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken) {
      sessionStorage.setItem("github_token", urlToken);
      setToken(urlToken);
      window.history.replaceState({}, "", window.location.pathname);
    } else {
      const stored = sessionStorage.getItem("github_token");
      if (stored) setToken(stored);
    }

    // Primary auth check: call /auth/me which reads the httpOnly cookie.
    // This works even when no token is in sessionStorage.
    fetch(`${API_BASE}/auth/me`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.login) setUser(data as GitHubUser);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(async () => {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
    sessionStorage.removeItem("github_token");
    // Let the intro video replay on the next login.
    sessionStorage.removeItem("cortex_intro_shown");
    setUser(null);
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
