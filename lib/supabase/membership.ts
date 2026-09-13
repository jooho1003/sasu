import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { CONSENT_LATER_COOKIE } from "@/lib/consent";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Membership = {
  userId: string;
  deptId: string;
  role: "lead" | "member";
  displayName: string;
  consentedAt: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function sanitizeInternalPath(
  value: string | null | undefined,
  fallback: string,
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  if (decoded.startsWith("//") || decoded.startsWith("/\\")) {
    return fallback;
  }

  try {
    const base = new URL("https://sasu.internal");
    const resolved = new URL(value, base);
    return resolved.origin === base.origin
      ? `${resolved.pathname}${resolved.search}${resolved.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}

export async function requireMembership(
  deptSlugOrId: string,
): Promise<Membership> {
  if (!UUID_PATTERN.test(deptSlugOrId)) {
    redirect("/no-membership");
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("members")
    .select("dept_id, role, display_name, consented_at")
    .eq("user_id", user.id)
    .eq("dept_id", deptSlugOrId)
    .maybeSingle();

  if (membershipError) {
    throw new Error("부서 멤버십을 확인하지 못했습니다.", {
      cause: membershipError,
    });
  }

  if (
    !membership ||
    (membership.role !== "lead" && membership.role !== "member")
  ) {
    redirect("/no-membership");
  }

  return {
    userId: user.id,
    deptId: membership.dept_id,
    role: membership.role,
    displayName: membership.display_name,
    consentedAt: membership.consented_at,
  };
}

export async function requirePageMembership(
  deptSlugOrId: string,
  nextPath: string,
): Promise<Membership> {
  const membership = await requireMembership(deptSlugOrId);
  if (membership.consentedAt) {
    return membership;
  }

  const cookieStore = await cookies();
  if (cookieStore.get(CONSENT_LATER_COOKIE)?.value === "1") {
    return membership;
  }

  const fallback = `/d/${membership.deptId}`;
  const safeNextPath = sanitizeInternalPath(nextPath, fallback);
  redirect(`/consent?next=${encodeURIComponent(safeNextPath)}`);
}
