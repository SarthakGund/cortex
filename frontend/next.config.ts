import path from "path";
import type { NextConfig } from "next";

// Where the FastAPI backend is reachable *from the Next.js server*.
// In prod set BACKEND_INTERNAL_URL (server-side env) to the backend's URL.
const BACKEND_ORIGIN = process.env.BACKEND_INTERNAL_URL || "http://localhost:8000";

const nextConfig = {
  output: "standalone",
  envDir: path.join(__dirname, ".."),
  // Same-origin proxy: the browser only ever talks to its own origin
  // (/api/backend/*), and Next forwards to the backend server-side. This
  // avoids cross-origin auth cookies being dropped by browser tracking
  // protection (e.g. Firefox ETP) and removes the need for CORS.
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${BACKEND_ORIGIN}/:path*`,
      },
    ];
  },
} as NextConfig;

export default nextConfig;
