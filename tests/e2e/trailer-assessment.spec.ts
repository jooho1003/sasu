import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { ASSESSMENT_FIXED_COPY } from "../../lib/trailer-assessment";
import { missingEnv, serviceClient } from "./support/auth";
loadEnvConfig(process.cwd());test.use({screenshot:"off",trace:"off",video:"off"});
const live=process.env.E2E_ALLOW_EXTERNAL_WRITES==="1"&&process.env.E2E_ASSESSMENT_DB==="1"&&!missingEnv(["E2E_BASE_URL","NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY"]).length;
const path="/demo/d/cccccccc-cccc-4ccc-8ccc-cccccccccccc/trailers";
test("합성 채점 A · 비활성 경로 404",async({request})=>{test.skip(live,"B는 on 서버입니다.");expect((await request.get(path)).status()).toBe(404);});
test.describe("합성 채점 B · O12 운영 승인 후",()=>{
  test.skip(!live,"외부 쓰기·QA DB·발행 on·full 서버 필요");
  test("제출순·명시적 점수 정렬·고정 문구·근거·쓰기 없음",async({page,browser})=>{
    const db=serviceClient();const counts=()=>Promise.all(["llm_calls","trailer_attempts","jobs"].map(async(table)=>{const r=await db.from(table).select("*",{count:"exact",head:true});expect(Boolean(r.error)).toBe(false);return r.count;}));const before=await counts();
    await page.goto(path);await page.getByRole("tab",{name:"합성 지원자 점수표"}).click();for(const copy of ASSESSMENT_FIXED_COPY)await expect(page.getByText(copy,{exact:true})).toBeVisible();
    const rows=page.locator("[data-attempt-label]");expect(await rows.evaluateAll(nodes=>nodes.map(n=>n.getAttribute("data-attempt-label")))).toEqual(["합성 지원자 A","합성 지원자 B","합성 지원자 C"]);await expect(rows.locator("details[open]")).toHaveCount(0);
    expect(new Set(await rows.evaluateAll(nodes=>nodes.map(n=>n.className))).size).toBe(1);
    await page.getByRole("button",{name:"점수순으로 보기"}).click();await expect(page.getByRole("button",{name:"제출순으로 보기"})).toHaveAttribute("aria-pressed","true");
    const scored=await db.from("trailer_attempts").select("label,weighted_score,created_at").eq("trailer_id","cccccccc-cccc-4ccc-8ccc-cccccccccf01").eq("kind","synthetic");expect(Boolean(scored.error)).toBe(false);
    const expected=[...(scored.data??[])].sort((a,b)=>(b.weighted_score??-1)-(a.weighted_score??-1)||a.created_at.localeCompare(b.created_at)).map(a=>a.label);expect(await rows.evaluateAll(nodes=>nodes.map(n=>n.getAttribute("data-attempt-label")))).toEqual(expected);
    for(const summary of await rows.locator("summary").all())await summary.click();await expect(page.getByRole("region",{name:"면접 확인 질문"}).first()).toBeVisible();
    let text=await page.locator("main").innerText();for(const copy of ASSESSMENT_FIXED_COPY)text=text.replaceAll(copy,"");expect(/합격|불합격|탈락|추천/u.test(text)).toBe(false);expect(await counts()).toEqual(before);
    if(process.env.E2E_BASE_URL_SCORES){const context=await browser.newContext();try{const scores=await context.newPage();await scores.goto(`${process.env.E2E_BASE_URL_SCORES}${path}`);await scores.getByRole("tab",{name:"합성 지원자 점수표"}).click();for(const summary of await scores.locator("summary").all())await summary.click();await expect(scores.getByRole("region",{name:"면접 확인 질문"})).toHaveCount(0);}finally{await context.close();}}
  });
  test("실제 지원자 생성은 service RPC와 직접 insert 양쪽에서 차단",async()=>{
    const db=serviceClient(),trailerId=randomUUID(),id=randomUUID();
    const demo=await db.from("trailers").select("scenarios,rubric").eq("id","cccccccc-cccc-4ccc-8ccc-cccccccccf01").single();expect(Boolean(demo.error)).toBe(false);
    const prepared=await db.from("trailers").insert({id:trailerId,dept_id:"fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",status:"review",source_decision_ids:["fddddddd-dddd-4ddd-8ddd-dddddddddd01"],scenarios:demo.data!.scenarios,rubric:demo.data!.rubric});expect(Boolean(prepared.error)).toBe(false);
    try {
      const submissions=[{scenario_id:demo.data!.scenarios[0].id,choice_id:demo.data!.scenarios[0].choices[0].id,reason:"차단 확인",fact_ids:[],events:[]}];
      const rpc=await db.rpc("create_trailer_attempt",{p_attempt_id:id,p_trailer:trailerId,p_kind:"candidate",p_label:"차단 확인",p_submissions:submissions});expect(rpc.error?.message==="trailer_assessment_disabled").toBe(true);
      const direct=await db.from("trailer_attempts").insert({id,trailer_id:trailerId,kind:"candidate",label:"차단 확인",submissions});expect(direct.error?.message==="trailer_assessment_disabled").toBe(true);
    } finally { const cleaned=await db.from("trailers").delete().eq("id",trailerId).eq("dept_id","fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");expect(Boolean(cleaned.error)).toBe(false); }
  });
});
