import { NextRequest, NextResponse } from "next/server";

import { AUTH_CALLBACK_ERROR_PATH, parseEmailConfirm, postLoginPath } from "@/lib/auth-login";
import { LOGIN_NEXT_COOKIE } from "@/lib/auth-redirect";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// The request URL carries a one-time login credential: never log it, never cache or refer it.
function redirectTo(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url), 302);
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export async function GET(request: NextRequest) {
  // The destination comes only from the login cookie; query `next` is never read.
  const confirm = parseEmailConfirm(request.nextUrl.searchParams);
  if (!confirm) return redirectTo(request, AUTH_CALLBACK_ERROR_PATH);

  const supabase = await createServerSupabaseClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: confirm.type,
    token_hash: confirm.tokenHash,
  });
  if (verifyError) return redirectTo(request, AUTH_CALLBACK_ERROR_PATH);

  const destination = await postLoginPath(
    supabase,
    request.cookies.get(LOGIN_NEXT_COOKIE)?.value,
  );
  const response = redirectTo(request, destination.path);
  if (destination.ok) response.cookies.delete(LOGIN_NEXT_COOKIE);
  return response;
}
