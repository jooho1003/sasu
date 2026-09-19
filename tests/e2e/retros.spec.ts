import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { serviceClient, signInSeedUser, SEED_LEAD, SEED_MEMBER, requiredEnv } from "./support/auth";
import { localDate } from "../../lib/retro/bundle";

test.skip(process.env.E2E_RETROS !== "1" || !/^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""), "실제 로컬 Supabase QA에서만 실행");
test("합성 번들부터 실제 생성·수정·공유·내보내기까지",async({page,context,browser,baseURL})=>{
  test.setTimeout(240000);
  const admin=serviceClient(), org=randomUUID(), dept=randomUUID();
  const evidence="docs/verification/daily-retro-2026-09-19";mkdirSync(evidence,{recursive:true});
  const owner=await signInSeedUser(context,baseURL!,SEED_LEAD);
  const second=await browser.newContext();const other=await signInSeedUser(second,baseURL!,SEED_MEMBER);
  expect((await admin.from("orgs").insert({id:org,name:"합성 회고 검증"})).error).toBeNull();
  expect((await admin.from("departments").insert({id:dept,org_id:org,name:"회고 QA"})).error).toBeNull();
  expect((await admin.from("members").insert([{dept_id:dept,user_id:owner.session.user.id,role:"lead",display_name:"합성 작성자",consented_at:new Date().toISOString()},{dept_id:dept,user_id:other.session.user.id,role:"member",display_name:"합성 팀원",consented_at:new Date().toISOString()}])).error).toBeNull();
  const date=localDate(new Date(),"Asia/Seoul");
  const bundle={version:1,date,tz:"Asia/Seoul",collected_at:new Date().toISOString(),collector:{name:"sasu-retro-collect",version:"1"},activities:[
    {kind:"git_commit",ref:"synthetic-1",title:"자료의 인용 검증 테스트를 추가했다",text:"삭제된 자료를 답변에 사용하지 않는지 확인했다",at:`${date}T01:00:00Z`,meta:{}},
    {kind:"doc_change",ref:"synthetic-2",title:"업무 기준 문서를 정리했다",text:"담당자가 근거를 확인한 뒤 승인하도록 기준을 정했다",at:`${date}T02:00:00Z`,meta:{}},
    {kind:"web_visit",ref:"https://docs.example.com/guide",title:"테스트 작성 안내를 찾아봤다",text:"",at:`${date}T03:00:00Z`,meta:{domain:"docs.example.com"}},
  ]};
  let id="";
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.name));
  try {
    const worker=async()=>{const response=await context.request.post("/api/jobs/run",{headers:{"x-jobs-secret":requiredEnv("JOBS_TRIGGER_SECRET")},timeout:120000});expect(response.status()).toBe(200);};
    // A local QA server has no deployed cron; drain prior QA work then reproduce
    // the scheduled worker trigger that accompanies after() in production.
    await worker();
    await page.goto(`/d/${dept}/retros`);
    await page.getByLabel("회고 파일 업로드",{exact:true}).setInputFiles({name:"synthetic-retro.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(bundle))});
    await page.waitForURL(/\/retros\/[0-9a-f-]{36}$/);id=page.url().split("/").at(-1)!;
    const endpoint=`/api/d/${dept}/retros/${id}`;
    const read=async()=>(await context.request.get(endpoint)).json();
    await worker();
    await expect.poll(async()=>(await read()).day?.status,{timeout:120000,intervals:[2000]}).toBe("draft");
    await page.reload();await expect(page.getByRole("region",{name:"회고 본문"})).toBeVisible();
    await page.getByRole("checkbox").last().check();
    await page.getByRole("button",{name:"다시 생성",exact:true}).click();
    await worker();
    await expect.poll(async()=>(await read()).day?.revision,{timeout:120000,intervals:[2000]}).toBe(2);
    await page.reload();await page.getByRole("button",{name:"편집",exact:true}).click();
    await page.getByLabel("제목",{exact:true}).fill("합성 업무 회고 QA");
    const draft=await read();
    await page.getByRole("button",{name:"수정 저장"}).click();
    await expect(page.getByRole("button",{name:"수정 저장"})).toHaveCount(0);
    expect((await context.request.patch(endpoint,{data:{revision:0,title:"이전 편집",body:draft.revision.body,topics:[]}})).status()).toBe(409);
    await page.getByRole("button",{name:"확정",exact:true}).click();
    await expect.poll(async()=>(await read()).day?.status).toBe("confirmed");
    await page.getByText("내보내기",{exact:true}).click();const pending=page.waitForEvent("download");
    await page.getByRole("button",{name:".md 파일 다운로드"}).click();const file=await pending;
    expect(readFileSync((await file.path())!,"utf8")).toContain("[^A1]");
    const exported=await context.request.get(`${endpoint}/export`);expect(exported.headers()["cache-control"]).toMatch(/private, no-store(?:, max-age=0)?/);
    expect((await second.request.get(endpoint)).status()).toBe(404);
    await page.getByLabel("볼 수 있는 사람").selectOption("dept");
    await expect.poll(async()=>(await second.request.get(endpoint)).status()).toBe(200);
    await page.getByText("내보내기",{exact:true}).click();
    for(const width of [1440,390]){await page.setViewportSize({width,height:960});await page.screenshot({path:`${evidence}/retro-detail-${width}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);}
    await page.goto(`/d/${dept}/retros`);await expect(page.getByRole("link",{name:"합성 업무 회고 QA"})).toBeVisible();
    for(const width of [1440,390]){await page.setViewportSize({width,height:960});await page.screenshot({path:`${evidence}/retros-timeline-${width}.png`,fullPage:true});}
    await page.goto(`/d/${dept}/settings`);await expect(page.getByRole("heading",{name:"회고 수집기",exact:true})).toBeVisible();await page.setViewportSize({width:1440,height:960});await page.screenshot({path:`${evidence}/settings-retro-1440.png`,fullPage:true});
    const calls=await admin.from("llm_calls").select("id",{count:"exact",head:true}).eq("dept_id",dept).eq("purpose","retro_draft");expect(calls.error).toBeNull();expect(calls.count).toBeGreaterThanOrEqual(2);
    writeFileSync(`${evidence}/live-results.json`,JSON.stringify({database:"local Supabase",flow:"upload-generate-exclude-regenerate-edit-confirm-share-export",llmCalls:calls.count,errors},null,2));expect(errors).toEqual([]);
  } finally {
    if(id) await owner.supabase.rpc("delete_retro_day",{p_day:id});
    await second.close();
  }
});
