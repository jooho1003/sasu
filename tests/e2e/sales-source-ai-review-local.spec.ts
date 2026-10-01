import {randomUUID} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {createClient} from "@supabase/supabase-js";
import {expect,test,type BrowserContext} from "@playwright/test";

const base=process.env.E2E_BASE_URL??"",url=process.env.NEXT_PUBLIC_SUPABASE_URL??"";
test.skip(process.env.E2E_REVIEW_LIVE!=="1" || base!=="http://localhost:3011" || !/^http:\/\/(localhost|127\.0\.0\.1):/.test(url),"local isolated synthetic only");
async function signIn(context:BrowserContext,email:string,password:string) {
  const client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false}});
  const r=await client.auth.signInWithPassword({email,password});
  if(r.error||!r.data.session) throw Error("local_login_failed");
  await context.addCookies([{name:`sb-${new URL(url).hostname.split(".")[0]}-auth-token`,value:`base64-${Buffer.from(JSON.stringify(r.data.session)).toString("base64url")}`,url:base,httpOnly:true,secure:false,sameSite:"Lax"}]);
}

test("선택한 네 자료의 실제 AI 문단 검토와 원문 변경·재선택·역할 회수",async({browser,context,page})=>{
  test.setTimeout(180_000);
  const {dept,lead}=JSON.parse(readFileSync(".vercel/review-qa/ids.json","utf8"));
  const {password}=JSON.parse(readFileSync(".vercel/review-qa/credentials.json","utf8"));
  const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
  const sourceIds=Array.from({length:4},()=>randomUUID()),itemIds=Array.from({length:4},()=>randomUUID()),tasks:string[]=[];
  const labels=["고객 요청","기존 견적","변경 견적","영업 원칙"];
  const texts=[
    "합성 고객 요청\n\n견적 금액과 납기를 확인해주세요.",
    "합성 기존 견적\n\n금액은 1,000원입니다.\n납기 일정은 협의가 필요합니다.",
    "합성 변경 견적\n\n금액은 1,200원입니다.\n할인은 승인되지 않았습니다.\n\n납기는 확정하지 않습니다.\n담당자 승인 후 다시 협의합니다.",
    "합성 영업 원칙\n\n가격 변경은 팀장 승인 후 확정합니다.\n납기를 약속하기 전에 담당자에게 확인합니다.",
  ];
  const selection={request_item_id:itemIds[0],old_quote_item_id:itemIds[1],new_quote_item_id:itemIds[2],policy_item_id:itemIds[3]};
  const endpoint=`${base}/api/d/${dept}/sales-review/ai`;
  const counts=async()=> {
    const result=await service.from("sales_review_tasks").select("id",{count:"exact",head:true});expect(result.error).toBeNull();return result.count;
  };
  const before=await counts();
  try {
    expect((await service.from("sources").insert(sourceIds.map((id,i)=>({id,dept_id:dept,kind:"document",external_id:"phase41:"+id,title:"phase41 "+labels[i],visibility:"leads_only",active:true,is_principles:i===3})))).error).toBeNull();
    expect((await service.from("items").insert(itemIds.map((id,i)=>({id,dept_id:dept,source_id:sourceIds[i],content:texts[i],external_ref:"phase41:"+id})))).error).toBeNull();
    await signIn(context,"review-lead@example.test",password);
    await page.goto(`${base}/d/${dept}/sales-review`);
    await expect(page.getByRole("combobox",{name:labels[0]}).locator(`option[value="${itemIds[0]}"]`)).toHaveCount(1,{timeout:20_000});
    for(let i=0;i<4;i++) await page.getByRole("combobox",{name:labels[i]}).selectOption(itemIds[i]);
    await page.getByRole("button",{name:"원문 나란히 보기"}).click();
    const region=page.locator('[aria-label="사수 원문 근거 검토"]');
    const response=page.waitForResponse(r=>r.url()===endpoint && r.request().method()==="POST");
    await region.getByRole("button",{name:"사수로 확인할 근거 찾기"}).click();
    const created=await response;expect(created.status()).toBe(202);tasks.push((await created.json()).task_id);
    await expect(region.locator("article").first()).toBeVisible({timeout:100_000});
    await expect(region.getByRole("button")).toBeEnabled();
    for(const quote of await region.locator("blockquote").all()) {
      const content=await quote.textContent();
      expect(texts.some(t=>t.includes(content!))).toBe(true);
    }
    await expect(region).toContainText("할인은 승인되지 않았습니다.");
    const direct=await page.request.get(`${endpoint}?task_id=${tasks[0]}`);
    expect(direct.status()).toBe(200);expect(direct.headers()["cache-control"]).toContain("no-store");
    const stored=await service.from("sales_source_reviews").select("result,item_ids,versions").eq("id",tasks[0]).single();
    expect(stored.error).toBeNull();expect(JSON.stringify(stored.data!.result)).not.toContain("할인");
    expect(stored.data!.versions).toHaveLength(4);
    const href=await region.getByRole("link",{name:"원문에서 확인"}).first().getAttribute("href");
    const original=await context.newPage();await original.goto(base+href);await expect(original.locator("body")).toContainText("합성");await original.close();
    await region.screenshot({path:"docs/verification/sales-source-ai-review-2026-10-01.png"});
    await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await region.screenshot({path:"docs/verification/sales-source-ai-review-2026-10-01-mobile.png"});
    const member=await browser.newContext();
    try {await signIn(member,"review-member@example.test",password);expect((await member.request.post(endpoint,{data:{...selection,request_id:randomUUID()}})).status()).toBe(403);}
    finally{await member.close();}
    expect((await service.from("items").update({content:texts[2]+"\n新"}).eq("id",itemIds[2])).error).toBeNull();
    expect((await page.request.get(`${endpoint}?task_id=${tasks[0]}`)).status()).toBe(404);
    // Focus rereads the current task, clearing stale quotes after version change.
    await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
    await expect(region).toHaveCount(0);
    await expect(page.locator('[aria-label="선택한 원문 대조"]')).toHaveCount(0);
    expect((await service.from("items").update({content:texts[2]}).eq("id",itemIds[2])).error).toBeNull();
    await page.getByRole("button",{name:"원문 나란히 보기"}).click();
    await page.getByRole("combobox",{name:labels[0]}).selectOption("");
    await expect(region).toHaveCount(0);
    await page.getByRole("combobox",{name:labels[0]}).selectOption(itemIds[0]);
    await page.getByRole("button",{name:"원문 나란히 보기"}).click();
    await expect(region.getByRole("button",{name:"사수로 확인할 근거 찾기"})).toBeVisible();
    expect((await service.from("members").update({role:"member"}).eq("user_id",lead).eq("dept_id",dept)).error).toBeNull();
    await region.getByRole("button",{name:"사수로 확인할 근거 찾기"}).click();
    await expect(region).toHaveCount(0);
    await expect(page.locator('[aria-labelledby="real-sales-sources-heading"] [role="alert"]')).toContainText("현재 확인할 수 없는 원문");
    writeFileSync("docs/verification/sales-source-ai-review-2026-10-01-runtime.json",JSON.stringify({environment:"isolated-local-synthetic",task_status:"ready",checks:["202_and_poll","exact_complete_quotes","indices_only_storage","evidence_link","390px","member_403","content_change_404","focus_clears","selection_clears","demotion_403_clears"],synthetic_tasks_before:before,synthetic_tasks_after:await counts()},null,2));
  } finally {
    await service.from("members").update({role:"lead"}).eq("user_id",lead).eq("dept_id",dept);
    if(tasks.length){await service.from("jobs").delete().eq("kind","run_sales_source_review").in("payload->>taskId",tasks);await service.from("sales_source_reviews").delete().in("id",tasks);}
    await service.from("items").delete().in("id",itemIds);await service.from("sources").delete().in("id",sourceIds);
  }
  expect(await counts()).toBe(before);
});

test("검토 실패·근거 없음·조회 오류에서 이전 인용을 표시하지 않는다",async({context,page})=>{
  const {dept}=JSON.parse(readFileSync(".vercel/review-qa/ids.json","utf8"));
  const {password}=JSON.parse(readFileSync(".vercel/review-qa/credentials.json","utf8"));
  await signIn(context,"review-lead@example.test",password);
  const ids=Array.from({length:4},()=>randomUUID());
  const roles=["request","old_quote","new_quote","policy"];
  await page.route("**/sales-review/sources",async route=>{
    if(route.request().method()==="GET") await route.fulfill({json:{candidates:ids.map((id,i)=>({item_id:id,title:"합성 "+i,kind:"document",quote:"합성 기록",is_principles:i===3}))}});
    else await route.fulfill({json:{sources:Object.fromEntries(roles.map((r,i)=>[r,{item_id:ids[i],title:"합성",quote:"합성 기록",href:"/demo",kind:"document",is_principles:i===3}]))}});
  });
  let status="failed",getStatus=200,holdPost=false;
  await page.route("**/sales-review/ai*",async route=>{
    if(route.request().method()==="POST") {
      if(holdPost) return;
      await route.fulfill({status:202,json:{task_id:randomUUID()}});
    } else {
      if(getStatus===0) return;
      await route.fulfill({status:getStatus,json:getStatus===200?{task:{id:randomUUID(),status,result:null}}:{error:"검토를 확인하지 못했습니다. 다시 시도해 주세요."}});
    }
  });
  await page.goto(`${base}/d/${dept}/sales-review`);
  const labels=["고객 요청","기존 견적","변경 견적","영업 원칙"];
  await expect(page.getByRole("combobox",{name:labels[0]}).locator(`option[value="${ids[0]}"]`)).toHaveCount(1);
  for(let i=0;i<4;i++) await page.getByRole("combobox",{name:labels[i]}).selectOption(ids[i]);
  await page.getByRole("button",{name:"원문 나란히 보기"}).click();
  const region=page.locator('[aria-label="사수 원문 근거 검토"]');
  await region.getByRole("button").click();await expect(region).toContainText("완료하지 못했습니다");
  status="refused";await region.getByRole("button").click();await expect(region).toContainText("근거를 선택하지 못했습니다");
  getStatus=500;await region.getByRole("button").click();await expect(region.getByRole("alert")).toContainText("다시 시도");
  await expect(region.locator("blockquote")).toHaveCount(0);
  await page.clock.install();
  getStatus=0;await region.getByRole("button").click();
  await expect(region.getByRole("button")).toBeDisabled();
  await page.clock.fastForward(121_000);
  await expect(region.getByRole("alert")).toContainText("오래 걸려");
  await expect(region.getByRole("button")).toBeEnabled();
  holdPost=true;await region.getByRole("button").click();
  await expect(region.getByRole("button")).toBeDisabled();
  await page.clock.fastForward(121_000);
  await expect(region.getByRole("alert")).toContainText("오래 걸려");
  await expect(page.getByRole("combobox",{name:"고객 요청"})).toBeEnabled();
});
