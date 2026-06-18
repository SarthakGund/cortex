/**
 * Central API configuration.
 *
 * All pages/components must import API_BASE from here instead of
 * hard-coding `process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"`.
 *
 * Requests go through a same-origin Next.js rewrite (/api/backend/* -> backend,
 * configured in next.config.ts). The browser only ever talks to its own origin,
 * so the httpOnly auth cookie is always sent and there's no CORS/cross-origin
 * cookie blocking (e.g. Firefox Enhanced Tracking Protection dropping the
 * cookie on a :3000 -> :8000 fetch). To repoint the backend, set
 * BACKEND_INTERNAL_URL for the Next.js server — no rebuild of this value needed.
 */

export const API_BASE: string = "/api/backend";

/**
 * Thin fetch wrapper that:
 *  - Prepends API_BASE to relative paths
 *  - Sends cookies automatically (credentials: "include") for httpOnly auth
 *  - Merges caller-supplied headers cleanly
 */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.headers ?? {}),
    },
  });
}
