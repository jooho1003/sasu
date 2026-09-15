import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { trailerPublishEnabled } from "@/lib/features";

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

  await supabase.auth.getClaims();

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
  ],
};
