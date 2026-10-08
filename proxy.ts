import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { trailerPublishEnabled } from "@/lib/features";
import { isDemoReviewer } from "@/lib/demo-access";
import { contentSecurityPolicy } from "@/lib/security-headers";
import { legacyHostRedirect } from "@/lib/site";
import { isIndexable } from "@/lib/search-discovery";
import { analyticsId, sentryDsn, telemetryEnabled } from "@/lib/telemetry";

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const policy = contentSecurityPolicy(nonce, process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NODE_ENV === "development", {
    ga4: telemetryEnabled() && Boolean(analyticsId(process.env.GA4_MEASUREMENT_ID)),
    sentryDsn: telemetryEnabled() ? sentryDsn(process.env.SENTRY_DSN) : null,
  });
  const policyHeader = process.env.SASU_CSP_ENFORCE === "true"
    ? "Content-Security-Policy"
    : "Content-Security-Policy-Report-Only";
  // Replace any client-supplied nonce/CSP. Next extracts this nonce on dynamic SSR.
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", policy);
  const protect = (response: NextResponse) => {
    if (!isIndexable(request.nextUrl.pathname)) response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set(policyHeader, policy);
    // Candidate invite tokens and mail login token_hash links must not leak through Referer.
    if (/^\/t\/i\/[^/]+\/?$/u.test(request.nextUrl.pathname) || /^\/auth\/confirm\/?$/u.test(request.nextUrl.pathname)) {
      response.headers.set("Referrer-Policy", "no-referrer");
    }
    // A response carrying a request nonce must never be replayed by a shared cache.
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  };
  const legacyTarget = legacyHostRedirect({
    host: request.headers.get("host"),
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
  });
  if (legacyTarget) return protect(NextResponse.redirect(legacyTarget, 308));
  // Close disabled pages before the parent department layout redirects to login.
  if (!trailerPublishEnabled() && /^\/d\/[^/]+\/trailers(?:\/|$)/u.test(request.nextUrl.pathname)) {
    return protect(new NextResponse("페이지를 찾을 수 없습니다.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } }));
  }
  let response = protect(NextResponse.next({ request }));
  // Public pages, collectors and worker endpoints do not refresh user sessions.
  const needsSession = /^(?:\/(?:login|consent|no-membership)$|\/(?:auth|d|admin|invite)(?:\/|$)|\/api\/(?:d|cards|admin|invites|devices)(?:\/|$)|\/demo\/access$)/u.test(request.nextUrl.pathname);
  if (!needsSession) return response;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }

  if (!supabaseAnonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headersToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = protect(NextResponse.next({ request }));

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headersToSet).forEach(([name, value]) => {
          response.headers.set(name, value);
        });
      },
    },
  });

  const claims = await supabase.auth.getClaims();
  const userId = claims.data?.claims?.sub;
  if (typeof userId === "string" && isDemoReviewer(userId)) {
    for (const cookie of request.cookies.getAll()) {
      if (!/-auth-token(?:\.\d+)?$/u.test(cookie.name)) continue;
      response.cookies.set(cookie.name, cookie.value, {
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }
  }
  const isWriteRequest = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (isWriteRequest && typeof userId === "string" && isDemoReviewer(userId)) {
    return protect(NextResponse.json(
      {
        error: "심사위원 데모에서는 실제 저장과 외부 발신을 하지 않습니다.",
        code: "demo_read_only",
      },
      {
        status: 403,
        headers: { "cache-control": "private, no-store, max-age=0" },
      },
    ));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|opengraph-image.png).*)",
  ],
};
