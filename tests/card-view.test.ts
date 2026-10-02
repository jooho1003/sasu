import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

import { loadCardView } from "@/lib/card-view";

const ctx = {
  client: { from: mocks.from },
  userId: "lead-1",
  deptId: "dept-1",
  role: "lead" as const,
  consentedAt: "2026-10-02T00:00:00.000Z",
};

function query(data: unknown, error: unknown = null) {
  const result = { data, error };
  const q = {
    select: () => q, eq: () => q, in: () => q, is: () => q,
    maybeSingle: async () => result,
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return q;
}

describe("loadCardView", () => {
  it("원문에 없는 인용은 카드 보기에서 빼고, 남은 근거만 반환한다", async () => {
    mocks.from.mockImplementation((table: string) => query(
      table === "decision_requests"
        ? { id: "card-1", dept_id: "dept-1", title: "결정", background: "배경", recommendation: null, deadline: null, assignee_id: null, status: "open", visibility: "dept" }
        : table === "citations"
          ? [{ item_id: "item-1", decision_id: null, quote: "맞는 근거" }, { item_id: "item-1", decision_id: null, quote: "없는 근거" }]
          : table === "items"
            ? [{ id: "item-1", source_id: "source-1", content: "맞는 근거가 있습니다", deleted_at: null, author: "팀원", spoken_at: null, external_ref: null, sources: { kind: "document", external_id: "doc-1", title: "문서" } }]
            : [],
    ));

    const result = await loadCardView(ctx as never, "card-1");

    expect(result).toMatchObject({ ok: true, status: 200 });
    if (!result.ok) throw new Error("expected card view");
    expect(result.body.citations).toHaveLength(1);
    expect(result.body.citations[0]?.quote).toBe("맞는 근거");
    expect(JSON.stringify(result.body)).not.toContain("없는 근거");
  });

  it("다른 부서 카드는 찾을 수 없다고 반환한다", async () => {
    mocks.from.mockReturnValue(query(null));
    await expect(loadCardView(ctx as never, "card-1")).resolves.toMatchObject({
      ok: false, status: 404, code: "card_not_found",
    });
  });
});
