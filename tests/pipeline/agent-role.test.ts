import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: null as ReturnType<typeof createFakeClient> | null,
  structured: vi.fn(),
  register: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: () => mocks.client?.client,
}));
vi.mock("@/lib/llm", () => ({ llm: { structured: mocks.structured } }));
vi.mock("@/lib/jobs", () => ({ registerHandler: mocks.register }));

import { registerAgentRoleHandler, runAgentRole } from "@/lib/pipeline/agent-role";

type Operation = { table: string; values: Record<string, unknown>; filters: Array<[string, unknown]> };

function createFakeClient(args: {
  result?: Record<string, unknown> | null;
  role?: Record<string, unknown> | null;
  items?: Array<Record<string, unknown>>;
}) {
  const operations: Operation[] = [];
  const client = {
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      const builder = {
        select: () => builder,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return builder; },
        is: () => builder,
        order: () => builder,
        maybeSingle: async () => ({
          data: table === "agent_role_results" ? args.result ?? null : table === "agent_roles" ? args.role ?? null : null,
          error: null,
        }),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: table === "items" ? args.items ?? [] : null, error: null }),
        update: (values: Record<string, unknown>) => {
          operations.push({ table, values, filters });
          return { eq: async () => ({ error: null }) };
        },
      };
      return builder;
    },
  };
  return { client, operations };
}

const result = { id: "result-1", role_id: "role-1", source_id: "source-1", dept_id: "dept-1", status: "processing" };
const role = {
  id: "role-1", name: "지원서 검토", instruction: "직무 경험을 확인", visibility: "leads_only", criteria: [{ key: "experience", label: "경험", description: "관련 경험", weight: 2 }],
};

describe("agent role pipeline", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("문서 chunk가 없으면 no_document_chunks로 실패 처리한다", async () => {
    mocks.client = createFakeClient({ result, role, items: [] });
    await runAgentRole("result-1");
    expect(mocks.structured).not.toHaveBeenCalled();
    expect(mocks.client.operations).toContainEqual(expect.objectContaining({
      table: "agent_role_results", values: expect.objectContaining({ status: "failed", status_reason: "no_document_chunks" }),
    }));
  });

  it("유효한 문서 인용만 완료 결과와 코드 계산 가중 점수로 저장한다", async () => {
    mocks.client = createFakeClient({ result, role, items: [{ id: "item-1", content: "관련 프로젝트를 운영했습니다." }] });
    mocks.structured.mockResolvedValue({ data: {
      criteria: [{ key: "experience", score: 4, rationale: "운영 경험", citations: [{ item_id: "item-1", decision_id: null, quote: "프로젝트를 운영" }] }],
      summary: "프로젝트 운영 경험이 있습니다.",
    } });
    await runAgentRole("result-1");
    expect(mocks.structured).toHaveBeenCalledWith("run_agent_role", expect.anything(), expect.anything(), { deptId: "dept-1" });
    expect(mocks.client.operations).toContainEqual(expect.objectContaining({
      table: "agent_role_results", values: expect.objectContaining({ status: "completed", weighted_score: 4 }),
    }));
  });

  it("유효 인용이 하나도 없으면 citation_invalid로 실패한다", async () => {
    mocks.client = createFakeClient({ result, role, items: [{ id: "item-1", content: "관련 프로젝트를 운영했습니다." }] });
    mocks.structured.mockResolvedValue({ data: {
      criteria: [{ key: "experience", score: 4, rationale: "운영 경험", citations: [{ item_id: "item-1", decision_id: null, quote: "없는 인용" }] }],
      summary: "요약",
    } });
    await runAgentRole("result-1");
    expect(mocks.client.operations).toContainEqual(expect.objectContaining({
      table: "agent_role_results", values: expect.objectContaining({ status: "failed", status_reason: "citation_invalid", result: null }),
    }));
  });

  it("결과 id를 받는 handler를 등록한다", () => {
    registerAgentRoleHandler();
    expect(mocks.register).toHaveBeenCalledWith("run_agent_role", expect.any(Function));
  });
});
