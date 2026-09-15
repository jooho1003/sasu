import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CONSENT_SECTIONS, CONSENT_VERSION } from "@/lib/consent";

function plainText(value: string): string {
  return value.replaceAll("**", "").replaceAll("`", "");
}

function visibleConsentFromDocument(document: string) {
  const visibleBody = document
    .split("## 화면·DM에 표시하는 본문")[1]
    ?.split("\n---")[0];
  if (!visibleBody) {
    throw new Error("동의문 표시 본문을 찾지 못했습니다.");
  }

  const lines = visibleBody.split(/\r?\n/u);
  const titleIndex = lines.findIndex((line) => /^\*\*.+\*\*$/u.test(line));
  const title = plainText(lines[titleIndex] ?? "");
  const introduction = plainText(lines[titleIndex + 2] ?? "");
  const items: { title: string; body: string | null; details: string[] }[] = [];

  for (const line of lines.slice(titleIndex + 3)) {
    const itemMatch = line.match(/^\d+\. \*\*(.+?)\*\*(?:: (.*))?$/u);
    if (itemMatch) {
      items.push({
        title: plainText(itemMatch[1]),
        body: itemMatch[2] ? plainText(itemMatch[2]) : null,
        details: [],
      });
      continue;
    }

    const detailMatch = line.match(/^\s+- (.+)$/u);
    if (detailMatch && items.length > 0) {
      items.at(-1)?.details.push(plainText(detailMatch[1]));
    }
  }

  return { title, introduction, items };
}

describe("파일럿 동의문 상수", () => {
  it("조직 관리자의 메타데이터 열람과 첫 부서장 지정 범위를 고지하고 동의 버전은 유지한다", () => {
    const notice = CONSENT_SECTIONS.items.find((item) => item.title === "누가 보나")?.body;
    expect(CONSENT_VERSION).toBe(1);
    expect(notice).toContain("조직 관리자는 멤버 목록(이름·이메일·부서·역할)과 동의 상태, 부서별 질문 수와 인용 통계를 볼 수 있습니다.");
    expect(notice).toContain("조직 관리자 권한만으로는 질문·답변·카드·원장의 내용과 질문자별 기록을 볼 수 없습니다.");
    expect(notice).toContain("조직 관리자는 새 부서의 첫 부서장을 지정할 수 있고, 지정된 부서장은 부서 설정에서 확인할 수 있습니다.");
  });
  it("문서의 제목·소개·일곱 항목 본문과 세부 문장을 그대로 유지한다", () => {
    const document = readFileSync(
      resolve(process.cwd(), "docs/pilot-consent.md"),
      "utf8",
    );
    const visibleConsent = visibleConsentFromDocument(document);

    expect(CONSENT_VERSION).toBe(1);
    expect(CONSENT_SECTIONS).toEqual(visibleConsent);
    expect(visibleConsent.items).toHaveLength(7);
  });

  it("공급자별 확인 결과를 문서와 다르게 축약하지 않는다", () => {
    expect(JSON.stringify(CONSENT_SECTIONS)).toContain(
      "2026-09-14부터 조직 Data Controls의 Global ZDR·Inference APIs ZDR을 켜",
    );
    expect(JSON.stringify(CONSENT_SECTIONS)).toContain(
      "2026-09-13부터 학습 사용 거부(opt-out)가 설정되어 처리 후 즉시 삭제됩니다.",
    );
  });
});
