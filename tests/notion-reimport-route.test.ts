import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMembership: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  enqueue: vi.fn(),
  kickWorker: vi.fn(),
  registerNotionImportHandler: vi.fn(),
  registerNotionDiscoverHandler: vi.fn(),
  withNotionForDepartment: vi.fn(),
}));

vi.mock("@/lib/supabase/membership", () => ({ requireMembership: mocks.requireMembership }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.createServerSupabaseClient }));
vi.mock("@/lib/jobs", () => ({ enqueue: mocks.enqueue, kickWorker: mocks.kickWorker }));
vi.mock("@/lib/pipeline/notion-import", () => ({ registerNotionImportHandler: mocks.registerNotionImportHandler }));
vi.mock("@/lib/pipeline/notion-discover", () => ({ registerNotionDiscoverHandler: mocks.registerNotionDiscoverHandler }));
vi.mock("@/lib/notion-workspace", () => ({ withNotionForDepartment: mocks.withNotionForDepartment }));

import { POST } from "@/app/api/d/[dept]/settings/notion/route";

type StoredSource = {
  id: string;
  dept_id: string;
  kind: string;
  external_id: string;
  active: boolean;
  import_version: number;
  ingest_mode: string;
};

function sourceClient(initial: StoredSource[] = []) {
  const sources = [...initial];
  const rpc = vi.fn(async (name: string) => ({
    data: name === "lead_upsert_notion_root" ? "root-1" : true,
    error: null,
  }));
  const from = vi.fn(() => {
    const filters: Record<string, unknown> = {};
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return query;
      },
      maybeSingle: async () => ({
        data: sources.find((source) =>
          Object.entries(filters).every(([column, value]) => source[column as keyof StoredSource] === value),
        ) ?? null,
        error: null,
      }),
      insert: (values: Omit<StoredSource, "id">) => {
        const source = { id: `source-${sources.length + 1}`, ...values };
        sources.push(source);
        return {
          select: () => ({
            single: async () => ({ data: { id: source.id }, error: null }),
          }),
        };
      },
    };
    return query;
  });
  return { client: { from, rpc }, rpc, sources };
}

describe("Notion 재가져오기 권한", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.withNotionForDepartment.mockImplementation(async (_client, _dept, action: () => Promise<unknown>) => action());
    mocks.enqueue.mockResolvedValue("job-1");
  });

  it("member의 source_id 재가져오기 요청은 데이터베이스 접근 전에 거부한다", async () => {
    mocks.requireMembership.mockResolvedValue({ deptId: "dept-1", role: "member" });

    const response = await POST(
      new Request("http://localhost/api/d/dept-1/settings/notion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source_id: "11111111-1111-4111-8111-111111111111" }),
      }),
      { params: Promise.resolve({ dept: "dept-1" }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("조직 Notion 설치가 없으면 source 접근 전에 안전하게 거부한다", async () => {
    mocks.requireMembership.mockResolvedValue({ deptId: "dept-1", role: "lead" });
    mocks.createServerSupabaseClient.mockResolvedValue({ rpc: vi.fn() });
    mocks.withNotionForDepartment.mockRejectedValue(
      Object.assign(new Error("Notion API request failed"), {
        error_code: "notion_not_configured",
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/d/dept-1/settings/notion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source_id: "11111111-1111-4111-8111-111111111111",
        }),
      }),
      { params: Promise.resolve({ dept: "dept-1" }) },
    );

    expect(response.status).toBe(409);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("여러 줄을 정규화하고 같은 부서의 활성 페이지는 한 소스만 돌려준다", async () => {
    mocks.requireMembership.mockResolvedValue({ deptId: "dept-1", role: "lead" });
    const database = sourceClient();
    mocks.createServerSupabaseClient.mockResolvedValue(database.client);
    const page = "11111111-1111-4111-8111-111111111111";

    const response = await POST(
      new Request("http://localhost/api/d/dept-1/settings/notion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          page_id: `${page}\nhttps://www.notion.so/${page.replaceAll("-", "")}`,
          title: "운영 원칙",
          visibility: "dept",
        }),
      }),
      { params: Promise.resolve({ dept: "dept-1" }) },
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      results: [
        { input: page, status: "created", source_id: "source-1" },
        { status: "existing", source_id: "source-1" },
      ],
    });
    expect(database.sources).toHaveLength(1);
    expect(database.sources[0]).toMatchObject({
      import_version: 2,
      ingest_mode: "classify",
    });
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  });

  it("잘못된 줄은 다른 줄의 등록을 막지 않고 줄별 결과로 반환한다", async () => {
    mocks.requireMembership.mockResolvedValue({ deptId: "dept-1", role: "lead" });
    const database = sourceClient();
    mocks.createServerSupabaseClient.mockResolvedValue(database.client);

    const response = await POST(
      new Request("http://localhost/api/d/dept-1/settings/notion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          page_id: "잘못된 주소\n22222222-2222-4222-8222-222222222222",
        }),
      }),
      { params: Promise.resolve({ dept: "dept-1" }) },
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      results: [
        { input: "잘못된 주소", status: "error" },
        { input: "22222222-2222-4222-8222-222222222222", status: "created" },
      ],
    });
    expect(database.sources).toHaveLength(1);
  });

  it("하위 페이지 포함은 lead root RPC 뒤 notion_discover만 예약한다", async () => {
    mocks.requireMembership.mockResolvedValue({ deptId: "dept-1", role: "lead" });
    const database = sourceClient();
    mocks.createServerSupabaseClient.mockResolvedValue(database.client);
    const page = "33333333-3333-4333-8333-333333333333";

    const response = await POST(
      new Request("http://localhost/api/d/dept-1/settings/notion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ page_id: page, visibility: "leads_only", include_children: true }),
      }),
      { params: Promise.resolve({ dept: "dept-1" }) },
    );

    expect(response.status).toBe(202);
    expect(database.rpc).toHaveBeenCalledWith("lead_upsert_notion_root", {
      p_dept: "dept-1",
      p_notion_id: page,
      p_kind: "page",
      p_visibility: "leads_only",
    });
    expect(mocks.enqueue).toHaveBeenCalledWith(
      "notion_discover",
      { rootId: "root-1" },
      { dedupeKey: expect.stringContaining("root-1:") },
    );
    expect(database.sources).toHaveLength(0);
    expect(mocks.registerNotionDiscoverHandler).toHaveBeenCalledOnce();
    expect(mocks.registerNotionImportHandler).not.toHaveBeenCalled();
  });

  it("한 요청의 입력은 빈 줄 제외 50개로 제한한다", async () => {
    mocks.requireMembership.mockResolvedValue({ deptId: "dept-1", role: "lead" });
    const database = sourceClient();
    mocks.createServerSupabaseClient.mockResolvedValue(database.client);
    const lines = Array.from({ length: 51 }, (_, index) => `${index}`.padStart(32, "0")).join("\n");

    const response = await POST(
      new Request("http://localhost/api/d/dept-1/settings/notion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ page_id: lines }),
      }),
      { params: Promise.resolve({ dept: "dept-1" }) },
    );

    expect(response.status).toBe(400);
    expect(database.sources).toHaveLength(0);
  });

  it("부서장의 전환 요청은 SQL RPC에 맡기고 별도 job을 중복 enqueue하지 않는다", async () => {
    mocks.requireMembership.mockResolvedValue({ deptId: "dept-1", role: "lead" });
    const database = sourceClient([{
      id: "source-legacy",
      dept_id: "dept-1",
      kind: "notion_page",
      external_id: "legacy-page",
      active: true,
      import_version: 1,
      ingest_mode: "classify",
    }]);
    mocks.createServerSupabaseClient.mockResolvedValue(database.client);

    const response = await POST(
      new Request("http://localhost/api/d/dept-1/settings/notion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source_id: "source-legacy", convert_v2: true }),
      }),
      { params: Promise.resolve({ dept: "dept-1" }) },
    );

    expect(response.status).toBe(202);
    expect(database.rpc).toHaveBeenCalledWith("convert_notion_source_v2", { p_source: "source-legacy" });
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.kickWorker).toHaveBeenCalledOnce();
  });
});
