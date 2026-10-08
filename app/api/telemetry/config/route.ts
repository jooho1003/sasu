import { NextResponse } from "next/server";
import { sentryDsn, telemetryEnabled } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

export function GET() {
  const dsn = telemetryEnabled() ? sentryDsn(process.env.SENTRY_DSN) : null;
  return NextResponse.json({ dsn, environment: process.env.VERCEL_ENV === "production" ? "production" : "test" }, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
