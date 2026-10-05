import type { SupabaseClient } from "@supabase/supabase-js";

import { resolvePostLoginPath } from "@/lib/auth-redirect";
import { orgAdminReadEnabled } from "@/lib/features";

export const AUTH_CALLBACK_ERROR_PATH = "/login?error=auth_callback";
const MEMBERSHIP_ERROR_PATH = "/login?error=membership_lookup";

export type EmailConfirm = { tokenHash: string; type: "email" | "magiclink" };

const TOKEN_HASH_PATTERN = /^[A-Za-z0-9_-]{1,512}$/u;
const EMAIL_CONFIRM_TYPES: ReadonlySet<string> = new Set(["email", "magiclink"]);

function singleParam(params: URLSearchParams, name: string): string | null {
  const values = params.getAll(name);
  return values.length === 1 ? values[0] : null;
}

// Design Ref: app-domain-migration §4 E-C1 — only email/magiclink token_hash links create a session here.
export function parseEmailConfirm(params: URLSearchParams): EmailConfirm | null {
  const tokenHash = singleParam(params, "token_hash");
  const type = singleParam(params, "type");
  if (tokenHash === null || !TOKEN_HASH_PATTERN.test(tokenHash)) return null;
  if (type === null || !EMAIL_CONFIRM_TYPES.has(type)) return null;
  return { tokenHash, type: type as EmailConfirm["type"] };
}

// Shared by /auth/callback and /auth/confirm. `supabase` must be the cookie session client.
export async function postLoginPath(
  supabase: SupabaseClient,
  encodedNext: string | undefined,
): Promise<{ path: string; ok: boolean }> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { path: AUTH_CALLBACK_ERROR_PATH, ok: false };

  const { data: membership, error: membershipError } = await supabase
    .from("members")
    .select("dept_id")
    .eq("user_id", user.id)
    .order("dept_id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membershipError) return { path: MEMBERSHIP_ERROR_PATH, ok: false };

  let isOrgAdmin = false;
  const adminReadEnabled = orgAdminReadEnabled();
  if (!membership && adminReadEnabled) {
    const adminResult = await supabase.rpc("admin_org_id");
    isOrgAdmin = !adminResult.error && Boolean(adminResult.data);
  }

  let cookieNext: string | null = null;
  if (encodedNext) {
    try {
      cookieNext = decodeURIComponent(encodedNext);
    } catch {
      cookieNext = null;
    }
  }

  return {
    path: resolvePostLoginPath({
      next: cookieNext,
      firstDeptId: membership?.dept_id ?? null,
      isOrgAdmin,
      adminReadEnabled,
    }),
    ok: true,
  };
}
