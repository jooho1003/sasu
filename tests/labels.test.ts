import { describe, expect, it } from "vitest";
import { RETRO_PRESETS, RETRO_PRESET_COPY } from "@/lib/retro/presets";
import { STATUS_LABELS, UI_LABELS, statusLabel } from "@/lib/labels";

describe("쉬운 말 이름표", () => {
  it("핵심 메뉴와 상태는 한글 이름표를 사용한다", () => { expect(UI_LABELS.ledger).toBe("결정 기록"); expect(UI_LABELS.lead).toBe("팀장"); expect(statusLabel("needs_review")).toBe("확인 필요"); expect(statusLabel("unknown")).toBe("확인 필요"); });
  it("회고 프리셋은 같은 네 섹션을 유지한다", () => { expect(RETRO_PRESETS).toHaveLength(8); expect(Object.values(RETRO_PRESET_COPY)).toHaveLength(8); expect(STATUS_LABELS.open).toBe("열림"); });
});
