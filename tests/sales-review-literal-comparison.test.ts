import { describe, expect, it } from "vitest";

import { buildSalesReviewLiteralComparison } from "@/lib/sales-review-literal-comparison";

const dept = "22222222-2222-4222-8222-222222222222";
const ids = [
  "11111111-1111-4111-8111-111111111111",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
] as const;
const selection = { request_item_id: ids[0], old_quote_item_id: ids[1], new_quote_item_id: ids[2], policy_item_id: ids[3] };
function rows(oldContent: string, newContent: string) {
  return ["고객 요청 원문", oldContent, newContent, "승인은 팀장이 확인한다."].map((content, i) => ({
    id: ids[i], dept_id: dept, content, deleted_at: null,
    sources: { dept_id: dept, title: `자료 ${i}`, kind: "document", active: true, is_principles: i === 3 },
  }));
}

describe("literal comparison of current sales source rows", () => {
  it("reports added and removed verbatim lines, including repeated occurrences", () => {
    const input = rows("공통 조건\n반복 조건\n반복 조건\n삭제 조건", "공통 조건\n반복 조건\n추가 조건");
    const result = buildSalesReviewLiteralComparison(selection, input, dept);
    expect(result.difference.old_only.map((entry) => entry.quote)).toEqual(["반복 조건", "삭제 조건"]);
    expect(result.difference.new_only.map((entry) => entry.quote)).toEqual(["추가 조건"]);
    expect(result.difference.old_only_total).toBe(2);
    expect(result.difference.new_only_total).toBe(1);
    for (const entry of [...result.difference.old_only, ...result.difference.new_only]) {
      const original = input.find((row) => row.id === entry.source_id);
      expect(original?.content.includes(entry.quote)).toBe(true);
      expect(entry.href).toBe(`/d/${dept}/evidence/${entry.source_id}`);
    }
    expect(result.sources.policy.quote).toBe("승인은 팀장이 확인한다.");
  });

  it("does not claim a change for identical text", () => {
    const result = buildSalesReviewLiteralComparison(selection, rows("같은 조건\n두 번째", "같은 조건\n두 번째"), dept);
    expect(result.difference).toEqual({ old_only: [], new_only: [], old_only_total: 0, new_only_total: 0, truncated: false });
  });

  it("keeps long-line pieces exact and separates shown rows from total rows", () => {
    const oldText = "가".repeat(320) + "나".repeat(320);
    const input = rows(oldText, Array.from({ length: 11 }, (_, index) => `새 문구 ${index}`).join("\n"));
    const result = buildSalesReviewLiteralComparison(selection, input, dept);
    expect(result.difference.old_only.map((entry) => entry.quote)).toEqual(["가".repeat(320), "나".repeat(320)]);
    expect(result.difference.new_only).toHaveLength(8);
    expect(result.difference.new_only_total).toBe(11);
    expect(result.difference.truncated).toBe(true);
  });

  it("rejects oversized text, too many pieces and no-longer-available sources", () => {
    expect(() => buildSalesReviewLiteralComparison(selection, rows("가".repeat(100_001), "새 조건"), dept)).toThrow("sales_review_comparison_too_large");
    expect(() => buildSalesReviewLiteralComparison(selection, rows(Array.from({ length: 2_001 }, () => "동일").join("\n"), "새 조건"), dept)).toThrow("sales_review_comparison_too_large");
    expect(() => buildSalesReviewLiteralComparison(selection, rows("기존", "변경").slice(0, 3), dept)).toThrow("sales_review_source_unavailable");
  });
});
