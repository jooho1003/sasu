import { describe, expect, it } from "vitest";
import { collectGit } from "@/lib/retro/collect/git";
import { collectClaude } from "@/lib/retro/collect/claude";
import { collectCodex } from "@/lib/retro/collect/codex";
import { collectMemory } from "@/lib/retro/collect/memory";
import { collectDocs } from "@/lib/retro/collect/docs";
import { collectChrome } from "@/lib/retro/collect/chrome";
const date = "2026-09-19", at = `${date}T01:00:00Z`;
describe("회고 소스 최소 수집", () => {
  it("git 제목·통계만 읽는다", () => {
    const rows = collectGit(`abc\u001f${at}\u001ffeat: 근거 확인\n 2 files changed, 3 insertions(+), 1 deletion(-)`, "repo");
    expect(rows[0]).toMatchObject({ kind: "git_commit", title: "feat: 근거 확인", text: "", meta: { files: 2, insertions: 3, deletions: 1 } });
  });
  it("Claude 붙여넣기·assistant·도구 결과는 내보내지 않는다", () => {
    const rows = collectClaude([JSON.stringify({ display: "첫 질문\n비밀 둘째 줄", timestamp: Date.parse(at), sessionId: "s", pastedContents: { text: "secret" } })], [JSON.stringify({ type: "assistant", message: "secret" }), JSON.stringify({ type: "ai-title", aiTitle: "합성 세션", sessionId: "s", timestamp: at })], date, "Asia/Seoul");
    expect(rows).toHaveLength(2); expect(JSON.stringify(rows)).not.toMatch(/secret|비밀 둘째/);
    const nestedFirst = JSON.stringify({pastedContents:{display:"붙여넣은 비밀",timestamp:Date.parse(at),sessionId:"private"},display:"직접 입력",timestamp:Date.parse(at),sessionId:"s"});
    expect(collectClaude([nestedFirst],[],date,"Asia/Seoul")[0].title).toBe("직접 입력");
  });
  it("Claude 세션 제목에 시각이 없으면 해당 파일 수정 시각을 사용한다", () => {
    expect(collectClaude([], [JSON.stringify({type:"ai-title",aiTitle:"합성 제목",sessionId:"s"})], date, "Asia/Seoul", at)[0]).toMatchObject({kind:"claude_session", title:"합성 제목", at:new Date(at).toISOString()});
  });
  it("Codex의 첫 직접 입력만 읽고 환경 지시는 건너뛴다", () => {
    const rows = collectCodex([JSON.stringify({ type: "session_meta", payload: { id: "s" } }), JSON.stringify({ timestamp: at, type: "event_msg", payload: { type: "user_message", message: "테스트를 고쳐줘\n둘째" } }), JSON.stringify({ timestamp: at, type: "event_msg", payload: { type: "agent_message", message: "secret" } })], "s", date, "Asia/Seoul");
    expect(rows[0].title).toBe("테스트를 고쳐줘"); expect(JSON.stringify(rows)).not.toMatch(/secret|둘째/);
  });
  it("메모리 frontmatter와 문서 통계만 읽는다", () => {
    const rows = collectMemory([{ path: "memory.md", mtime: at, content: "---\nname: 합성\ndescription: 기준\n---\n비밀본문" }], date, "Asia/Seoul");
    expect(rows[0].text).toBe("기준"); expect(JSON.stringify(rows)).not.toContain("비밀본문");
    expect(collectDocs("docs/PRD.md\t3\t1", [], ["### ADR-064: 합성"], at)).toHaveLength(2);
  });
  it("Chrome은 기본 off이며 켜도 은행·로컬·쿼리·검색어를 제외한다", () => {
    const visit_time = (Date.parse(at) + 11644473600000) * 1000;
    const rows = [{ url: "https://docs.example.com/page?token=secret#frag", title: "문서", visit_time, visit_count: 1 }, { url: "https://bank.example.com/", title: "은행", visit_time, visit_count: 1 }, { url: "http://127.0.0.1/", title: "로컬", visit_time, visit_count: 1 }];
    expect(collectChrome(rows, [], { date, tz: "Asia/Seoul" })).toEqual([]);
    const result = collectChrome(rows, [{ term: "비밀 검색", at }], { enabled: true, date, tz: "Asia/Seoul", domains: ["bank.example.com"] });
    expect(result).toHaveLength(1); expect(result[0].ref).toBe("https://docs.example.com/page");
    expect(JSON.stringify(result)).not.toMatch(/secret|frag|비밀 검색/);
  });
  it("검색 결과 페이지 제목으로 검색어 동의를 우회하지 않는다", () => {
    const visit_time = (Date.parse(at) + 11644473600000) * 1000;
    const visits = [{url:"https://www.google.com/search?q=private",title:"private - Google 검색",visit_time,visit_count:1}];
    expect(collectChrome(visits, [], {enabled:true,date,tz:"Asia/Seoul"})).toEqual([]);
    expect(collectChrome([], [{term:"합성 검색",at}], {enabled:true,search_terms:true,date,tz:"Asia/Seoul"})[0].kind).toBe("web_search");
  });
});
