import type { RetroDetailData } from "@/components/retro-detail";
import type { RetroActivityRow } from "@/lib/contracts";
export function buildDemoRetros(departments = [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", users: ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002"] }]): RetroDetailData[] {
  const result: RetroDetailData[] = [];
  for (const [deptIndex, dept] of departments.entries()) for (let dayIndex = 0; dayIndex < 5; dayIndex++) for (let person = 0; person < 2; person++) {
    const serial = deptIndex * 10 + dayIndex * 2 + person + 1;
    const id = `72000000-0000-4000-8000-${String(serial).padStart(12, "0")}`;
    const date = `2026-09-${String(15 + dayIndex).padStart(2,"0")}`;
    const topics = ["근거 검증", person ? "고객 안내" : "문서 정리"];
    const kinds = ["git_commit", "claude_prompt", "memory_change", "doc_change", "web_visit", "git_commit", "doc_change", "claude_prompt"] as const;
    const activities: RetroActivityRow[] = kinds.map((kind, index): RetroActivityRow => ({ id: `73000000-0000-4000-8000-${String(serial * 100 + index).padStart(12,"0")}`, day_id: id, kind, ref: `synthetic-${serial}-${index}`, title: `합성 업무 ${index + 1}의 근거를 확인했다`, text: "담당자와 확인한 기준을 문서로 남겼다.", at: `${date}T0${index}:00:00Z`, meta: kind === "web_visit" ? { domain: "docs.example.com" } : {}, source_visibility: null, excluded: false }));
    const items = activities.slice(0,4).map(a=>({ text:a.title, citations:[{activity_id:a.id,quote:a.title}] }));
    const revision = { day_id:id, revision:2, origin:"confirm" as const, title:`${person ? "합성 지수" : "합성 민호"}의 ${15+dayIndex}일 업무 회고`, body:{did:[items[0]],learned:[items[1]],decided:[items[2]],next:[items[3]]},topics,highlight:null,citations:items.flatMap(i=>i.citations),created_at:`${date}T10:00:00Z` };
    result.push({ day:{id,dept_id:dept.id,user_id:dept.users[person],retro_date:date,tz:"Asia/Seoul",visibility:"dept",status:"confirmed",status_reason:null,activity_count:activities.length,revision:2,confirmed_revision:2,confirmed_at:revision.created_at,topics,generation:1,updated_at:revision.created_at,display_name:person?"합성 지수":"합성 민호",title:revision.title},activities,revision,confirmed:revision,owner:true });
  }
  return result;
}
