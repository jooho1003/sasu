import { describe, expect, it } from "vitest";

import {
  SALES_CASE_SOURCES,
  buildSalesReview,
  safeSalesReviewResult,
} from "@/lib/sales-review";

describe("synthetic sales review", () => {
  it("builds four grounded result sections and computes the quote delta", () => {
    const result = buildSalesReview("all", { priority: "price", reply_style: "brief" });
    expect(result.comparison.length).toBeGreaterThan(0);
    expect(result.policy_flags.length).toBeGreaterThan(0);
    expect(result.questions.length).toBeGreaterThan(0);
    expect(result.reply_draft.length).toBeGreaterThan(0);
    expect(result.total_delta_krw).toBe(6_000_000);
    expect(result.case_version).toBe(1);
    expect(safeSalesReviewResult(result)).toEqual(result);
    for (const line of [
      ...result.comparison,
      ...result.policy_flags,
      ...result.questions,
      ...result.reply_draft,
    ]) {
      expect(line.citations.length).toBeGreaterThan(0);
      for (const citation of line.citations) {
        expect(SALES_CASE_SOURCES[citation.source_id].includes(citation.quote)).toBe(true);
      }
    }
  });

  it("keeps model choice within fixed cited text", () => {
    const price = buildSalesReview("price", { priority: "schedule", reply_style: "detailed" });
    const schedule = buildSalesReview("schedule", { priority: "price", reply_style: "brief" });
    expect(price.priority).toBe("price");
    expect(schedule.priority).toBe("schedule");
    expect(price.reply_draft[0].text).not.toBe(schedule.reply_draft[0].text);
    expect(price.reply_draft.every((line) => line.citations.length > 0)).toBe(true);
  });

  it("rejects tampered quotes and uncited facts", () => {
    const result = buildSalesReview("all", { priority: "price", reply_style: "brief" });
    expect(safeSalesReviewResult({
      ...result,
      comparison: [{ ...result.comparison[0], citations: [{ source_id: "S1", quote: "없는 원문" }] }],
    })).toBeNull();
    expect(safeSalesReviewResult({
      ...result,
      reply_draft: [{ text: "승인됐습니다.", citations: [] }],
    })).toBeNull();
  });
});
