import { NextResponse } from "next/server";

import { sanitizeInternalPath } from "@/lib/auth-redirect";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  await (await createServerSupabaseClient()).auth.signOut();
  const next = sanitizeInternalPath(new URL(request.url).searchParams.get("next"), "/login");
  return NextResponse.redirect(new URL(next, request.url), 303);
}

export function GET() {
  return Response.json({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "POST" } });
}
