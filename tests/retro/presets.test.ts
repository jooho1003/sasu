import { describe, expect, it } from "vitest";
import { RETRO_PRESETS, retroPresetCopy, recommendedConnectors } from "@/lib/retro/presets";

describe("부서별 회고 형식", () => {
  it("부서에 맞는 연결을 앞에 추천하고 없는 부서는 공통 연결만 추천한다", () => {
    expect(recommendedConnectors('design')).toEqual(['figma', 'notion']);
    expect(recommendedConnectors('development')).toContain('linear');
    expect(recommendedConnectors('sales')).toContain('hubspot');
    expect(recommendedConnectors('__proto__')).toEqual(['google_calendar']);
  });
  it("8개 부서 모두 동일한 네 섹션 키와 개별 라벨·힌트를 갖는다", () => {
    expect(RETRO_PRESETS).toHaveLength(8);
    for (const preset of RETRO_PRESETS) {
      const copy = retroPresetCopy(preset);
      expect(Object.keys(copy.sections)).toEqual(["did", "learned", "decided", "next"]);
      expect(Object.values(copy.sections).every(s => /[가-힣]/.test(s))).toBe(true);
      expect(copy.hint.length).toBeGreaterThan(10);
    }
    expect(retroPresetCopy("design").sections.did).toBe("바꾼 것");
    expect(retroPresetCopy("__proto__")).toEqual(retroPresetCopy("general"));
  });
});
