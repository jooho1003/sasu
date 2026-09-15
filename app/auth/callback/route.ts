import { NextRequest, NextResponse } from "next/server";

import { LOGIN_NEXT_COOKIE, resolvePostLoginPath } from "@/lib/auth-redirect";
import { orgAdminReadEnabled } from "@/lib/features";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=auth_callback", request.url),
    );
  }

  const supabase = await createServerSupabaseClient();
  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(
      new URL("/login?error=auth_callback", request.url),
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.redirect(
      new URL("/login?error=auth_callback", request.url),
    );
  }

  const { data: membership, error: membershipError } = await supabase
    .from("members")
    .select("dept_id")
    .eq("user_id", user.id)
    .order("dept_id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.redirect(
      new URL("/login?error=membership_lookup", request.url),
    );
  }

  let cookieNext: string | null = null;
  const encodedNext = request.cookies.get(LOGIN_NEXT_COOKIE)?.value;
  if (encodedNext) {
    try {
      cookieNext = decodeURIComponent(encodedNext);
    } catch {
      cookieNext = null;
    }
  }

  let isOrgAdmin = false;
  const adminReadEnabled = orgAdminReadEnabled();
  if (!membership && adminReadEnabled) {
    const adminResult = await supabase.rpc("admin_org_id");
    isOrgAdmin = !adminResult.error && Boolean(adminResult.data);
  }

  const destination = resolvePostLoginPath({
    next: cookieNext,
    firstDeptId: membership?.dept_id ?? null,
    isOrgAdmin,
    adminReadEnabled,
  });
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.cookies.delete(LOGIN_NEXT_COOKIE);
  return response;
}
