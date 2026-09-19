import { describe, expect, it } from "vitest";
import { RetroDraft, toStrictJsonSchema } from "@/lib/contracts";
import { verifyRetroDraft } from "@/lib/retro/verify";
import { chunkRetroActivities, mergeRetroDrafts } from "@/lib/retro/chunk";
import { retroMarkdown } from "@/lib/retro/export";
const citation = { activity_id: "a", quote: "검증 완료" };
const draft = { citations: [citation], title: "오늘 회고", highlight: "검증을 마쳤다", topics: ["검증"], body: { did: [{ text: "검증했다", citations: [citation] }], learned: [], decided: [], next: [] } };
const activities = [{ id: "a", title: "검증 완료", text: "", excluded: false, kind: "git_commit", at: "2026-09-19T01:00:00Z", meta: {} }];
describe("회고 근거와 내보내기", () => {
  it("달력만으로 실제 참석을 주장하지 않고 등록된 일정의 확인만 허용한다", () => {
    const calendar = [{ ...activities[0], kind: 'calendar_event' }];
    const withText = (text: string) => ({ ...draft, body: { ...draft.body, did: [{ text, citations: [citation] }] } });
    expect(verifyRetroDraft(withText('등록된 면접 일정을 확인했습니다.'), calendar).valid).toBe(true);
    for (const text of ['면접에 참석했습니다.', '회의를 진행하고 결과를 확인했습니다.', '면접 참석 여부를 확인했습니다.']) expect(verifyRetroDraft(withText(text), calendar).valid).toBe(false);
  });
  it("부서 문맥을 개인 성과로 인용하거나 마스킹 토큰을 옮겨 쓰지 않는다", () => {
    expect(verifyRetroDraft(draft, [{ ...activities[0], kind: "notion_page_changed" }]).valid).toBe(false);
    expect(verifyRetroDraft(draft, [{ ...activities[0], kind: "department_snapshot" }]).valid).toBe(false);
    expect(verifyRetroDraft(draft, [{ ...activities[0], meta: { dept_context: true } }]).valid).toBe(false);
    // 다른 부분에 개인정보가 가려져 있어도 정상적인 근거 인용은 유지한다.
    expect(verifyRetroDraft(draft, [{ ...activities[0], text: "[전화번호]" }]).valid).toBe(true);
    const masked = { ...draft, body: { ...draft.body, did: [{ text: "[전화번호]로 연락했습니다.", citations: [citation] }] } };
    expect(verifyRetroDraft(masked, activities).valid).toBe(false);
  });
  it("집계는 확인·비교만 허용하고 개인 성과로 쓰지 않는다", () => {
    const metric = [{ ...activities[0], kind: "metric_snapshot" }];
    expect(verifyRetroDraft(draft, metric).valid).toBe(false);
    const observed = { ...draft, body: { ...draft.body, did: [{ text: "지표를 확인했습니다.", citations: [citation] }] } };
    expect(verifyRetroDraft(observed, metric).valid).toBe(true);
    expect(verifyRetroDraft({ ...observed, body: { ...observed.body, did: [{ text: "지표를 확인하고 매출을 높였습니다.", citations: [citation] }] } }, metric).valid).toBe(false);
  });
  it("strict JSON schema를 만들고 유효한 근거만 남긴다", () => {
    expect(JSON.stringify(toStrictJsonSchema("retro_draft_response", RetroDraft))).toContain('"additionalProperties":false');
    expect(verifyRetroDraft(draft, activities)).toMatchObject({ valid: true, dropped: 0, highlight: draft.highlight });
    expect(verifyRetroDraft(draft, [{ ...activities[0], excluded: true }])).toMatchObject({ valid: false, dropped: 1, highlight: null });
    expect(verifyRetroDraft({ ...draft, citations: [{ activity_id: "b", quote: "검증 완료" }] }, activities).highlight).toBeNull();
  });
  it("120개씩 묶고 주제를 합친다", () => {
    expect(chunkRetroActivities(Array.from({ length: 121 }, (_, i) => ({ ...activities[0], id: String(i) })))).toHaveLength(2);
    expect(mergeRetroDrafts([draft, draft]).body.did).toHaveLength(2);
  });
  it("Markdown은 유효한 인용만 내보내고 웹 각주에는 도메인만 남긴다", () => {
    const md = retroMarkdown({ retro_date: "2026-09-19", tz: "Asia/Seoul", author: "합성 작성자" }, draft, [{ ...activities[0], kind: "web_visit", meta: { domain: "example.com" }, ref: "https://example.com/private?token=secret" }]);
    expect(md).toContain("example.com"); expect(md).not.toMatch(/private|token=secret/);
    expect(md).toContain("[^A1]");
  });
});
