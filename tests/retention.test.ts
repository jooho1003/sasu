import { describe, expect, it } from "vitest";
import {
  buildRetentionBundle,
  retentionRisk,
  verifyRetentionBundle,
} from "@/lib/retention";
const record = {
  id: "item",
  source_id: "source",
  external_ref: "100.000001",
  content_version: 2,
  content: "확인 후 진행합니다.",
  author: "합성 담당자",
  spoken_at: "2026-09-01T00:00:00Z",
  created_at: "2026-09-01T00:00:00Z",
  visibility: "dept",
};
describe("Slack 보관 묶음", () => {
  it("실제 원문·버전·체크섬을 포함하되 첨부와 수집 완전성을 과장하지 않는다", () => {
    const bundle = buildRetentionBundle(
      {
        sourceId: "source",
        title: "합성 채널",
        from: "2026-09-01",
        to: "2026-09-17",
        records: [record],
      },
      new Date("2026-09-16T00:00:00Z"),
    );
    expect(bundle.manifest.attachments_included).toBe(false);
    expect(bundle.manifest.coverage).toBe("collected_records_only");
    expect(bundle.markdown).toContain("확인 후 진행합니다.");
    expect(bundle.markdown).toContain("버전 2");
    expect(verifyRetentionBundle(bundle)).toBe(true);
    bundle.records[0].content = "변조된 내용";
    expect(verifyRetentionBundle(bundle)).toBe(false);
  });
  it("큰 범위를 잘라서 성공시키지 않는다", () => {
    expect(() =>
      buildRetentionBundle({
        sourceId: "s",
        title: "t",
        from: "a",
        to: "b",
        records: Array(5001).fill(record),
      }),
    ).toThrow("export_too_large");
  });
  it("실제 설정 미확인과 만료 임박을 구분한다", () => {
    expect(
      retentionRisk(
        { plan: "unknown", expires_at: null, retention_days: null },
        new Date(),
      ).state,
    ).toBe("unknown");
    expect(
      retentionRisk(
        { plan: "paid", expires_at: "2026-09-20", retention_days: null },
        new Date("2026-09-16"),
      ).state,
    ).toBe("soon");
  });
});
