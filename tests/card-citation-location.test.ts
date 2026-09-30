import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactNode } from "react";

const mocks = vi.hoisted(() => ({ from: vi.fn(), reviews: [] as unknown[] }));
vi.mock("@/lib/supabase/membership", () => ({ requireMembership: async () => ({ deptId: "dept-1", userId: "lead-1", role: "lead" }) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ from: mocks.from }) }));
import CardDetailPage from "@/app/(auth)/d/[dept]/cards/[id]/page";

const card = { id: "card-1", title: "회의 결정", background: "근거", recommendation: "진행", deadline: null, assignee_id: "lead-1", status: "open", visibility: "dept" };
const item = { id: "item-1", source_id: "source-1", content: "마스킹된 발언", deleted_at: null, author: "참여자", spoken_at: null,
  external_ref: "review-section-0", sources: { kind: "document", external_id: "review:review-1:1:source-1", title: "회의 기록" } };
const review = { id: "review-1", published_source_id: "source-1", kind: "audio", revision: 1, published_revision: 1, original_uploaded: true,
  original_deleted_at: null, deleted_at: null, sections: [{ text: "마스킹된 발언", start_seconds: 33, confidence: "low", boundary_review: false }] };

function query(data: unknown) {
  const result = { data, error: null };
  const q = { select: () => q, eq: () => q, in: () => q, is: () => q,
    maybeSingle: async () => result, then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
  return q;
}

function hrefs(node: ReactNode): string[] {
  if (Array.isArray(node)) return node.flatMap(hrefs);
  if (!isValidElement(node)) return [];
  const props = node.props as { href?: string; children?: ReactNode };
  return [...(props.href ? [props.href] : []), ...hrefs(props.children)];
}

describe("결정 카드의 녹음 인용 위치", () => {
  beforeEach(() => {
    mocks.reviews = [review];
    mocks.from.mockImplementation((table: string) => query(table === "decision_requests" ? card : table === "citations" ? [{ item_id: "item-1", decision_id: null, quote: "마스킹된" }] : table === "items" ? [item] : table === "reviewed_materials" ? mocks.reviews : []));
  });
  it("RLS로 보이는 녹음 인용은 검토 구간으로 이동한다", async () => {
    const tree = await CardDetailPage({ params: Promise.resolve({ dept: "dept-1", id: "card-1" }) });
    expect(hrefs(tree)).toContain("/d/dept-1/reviews/review-1?section=0");
  });
  it("RLS로 검토 자료가 숨겨지면 현재 원문 위치를 유지한다", async () => {
    mocks.reviews = [];
    const tree = await CardDetailPage({ params: Promise.resolve({ dept: "dept-1", id: "card-1" }) });
    expect(hrefs(tree)).toContain("/d/dept-1?item=item-1#item-item-1");
  });
});
