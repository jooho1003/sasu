import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  DEMO_REVIEWER_ID,
  demoAutoLoginEnabled,
  demoReviewerEmail,
  isDemoReviewer,
  safeDemoDestination,
} from "@/lib/demo-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function noStoreRedirect(request: NextRequest, destination: string) {
  const response = NextResponse.redirect(new URL(destination, request.url), 303);
  response.headers.set("cache-control", "private, no-store, max-age=0");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}

async function hardenDemoSessionCookies(maxAge: number) {
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (!/-auth-token(?:\.\d+)?$/u.test(cookie.name)) continue;
    cookieStore.set(cookie.name, cookie.value, {
      httpOnly: true,
      maxAge,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
}

export async function GET(request: NextRequest) {
  if (!demoAutoLoginEnabled()) {
    return noStoreRedirect(request, "/demo?demo=disabled");
  }

  const destination = safeDemoDestination(request.nextUrl.searchParams.get("next"));
  const supabase = await createServerSupabaseClient();
  const current = await supabase.auth.getUser();

  if (current.data.user) {
    return noStoreRedirect(
      request,
      isDemoReviewer(current.data.user.id)
        ? destination
        : "/demo?demo=existing-account",
    );
  }

  const password = process.env.SASU_DEMO_USER_PASSWORD?.trim();
  if (!password) {
    return noStoreRedirect(request, "/demo?demo=unavailable");
  }

  const signedIn = await supabase.auth.signInWithPassword({
    email: demoReviewerEmail(),
    password,
  });
  if (
    signedIn.error ||
    !signedIn.data.user ||
    signedIn.data.user.id !== DEMO_REVIEWER_ID
  ) {
    if (signedIn.data.session) await supabase.auth.signOut();
    return noStoreRedirect(request, "/demo?demo=unavailable");
  }

  await hardenDemoSessionCookies(signedIn.data.session?.expires_in ?? 3_600);

  return noStoreRedirect(request, destination);
}
