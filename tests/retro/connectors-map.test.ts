import { describe, expect, it } from "vitest";
import { mapConnectorRows } from "@/lib/retro/connectors/map";
describe("개인 커넥터 변환", () => {
  it("외부 응답에서 개인 연락처 필드를 읽지 않고 KST 날짜만 남긴다", () => {
    const rows = mapConnectorRows("hubspot", [{ id: "n1", company_name: "가상 회사", subject: "상담", email: "private@example.com", phone: "010-1234-5678", updated_at: "2026-09-19T01:00:00Z" }], "2026-09-19", "Asia/Seoul");
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ kind: "crm_note", title: "가상 회사", text: "" }); expect(JSON.stringify(rows)).not.toMatch(/private|010-|email|phone/);
  });
  it("지표는 snapshot 메타로 만들고 200건에서 멈춘다", () => {
    const rows = mapConnectorRows("ga4", Array.from({ length: 220 }, (_, i) => ({ id: String(i), label: "어제 대비", summary: "확인", updated_at: "2026-09-19T00:00:00Z" })), "2026-09-19", "Asia/Seoul");
    expect(rows).toHaveLength(200); expect(rows[0].kind).toBe("metric_snapshot"); expect(rows[0].meta.metric).toBe("snapshot");
  });
});
