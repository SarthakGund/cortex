/**
 * Central API configuration.
 *
 * All pages/components must import API_BASE from here instead of
 * hard-coding `process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"`.
 *
 * In production builds, NEXT_PUBLIC_API_URL must be set at build time.
 * The check below surfaces a clear error rather than silently hitting localhost.
 */

function resolveApiBase(): string {
  const env = process.env.NEXT_PUBLIC_API_URL;
  if (env) return env;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. " +
        "Set it in the root .env or pass a build-arg: " +
        "--build-arg NEXT_PUBLIC_API_URL=https://api.example.com"
    );
  }
  return "http://localhost:8000";
}

export const API_BASE: string = resolveApiBase();

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
