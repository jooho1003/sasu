import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  enqueue: vi.fn(),
  from: vi.fn(),
  kickWorker: vi.fn(),
  registerAgentRoleHandler: vi.fn(),
  requireMembership: vi.fn(),
  rpc: vi.fn(),
  filters: [] as Array<{ table: string; column: string; value: unknown }>,
  inserts: [] as Array<{ table: string; values: unknown }>,
  orders: [] as Array<{
    table: string;
    column: string;
    options: unknown;
  }>,
  updates: [] as Array<{ table: string; values: unknown }>,
  roleInsertResult: { data: null as unknown, error: null as unknown },
  roleSelectResult: { data: null as unknown, error: null as unknown },
  roleUpdateResult: { data: null as unknown, error: null as unknown },
  resultSelectResult: { data: null as unknown, error: null as unknown },
}));

vi.mock("@/lib/jobs", () => ({
  enqueue: mocks.enqueue,
  kickWorker: mocks.kickWorker,
}));
vi.mock("@/lib/pipeline/agent-role", () => ({
  registerAgentRoleHandler: mocks.registerAgentRoleHandler,
}));
vi.mock("@/lib/supabase/membership", () => ({
  requireMembership: mocks.requireMembership,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mocks.authGetUser },
    from: mocks.from,
    rpc: mocks.rpc,
  }),
}));

import {
  GET as getRoles,
  POST as createRole,
} from "@/app/api/d/[dept]/roles/route";
import { PATCH as archiveRole } from "@/app/api/d/[dept]/roles/[roleId]/route";
import {
  GET as getRuns,
  POST as createRuns,
} from "@/app/api/d/[dept]/roles/[roleId]/runs/route";

const membership = {
  userId: "11111111-1111-4111-8111-111111111111",
  deptId: "22222222-2222-4222-8222-222222222222",
  role: "lead" as const,
  displayName: "합성 팀장",
  consentedAt: "2026-09-14T00:00:00.000Z",
};
const authUserId = "33333333-3333-4333-8333-333333333333";
const roleId = "44444444-4444-4444-8444-444444444444";
const sourceId1 = "55555555-5555-4555-8555-555555555555";
const sourceId2 = "66666666-6666-4666-8666-666666666666";
const resultId1 = "77777777-7777-4777-8777-777777777777";
const resultId2 = "88888888-8888-4888-8888-888888888888";

const validCriteria = [
  {
    key: "experience",
    label: "관련 경험",
    description: "직무와 직접 관련된 프로젝트 경험",
    weight: 3,
  },
];

function validRoleBody() {
  return {
    name: "지원서 검토",
    instruction: "직무 관련 근거만 검토하세요.",
    visibility: "leads_only",
    criteria: validCriteria,
  };
}

function roleRequest(body: unknown) {
  return new Request("http://localhost/api/d/dept/roles", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function patchRequest(body: unknown) {
  return new Request(`http://localhost/api/d/dept/roles/${roleId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function runsRequest(body: unknown) {
  return new Request(`http://localhost/api/d/dept/roles/${roleId}/runs`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function query(table: string) {
  let action: "select" | "insert" | "update" = "select";
  const result = () => {
    if (table === "agent_roles" && action === "insert") {
      return mocks.roleInsertResult;
    }
    if (table === "agent_roles" && action === "update") {
      return mocks.roleUpdateResult;
    }
    if (table === "agent_roles") return mocks.roleSelectResult;
    if (table === "agent_role_results") return mocks.resultSelectResult;
    throw new Error(`unexpected table: ${table}`);
  };
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => {
      mocks.filters.push({ table, column, value });
      return builder;
    }),
    is: vi.fn((column: string, value: unknown) => {
      mocks.filters.push({ table, column, value });
      return builder;
    }),
    order: vi.fn((column: string, options: unknown) => {
      mocks.orders.push({ table, column, options });
      return builder;
    }),
    insert: vi.fn((values: unknown) => {
      action = "insert";
      mocks.inserts.push({ table, values });
      return builder;
    }),
    update: vi.fn((values: unknown) => {
      action = "update";
      mocks.updates.push({ table, values });
      return builder;
    }),
    maybeSingle: vi.fn(async () => result()),
    single: vi.fn(async () => result()),
    then: (
      resolve: (value: { data: unknown; error: unknown }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result()).then(resolve, reject),
  };
  return builder;
}

describe("부서 역할 라우트", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.filters.length = 0;
    mocks.inserts.length = 0;
    mocks.orders.length = 0;
    mocks.updates.length = 0;
    mocks.requireMembership.mockResolvedValue(membership);
    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: authUserId } },
      error: null,
    });
    mocks.enqueue.mockResolvedValue("99999999-9999-4999-8999-999999999999");
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    mocks.roleInsertResult = {
      data: {
        id: roleId,
        ...validRoleBody(),
        created_at: "2026-09-14T01:00:00.000Z",
      },
      error: null,
    };
    mocks.roleSelectResult = {
      data: { id: roleId, dept_id: membership.deptId },
      error: null,
    };
    mocks.roleUpdateResult = {
      data: { id: roleId, archived_at: "2026-09-14T02:00:00.000Z" },
      error: null,
    };
    mocks.resultSelectResult = { data: [], error: null };
    mocks.from.mockImplementation(query);
  });

  it("member는 역할을 만들 수 없다", async () => {
    mocks.requireMembership.mockResolvedValue({
      ...membership,
      role: "member" as const,
    });

    const response = await createRole(roleRequest(validRoleBody()), {
      params: Promise.resolve({ dept: membership.deptId }),
    });

    expect(response.status).toBe(403);
    expect(mocks.inserts).toEqual([]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("member는 역할을 보관할 수 없다", async () => {
    mocks.requireMembership.mockResolvedValue({
      ...membership,
      role: "member" as const,
    });

    const response = await archiveRole(patchRequest({ archived: true }), {
      params: Promise.resolve({ dept: membership.deptId, roleId }),
    });

    expect(response.status).toBe(403);
    expect(mocks.updates).toEqual([]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("member는 역할 실행을 요청할 수 없다", async () => {
    mocks.requireMembership.mockResolvedValue({
      ...membership,
      role: "member" as const,
    });

    const response = await createRuns(
      runsRequest({ source_ids: [sourceId1] }),
      { params: Promise.resolve({ dept: membership.deptId, roleId }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.inserts).toEqual([]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["11개 기준", Array.from({ length: 11 }, (_, index) => ({
      ...validCriteria[0],
      key: `criterion_${index}`,
    }))],
    ["중복 key", [validCriteria[0], { ...validCriteria[0] }]],
    ["가중치 6", [{ ...validCriteria[0], weight: 6 }]],
  ])("잘못된 criteria(%s)는 거부한다", async (_caseName, criteria) => {
    const response = await createRole(
      roleRequest({ ...validRoleBody(), criteria }),
      { params: Promise.resolve({ dept: membership.deptId }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.inserts).toEqual([]);
  });

  it("본문의 dept_id와 created_by를 무시하고 세션 값을 저장한다", async () => {
    const response = await createRole(
      roleRequest({
        ...validRoleBody(),
        dept_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        created_by: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      }),
      { params: Promise.resolve({ dept: membership.deptId }) },
    );

    expect(response.status).toBe(201);
    expect(mocks.inserts).toHaveLength(1);
    expect(mocks.inserts[0].values).toMatchObject({
      dept_id: membership.deptId,
      created_by: authUserId,
    });
    expect(mocks.inserts[0].values).not.toMatchObject({
      dept_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      created_by: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
  });

  it("역할 정의의 모든 자유 텍스트 이메일을 저장 전에 마스킹한다", async () => {
    const response = await createRole(
      roleRequest({
        ...validRoleBody(),
        name: "owner@example.com 검토",
        instruction: "문의는 reviewer@example.com으로 보내세요.",
        criteria: [{
          ...validCriteria[0],
          label: "lead@example.com",
          description: "담당 hr@example.com이 직무 근거를 확인합니다.",
        }],
      }),
      { params: Promise.resolve({ dept: membership.deptId }) },
    );

    expect(response.status).toBe(201);
    expect(mocks.inserts[0].values).toMatchObject({
      name: "[이메일] 검토",
      instruction: "문의는 [이메일]으로 보내세요.",
      criteria: [{
        ...validCriteria[0],
        label: "[이메일]",
        description: "담당 [이메일]이 직무 근거를 확인합니다.",
      }],
    });
  });

  it("RLS가 역할 생성을 거부하면 403을 반환한다", async () => {
    mocks.roleInsertResult = {
      data: null,
      error: { code: "42501", message: "row-level security policy" },
    };

    const response = await createRole(roleRequest(validRoleBody()), {
      params: Promise.resolve({ dept: membership.deptId }),
    });

    expect(response.status).toBe(403);
  });

  it("역할 보관은 현재 부서로 제한하고 0행이면 404를 반환한다", async () => {
    mocks.roleUpdateResult = { data: null, error: null };

    const response = await archiveRole(patchRequest({ archived: true }), {
      params: Promise.resolve({ dept: membership.deptId, roleId }),
    });

    expect(response.status).toBe(404);
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.filters).toContainEqual({
      table: "agent_roles",
      column: "dept_id",
      value: membership.deptId,
    });
  });

  it.each([
    ["agent_role_forbidden", 403],
    ["agent_role_sources_invalid", 400],
    ["agent_role_daily_limit", 429],
    ["database_failed", 500],
  ])("RPC 오류 %s를 상태 코드 %i로 매핑한다", async (message, status) => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message },
    });

    const response = await createRuns(
      runsRequest({ source_ids: [sourceId1] }),
      { params: Promise.resolve({ dept: membership.deptId, roleId }) },
    );

    expect(response.status).toBe(status);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("정상 실행 요청은 결과마다 updated_at 기반 중복 키로 job을 넣는다", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          result_id: resultId1,
          source_id: sourceId1,
          updated_at: "2026-09-14T03:00:00.000Z",
        },
        {
          result_id: resultId2,
          source_id: sourceId2,
          updated_at: "2026-09-14T03:00:01.000Z",
        },
      ],
      error: null,
    });

    const response = await createRuns(
      runsRequest({
        source_ids: [sourceId1, sourceId2],
        dept_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        requested_by: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      }),
      { params: Promise.resolve({ dept: membership.deptId, roleId }) },
    );
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(mocks.rpc).toHaveBeenCalledWith("request_agent_role_run", {
      p_role: roleId,
      p_sources: [sourceId1, sourceId2],
    });
    expect(mocks.enqueue).toHaveBeenNthCalledWith(
      1,
      "run_agent_role",
      { resultId: resultId1 },
      { dedupeKey: `${resultId1}:2026-09-14T03:00:00.000Z` },
    );
    expect(mocks.enqueue).toHaveBeenNthCalledWith(
      2,
      "run_agent_role",
      { resultId: resultId2 },
      { dedupeKey: `${resultId2}:2026-09-14T03:00:01.000Z` },
    );
    expect(mocks.registerAgentRoleHandler).toHaveBeenCalledOnce();
    expect(mocks.kickWorker).toHaveBeenCalledOnce();
    expect(body).toEqual({
      ok: true,
      results: [
        { result_id: resultId1, source_id: sourceId1 },
        { result_id: resultId2, source_id: sourceId2 },
      ],
    });
  });

  it.each([
    ["21개", Array.from({ length: 21 }, (_, index) =>
      `90000000-0000-4000-8000-${String(index).padStart(12, "0")}`)],
    ["비 UUID", ["not-a-uuid"]],
    ["중복", [sourceId1, sourceId1]],
  ])("source_ids가 %s이면 RPC를 호출하지 않는다", async (_caseName, sourceIds) => {
    const response = await createRuns(runsRequest({ source_ids: sourceIds }), {
      params: Promise.resolve({ dept: membership.deptId, roleId }),
    });

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("역할 목록은 현재 부서의 활성 역할만 최신순으로 반환한다", async () => {
    const role = mocks.roleInsertResult.data;
    mocks.roleSelectResult = { data: [role], error: null };

    const response = await getRoles(
      new Request("http://localhost/api/d/dept/roles"),
      { params: Promise.resolve({ dept: membership.deptId }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ roles: [role] });
    expect(mocks.filters).toContainEqual({
      table: "agent_roles",
      column: "dept_id",
      value: membership.deptId,
    });
    expect(mocks.filters).toContainEqual({
      table: "agent_roles",
      column: "archived_at",
      value: null,
    });
    expect(mocks.orders).toContainEqual({
      table: "agent_roles",
      column: "created_at",
      options: { ascending: false },
    });
  });

  it("실행 결과는 문서 제목을 펼쳐 점수·갱신시각 순으로 반환한다", async () => {
    mocks.resultSelectResult = {
      data: [{
        id: resultId1,
        source_id: sourceId1,
        status: "completed",
        status_reason: null,
        result: { criteria: [], summary: "요약" },
        weighted_score: 4.25,
        visibility: "leads_only",
        updated_at: "2026-09-14T03:00:00.000Z",
        sources: { title: "합성 지원서" },
      }],
      error: null,
    };

    const response = await getRuns(
      new Request(`http://localhost/api/d/dept/roles/${roleId}/runs`),
      { params: Promise.resolve({ dept: membership.deptId, roleId }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [{
        id: resultId1,
        source_id: sourceId1,
        title: "합성 지원서",
        status: "completed",
        status_reason: null,
        result: { criteria: [], summary: "요약" },
        weighted_score: 4.25,
        visibility: "leads_only",
        updated_at: "2026-09-14T03:00:00.000Z",
      }],
    });
    expect(mocks.orders).toEqual([
      {
        table: "agent_role_results",
        column: "weighted_score",
        options: { ascending: false, nullsFirst: false },
      },
      {
        table: "agent_role_results",
        column: "updated_at",
        options: { ascending: false },
      },
    ]);
  });
});
