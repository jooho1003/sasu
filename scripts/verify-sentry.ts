import { loadEnvConfig } from "@next/env";
import * as Sentry from "@sentry/nextjs";

async function main() {
  loadEnvConfig(process.cwd());
  process.env.SASU_TELEMETRY_TEST_ENABLED = "true";

  await import("../sentry.server.config");
  if (!Sentry.isEnabled()) throw new Error("sentry_not_configured");
  // Synthetic transport check. No real request, customer data or original business text.
  const eventId = Sentry.captureException(new Error("SASU_SETUP_CANARY synthetic server verification"));
  const { onRequestError } = await import("../instrumentation");
  await onRequestError(new Error("SASU_SETUP_CANARY synthetic request verification"), {
    path: "/auth/confirm?token_hash=SASU_SETUP_CANARY", method: "POST", headers: { authorization: "Bearer SASU_SETUP_CANARY" },
  }, { routerKind: "App Router", routePath: "/api/synthetic", routeType: "route", revalidateReason: undefined });
  const flushed = await Sentry.flush(15_000);
  console.log(JSON.stringify({ event_id: eventId, flushed }));
  if (!flushed) process.exitCode = 1;
}

void main().catch((error: unknown) => { console.error(JSON.stringify({ code: error instanceof Error && error.message === "sentry_not_configured" ? error.message : "sentry_verification_failed", type: error instanceof Error ? error.name : "unknown" })); process.exitCode = 1; });
