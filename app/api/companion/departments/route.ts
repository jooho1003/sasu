// Design Ref: desktop-companion §4 E01 — Bearer 사용자 자신의 부서만 RLS로 읽는다.
import { CompanionDepartmentsResponse } from "@/lib/contracts";
import { jsonResult, type Result } from "@/lib/companion/context";
import { requireBearerUser } from "@/lib/companion/device-context";

type MemberRow = {
  dept_id: string;
  role: "lead" | "member";
  consented_at: string | null;
};

type DepartmentRow = { id: string; name: string };

function failed<T>(): Result<T> {
  return {
    ok: false,
    status: 500,
    error: "부서 목록을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
    code: "departments_failed",
  };
}

export async function GET(request: Request) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return jsonResult(auth);
  }

  const memberships = await auth.client
    .from("members")
    .select("dept_id, role, consented_at")
    .eq("user_id", auth.userId)
    .order("dept_id");

  if (memberships.error || !Array.isArray(memberships.data)) {
    return jsonResult(failed());
  }

  const rawMemberships: unknown[] = memberships.data;
  const rows = rawMemberships.filter(
    (row): row is MemberRow => {
      if (!row || typeof row !== "object") return false;
      const member = row as Record<string, unknown>;
      return (
        typeof member.dept_id === "string" &&
        (member.role === "lead" || member.role === "member") &&
        (member.consented_at === null ||
          typeof member.consented_at === "string")
      );
    },
  );
  if (rows.length !== rawMemberships.length) {
    return jsonResult(failed());
  }

  if (rows.length === 0) {
    return jsonResult({
      ok: true,
      status: 200,
      body: CompanionDepartmentsResponse.parse({ departments: [] }),
    });
  }

  const departments = await auth.client
    .from("departments")
    .select("id, name")
    .in(
      "id",
      rows.map((row) => row.dept_id),
    );

  if (departments.error || !Array.isArray(departments.data)) {
    return jsonResult(failed());
  }

  const names = new Map<string, string>();
  for (const value of departments.data as unknown[]) {
    if (!value || typeof value !== "object") {
      return jsonResult(failed());
    }
    const row = value as DepartmentRow;
    if (typeof row.id !== "string" || typeof row.name !== "string") {
      return jsonResult(failed());
    }
    names.set(row.id, row.name);
  }

  const parsed = CompanionDepartmentsResponse.safeParse({
    departments: rows.map((row) => ({
      id: row.dept_id,
      name: names.get(row.dept_id),
      role: row.role,
      consented: row.consented_at !== null,
    })),
  });

  if (!parsed.success) {
    return jsonResult(failed());
  }

  return jsonResult({ ok: true, status: 200, body: parsed.data });
}
