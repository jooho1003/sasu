/** No cookies, tokens or request bodies are included in these policies. */
export function baselineSecurityHeaders() {
  return [
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "microphone=(self), display-capture=(self), camera=(), geolocation=()" },
  ];
}

export function contentSecurityPolicy(nonce: string, supabaseUrl: string | undefined, development: boolean, telemetry: { ga4?: boolean; sentryDsn?: string | null } = {}) {
  if (!/^[A-Za-z0-9+/=_-]+$/u.test(nonce)) throw new Error("invalid_nonce");
  let origin = "";
  let websocket = "";
  if (supabaseUrl) {
    try {
      const url = new URL(supabaseUrl);
      if (!/^https?:\/\/[A-Za-z0-9.\-\[\]:]+$/u.test(url.origin) || url.username || url.password) throw new Error();
      origin = ` ${url.origin}`;
      websocket = ` ${url.origin.replace(/^http/u, "ws")}`;
    } catch { throw new Error("invalid_supabase_origin"); }
  }
  let sentryOrigin = "";
  if (telemetry.sentryDsn) {
    try {
      const url = new URL(telemetry.sentryDsn);
      if (url.protocol === "https:" && /^o\d+\.ingest(?:\.[a-z]+)?\.sentry\.io$/u.test(url.hostname) && !url.port && !url.password) sentryOrigin = ` ${url.origin}`;
    } catch { /* An invalid optional collector stays disabled. */ }
  }
  const collectors = `${telemetry.ga4 ? " https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com" : ""}${sentryOrigin}`;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    // Existing components use style attributes. Script execution remains nonce-only.
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self'${origin}${websocket}${collectors}${development ? " ws: http://localhost:* http://127.0.0.1:*" : ""}`,
    `media-src 'self' blob:${origin}`,
    "worker-src 'self' blob:",
    `img-src 'self' data: blob:${telemetry.ga4 ? " https://www.google-analytics.com https://region1.google-analytics.com" : ""}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    // The Slack install form posts to our origin, which redirects (303) to Slack OAuth; Chrome checks form-action on that redirect.
    "form-action 'self' https://slack.com https://*.slack.com",
    "frame-ancestors 'none'",
  ].join("; ") + ";";
}
