import path from "path";
import type { NextConfig } from "next";

const nextConfig = {
  output: "standalone",
  envDir: path.join(__dirname, ".."),
} as NextConfig;

export default nextConfig;
