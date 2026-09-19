import type { NextConfig } from "next";
import { baselineSecurityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  // Keep production verification separate from an already running dev server.
  distDir: process.env.SASU_VERIFY_BUILD === "1" ? ".next-verify" : ".next",
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
  async headers() {
    return [{ source: "/:path*", headers: baselineSecurityHeaders() }];
  },
};

export default nextConfig;
