import { describe, expect, it } from "vitest";
import { answerLead, evidenceParagraphs, isParagraphRange, paragraphSpans, resolveSelections, type EvidenceSource } from "@/lib/answer-grounding";

const text = "  외부 교육비는 연 50만 원까지 지원합니다.\n\n단, 필수 자격증 교육에는 한도를 적용하지 않습니다.\n\n 신청은 2주 전까지 합니다.  ";
const sources: EvidenceSource[] = [{ kind: "item", id: "policy", text }, { kind: "decision", id: "decision", text: "재입찰\n10% 이상 인상이기 때문입니다." }];
const selection = { evidence: 1, first_paragraph: 1, last_paragraph: 2 };
describe("번호 범위로 선택하는 원문 근거", () => {
  it("조건부터 예외까지 빈 줄을 포함한 원문 범위를 만든다", () => {
    expect(resolveSelections([selection], sources)).toEqual({ ok: true, citations: [{ itemId: "policy", quote: "외부 교육비는 연 50만 원까지 지원합니다.\n\n단, 필수 자격증 교육에는 한도를 적용하지 않습니다." }] });
  });
  it.each([text, text.replaceAll("\n", "\r\n"), "\n \n\t", "첫 줄\n둘째 줄\n\n\n  다음 문단\n\t\n끝\n"])("문단 offset과 기존 split/trim이 일치한다", value => {
    const paragraphs = value.split(/\r?\n[\t ]*\r?\n/u).map(p => p.trim()).filter(Boolean);
    expect(evidenceParagraphs(value)).toEqual(paragraphs);
    expect(paragraphSpans(value).map(s => value.slice(s.start, s.end))).toEqual(paragraphs);
  });
  it("한 문단 선택과 결정의 출력 순서를 유지한다", () => {
    expect(resolveSelections([{ evidence: 2, first_paragraph: 1, last_paragraph: 1 }, { ...selection, last_paragraph: 1 }], sources)).toEqual({ ok: true, citations: [
      { decisionId: "decision", quote: sources[1].text }, { itemId: "policy", quote: evidenceParagraphs(text)[0] },
    ] });
  });
  it("CRLF·공백으로 된 구분선도 다시 쓰지 않는다", () => {
    const raw = "  첫 문단\r\n둘째 줄 \r\n\t \r\n  예외 문단  ";
    const result = resolveSelections([selection], [{ kind: "item", id: "crlf", text: raw }]);
    expect(result).toEqual({ ok: true, citations: [{ itemId: "crlf", quote: raw.trim() }] });
    if (result.ok) expect(raw.includes(result.citations[0].quote)).toBe(true);
  });
  it.each([
    { selections: [], code: "empty" },
    { selections: Array(9).fill(selection), code: "too_many" },
    { selections: [{ ...selection, evidence: 3 }], code: "evidence_out_of_range" },
    { selections: [{ ...selection, evidence: 0 }], code: "evidence_out_of_range" },
    { selections: [{ ...selection, evidence: 1.5 }], code: "evidence_out_of_range" },
    { selections: [{ ...selection, last_paragraph: 4 }], code: "paragraph_out_of_range" },
    { selections: [{ ...selection, first_paragraph: 0 }], code: "paragraph_out_of_range" },
    { selections: [{ ...selection, first_paragraph: NaN }], code: "paragraph_out_of_range" },
    { selections: [{ ...selection, first_paragraph: 2, last_paragraph: 1 }], code: "range_reversed" },
    { selections: [selection, selection], code: "duplicate_evidence" },
  ])("$code 실패를 보고한다", ({ selections, code }) => {
    const result = resolveSelections(selections, sources);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failures).toEqual(expect.arrayContaining([expect.objectContaining({ code })]));
  });
  it("다른 선택들의 실패를 번호와 함께 모두 모은다", () => {
    expect(resolveSelections([{ ...selection, evidence: 99 }, { ...selection, first_paragraph: 3, last_paragraph: 1 }], sources)).toEqual({ ok: false, failures: [
      { selection: 1, code: "evidence_out_of_range" }, { selection: 2, code: "range_reversed" },
    ] });
  });
  it("번호가 달라도 동일한 출처를 중복 저장하지 않는다", () => {
    expect(resolveSelections([selection, { ...selection, evidence: 2 }], [sources[0], sources[0]])).toMatchObject({ ok: false, failures: [{ selection: 2, code: "duplicate_evidence" }] });
  });
  it("문단 경계에서 시작하고 끝나는 범위만 검증한다", () => {
    expect(isParagraphRange(text, text.trim())).toBe(true);
    expect(isParagraphRange(text, evidenceParagraphs(text)[1])).toBe(true);
    for (const quote of ["", "50만 원까지 지원합니다.", "한도를 적용하지 않습니다.", "외부 교육비는", "없음", text]) expect(isParagraphRange(text, quote)).toBe(false);
    expect(isParagraphRange("중간 예외\n\n예외", "예외")).toBe(true);
  });
  it("고정 안내 본문에는 원문을 포함하지 않는다", () => {
    expect(answerLead(3)).toBe("관련 부서 기록 3개를 찾았습니다. 아래 원문을 확인해 주세요.");
  });
});
