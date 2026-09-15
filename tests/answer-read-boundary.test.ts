import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/membership", () => ({ requireMembership: async () => ({ deptId: "dept-1", userId: "user-1" }) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => mocks }));
import { GET } from "@/app/api/d/[dept]/answers/[id]/route";
const answer = { id: "answer-1", asked_by: "user-1", answer: "공개 사실과 기밀 사실을 결합한 답변", status: "done", refused: false, verified: true };
function query(data: unknown) {
  const result = { data, error: null };
  const q = { select: () => q, eq: () => q, in: () => q, maybeSingle: async () => result, then: (fn: (v: unknown) => unknown) => Promise.resolve(result).then(fn) };
  return q;
}
const read = async () => (await GET(new Request("http://localhost"), { params: Promise.resolve({ dept: "dept-1", id: "answer-1" }) })).json();
describe("저장 답변 재열람 경계", () => {
  beforeEach(() => {
    mocks.from.mockImplementation((table: string) => query(table === "answers" ? answer : table === "citations" ? [{ item_id: "i1", quote: "공개 사실", decision_id: null }, { item_id: "secret", quote: "기밀 사실", decision_id: null }] : [{ id: "i1", content: "공개 사실", deleted_at: null, author: "팀원", sources: { kind: "document", title: "원칙", external_id: "doc", active: true } }]));
  });
  it("인용 중 하나라도 RLS에서 사라지면 본문 전체를 숨긴다", async () => {
    const body = await read();
    expect(body.refused).toBe(true);
    expect(JSON.stringify(body)).not.toContain("기밀 사실");
    expect(body.citations).toEqual([]);
  });
  it("인용 없는 done 본문도 숨긴다", async () => {
    mocks.from.mockImplementation((table: string) => query(table === "answers" ? answer : []));
    expect((await read()).refused).toBe(true);
  });
  it("원문 문자열이 바뀌면 예전 본문을 반환하지 않는다", async () => {
    mocks.from.mockImplementation((table: string) => query(table === "answers" ? answer : table === "citations" ? [{ item_id: "i1", quote: "옛 원문", decision_id: null }] : [{ id: "i1", content: "새 원문", deleted_at: null, sources: { kind: "document", external_id: "doc", active: true } }]));
    expect((await read()).refused).toBe(true);
  });
});
