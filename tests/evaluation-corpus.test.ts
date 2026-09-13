import { describe, expect, it } from "vitest";
import { classificationCases } from "@/fixtures/evaluation/classification";
import { classifyNonDecisionByRules } from "@/lib/rules";
import { mask } from "@/lib/mask";
import { collectBackfillItems } from "@/lib/adapters/slack";
import { verifyAnswerCitations } from "@/lib/pipeline/answer";

describe("평가 데이터 무결성", () => {
  it("64개의 서로 다른 문장과 이유, 균형 잡힌 개발/보류 세트를 가진다", () => {
    expect(classificationCases).toHaveLength(64);
    expect(new Set(classificationCases.map(row => row.text)).size).toBe(64);
    expect(new Set(classificationCases.map(row => row.id)).size).toBe(64);
    for (const split of ["development", "holdout"]) {
      for (const label of ["decision", "action", "info", "chatter"]) {
        expect(classificationCases.filter(row => row.split === split && row.label === label)).toHaveLength(8);
      }
    }
    expect(classificationCases.every(row => row.rationale.trim().length > 0)).toBe(true);
  });
});

describe("실행 요청 공백 변형 회귀", () => {
  for (const verb of ["공유해", "보내", "정리해", "확인해", "검토해", "진행해", "예약해", "받아"]) {
    it.each(["", " ", "  ", "\t", "\n"])(`${verb} + 공백 %j + 주세요`, whitespace => {
      expect(classifyNonDecisionByRules(`자료를 ${verb}${whitespace}주세요.`).label).toBe("action");
    });
  }
});

describe("개인정보 마스킹과 업무 수치 보존 조합", () => {
  const pii = [
    ["sample@example.com", "[이메일]"], ["qa+test@example.org", "[이메일]"],
    ["010-1234-5678", "[전화번호]"], ["01012345678", "[전화번호]"],
    ["010 1234 5678", "[전화번호]"], ["123456-1234567", "[주민번호]"],
    ["1234-5678-9012-3456", "[카드번호]"], ["123456-78-901234", "[계좌번호]"],
  ];
  for (const [privateText, token] of pii) {
    for (const fact of ["12,000,000원", "1200만원", "15%", "2026-09-15", "9월 15일", "80개", "3,500개", "0.2%", "7일", "14일", "300만원", "2028-02-29"]) {
      it(`${token} / ${fact}`, () => {
        const actual = mask(`연락 정보 ${privateText}. 업무 조건 ${fact}.`);
        expect(actual).not.toContain(privateText);
        expect(actual).toContain(token);
        expect(actual).toContain(fact);
        expect(mask(actual)).toBe(actual);
      });
    }
  }
});

describe("합성 부서 입력의 동의·매핑 조합", () => {
  for (const dept of ["sales", "engineering", "finance", "operations"]) {
    for (const consent of [true, false, null]) {
      for (const kind of ["normal", "bot", "empty", "emoji", "join", "no_user"]) {
        it(`${dept}/${consent}/${kind}`, () => {
          const event = { type: "message", user: kind === "no_user" ? undefined : "U_SYNTHETIC", ts: "1788840000.000001", text: kind === "empty" ? " " : kind === "emoji" ? "👍" : "합성 계약 검토", ...(kind === "bot" ? { bot_id: "B_TEST" } : {}), ...(kind === "join" ? { subtype: "channel_join" } : {}) };
          const items = collectBackfillItems([event], { deptId: dept, sourceId: `source-${dept}`, members: new Map(consent === null ? [] : [["U_SYNTHETIC", { displayName: "합성 구성원", consented: consent }]]) });
          expect(items).toHaveLength(consent === true && kind === "normal" ? 1 : 0);
        });
      }
    }
  }
});

describe("인용 숫자·부정·출처 변조", () => {
  for (const [index, text] of ["할인은 5%까지만 허용한다.", "재입찰 없이 계약하지 않는다.", "승인자는 영업 팀장이다.", "한도는 300만원이다.", "출시일은 9월 20일이다.", "배포 전에 롤백 계획을 확인한다.", "계약 기간은 12개월이다.", "지출 증빙은 월말까지 제출한다."].entries()) {
    const sourceId = `evidence-${index}`;
    const sources = new Map([[sourceId, text], [`decision-${index}`, text]]);
    const variants = [
      { citation: { itemId: sourceId, quote: text }, valid: true },
      { citation: { itemId: "not-visible", quote: text }, valid: false },
      { citation: { itemId: sourceId, quote: "" }, valid: false },
      { citation: { itemId: sourceId, quote: `${text} 예외를 허용한다.` }, valid: false },
      { citation: { itemId: sourceId, decisionId: "decision-1", quote: text }, valid: false },
      { citation: { quote: text }, valid: false },
      { citation: { itemId: sourceId, quote: "원문에 없는 결론" }, valid: false },
      { citation: { decisionId: `decision-${index}`, quote: text }, valid: true },
    ];
    it.each(variants.map((variant, i) => ({ ...variant, i })))(`${sourceId}/$i`, ({ citation, valid }) => {
      expect(verifyAnswerCitations([citation], sources).valid).toHaveLength(valid ? 1 : 0);
    });
  }
});
