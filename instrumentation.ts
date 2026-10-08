import type { Instrumentation } from "next";
import { sentryDsn, telemetryEnabled } from "@/lib/telemetry";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !telemetryEnabled() || !sentryDsn(process.env.SENTRY_DSN)) return;
  try { await import("./sentry.server.config"); } catch { /* Fail closed without interrupting the app. */ }
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!telemetryEnabled() || !sentryDsn(process.env.SENTRY_DSN)) return;
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureRequestError(...args);
  } catch { /* Never log request/error bodies when monitoring itself fails. */ }
};
