import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { groundedOverview, verifyDocumentSummary } from "@/lib/document-summary-check";
import * as pipeline from "@/lib/pipeline/document-summary";

const base = { key_points: [], decisions: [], actions: [], open_questions: [] };

describe("document summary check module", () => {
  it("keeps citations and items found in their own item and drops the rest", () => {
    const result = verifyDocumentSummary({
      ...base,
      citations: [
        { item_id: "a", decision_id: null, quote: "배포는 금요일에 하지 않습니다." },
        { item_id: "a", decision_id: null, quote: "원문에 없는 인용" },
        { item_id: null, decision_id: "d", quote: "결정 인용" },
      ],
      overview: "배포는 금요일에 하지 않습니다.",
      decisions: [
        { item_id: "a", text: "배포는 금요일에 하지 않습니다." },
        { item_id: "b", text: "배포는 금요일에 하지 않습니다." },
      ],
    }, new Map([["a", "배포는 금요일에 하지 않습니다. 점검표는 목요일에 확인합니다."]]));

    expect(result.valid.citations).toEqual([{ item_id: "a", decision_id: null, quote: "배포는 금요일에 하지 않습니다." }]);
    expect(result.valid.decisions).toEqual([{ item_id: "a", text: "배포는 금요일에 하지 않습니다." }]);
    expect(result.valid.overview).toBe("배포는 금요일에 하지 않습니다.");
    expect(result.dropped).toBe(3);
  });

  it("grounds the overview sentence by sentence and falls back to verified items", () => {
    expect(groundedOverview("점검표는 목요일에 확인합니다.", ["점검표는 목요일에 확인합니다."], [])).toEqual({
      text: "점검표는 목요일에 확인합니다.",
      replaced: false,
    });
    expect(groundedOverview("문서에 없는 문장입니다.", ["점검표는 목요일에 확인합니다."], [
      { text: "첫 항목입니다." }, { text: "둘째 항목입니다." }, { text: "셋째 항목입니다." },
    ])).toEqual({ text: "첫 항목입니다. 둘째 항목입니다.", replaced: true });
    expect(groundedOverview("문서에 없는 문장입니다.", ["원문"], [])).toEqual({
      text: "요약할 내용을 찾지 못했습니다.",
      replaced: true,
    });
  });

  it("is the same implementation the pipeline re-exports", () => {
    expect(pipeline.verifyDocumentSummary).toBe(verifyDocumentSummary);
    expect(pipeline.groundedOverview).toBe(groundedOverview);
  });

  it("depends on contract types only (no LLM, job or database imports)", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/document-summary-check.ts"), "utf8");
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(match => match[1]);
    expect(imports).toEqual(["@/lib/contracts"]);
  });
});
