import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ from: vi.fn(), reviews: [] as unknown[] }));
vi.mock("@/lib/supabase/membership", () => ({ requireMembership: async () => ({ deptId: "dept-1", userId: "lead-1", role: "lead" }) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ from: mocks.from }) }));
import { GET } from "@/app/api/d/[dept]/ledger/route";

const decision = { id: "decision-1", request_id: null, decided_by: "lead-1", decided_by_name: "팀장", decided_at: "2026-09-29T00:00:00Z", outcome: "진행", rationale: "이유", supersedes_id: null, lead_time_min: null };
const item = { id: "item-1", source_id: "source-1", author: "참여자", spoken_at: null, external_ref: "review-section-0", content: "마스킹된 발언",
  sources: { kind: "document", external_id: "review:review-1:1:source-1", title: "녹음 회의" } };
const review = { id: "review-1", published_source_id: "source-1", kind: "audio", revision: 1, published_revision: 1, original_uploaded: true,
  original_deleted_at: null, deleted_at: null, sections: [{ text: "마스킹된 발언", start_seconds: 91, confidence: "low", boundary_review: true }] };

function query(data: unknown) {
  const result = { data, error: null };
  const q = { select: () => q, eq: () => q, in: () => q, is: () => q, order: () => q, limit: () => q,
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
  return q;
}

async function read() {
  const response = await GET(new NextRequest("http://localhost/api/d/dept-1/ledger"), { params: Promise.resolve({ dept: "dept-1" }) });
  expect(response.status).toBe(200);
  return response.json();
}

describe("결정 원장의 녹음 인용 위치", () => {
  beforeEach(() => {
    mocks.reviews = [review];
    let itemReads = 0;
    mocks.from.mockImplementation((table: string) => {
      if (table === "decisions") return query([decision]);
      if (table === "members") return query([]);
      if (table === "items") return query(++itemReads === 1 ? [] : [item]);
      if (table === "citations") return query([{ owner_kind: "decision", owner_id: "decision-1", item_id: "item-1", decision_id: null, quote: "마스킹된" }]);
      if (table === "reviewed_materials") return query(mocks.reviews);
      return query([]);
    });
  });
  it("보이는 발행 녹음의 구간 링크와 확인 배지를 반환한다", async () => {
    const body = await read();
    expect(body.decisions[0].citations[0]).toMatchObject({ href: "/d/dept-1/reviews/review-1?section=0", low_confidence: true, boundary_review: true });
  });
  it("검토 자료가 RLS로 숨겨지면 기존 원문 링크를 유지한다", async () => {
    mocks.reviews = [];
    const body = await read();
    expect(body.decisions[0].citations[0].href).toBe("/d/dept-1?item=item-1#item-item-1");
  });
});
