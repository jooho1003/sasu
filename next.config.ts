import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { baselineSecurityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  // Keep production verification separate from an already running dev server.
  distDir: process.env.SASU_VERIFY_BUILD === "1" ? ".next-verify" : ".next",
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
  async headers() {
    return [{ source: "/:path*", headers: baselineSecurityHeaders() }];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  telemetry: false,
  silent: true,
  // Error positions only. Do not publish or upload application source content.
  sourcemaps: { disable: true },
  release: { create: false, finalize: false },
  routeManifestInjection: false,
  webpack: { autoInstrumentServerFunctions: false, autoInstrumentMiddleware: false, autoInstrumentAppDirectory: false },
});
