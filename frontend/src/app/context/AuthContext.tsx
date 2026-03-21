"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

interface AuthContextType {
  token: string | null;
  loading: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  loading: true,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Handle OAuth callback: ?token=xxx or ?error=xxx
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken) {
      setToken(urlToken);
      localStorage.setItem("github_token", urlToken);
      window.history.replaceState({}, "", window.location.pathname);
      setLoading(false);
      return;
    }
    // Load from storage
    const stored = localStorage.getItem("github_token");
    if (stored) setToken(stored);
    setLoading(false);
  }, []);

  const login = useCallback((t: string) => {
    setToken(t);
    localStorage.setItem("github_token", t);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    localStorage.removeItem("github_token");
  }, []);

  return (
    <AuthContext.Provider value={{ token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
