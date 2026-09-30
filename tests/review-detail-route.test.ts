import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ membership: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/supabase/membership", () => ({ requireMembership: mocks.membership }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.create }));
vi.mock("@/lib/jobs", () => ({ kickWorker: vi.fn() }));

import { GET } from "@/app/api/d/[dept]/reviews/[id]/route";

const dept = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333";

type QueryResult = { data: unknown; error: unknown };

function queryStub(result: QueryResult) {
  const stub: Record<string, unknown> = {
    select: () => stub,
    eq: () => stub,
    order: () => stub,
    limit: () => stub,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return stub;
}

const reviewRow = {
  id, dept_id: dept, kind: "audio", title: "회의", status: "processing",
  confirmed_at: null,
};

function buildClient(overrides: Partial<Record<"review" | "parts" | "history" | "retention" | "segments", QueryResult>> = {}, settings: QueryResult = { data: { allow_original_download: false }, error: null }) {
  const tables: Record<string, QueryResult> = {
    reviewed_materials: overrides.review ?? { data: reviewRow, error: null },
    review_parts: overrides.parts ?? { data: [], error: null },
    review_revisions: overrides.history ?? { data: [], error: null },
    retention_settings: overrides.retention ?? { data: null, error: null },
    review_original_segments: overrides.segments ?? { data: [], error: null },
  };
  return {
    from: vi.fn((table: string) => queryStub(tables[table] ?? { data: null, error: null })),
    rpc: vi.fn().mockResolvedValue(settings),
  };
}

const request = () => new Request(`https://sasu.example/api/d/department-slug/reviews/${id}`);
const ctx = { params: Promise.resolve({ dept: "department-slug", id }) };

describe("GET /reviews/[id] 구간 응답", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.membership.mockResolvedValue({ userId: "user", deptId: dept, role: "lead", consentedAt: "2026-09-25" });
  });

  it("review_original_segments를 index·attempt·path·status·error_code·updated_at으로 매핑한다", async () => {
    mocks.create.mockResolvedValue(buildClient({
      segments: {
        data: [
          { segment_index: 0, attempt: 1, status: "verified", error_code: null, object_path: "dept/review/original-segments/0-1.wav", updated_at: "2026-09-25T00:00:00Z" },
          { segment_index: 1, attempt: 2, status: "failed", error_code: "segment_invalid", object_path: "dept/review/original-segments/1-2.wav", updated_at: "2026-09-25T00:01:00Z" },
        ],
        error: null,
      },
    }));
    const result = await GET(request(), ctx);
    expect(result.status).toBe(200);
    const payload = await result.json();
    expect(payload.segments).toEqual([
      { index: 0, attempt: 1, path: "dept/review/original-segments/0-1.wav", status: "verified", error_code: null, updated_at: "2026-09-25T00:00:00Z" },
      { index: 1, attempt: 2, path: "dept/review/original-segments/1-2.wav", status: "failed", error_code: "segment_invalid", updated_at: "2026-09-25T00:01:00Z" },
    ]);
  });

  it("구간이 없으면 빈 배열을 반환한다(single_file)", async () => {
    mocks.create.mockResolvedValue(buildClient());
    const result = await GET(request(), ctx);
    const payload = await result.json();
    expect(payload.segments).toEqual([]);
  });

  it("구간 조회 실패는 500이며 DB 오류 문구를 노출하지 않는다", async () => {
    mocks.create.mockResolvedValue(buildClient({ segments: { data: null, error: { message: "sensitive db text" } } }));
    const result = await GET(request(), ctx);
    expect(result.status).toBe(500);
    expect(await result.text()).not.toContain("sensitive db text");
  });

  it("다른 필드(parts·history)는 그대로 유지된다", async () => {
    mocks.create.mockResolvedValue(buildClient({
      parts: { data: [{ id: "part-1", part_index: 0, start_seconds: 0, end_seconds: 60, status: "done", error_code: null, attempt: 1, updated_at: "2026-09-25T00:00:00Z", lease_until: null }], error: null },
    }));
    const result = await GET(request(), ctx);
    const payload = await result.json();
    expect(payload.parts).toHaveLength(1);
    expect(payload.review).toMatchObject({ id, dept_id: dept });
  });
});
