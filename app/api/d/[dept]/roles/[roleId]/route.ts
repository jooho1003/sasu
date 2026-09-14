import { z } from "zod";

import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const ArchiveRoleRequest = z.strictObject({
  archived: z.literal(true),
});

type DatabaseError = {
  code?: string;
  message?: string;
};

function withoutAuthorityFields(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }

  const safeValue = { ...(value as Record<string, unknown>) };
  Reflect.deleteProperty(safeValue, "dept_id");
  Reflect.deleteProperty(safeValue, "created_by");
  Reflect.deleteProperty(safeValue, "requested_by");
  return safeValue;
}

function isRlsDenied(error: DatabaseError | null): boolean {
  return error?.code === "42501"
    || error?.message?.toLowerCase().includes("row-level security") === true;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ dept: string; roleId: string }> },
) {
  const { dept, roleId } = await params;
  const membership = await requireMembership(dept);
  if (membership.role !== "lead") {
    return Response.json(
      { error: "역할은 팀장만 보관할 수 있습니다." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = withoutAuthorityFields(await request.json());
  } catch {
    return Response.json(
      { error: "요청 본문이 올바른 JSON이 아닙니다." },
      { status: 400 },
    );
  }

  if (!ArchiveRoleRequest.safeParse(body).success) {
    return Response.json(
      { error: "보관 요청은 archived=true만 허용합니다." },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const result = await supabase
    .from("agent_roles")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", roleId)
    .eq("dept_id", membership.deptId)
    .select("id, archived_at")
    .maybeSingle();

  if (isRlsDenied(result.error)) {
    return Response.json(
      { error: "역할은 팀장만 보관할 수 있습니다." },
      { status: 403 },
    );
  }
  if (result.error) {
    return Response.json(
      { error: "역할을 보관하지 못했습니다." },
      { status: 500 },
    );
  }
  if (!result.data) {
    return Response.json(
      { error: "보관할 역할을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  return Response.json({ ok: true, role: result.data });
}
