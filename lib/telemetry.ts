import { publicPaths, type Environment } from "@/lib/search-discovery";

// Design Ref: search-observability §7 — rebuild outgoing payloads from an allowlist.
export function analyticsId(value: string | undefined): string | null {
  const id = value?.trim();
  return id && /^G-[A-Z0-9]+$/u.test(id) ? id : null;
}

export function sentryDsn(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !/^[a-z0-9]+$/iu.test(url.username) || url.password || url.port || url.search || url.hash || !/^o\d+\.ingest(?:\.[a-z]+)?\.sentry\.io$/u.test(url.hostname) || !/^\/\d+$/u.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

export function telemetryEnabled(env: Environment = process.env): boolean {
  if (env.VERCEL_ENV === "preview") return false;
  return env.VERCEL_ENV === "production" || env.SASU_TELEMETRY_TEST_ENABLED === "true";
}

export function analyticsPage(path: string, base: string) {
  const pathname = path.split(/[?#]/u)[0];
  const index = publicPaths.findIndex((entry) => entry === pathname);
  if (index < 0) return null;
  return { page_location: new URL(pathname, base).href, page_title: ["사수 — 제품 소개", "사수 체험", "개인정보 처리 안내"][index], page_referrer: "" };
}

type Frame = { filename?: string; lineno?: number; colno?: number };
type ErrorEvent = {
  event_id?: string; timestamp?: number; environment?: string; release?: string; level?: string; platform?: string;
  exception?: { values?: { type?: string; value?: string; stacktrace?: { frames?: Frame[] } }[] };
};

function codeFilename(filename: string | undefined): string | undefined {
  if (!filename) return undefined;
  const clean = filename.split(/[?#]/u)[0];
  if (/^https?:/u.test(clean)) {
    try {
      const url = new URL(clean);
      return !url.username && !url.password && /^\/_next\/static\/.+\.[cm]?js$/u.test(url.pathname) ? url.href : undefined;
    } catch { return undefined; }
  }
  const relative = clean.replace(/\\/gu, "/").replace(/^.*\/(?:sasu|task)\//u, "");
  return /^(?:app|lib|components|\.next|node_modules)\/[^\s]+\.[cm]?[jt]sx?$/u.test(relative) ? relative : undefined;
}

export function sanitizeSentryEvent<T extends ErrorEvent>(event: T): T {
  const result: ErrorEvent = {};
  if (event.event_id && /^[a-f0-9]+$/iu.test(event.event_id)) result.event_id = event.event_id;
  if (typeof event.timestamp === "number") result.timestamp = event.timestamp;
  if (event.environment && /^(?:production|development|test)$/u.test(event.environment)) result.environment = event.environment;
  if (event.release && /^[a-z0-9@._+-]{1,120}$/iu.test(event.release)) result.release = event.release;
  if (event.level && /^(?:fatal|error|warning|info|debug)$/u.test(event.level)) result.level = event.level;
  if (event.platform && /^(?:javascript|node)$/u.test(event.platform)) result.platform = event.platform;
  result.exception = { values: (event.exception?.values ?? [{ type: "Error" }]).map((exception) => {
    const frames = (exception.stacktrace?.frames ?? []).map((frame) => ({ filename: codeFilename(frame.filename), lineno: frame.lineno, colno: frame.colno })).filter((frame) => frame.filename);
    return {
      type: ["Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "URIError", "EvalError", "AggregateError"].includes(exception.type ?? "") ? exception.type : "Error",
      value: "application_error",
      ...(frames.length ? { stacktrace: { frames } } : {}),
    };
  }) };
  return result as T;
}
