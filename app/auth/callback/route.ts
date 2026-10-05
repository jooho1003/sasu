import { NextRequest, NextResponse } from "next/server";

import { AUTH_CALLBACK_ERROR_PATH, postLoginPath } from "@/lib/auth-login";
import { LOGIN_NEXT_COOKIE } from "@/lib/auth-redirect";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL(AUTH_CALLBACK_ERROR_PATH, request.url));
  }

  const supabase = await createServerSupabaseClient();
  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(new URL(AUTH_CALLBACK_ERROR_PATH, request.url));
  }

  const destination = await postLoginPath(
    supabase,
    request.cookies.get(LOGIN_NEXT_COOKIE)?.value,
  );
  const response = NextResponse.redirect(new URL(destination.path, request.url));
  if (destination.ok) response.cookies.delete(LOGIN_NEXT_COOKIE);
  return response;
}
