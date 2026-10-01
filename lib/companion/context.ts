// Design Ref: desktop-companion §4.1 — 웹과 기기 경로가 공유하는 결과 모양만 둔다.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Membership } from "@/lib/supabase/membership";

export type ActorContext = {
  client: SupabaseClient;
  userId: string;
  deptId: string;
  role: "lead" | "member";
  consentedAt: string | null;
};

export type Result<T> =
  | { ok: true; status: number; body: T }
  | { ok: false; status: number; error: string; code: string };

export type Failure = Extract<Result<never>, { ok: false }>;

export function actorFromMembership(
  client: SupabaseClient,
  membership: Membership,
): ActorContext {
  return {
    client,
    userId: membership.userId,
    deptId: membership.deptId,
    role: membership.role,
    consentedAt: membership.consentedAt,
  };
}

export function jsonResult<T>(result: Result<T>): Response {
  const init = {
    status: result.status,
    headers: { "Cache-Control": "private, no-store" },
  };

  if (result.ok) {
    return Response.json(result.body, init);
  }

  return Response.json(
    { error: result.error, code: result.code },
    init,
  );
}
