import { z } from "zod";

import { enqueue, kickWorker } from "@/lib/jobs";
import { registerAgentRoleHandler } from "@/lib/pipeline/agent-role";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const AgentRoleRunRequest = z
  .strictObject({
    source_ids: z.array(z.string().uuid()).min(1).max(20),
  })
  .superRefine(({ source_ids }, context) => {
    if (new Set(source_ids).size !== source_ids.length) {
      context.addIssue({
        code: "custom",
        path: ["source_ids"],
        message: "문서는 중복해서 선택할 수 없습니다.",
      });
    }
  });

type RunRow = {
  result_id: string;
  source_id: string;
  updated_at: string;
};

type ResultRow = {
  id: string;
  source_id: string;
  status: string;
  status_reason: string | null;
  result: unknown;
  weighted_score: number | null;
  visibility: "dept" | "leads_only";
  updated_at: string;
  sources: { title: string | null } | Array<{ title: string | null }>;
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

function relationValue<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value;
}

function rpcErrorResponse(error: { message?: string }) {
  const message = error.message ?? "";
  if (message.includes("agent_role_forbidden")) {
    return Response.json(
      { error: "역할 실행 권한이 없습니다." },
      { status: 403 },
    );
  }
  if (message.includes("agent_role_sources_invalid")) {
    return Response.json(
      { error: "이 부서의 처리 완료된 문서만 선택할 수 있습니다." },
      { status: 400 },
    );
  }
  if (message.includes("agent_role_daily_limit")) {
    return Response.json(
      { error: "오늘 역할 실행 한도(100건)를 넘었습니다." },
      { status: 429 },
    );
  }
  return Response.json(
    { error: "역할 실행을 요청하지 못했습니다." },
    { status: 500 },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ dept: string; roleId: string }> },
) {
  const { dept, roleId } = await params;
  const membership = await requireMembership(dept);
  if (membership.role !== "lead") {
    return Response.json(
      { error: "역할 실행은 팀장만 요청할 수 있습니다." },
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

  const parsed = AgentRoleRunRequest.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "실행할 문서 목록을 확인해주세요." },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const roleResult = await supabase
    .from("agent_roles")
    .select("id, dept_id")
    .eq("id", roleId)
    .eq("dept_id", membership.deptId)
    .is("archived_at", null)
    .maybeSingle();

  if (roleResult.error) {
    return Response.json(
      { error: "역할을 확인하지 못했습니다." },
      { status: 500 },
    );
  }
  if (!roleResult.data) {
    return Response.json(
      { error: "실행할 역할을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const runResult = await supabase.rpc("request_agent_role_run", {
    p_role: roleId,
    p_sources: parsed.data.source_ids,
  });
  if (runResult.error) return rpcErrorResponse(runResult.error);
  if (!runResult.data) {
    return Response.json(
      { error: "역할 실행 결과를 만들지 못했습니다." },
      { status: 500 },
    );
  }

  const results = runResult.data as RunRow[];
  await Promise.all(
    results.map((result) =>
      enqueue(
        "run_agent_role",
        { resultId: result.result_id },
        { dedupeKey: `${result.result_id}:${result.updated_at}` },
      ),
    ),
  );
  registerAgentRoleHandler();
  kickWorker();

  return Response.json(
    {
      ok: true,
      results: results.map((result) => ({
        result_id: result.result_id,
        source_id: result.source_id,
      })),
    },
    { status: 202 },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ dept: string; roleId: string }> },
) {
  const { dept, roleId } = await params;
  const membership = await requireMembership(dept);
  const supabase = await createServerSupabaseClient();
  const result = await supabase
    .from("agent_role_results")
    .select("id, source_id, status, status_reason, result, weighted_score, visibility, updated_at, sources!inner(title)")
    .eq("role_id", roleId)
    .eq("dept_id", membership.deptId)
    .order("weighted_score", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (result.error) {
    return Response.json(
      { error: "역할 실행 결과를 불러오지 못했습니다." },
      { status: 500 },
    );
  }

  return Response.json({
    results: ((result.data ?? []) as ResultRow[]).map((row) => ({
      id: row.id,
      source_id: row.source_id,
      title: relationValue(row.sources).title,
      status: row.status,
      status_reason: row.status_reason,
      result: row.result,
      weighted_score: row.weighted_score,
      visibility: row.visibility,
      updated_at: row.updated_at,
    })),
  });
}
