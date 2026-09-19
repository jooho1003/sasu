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

export function contentSecurityPolicy(nonce: string, supabaseUrl: string | undefined, development: boolean) {
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
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    // Existing components use style attributes. Script execution remains nonce-only.
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self'${origin}${websocket}${development ? " ws: http://localhost:* http://127.0.0.1:*" : ""}`,
    `media-src 'self' blob:${origin}`,
    "worker-src 'self' blob:",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ") + ";";
}
