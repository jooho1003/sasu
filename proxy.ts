import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { trailerPublishEnabled } from "@/lib/features";
import { isDemoReviewer } from "@/lib/demo-access";

export async function proxy(request: NextRequest) {
  // Close disabled pages before the parent department layout redirects to login.
  if (!trailerPublishEnabled() && /^\/d\/[^/]+\/trailers(?:\/|$)/u.test(request.nextUrl.pathname)) {
    return new NextResponse("페이지를 찾을 수 없습니다.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  let response = NextResponse.next({ request });
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

        response = NextResponse.next({ request });

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
    return NextResponse.json(
      {
        error: "심사위원 데모에서는 실제 저장과 외부 발신을 하지 않습니다.",
        code: "demo_read_only",
      },
      {
        status: 403,
        headers: { "cache-control": "private, no-store, max-age=0" },
      },
    );
  }

  return response;
}

export const config = {
  matcher: [
    "/login",
    "/consent",
    "/auth/:path*",
    "/no-membership",
    "/d/:path*",
    "/api/d/:path*",
    "/api/cards/:path*",
    "/admin/:path*",
    "/invite/:path*",
    "/api/admin/:path*",
    "/api/invites/:path*",
    "/demo/access",
  ],
};
