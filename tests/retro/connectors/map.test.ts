import { describe, expect, it } from "vitest";
import { mapConnectorRows, dayWindow } from "@/lib/retro/connectors/map";
describe("개인 커넥터 변환", () => {
  it("외부 응답에서 개인 연락처 필드를 읽지 않고 KST 날짜만 남긴다", () => {
    const never = () => { throw new Error("personal_field_was_read"); };
    const guest = { self: false, get email() { return never(); }, get displayName() { return never(); } };
    const rows = mapConnectorRows("google_calendar", [{ id: "event", summary: "회의", start: {dateTime:"2026-09-19T01:00:00Z"}, organizer: {self:true}, attendees:[guest], get description() { return never(); }, get location() {return never();} }], "2026-09-19", "Asia/Seoul", "self");
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ kind: "calendar_event", title: "회의", text: "", meta:{attendees:1} }); expect(JSON.stringify(rows)).not.toMatch(/email|phone|location/);
  });
  it("지표는 snapshot 메타로 만들고 200건에서 멈춘다", () => {
    const rows = mapConnectorRows("figma", Array.from({ length: 220 }, (_, i) => ({ id: String(i), label: "검토", description: "화면 정리", user:{id:"me"}, created_at: "2026-09-19T00:00:00Z" })), "2026-09-19", "Asia/Seoul", "me", {kind:"figma_version",ref:"fileA"});
    expect(rows).toHaveLength(200); expect(rows[0].kind).toBe("figma_version");
  });
  it("작성자·KST 날짜 경계·중복을 검증한다", () => {
    const make=(id:string,user:string,at:string)=>({id,title:"변경 제안",user:{id:user},created_at:at,state:"open"});
    const a=make("1","me","2026-09-18T15:00:00Z");
    const rows=mapConnectorRows("github",[make("0","me","2026-09-18T14:59:59Z"),a,a,make("2","other","2026-09-19T02:00:00Z"),make("3","me","2026-09-19T15:00:00Z")],"2026-09-19","Asia/Seoul","me",{kind:"github_pr",ref:"owner/repo"});
    expect(rows).toHaveLength(1);expect(rows[0].ref).toBe("owner/repo:1");
    expect(mapConnectorRows("github",[a],"2026-09-19","Asia/Seoul","",{kind:"github_pr",ref:"owner/repo"})).toEqual([]);
  });
  it("다른 사람이 변경한 날짜를 작성자의 활동으로 기록하지 않는다", () => {
    expect(mapConnectorRows("github",[{id:1,user:{id:"me"},title:"제안",created_at:"2026-09-18T00:00:00Z",updated_at:"2026-09-19T00:00:00Z"}],"2026-09-19","Asia/Seoul","me")).toEqual([]);
  });
  it("시간대 자정과 일광절약 전환을 정확히 계산한다", () => {
    expect(dayWindow("2026-09-19","Asia/Seoul")).toEqual({from:"2026-09-18T15:00:00.000Z",to:"2026-09-19T15:00:00.000Z"});
    const dst=dayWindow("2026-03-08","America/New_York");expect(Date.parse(dst.to)-Date.parse(dst.from)).toBe(23*3600000);
  });
});
