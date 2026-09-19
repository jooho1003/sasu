import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ membership: vi.fn(), rows: [] as unknown[] }));
vi.mock("@/lib/supabase/membership", () => ({ requireMembership: mocks.membership }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    from: () => {
      const result = { data: mocks.rows, error: null };
      const query = {
        select: () => query, eq: () => query, order: () => query,
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/jobs", () => ({ kickWorker: vi.fn() }));

import { GET } from "@/app/api/d/[dept]/documents/route";

const deptId = "22222222-2222-4222-8222-222222222222";
const params = { params: Promise.resolve({ dept: deptId }) };
const row = (source_id: string, summary: unknown) => ({
  source_id, status: "summarized", summary, status_reason: null, extracted_chars: 10, chunk_count: 1,
  created_at: "2026-09-17T00:00:00Z", updated_at: "2026-09-17T00:00:00Z", sources: { title: "문서", visibility: "dept" },
});
const complete = {
  citations: [{ item_id: "item", decision_id: null, quote: "원문" }], overview: "요약",
  key_points: [{ item_id: "item", text: "원문" }], decisions: [], actions: [], open_questions: [],
};

beforeEach(() => {
  mocks.membership.mockResolvedValue({ userId: "lead", deptId, role: "lead", displayName: "팀장" });
});

describe("문서 목록 읽기", () => {
  it("계약과 다른 저장 요약은 null로 내려 화면이 없는 배열을 읽지 않게 한다", async () => {
    mocks.rows = [row("partial", { overview: "overview만 있는 저장값" }), row("complete", complete), row("empty", null)];

    const response = await GET(new Request("http://localhost/documents"), params);
    const body = await response.json() as { documents: Array<{ id: string; summary: unknown }> };

    expect(response.status).toBe(200);
    expect(body.documents.map((document) => [document.id, document.summary])).toEqual([
      ["partial", null], ["complete", complete], ["empty", null],
    ]);
  });
});
