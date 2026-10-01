import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
import { readAnswerView } from "@/lib/answer-view";

const ctx = {
  client: { from: mocks.from },
  userId: "user-1",
  deptId: "dept-1",
  role: "member" as const,
  consentedAt: "2026-10-02T00:00:00.000Z",
};
const answer = { id: "answer-1", asked_by: "user-1", answer: "확인한 답변", status: "done", refused: false, error_code: null };

function query(data: unknown, error: unknown = null) {
  const result = { data, error };
  const q = { select: () => q, eq: () => q, in: () => q, order: () => q, maybeSingle: async () => result, then: (fn: (value: unknown) => unknown) => Promise.resolve(result).then(fn) };
  return q;
}

describe("readAnswerView", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("pending 답변은 근거 없이 그대로 반환한다", async () => {
    mocks.from.mockReturnValue(query({ ...answer, status: "pending", answer: null }));

    await expect(readAnswerView(ctx as never, "answer-1")).resolves.toEqual({
      ok: true, status: 200,
      body: { id: "answer-1", status: "pending", answer: null, refused: false, citations: [] },
    });
  });

  it("현재 RLS에서 사라진 인용이 있으면 done 본문 전체를 refused로 숨긴다", async () => {
    mocks.from.mockImplementation((table: string) => query(
      table === "answers" ? answer
        : table === "citations" ? [{ item_id: "i1", decision_id: null, quote: "공개 사실" }, { item_id: "secret", decision_id: null, quote: "기밀 사실" }]
          : [{ id: "i1", source_id: "source-1", content: "공개 사실", deleted_at: null, author: "팀원", spoken_at: null, external_ref: "ref", sources: { kind: "document", external_id: "doc", title: "원칙" } }],
    ));

    const result = await readAnswerView(ctx as never, "answer-1");
    expect(result).toMatchObject({ ok: true, status: 200, body: { status: "refused", refused: true, citations: [] } });
    expect(JSON.stringify(result)).not.toContain("기밀 사실");
  });

  it("답변이 없으면 404로 반환한다", async () => {
    mocks.from.mockReturnValue(query(null));

    await expect(readAnswerView(ctx as never, "answer-1")).resolves.toMatchObject({
      ok: false, status: 404, code: "answer_not_found",
    });
  });
});
