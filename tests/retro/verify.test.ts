import { describe, expect, it } from "vitest";
import { RetroDraft, toStrictJsonSchema } from "@/lib/contracts";
import { verifyRetroDraft } from "@/lib/retro/verify";
import { chunkRetroActivities, mergeRetroDrafts } from "@/lib/retro/chunk";
import { retroMarkdown } from "@/lib/retro/export";
const citation = { activity_id: "a", quote: "검증 완료" };
const draft = { citations: [citation], title: "오늘 회고", highlight: "검증을 마쳤다", topics: ["검증"], body: { did: [{ text: "검증했다", citations: [citation] }], learned: [], decided: [], next: [] } };
const activities = [{ id: "a", title: "검증 완료", text: "", excluded: false, kind: "git_commit", at: "2026-09-19T01:00:00Z", meta: {} }];
describe("회고 근거와 내보내기", () => {
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
