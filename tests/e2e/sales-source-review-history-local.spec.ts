import {createHash,randomUUID} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {createClient} from "@supabase/supabase-js";
import {expect,test,type BrowserContext} from "@playwright/test";

const base=process.env.E2E_BASE_URL??"",url=process.env.NEXT_PUBLIC_SUPABASE_URL??"";
test.skip(process.env.E2E_REVIEW_LIVE!=="1" || base!=="http://localhost:3011" || !/^http:\/\/(localhost|127\.0\.0\.1):/.test(url),"isolated local synthetic only");
const ids=()=>JSON.parse(readFileSync(".vercel/review-qa/ids.json","utf8"));
async function signIn(context:BrowserContext,email="review-lead@example.test") {
  const {password}=JSON.parse(readFileSync(".vercel/review-qa/credentials.json","utf8"));
  const client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false}});
  const result=await client.auth.signInWithPassword({email,password});
  if(result.error||!result.data.session)throw Error("local_login_failed");
  await context.addCookies([{name:`sb-${new URL(url).hostname.split(".")[0]}-auth-token`,value:`base64-${Buffer.from(JSON.stringify(result.data.session)).toString("base64url")}`,url:base,httpOnly:true,secure:false,sameSite:"Lax"}]);
}

test("본인 이력 20건·동일시각 더 보기·재접속 재열람·현재 원문과 권한·무쓰기",async({context,page,browser})=>{
  test.setTimeout(90_000);
  const {dept,lead,member,other}=ids();
  const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
  const sources=Array.from({length:4},()=>randomUUID()),items=Array.from({length:4},()=>randomUUID());
  const tasks=Array.from({length:22},()=>randomUUID()).sort().reverse(),foreign=[randomUUID(),randomUUID()];
  const texts=["합성 고객 요청\n\n금액과 납기를 확인해 주세요.","합성 기존 견적\n\n가격은 1,000원입니다.","합성 변경 견적\n\n가격은 1,200원입니다.\n할인은 승인되지 않았습니다.","합성 영업 원칙\n\n가격 변경은 팀장 승인 후 확정합니다."];
  const hashes=texts.map(t=>createHash("sha256").update(t).digest("hex"));
  const time=new Date(Date.now()+60_000).toISOString().replace(/\.\d{3}Z$/,".123456Z");
  const chosen={topics:[{topic:"price",selections:[{evidence:3,first_paragraph:2,last_paragraph:2},{evidence:4,first_paragraph:2,last_paragraph:2}]}]};
  const row=(id:string,owner=lead,department=dept,status="ready")=>({id,requested_by:owner,dept_id:department,client_request_id:randomUUID(),item_ids:items,versions:hashes,status,result:status==="ready"?chosen:null,created_at:time});
  const endpoint=`${base}/api/d/${dept}/sales-review/history`,detail=`${base}/api/d/${dept}/sales-review/ai`;
  const counts=async()=>{
    const tables=["sales_source_reviews","sales_review_tasks","jobs","llm_calls"];
    return Object.fromEntries(await Promise.all(tables.map(async table=>{const r=await service.from(table).select("id",{count:"exact",head:true});expect(r.error).toBeNull();return [table,r.count];})));
  };
  try {
    expect((await service.from("sources").insert(sources.map((id,i)=>({id,dept_id:dept,kind:"document",title:"phase42 합성 "+i,external_id:"phase42:"+id,visibility:"leads_only",is_principles:i===3,active:true})))).error).toBeNull();
    expect((await service.from("items").insert(items.map((id,i)=>({id,source_id:sources[i],dept_id:dept,external_ref:"phase42:"+id,content:texts[i]})))).error).toBeNull();
    const statuses=["ready","failed","refused","queued","processing"];
    expect((await service.from("sales_source_reviews").insert([...tasks.map((id,i)=>row(id,lead,dept,statuses[i]??"ready")),row(foreign[0],member),row(foreign[1],lead,other)])).error).toBeNull();
    const before=await counts();
    await signIn(context);
    const first=await page.request.get(endpoint);expect(first.status()).toBe(200);expect(first.headers()["cache-control"]).toContain("no-store");
    const firstBody=await first.json();expect(firstBody.tasks.map((r:{id:string})=>r.id)).toEqual(tasks.slice(0,20));
    expect(Object.keys(firstBody.tasks[0]).sort()).toEqual(["created_at","id","status"]);
    const cursor=new URLSearchParams({before_created_at:firstBody.next_cursor.created_at,before_id:firstBody.next_cursor.id});
    const next=await (await page.request.get(endpoint+"?"+cursor)).json();expect(next.tasks.map((r:{id:string})=>r.id)).toEqual(tasks.slice(20));expect(next.next_cursor).toBeNull();
    for(const id of foreign)expect((await page.request.get(detail+"?task_id="+id)).status()).toBe(404);
    await page.goto(`${base}/d/${dept}/sales-review`);
    const history=page.getByRole("region",{name:"본인 원문 검토 이력"});
    await expect(history.getByRole("button",{name:"다시 열기"})).toHaveCount(20);
    for(const label of ["근거 준비됨","검토 실패","근거를 찾지 못함","검토 대기","검토 중"])await expect(history).toContainText(label);
    await history.getByRole("button",{name:"이력 더 보기"}).click();await expect(history.getByRole("button",{name:"다시 열기"})).toHaveCount(22);
    await history.getByRole("button",{name:"다시 열기"}).nth(1).click();await expect(history.getByRole("alert")).toContainText("완료하지 못했습니다");
    await history.getByRole("button",{name:"다시 열기"}).nth(2).click();await expect(history).toContainText("근거를 선택하지 못했습니다");
    await history.getByRole("button",{name:"다시 열기"}).first().click();
    const opened=history.getByRole("region",{name:"이력에서 연 검토"});
    await expect(opened).toContainText("할인은 승인되지 않았습니다.");
    await expect(opened).toBeFocused();await expect(opened).toBeInViewport();
    await expect(opened.getByRole("button",{name:/사수로|사수 검토 다시/})).toHaveCount(0);
    await page.reload();await expect(history.getByRole("button",{name:"다시 열기"})).toHaveCount(20);await expect(opened).toHaveCount(0);
    await history.getByRole("button",{name:"다시 열기"}).first().click();await expect(opened).toContainText("할인은 승인되지 않았습니다.");
    const href=await opened.getByRole("link",{name:"원문에서 확인"}).first().getAttribute("href");
    const original=await context.newPage();await original.goto(base+href);await expect(original.locator("body")).toContainText(texts[2]);await original.close();
    // Explicit focus refresh removes old detail, then re-open a current task.
    await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await expect(opened).toHaveCount(0);
    await expect(history.getByRole("button",{name:"다시 열기"})).toHaveCount(20);
    await history.getByRole("button",{name:"다시 열기"}).first().click();await expect(opened).toContainText("할인은 승인되지 않았습니다.");
    await history.screenshot({path:"docs/verification/sales-source-review-history-2026-10-01.png"});
    await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await history.screenshot({path:"docs/verification/sales-source-review-history-2026-10-01-mobile.png"});
    const afterRead=await counts();expect(afterRead).toEqual(before);
    const memberContext=await browser.newContext();
    try {await signIn(memberContext,"review-member@example.test");expect((await memberContext.request.get(endpoint)).status()).toBe(403);}
    finally{await memberContext.close();}
    expect((await service.from("items").update({content:texts[2]+"\n변경"}).eq("id",items[2])).error).toBeNull();
    const hidden=await (await page.request.get(endpoint)).json();expect(hidden).toEqual({tasks:[],next_cursor:null});
    expect((await page.request.get(detail+"?task_id="+tasks[0])).status()).toBe(404);
    await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await expect(opened).toHaveCount(0);await expect(history.getByRole("button",{name:"다시 열기"})).toHaveCount(0);
    await expect(history).toContainText("현재 볼 수 있는 검토 이력이 없습니다");await expect(history).not.toContainText("제외");
    expect((await service.from("items").update({content:texts[2]}).eq("id",items[2])).error).toBeNull();
    // The same current-input RLS protects list and detail after source lifecycle changes.
    const assertHidden=async()=>{
      expect(await (await page.request.get(endpoint)).json()).toEqual({tasks:[],next_cursor:null});
      expect((await page.request.get(detail+"?task_id="+tasks[0])).status()).toBe(404);
    };
    try {
      expect((await service.from("sources").update({active:false}).eq("id",sources[0])).error).toBeNull();await assertHidden();
    } finally {await service.from("sources").update({active:true}).eq("id",sources[0]);}
    try {
      expect((await service.from("sources").update({is_principles:false}).eq("id",sources[3])).error).toBeNull();await assertHidden();
    } finally {await service.from("sources").update({is_principles:true}).eq("id",sources[3]);}
    try {
      expect((await service.from("items").update({deleted_at:new Date().toISOString()}).eq("id",items[0])).error).toBeNull();await assertHidden();
    } finally {expect((await service.from("items").update({deleted_at:null,content:texts[0]}).eq("id",items[0])).error).toBeNull();}
    const consent=await service.from("members").select("consented_at").eq("user_id",lead).eq("dept_id",dept).single();expect(consent.error).toBeNull();
    try {
      expect((await service.from("members").update({consented_at:null}).eq("user_id",lead).eq("dept_id",dept)).error).toBeNull();
      expect((await page.request.get(endpoint)).status()).toBe(403);expect((await page.request.get(detail+"?task_id="+tasks[0])).status()).toBe(403);
    } finally {await service.from("members").update({consented_at:consent.data!.consented_at}).eq("user_id",lead).eq("dept_id",dept);}
    await history.getByRole("button",{name:"이력 새로고침"}).click();await expect(history.getByRole("button",{name:"다시 열기"})).toHaveCount(20);
    await history.getByRole("button",{name:"다시 열기"}).first().click();await expect(opened).toContainText("할인은 승인되지 않았습니다.");
    expect((await service.from("members").update({role:"member"}).eq("user_id",lead).eq("dept_id",dept)).error).toBeNull();
    const beforeRevokedRead=await counts();
    expect((await page.request.get(endpoint)).status()).toBe(403);
    await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await expect(opened).toHaveCount(0);await expect(history.getByRole("button",{name:"다시 열기"})).toHaveCount(0);await expect(history.getByRole("alert")).toContainText("동의한 팀장만");
    const afterRevokedRead=await counts();expect(afterRevokedRead).toEqual(beforeRevokedRead);
    writeFileSync("docs/verification/sales-source-review-history-2026-10-01-runtime.json",JSON.stringify({environment:"isolated-local-synthetic",checks:["same_time_keyset_20_plus_2","owner_department_guard","five_statuses","revisit_reopen","exact_quote_link","read_only_no_post","focus_clears","390px","content_change_hides_list_detail","inactive_deleted_unprincipled_hides","current_consent_role_revocation","no_excluded_count"],counts_before:before,counts_after:afterRead,revoked_read_before:beforeRevokedRead,revoked_read_after:afterRevokedRead,note:"Source fixture mutations may enqueue existing classify jobs; read-only count windows exclude fixture setup/mutations."},null,2));
  } finally {
    await service.from("members").update({role:"lead"}).eq("user_id",lead).eq("dept_id",dept);
    await service.from("sales_source_reviews").delete().in("id",[...tasks,...foreign]);
    await service.from("jobs").delete().eq("kind","classify").in("payload->>itemId",items);
    await service.from("items").delete().in("id",items);await service.from("sources").delete().in("id",sources);
  }
});

test("이력 조회 실패·시간초과·늦은 응답과 상세 재열람 시간초과에서 표시·잠금 회복",async({context,page})=>{
  const {dept}=ids();await signIn(context);
  const taskId=randomUUID(),lateId=randomUUID();let mode="ready";
  const one={id:taskId,created_at:"2026-10-01T00:00:00Z",status:"ready"};
  let delayedResolve:(()=>void)|undefined;
  const delayed=new Promise<void>(resolve=>{delayedResolve=resolve;});
  await page.route("**/sales-review/history*",async route=>{
    const current=mode;
    if(current==="hold")return;
    if(current==="late") {await delayed;await route.fulfill({json:{tasks:[{...one,id:lateId,status:"failed"}],next_cursor:null}}).catch(()=>{});return;}
    if(current==="error")await route.fulfill({status:500,json:{error:"검토 이력을 불러오지 못했습니다. 다시 시도해 주세요."}});
    else await route.fulfill({json:{tasks:[one],next_cursor:current==="more"?{id:one.id,created_at:one.created_at}:null}});
  });
  let detailMode="ready";
  const requests:string[]=[];
  await page.route("**/sales-review/ai*",async route=>{
    requests.push(route.request().method());
    if(detailMode==="hold")return;
    if(detailMode==="revoked"){await route.fulfill({status:404,json:{error:"현재 확인할 수 없는 검토입니다."}});return;}
    await route.fulfill({json:{task:{id:taskId,status:"ready",result:{status:"ready",topics:[{id:"price",label:"가격",question:"가격을 확인해 주세요.",evidence:[{source_id:"S3",role:"new_quote",title:"합성",quote:"할인은 승인되지 않았습니다.",href:"/demo"}]}]}}}});
  });
  await page.goto(`${base}/d/${dept}/sales-review`);
  const history=page.getByRole("region",{name:"본인 원문 검토 이력"}),opened=history.getByRole("region",{name:"이력에서 연 검토"});
  await history.getByRole("button",{name:"다시 열기"}).click();await expect(opened).toContainText("할인은 승인되지 않았습니다.");
  mode="error";await history.getByRole("button",{name:"이력 새로고침"}).click();await expect(opened).toHaveCount(0);await expect(history.getByRole("button",{name:"다시 열기"})).toHaveCount(0);await expect(history.getByRole("alert")).toContainText("다시 시도");
  mode="more";await history.getByRole("button",{name:"이력 새로고침"}).click();await expect(history.getByRole("button",{name:"이력 더 보기"})).toBeVisible();
  mode="error";await history.getByRole("button",{name:"이력 더 보기"}).click();await expect(history.getByRole("button",{name:"다시 열기"})).toHaveCount(0);await expect(history.getByRole("alert")).toContainText("다시 시도");
  await page.clock.install();mode="hold";await history.getByRole("button",{name:"이력 새로고침"}).click();await expect(history.getByRole("status")).toContainText("불러오고");await page.clock.fastForward(31_000);await expect(history.getByRole("alert")).toContainText("오래 걸려");await expect(history.getByRole("status")).toHaveCount(0);
  mode="late";await history.getByRole("button",{name:"이력 새로고침"}).click();await expect(history.getByRole("status")).toContainText("불러오고");
  mode="ready";await history.getByRole("button",{name:"이력 새로고침"}).click();await expect(history.getByRole("button",{name:"다시 열기"})).toHaveCount(1);delayedResolve!();await page.clock.fastForward(100);await expect(history).not.toContainText("검토 실패");
  detailMode="hold";await history.getByRole("button",{name:"다시 열기"}).click();await expect(opened.getByRole("status")).toContainText("결과를 확인");
  await page.clock.fastForward(121_000);await expect(opened.getByRole("alert")).toContainText("오래 걸려");await expect(opened.locator("blockquote")).toHaveCount(0);
  detailMode="ready";await history.getByRole("button",{name:"다시 열기"}).click();await expect(opened).toContainText("할인은 승인되지 않았습니다.");
  detailMode="revoked";await history.getByRole("button",{name:"다시 열기"}).click();await expect(opened).toHaveCount(0);await expect(history).toContainText("현재 확인할 수 없는 검토");await expect(history.locator("blockquote")).toHaveCount(0);
  expect(requests.length).toBeGreaterThan(0);expect(requests.every(method=>method==="GET")).toBe(true);
});

test("취소한 상세의 늦은 권한 오류가 새로 연 검토를 지우지 않는다",async({context,page})=>{
  const {dept}=ids();await signIn(context);
  const a=randomUUID(),b=randomUUID();
  await page.addInitScript(({a})=>{
    const original=window.fetch.bind(window);
    window.fetch=(input,init)=>{
      if(String(input).includes("/sales-review/ai?task_id="+a)) {
        return new Promise<Response>(resolve=>{
          (window as unknown as {releaseOld:()=>void}).releaseOld=()=>resolve(new Response(JSON.stringify({error:"현재 확인할 수 없는 검토입니다."}),{status:404,headers:{"content-type":"application/json"}}));
        });
      }
      return original(input,init);
    };
  },{a});
  let listReads=0;
  await page.route("**/sales-review/history*",async route=>{listReads++;await route.fulfill({json:{tasks:[a,b].map(id=>({id,created_at:"2026-10-01T00:00:00Z",status:"ready"})),next_cursor:null}});});
  await page.route("**/sales-review/ai*",async route=>{await route.fulfill({json:{task:{id:b,status:"ready",result:{status:"ready",topics:[{id:"price",label:"가격",question:"가격을 확인해 주세요.",evidence:[{source_id:"S3",role:"new_quote",title:"새 합성 검토",quote:"새 검토 근거는 승인 대기입니다.",href:"/demo"}]}]}}}});});
  await page.goto(`${base}/d/${dept}/sales-review`);
  const history=page.getByRole("region",{name:"본인 원문 검토 이력"}),opened=history.getByRole("region",{name:"이력에서 연 검토"});
  await expect(history.getByRole("button",{name:"다시 열기"})).toHaveCount(2);
  await history.getByRole("button",{name:"다시 열기"}).first().click();await expect(opened.getByRole("status")).toContainText("결과를 확인");
  await expect.poll(()=>page.evaluate(()=>typeof (window as unknown as {releaseOld?:unknown}).releaseOld)).toBe("function");
  await history.getByRole("button",{name:"다시 열기"}).nth(1).click();await expect(opened).toContainText("새 검토 근거는 승인 대기입니다.");
  const before=listReads;
  await page.evaluate(async()=>{(window as unknown as {releaseOld:()=>void}).releaseOld();await new Promise(resolve=>setTimeout(resolve,50));});
  await expect(opened).toContainText("새 검토 근거는 승인 대기입니다.");expect(listReads).toBe(before);await expect(history).not.toContainText("현재 확인할 수 없는 검토");
});
