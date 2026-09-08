import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";

type Membership = {
  userId: string;
  deptId: string;
  role: "lead" | "member";
  displayName: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    .select("dept_id, role, display_name")
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
  };
}
