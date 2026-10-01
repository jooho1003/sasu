import { describe, expect, it } from "vitest";
import { buildSalesReviewConditionChecklist } from "@/lib/sales-review-condition-checklist";

const dept = "22222222-2222-4222-8222-222222222222";
const ids = ["11111111-1111-4111-8111-111111111111", "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555"];
const selection = { request_item_id: ids[0], old_quote_item_id: ids[1], new_quote_item_id: ids[2], policy_item_id: ids[3] };
function rows(contents = ["가격과 시작일을 확인해 주세요.", "계약은 갱신되지 않습니다.", "할인은 승인된 것이 아닙니다. 예외는 팀장에게 확인합니다.", "할인 승인 전 결재가 필요합니다."]) {
  return contents.map((content, i) => ({ id: ids[i], dept_id: dept, content, deleted_at: null,
    sources: { dept_id: dept, title: `원문 ${i}`, kind: "document", active: true, is_principles: i === 3 } }));
}

describe("current source condition checklist", () => {
  it("groups all four roles by topic and preserves negatives and exceptions with exact citations", () => {
    const input = rows();
    const result = buildSalesReviewConditionChecklist(selection, input, dept);
    expect(result.topics.map(t => t.id)).toEqual(["price", "schedule", "contract", "approval"]);
    const price = result.topics[0];
    expect(price.evidence.map(e => e.role)).toEqual(["request", "new_quote", "policy"]);
    expect(price.matches).toEqual({ request: 1, old_quote: 0, new_quote: 1, policy: 1 });
    expect(price.question).toContain("가격");
    expect(price.evidence[1].quote).toBe(input[2].content);
    expect(result.topics[2].evidence[0].quote).toBe("계약은 갱신되지 않습니다.");
    for (const topic of result.topics) for (const citation of topic.evidence) {
      expect(input.find(row => row.id === citation.source_id)?.content.includes(citation.quote)).toBe(true);
      expect(citation.href).toBe(`/d/${dept}/evidence/${citation.source_id}`);
    }
  });

  it("does not invent questions or missing-condition claims for unmatched topics", () => {
    const result = buildSalesReviewConditionChecklist(selection, rows(["안녕하세요", "안내 문서", "두 번째 문서", "팀 기준"]), dept);
    for (const topic of result.topics) {
      expect(topic.question).toBeNull();
      expect(topic.evidence).toEqual([]);
      expect(topic.matches).toEqual({ request: 0, old_quote: 0, new_quote: 0, policy: 0 });
      expect(topic.truncated).toBe(false);
    }
  });

  it("matches English words case-insensitively without substring false positives", () => {
    const result = buildSalesReviewConditionChecklist(selection, rows(["VAT / PRICE / discount", "contractual priced reapproval", "DELIVERY deadline", "CONTRACT renewal / APPROVAL"]), dept);
    expect(result.topics[0].matches.request).toBe(1);
    expect(result.topics.every(t => t.matches.old_quote === 0)).toBe(true);
    expect(result.topics[1].matches.new_quote).toBe(1);
    expect(result.topics[2].matches.policy).toBe(1);
    expect(result.topics[3].matches.policy).toBe(1);
  });

  it("counts repeated lines and shows three matches per role with explicit totals", () => {
    const result = buildSalesReviewConditionChecklist(selection, rows([" 가격 확인 \r\n가격 확인\r가격 확인\n가격 확인", "가격 유지", "가격 수정", "가격 원칙"]), dept);
    const price = result.topics[0];
    expect(price.matches.request).toBe(4);
    expect(price.evidence.filter(e => e.role === "request").map(e => e.quote)).toEqual(["가격 확인", "가격 확인", "가격 확인"]);
    expect(price.truncated).toBe(true);
    expect(price.evidence).toHaveLength(6);
  });

  it("scans beyond the short source preview and never cuts long lines to remove a qualifier", () => {
    const text = "일반 안내\n" + "가".repeat(400) + " 할인 승인 아님";
    const result = buildSalesReviewConditionChecklist(selection, rows([text, "기존", "변경", "원칙"]), dept);
    expect(result.topics[0].evidence[0].quote).toBe(text.split("\n")[1]);
    expect(result.topics[3].evidence[0].quote).toContain("승인 아님");
  });

  it("rejects the whole request for any oversized document, line count or Unicode line", () => {
    for (let role = 0; role < 4; role++) {
      for (const bad of ["가".repeat(100_001), Array(2_001).fill("안내").join("\n"), "😀".repeat(2_001)]) {
        const input = rows(); input[role].content = bad;
        expect(() => buildSalesReviewConditionChecklist(selection, input, dept)).toThrow("sales_review_checklist_too_large");
      }
    }
    const input = rows(["가격 " + "😀".repeat(1_997), Array(2_000).fill("안내").join("\n"), "변경", "원칙"]);
    expect(buildSalesReviewConditionChecklist(selection, input, dept).topics[0].evidence[0].quote).toBe(input[0].content);
    const atLengthLimit = rows([Array(50).fill("가".repeat(1_999)).join("\n") + "\n", "기존", "변경", "원칙"]);
    expect(atLengthLimit[0].content).toHaveLength(100_000);
    expect(() => buildSalesReviewConditionChecklist(selection, atLengthLimit, dept)).not.toThrow();
  });

  it("rejects current unavailable, inactive, wrong-policy and duplicate sources", () => {
    const input = rows();
    input[2].deleted_at = "now" as never;
    expect(() => buildSalesReviewConditionChecklist(selection, input, dept)).toThrow("sales_review_source_unavailable");
    const inactive = rows(); inactive[0].sources.active = false;
    expect(() => buildSalesReviewConditionChecklist(selection, inactive, dept)).toThrow("sales_review_source_unavailable");
    const policy = rows(); policy[3].sources.is_principles = false;
    expect(() => buildSalesReviewConditionChecklist(selection, policy, dept)).toThrow("sales_review_source_unavailable");
    expect(() => buildSalesReviewConditionChecklist({ ...selection, policy_item_id: ids[0] }, rows(), dept)).toThrow("sales_review_source_duplicate");
  });
});
