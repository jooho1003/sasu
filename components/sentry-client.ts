"use client";

import { sanitizeSentryEvent, sentryDsn } from "@/lib/telemetry";

let startup: Promise<void> | undefined;
let client: typeof import("@sentry/nextjs") | undefined;

export function initializeClientErrors(): Promise<void> {
  return startup ??= (async () => {
    try {
      const response = await fetch("/api/telemetry/config", { cache: "no-store", credentials: "omit" });
      if (!response.ok) return;
      const config = await response.json();
      const dsn = typeof config.dsn === "string" ? sentryDsn(config.dsn) : null;
      if (!dsn) return;
      const sentry = await import("@sentry/nextjs");
      sentry.init({
        dsn, environment: config.environment === "production" ? "production" : "test",
        defaultIntegrations: false,
        integrations: [sentry.globalHandlersIntegration(), sentry.browserApiErrorsIntegration(), sentry.dedupeIntegration()],
        dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false, graphQL: { document: false, variables: false }, genAI: { inputs: false, outputs: false }, databaseQueryData: false, queues: false, stackFrameVariables: false, frameContextLines: 0 },
        sendClientReports: false, maxBreadcrumbs: 0,
        replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0,
        tracePropagationTargets: [], enhanceFetchErrorMessages: false,
        beforeSend: (event) => sanitizeSentryEvent(event),
        beforeSendLog: () => null, beforeSendMetric: () => null, beforeBreadcrumb: () => null,
      });
      client = sentry;
    } catch { /* Observability must not interrupt the product or expose error content. */ }
  })();
}

export async function reportClientError(error: Error): Promise<void> {
  await initializeClientErrors();
  client?.captureException(error);
}
