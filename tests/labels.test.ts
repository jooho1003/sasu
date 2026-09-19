import { describe, expect, it } from "vitest";
import { RETRO_PRESETS, RETRO_PRESET_COPY } from "@/lib/retro/presets";
import { UI_LABELS } from "@/lib/labels";
import { LABELS, label, labelFrom } from "@/lib/labels";
import { checkStrings } from "@/lib/wording-check";
import dictionary from "@/scripts/wording/terms.json";

describe("쉬운 말 이름표", () => {
  it("핵심 메뉴와 상태는 한글 이름표를 사용한다", () => { expect(UI_LABELS.ledger).toBe("결정 기록"); expect(UI_LABELS.lead).toBe("팀장"); expect(label("cardStatus", "needs_review")).toBe("팀장 확인 필요"); expect(labelFrom("cardStatus", "unknown")).toBe("확인 필요"); });
  it("회고 프리셋은 같은 네 섹션을 유지한다", () => { expect(RETRO_PRESETS).toHaveLength(8); expect(Object.values(RETRO_PRESET_COPY)).toHaveLength(8); expect(label("cardStatus", "open")).toBe("아직 결정 안 함"); });
  it("모든 상태가 짧은 한국어이며 승인한 쉬운말을 쓴다",()=>{
    for(const group of Object.values(LABELS))for(const text of Object.values(group)){
      expect(text).toMatch(/^[가-힣 ]+$/);expect(text.replaceAll(' ','').length).toBeLessThanOrEqual(8);expect(text.length).toBeLessThanOrEqual(10);
      expect(checkStrings([{line:1,text,context:'literal'}],dictionary.terms,{file:'lib/labels.ts',styleExempt:false}).filter(f=>f.blocking)).toEqual([]);
    }
    expect(label('cardStatus','deferred')).toBe('미룸');
    expect(labelFrom('notionRootState','__proto__')).toBe('확인 필요');
    expect(labelFrom('inviteAttempt',null)).toBe('—');
    // @ts-expect-error Unknown values must never compile through the typed API.
    label('cardStatus','unknown');
  });
});
