import { describe, expect, it, vi } from "vitest";

import { decideCard } from "@/lib/card-decide";

const card = { id: "card-1", dept_id: "dept-1", assignee_id: "lead-1", status: "open" };
const ctx = { client: { from: vi.fn(), rpc: vi.fn() }, userId: "lead-1", deptId: "dept-1", role: "lead" as const, consentedAt: "2026-10-02" };

function query(data: unknown, error: unknown = null) {
  const result = { data, error };
  const q = { select: () => q, eq: () => q, maybeSingle: async () => result };
  return q;
}

describe("decideCard", () => {
  it("결정 RPC만 호출하고 결정 응답을 반환한다", async () => {
    const from = vi.fn((table: string) => query(table === "decision_requests" ? card : null));
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, duplicate: false, status: "decided", decision_id: "decision-1", decided_by_name: "팀장", decided_at: null }, error: null });

    await expect(decideCard({ ...ctx, client: { from, rpc } } as never, "card-1", {
      status: "decided", outcome: "승인", rationale: "근거를 확인했습니다.",
    })).resolves.toMatchObject({ ok: true, status: 200, body: { decision_id: "decision-1" } });
    expect(rpc).toHaveBeenCalledWith("decide_request", { p_request: "card-1", p_action: "decide", p_outcome: "승인", p_rationale: "근거를 확인했습니다." });
  });

  it("다른 부서 카드는 404로 숨긴다", async () => {
    const from = vi.fn(() => query({ ...card, dept_id: "other-dept" }));
    await expect(decideCard({ ...ctx, client: { from, rpc: vi.fn() } } as never, "card-1", { status: "deferred" })).resolves.toMatchObject({
      ok: false, status: 404, code: "card_not_found",
    });
  });
});
