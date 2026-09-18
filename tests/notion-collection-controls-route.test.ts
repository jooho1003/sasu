import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMembership: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/supabase/membership", () => ({ requireMembership: mocks.requireMembership }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.createServerSupabaseClient }));
vi.mock("@/lib/site", () => ({ metadataBase: () => new URL("https://sasu.example") }));
vi.mock("@/lib/jobs", () => ({ enqueue: vi.fn(), kickWorker: vi.fn() }));
vi.mock("@/lib/pipeline/notion-import", () => ({ registerNotionImportHandler: vi.fn() }));
vi.mock("@/lib/pipeline/notion-discover", () => ({ registerNotionDiscoverHandler: vi.fn() }));
vi.mock("@/lib/notion-workspace", () => ({ withNotionForDepartment: vi.fn() }));

import { GET, PATCH } from "@/app/api/d/[dept]/settings/notion/route";

function thenableQuery(result: unknown) {
  const calls: Array<[string, unknown[]]> = [];
  const query = {
    select: (...args: unknown[]) => { calls.push(["select", args]); return query; },
    eq: (...args: unknown[]) => { calls.push(["eq", args]); return query; },
    neq: (...args: unknown[]) => { calls.push(["neq", args]); return query; },
    not: (...args: unknown[]) => { calls.push(["not", args]); return query; },
    order: (...args: unknown[]) => { calls.push(["order", args]); return query; },
    range: (...args: unknown[]) => { calls.push(["range", args]); return query; },
    update: (...args: unknown[]) => { calls.push(["update", args]); return query; },
    maybeSingle: async () => result,
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return { query, calls };
}

const context = { params: Promise.resolve({ dept: "dept-1" }) };

describe("자동 수집 문서 route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("세션/RLS query로 200행 페이지와 root 설정을 읽는다", async () => {
    mocks.requireMembership.mockResolvedValue({ deptId: "dept-1", role: "lead" });
    const sources = thenableQuery({
      data: [{ id: "source-1", root_id: "root-1" }],
      count: 401,
      error: null,
    });
    const roots = thenableQuery({
      data: [{ id: "root-1", card_candidates: false }],
      error: null,
    });
    mocks.createServerSupabaseClient.mockResolvedValue({
      from: (table: string) => table === "sources" ? sources.query : roots.query,
    });

    const response = await GET(
      new Request("https://sasu.example/api/d/dept-1/settings/notion?page=2"),
      context,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ page: 2, page_size: 200, total: 401, total_pages: 3 });
    expect(sources.calls).toContainEqual(["range", [200, 399]]);
    expect(sources.calls).toContainEqual(["eq", ["dept_id", "dept-1"]]);
    expect(sources.calls).toContainEqual(["not", ["root_id", "is", null]]);
  });

  it("일반 멤버의 변경 요청은 DB 접근 전에 403으로 거부한다", async () => {
    mocks.requireMembership.mockResolvedValue({ deptId: "dept-1", role: "member" });

    const response = await PATCH(
      new Request("https://sasu.example/api/d/dept-1/settings/notion", {
        method: "PATCH",
        headers: { origin: "https://sasu.example", "content-type": "application/json" },
        body: JSON.stringify({ action: "exclude", source_id: "source-1", subtree: true }),
      }),
      context,
    );

    expect(response.status).toBe(403);
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("부서장의 제외 요청은 세션으로 확인한 external_id만 RPC에 전달한다", async () => {
    mocks.requireMembership.mockResolvedValue({ deptId: "dept-1", role: "lead" });
    const source = thenableQuery({
      data: { id: "source-1", external_id: "notion-page-1", root_id: "root-1" },
      error: null,
    });
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    mocks.createServerSupabaseClient.mockResolvedValue({ from: () => source.query, rpc });

    const response = await PATCH(
      new Request("https://sasu.example/api/d/dept-1/settings/notion", {
        method: "PATCH",
        headers: { origin: "https://sasu.example", "content-type": "application/json" },
        body: JSON.stringify({ action: "exclude", source_id: "source-1", subtree: true }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("set_notion_exclusion", {
      p_dept: "dept-1",
      p_notion_id: "notion-page-1",
      p_subtree: true,
      p_excluded: true,
    });
  });

  it("root 카드 후보 토글은 전용 lead RPC에 맡긴다", async () => {
    mocks.requireMembership.mockResolvedValue({ deptId: "dept-1", role: "lead" });
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    mocks.createServerSupabaseClient.mockResolvedValue({ rpc });

    const response = await PATCH(
      new Request("https://sasu.example/api/d/dept-1/settings/notion", {
        method: "PATCH",
        headers: { origin: "https://sasu.example", "content-type": "application/json" },
        body: JSON.stringify({ action: "card_candidates", root_id: "root-1", enabled: true }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("set_notion_root_card_candidates", {
      p_root: "root-1",
      p_enabled: true,
    });
  });
});
