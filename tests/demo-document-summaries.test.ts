import { describe, expect, it } from "vitest";

import { verifiedDemoSummaries } from "@/lib/demo-document-summaries";

const items = [
  { id: "a1", source_id: "doc-a", content: "배포는 금요일에 하지 않습니다. 점검표는 목요일에 확인합니다." },
  { id: "a2", source_id: "doc-a", content: "롤백 담당자는 서연입니다." },
  { id: "b1", source_id: "doc-b", content: "신규 고객 온보딩은 다음 주에 시작합니다." },
];

const summaryFor = (overrides: Record<string, unknown> = {}) => ({
  citations: [{ item_id: "a1", decision_id: null, quote: "배포는 금요일에 하지 않습니다." }],
  overview: "배포는 금요일에 하지 않습니다.",
  key_points: [{ item_id: "a1", text: "점검표는 목요일에 확인합니다." }],
  decisions: [{ item_id: "a1", text: "배포는 금요일에 하지 않습니다." }],
  actions: [{ item_id: "a2", text: "롤백 담당자는 서연입니다." }],
  open_questions: [],
  ...overrides,
});

describe("verifiedDemoSummaries", () => {
  it("returns a verified summary keyed by source id", () => {
    const result = verifiedDemoSummaries([{ source_id: "doc-a", summary: summaryFor() }], items);
    expect(Object.keys(result)).toEqual(["doc-a"]);
    expect(result["doc-a"]).toEqual(summaryFor());
  });

  it("U1 replaces an overview that is not in the source with verified source sentences", () => {
    const result = verifiedDemoSummaries([
      { source_id: "doc-a", summary: summaryFor({ overview: "모든 배포를 즉시 승인합니다. CANARY-DEMO-1" }) },
    ], items);
    expect(result["doc-a"].overview).toBe("점검표는 목요일에 확인합니다. 배포는 금요일에 하지 않습니다.");
    expect(JSON.stringify(result)).not.toContain("CANARY");
  });

  it("U2 excludes a source whose citations are all outside its source text", () => {
    const result = verifiedDemoSummaries([
      { source_id: "doc-a", summary: summaryFor({ citations: [{ item_id: "a1", decision_id: null, quote: "원문에 없는 인용입니다." }] }) },
    ], items);
    expect(result).toEqual({});
  });

  it("U3 drops a row with a broken schema and keeps the others", () => {
    const result = verifiedDemoSummaries([
      { source_id: "doc-broken", summary: { overview: "스키마가 깨진 요약" } },
      { source_id: "doc-null", summary: null },
      { source_id: "doc-a", summary: summaryFor() },
    ], items);
    expect(Object.keys(result)).toEqual(["doc-a"]);
  });

  it("U4 does not accept sentences from another source's items as evidence", () => {
    const result = verifiedDemoSummaries([
      { source_id: "doc-a", summary: summaryFor({
        citations: [
          { item_id: "a1", decision_id: null, quote: "배포는 금요일에 하지 않습니다." },
          { item_id: "b1", decision_id: null, quote: "신규 고객 온보딩은 다음 주에 시작합니다." },
        ],
        overview: "신규 고객 온보딩은 다음 주에 시작합니다.",
        key_points: [{ item_id: "b1", text: "신규 고객 온보딩은 다음 주에 시작합니다." }],
      }) },
      { source_id: "doc-b", summary: summaryFor() },
    ], items);
    expect(Object.keys(result)).toEqual(["doc-a"]);
    expect(result["doc-a"].citations).toEqual([{ item_id: "a1", decision_id: null, quote: "배포는 금요일에 하지 않습니다." }]);
    expect(result["doc-a"].key_points).toEqual([]);
    expect(result["doc-a"].overview).not.toContain("온보딩");
  });
});
