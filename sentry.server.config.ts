import * as Sentry from "@sentry/nextjs";
import { sanitizeSentryEvent, sentryDsn, telemetryEnabled } from "@/lib/telemetry";

const dsn = telemetryEnabled() ? sentryDsn(process.env.SENTRY_DSN) : null;
if (dsn) Sentry.init({
  dsn, environment: process.env.VERCEL_ENV === "production" ? "production" : "test",
  // Node SDK 11 needs explicit IP inference control; collector rules remove user/geo fields too.
  _metadata: { sdk: { settings: { infer_ip: "never" } } },
  defaultIntegrations: false, integrations: [], enableOpenTelemetrySetup: false,
  dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false, graphQL: { document: false, variables: false }, genAI: { inputs: false, outputs: false }, databaseQueryData: false, queues: false, stackFrameVariables: false, frameContextLines: 0 },
  sendClientReports: false, maxBreadcrumbs: 0, includeServerName: false,
  tracePropagationTargets: [], enhanceFetchErrorMessages: false,
  beforeSend: (event) => sanitizeSentryEvent(event),
  beforeSendLog: () => null, beforeSendMetric: () => null, beforeBreadcrumb: () => null,
});
