import { AgentRoleDefinition } from "@/lib/contracts";
import { mask } from "@/lib/mask";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const ROLE_FIELDS = "id, name, instruction, criteria, visibility, created_at";

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

function invalidRoleMessage(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>,
): string {
  const paths = Array.from(
    new Set(
      issues.map((issue) =>
        issue.path.length > 0 ? issue.path.join(".") : "요청 본문",
      ),
    ),
  );
  return `역할 입력이 올바르지 않습니다: ${paths.join(", ")}`;
}

function isRlsDenied(error: DatabaseError | null): boolean {
  return error?.code === "42501"
    || error?.message?.toLowerCase().includes("row-level security") === true;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  const supabase = await createServerSupabaseClient();
  const result = await supabase
    .from("agent_roles")
    .select(ROLE_FIELDS)
    .eq("dept_id", membership.deptId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (result.error) {
    return Response.json(
      { error: "역할 목록을 불러오지 못했습니다." },
      { status: 500 },
    );
  }

  return Response.json({ roles: result.data ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  if (membership.role !== "lead") {
    return Response.json(
      { error: "역할은 팀장만 만들 수 있습니다." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = withoutAuthorityFields(await request.json());
  } catch {
    return Response.json(
      { error: "요청 본문이 올바른 .json 파일이 아닙니다." },
      { status: 400 },
    );
  }

  const parsed = AgentRoleDefinition.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: invalidRoleMessage(parsed.error.issues) },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const userResult = await supabase.auth.getUser();
  if (userResult.error || !userResult.data.user) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const role = {
    name: mask(parsed.data.name),
    instruction: mask(parsed.data.instruction),
    visibility: parsed.data.visibility,
    criteria: parsed.data.criteria.map((criterion) => ({
      ...criterion,
      label: mask(criterion.label),
      description: mask(criterion.description),
    })),
  };
  const result = await supabase
    .from("agent_roles")
    .insert({
      ...role,
      dept_id: membership.deptId,
      created_by: userResult.data.user.id,
    })
    .select(ROLE_FIELDS)
    .single();

  if (isRlsDenied(result.error)) {
    return Response.json(
      { error: "역할은 팀장만 만들 수 있습니다." },
      { status: 403 },
    );
  }
  if (result.error || !result.data) {
    return Response.json(
      { error: "역할을 저장하지 못했습니다." },
      { status: 500 },
    );
  }

  return Response.json({ role: result.data }, { status: 201 });
}
