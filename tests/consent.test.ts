import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CONSENT_SECTIONS, CONSENT_VERSION } from "@/lib/consent";

describe("파일럿 동의문 상수", () => {
  it("문서에 공개된 일곱 항목 제목과 같은 순서를 유지한다", () => {
    const document = readFileSync(
      resolve(process.cwd(), "docs/pilot-consent.md"),
      "utf8",
    );
    const visibleBody = document
      .split("## 화면·DM에 표시하는 본문")[1]
      ?.split("\n---")[0];
    const documentTitles = Array.from(
      visibleBody?.matchAll(/^\d+\. \*\*(.+?)\*\*(?::|$)/gmu) ?? [],
      (match) => match[1],
    );

    expect(CONSENT_VERSION).toBe(1);
    expect(CONSENT_SECTIONS.items.map((item) => item.title)).toEqual(
      documentTitles,
    );
    expect(documentTitles).toHaveLength(7);
  });

  it("확인 대기 문구를 임의로 채우지 않는다", () => {
    expect(JSON.stringify(CONSENT_SECTIONS)).toContain(
      "[확인 대기: 조직 Data Controls·ZDR 설정]",
    );
    expect(JSON.stringify(CONSENT_SECTIONS)).toContain("[확인 대기]");
  });
});
