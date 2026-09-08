import { NextRequest, NextResponse } from "next/server";

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

  if (!membership) {
    return NextResponse.redirect(new URL("/no-membership", request.url));
  }

  return NextResponse.redirect(
    new URL(`/d/${membership.dept_id}`, request.url),
  );
}
