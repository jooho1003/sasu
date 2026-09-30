import { describe, expect, it } from "vitest";

import { buildSalesReviewSourcePreview, salesReviewSourceCandidates } from "@/lib/sales-review-sources";

const dept = "22222222-2222-4222-8222-222222222222";
const ids = [
  "11111111-1111-4111-8111-111111111111",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
] as const;
const selection = {
  request_item_id: ids[0], old_quote_item_id: ids[1],
  new_quote_item_id: ids[2], policy_item_id: ids[3],
};
const rows = ids.map((id, index) => ({
  id, dept_id: dept, content: `${"원문 ".repeat(100)}${index}`,
  deleted_at: null,
  sources: { dept_id: dept, title: `자료 ${index}`, kind: "document", active: true, is_principles: index === 3 },
}));

describe("real sales review source connection", () => {
  it("returns only direct excerpts and links from four current rows", () => {
    const preview = buildSalesReviewSourcePreview(selection, rows, dept);
    expect(Object.keys(preview.sources)).toEqual(["request", "old_quote", "new_quote", "policy"]);
    expect(preview.sources.policy.item_id).toBe(ids[3]);
    for (const source of Object.values(preview.sources)) {
      const original = rows.find((row) => row.id === source.item_id);
      expect(original?.content.includes(source.quote)).toBe(true);
      expect(source.quote.length).toBeLessThanOrEqual(320);
      expect(source.href).toBe(`/d/${dept}/evidence/${source.item_id}`);
    }
  });

  it("refuses missing, cross-department, inactive, deleted, or wrong-policy rows", () => {
    expect(() => buildSalesReviewSourcePreview(selection, rows.slice(0, 3), dept)).toThrow();
    expect(() => buildSalesReviewSourcePreview(selection, rows.map((row, i) => i === 1 ? { ...row, dept_id: ids[0] } : row), dept)).toThrow();
    expect(() => buildSalesReviewSourcePreview(selection, rows.map((row, i) => i === 2 ? { ...row, sources: { ...row.sources, active: false } } : row), dept)).toThrow();
    expect(() => buildSalesReviewSourcePreview(selection, rows.map((row, i) => i === 0 ? { ...row, deleted_at: "2026-09-30" } : row), dept)).toThrow();
    expect(() => buildSalesReviewSourcePreview(selection, rows.map((row, i) => i === 3 ? { ...row, sources: { ...row.sources, is_principles: false } } : row), dept)).toThrow();
  });

  it("filters unavailable candidates without retaining a source copy", () => {
    const candidates = salesReviewSourceCandidates([...rows, { ...rows[0], id: "66666666-6666-4666-8666-666666666666", deleted_at: "2026-09-30" }], dept);
    expect(candidates).toHaveLength(4);
    expect(candidates[0]).toEqual({ item_id: ids[0], title: "자료 0", kind: "document", quote: rows[0].content.slice(0, 320), is_principles: false });
    expect(candidates.every((candidate) => !Object.hasOwn(candidate, "content"))).toBe(true);
  });
});
