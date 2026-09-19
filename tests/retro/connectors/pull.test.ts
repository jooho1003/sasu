import { describe, expect, it, vi } from "vitest";
import { pullConnector } from "@/lib/retro/connectors/pull";

describe("제공자 실제 응답 수집",()=>{
  const credential={accessToken:'synthetic',refreshToken:null,expiresAt:null,subjectId:'me',authKind:'oauth' as const,scopes:[]};
  it("Figma는 선택한 파일의 본인 버전·의견만 읽는다",async()=>{
    const fetcher=vi.fn(async(url:string)=>Response.json(url.includes('versions')?{versions:[{id:'v',user:{id:'me'},label:'화면 정리',created_at:'2026-09-19T01:00:00Z'}]}:{comments:[{id:'c',user:{id:'other'},message:'다른 사람',created_at:'2026-09-19T01:00:00Z'}]}));
    const output=await pullConnector('figma',{files:['fileABC']},credential,'2026-09-19',fetcher as typeof fetch);
    expect(output).toHaveLength(1);expect(output[0].kind).toBe('figma_version');expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([url])=>url.startsWith('https://api.figma.com/v1/files/fileABC/'))).toBe(true);
  });
  it("Calendar 페이지를 넘겨도 primary·날짜·개인정보 제외 fields를 유지한다",async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(Response.json({items:[],nextPageToken:'next'})).mockResolvedValueOnce(Response.json({items:[{id:'event',summary:'회의',organizer:{self:true},start:{dateTime:'2026-09-19T01:00:00Z'}}]}));
    expect(await pullConnector('google_calendar',{},credential,'2026-09-19',fetcher)).toHaveLength(1);
    for(const [url] of fetcher.mock.calls){const u=new URL(url);expect(u.pathname).toContain('/primary/events');expect(u.searchParams.get('timeMin')).toBe('2026-09-18T15:00:00.000Z');expect(u.searchParams.get('fields')).not.toMatch(/email|displayName|description/);}
    expect(new URL(fetcher.mock.calls[1][0]).searchParams.get('pageToken')).toBe('next');
  });
  it("알 수 없는 제공자와 무한 페이지를 닫는다",async()=>{
    const fetcher=vi.fn().mockImplementation(async()=>Response.json({items:[],nextPageToken:'same'}));
    await expect(pullConnector('channel_talk' as never,{},credential,'2026-09-19',fetcher)).rejects.toThrow('connector_scope_denied');
    await pullConnector('google_calendar',{},credential,'2026-09-19',fetcher);expect(fetcher.mock.calls.length).toBeLessThanOrEqual(10);
  });
});
