import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { serviceClient, signInSeedUser, SEED_LEAD } from "./support/auth";

const sales="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",dev="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const evidence="docs/verification/plain-language-audit-2026-09-19";
const pages=[
  ["dashboard",`/demo/d/${sales}`],["card",`/demo/d/${sales}/cards/10000000-0000-4000-8000-000000000121`],
  ["ledger",`/demo/d/${sales}/ledger`],["ask",`/demo/d/${sales}/ask?q=vendor-price`],
  ["reviews",`/demo/d/${dev}/reviews`],["documents",`/demo/d/${sales}/documents`],
  ["roles",`/demo/d/${sales}/roles`],["retention",`/demo/d/${sales}/retention`],
  ["settings",`/demo/d/${sales}/settings`],["notion","/demo/notion"],["admin","/demo/admin"],
  ["trailers",`/demo/d/${dev}/trailers`],["demo","/demo?demo=public"],["features","/demo/features"],["hiring","/demo/hiring"],
  ["login","/login"],["not-found","/plain-language-missing-page"],["privacy","/privacy"],["home","/"],
] as const;
test.skip(!/^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.NEXT_PUBLIC_SUPABASE_URL??""),"로컬 합성 데이터에서만 검증");
for(const width of [1440,390])test(`쉬운말 19화면 ${width}`,async({page})=>{
  test.setTimeout(180000);mkdirSync(evidence,{recursive:true});
  await page.setViewportSize({width,height:width===1440?900:844});
  const writes:string[]=[],errors:string[]=[],measurements:unknown[]=[];
  page.on("pageerror",error=>errors.push(error.name));
  page.on("request",request=>{const path=new URL(request.url()).pathname;if(!path.startsWith("/__nextjs_")&&!["GET","HEAD","OPTIONS"].includes(request.method()))writes.push(path);});
  for(const [name,url]of pages) {
    const response=await page.goto(url);await page.locator("h1").first().waitFor();await page.evaluate(()=>document.fonts.ready);
    const measure=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,firstCardTop:document.querySelector('.decision-card')?.getBoundingClientRect().top??null,mainTop:document.querySelector('#workspace-main main')?.getBoundingClientRect().top??null}));
    measurements.push({name,status:response?.status(),...measure});
    if(measure.overflow)errors.push(`${name}:horizontal_overflow`);
    if(name==="dashboard"&&width===390&&(measure.firstCardTop===null||measure.firstCardTop>=200))errors.push("dashboard:first_card_below_200");
    if(response?.status()!==(name==="not-found"?404:200))errors.push(`${name}:status`);
    writeFileSync(`${evidence}/text-${name}.txt`,await page.locator("body").innerText());
    await page.screenshot({path:`${evidence}/${name}-${width}.png`,fullPage:true});
  }
  writeFileSync(`${evidence}/screens-${width}.json`,JSON.stringify({at:new Date().toISOString(),width,measurements,writes,errors},null,2));
  expect(writes).toEqual([]);expect(errors).toEqual([]);
});
test("단건 원문은 목록 필터 밖에서도 열리고 다른 부서 원문은 숨긴다",async({page,context,baseURL})=>{
  const admin=serviceClient();const owner=await signInSeedUser(context,baseURL!,SEED_LEAD);
  const org=randomUUID(),dept=randomUUID(),other=randomUUID(),source=randomUUID(),hiddenSource=randomUUID(),item=randomUUID(),hiddenItem=randomUUID();
  expect((await admin.from("orgs").insert({id:org,name:"합성 원문 검증"})).error).toBeNull();
  try {
    expect((await admin.from("departments").insert([{id:dept,org_id:org,name:"원문 부서"},{id:other,org_id:org,name:"다른 부서"}])).error).toBeNull();
    expect((await admin.from("members").insert({dept_id:dept,user_id:owner.session.user.id,role:"lead",display_name:"합성 작성자",consented_at:new Date().toISOString()})).error).toBeNull();
    expect((await admin.from("sources").insert([{id:source,dept_id:dept,kind:"document",external_id:"plain-visible",title:"직접 여는 합성 원문",visibility:"dept"},{id:hiddenSource,dept_id:other,kind:"document",external_id:"plain-hidden",title:"다른 부서 원문",visibility:"dept"}])).error).toBeNull();
    expect((await admin.from("items").insert([{id:item,dept_id:dept,source_id:source,external_ref:"old-unclassified",content:"이 기록은 목록의 기본 분류 밖에 있습니다.",author:"합성 작성자",spoken_at:"2026-01-01T00:00:00Z"},{id:hiddenItem,dept_id:other,source_id:hiddenSource,external_ref:"hidden",content:"다른 부서의 숨긴 합성 기록",author:"합성 작성자"}])).error).toBeNull();
    const opened=await page.goto(`/d/${dept}?item=${item}#item-${item}`);expect(opened?.status()).toBe(200);
    await expect(page.getByText("이 기록은 목록의 기본 분류 밖에 있습니다.",{exact:true})).toBeVisible();
    await page.goto(`/d/${dept}?item=${hiddenItem}`);await expect(page.locator("body")).not.toContainText("다른 부서의 숨긴 합성 기록");
    await expect(page.getByRole("heading",{level:1})).toHaveText("이 주소에는 페이지가 없습니다");
  } finally {await admin.from("orgs").delete().eq("id",org);}
});

test("판단 근거는 최신 출처만 펴고 검색·단일 선택을 지원한다",async({page})=>{
  await page.goto(`/demo/d/${sales}/ledger`);
  const picker=page.getByRole("group",{name:"판단 근거 선택",exact:true});
  await expect(picker).toBeVisible();
  expect(await picker.locator("details").count()).toBeGreaterThan(1);
  await expect(picker.locator("details[open]")).toHaveCount(1);
  const radio=picker.getByRole("radio").first();await radio.check();
  await expect(picker.getByText("선택한 근거:",{exact:false})).toBeVisible();
  const text=await radio.locator("..").innerText();
  await picker.getByLabel("출처·본문 검색").fill(text.trim().slice(0,12));
  await expect(picker.getByRole("radio").first()).toBeVisible();
  await picker.getByRole("radio").first().check();
  await expect(picker.locator('input[type="radio"]:checked')).toHaveCount(1);
  await picker.getByLabel("출처·본문 검색").fill("없는근거-QA-7492");
  await expect(picker.getByText("찾는 근거가 없습니다. 다른 말로 검색해 보세요.")).toBeVisible();
  await expect(picker.getByText("선택한 근거:",{exact:false})).toBeVisible();
});
