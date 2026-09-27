import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
test("합성 회고 체험은 필터·근거·복사만 제공하며 쓰기가 없다",async({page,context})=>{
  const writes:string[]=[];page.on("request",r=>{if(!["GET","HEAD","OPTIONS"].includes(r.method())||/\/api\/jobs|groq\.com/.test(r.url()))writes.push(r.method());});
  const response=await page.goto("/demo/retros");test.skip(response?.status()===404,"회고 기능이 꺼진 서버");
  await context.grantPermissions(["clipboard-read","clipboard-write"]);
  await expect(page.getByRole("heading",{name:"개발 회고 체험"})).toBeVisible();
  await expect(page.getByRole("button",{name:"사수 활동만으로 만들기"})).toBeDisabled();
  const evidence="docs/verification/daily-retro-2026-09-19";mkdirSync(evidence,{recursive:true});
  for(const width of [1440,390]){await page.setViewportSize({width,height:960});await page.screenshot({path:`${evidence}/demo-retros-${width}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);}
  await page.getByLabel("제목·주제 검색").fill("15일");await expect(page.getByRole("article").first()).toBeVisible();await expect(page.getByRole("article")).toContainText(Array(await page.getByRole("article").count()).fill("15일"));
  await page.getByRole("article").first().getByRole("button").click();
  await expect(page.getByRole("button",{name:"확정",exact:true})).toBeDisabled();await expect(page.getByRole("button",{name:"삭제",exact:true})).toBeDisabled();
  await page.getByRole("checkbox").first().check();
  await page.getByText("내보내기",{exact:true}).click();await page.getByRole("button",{name:".md 파일 복사"}).click();
  await expect(page.getByRole("alert").filter({hasText:".md 파일을 복사했습니다."})).toContainText("복사했습니다");expect(await page.evaluate(()=>navigator.clipboard.readText())).toContain("[^A1]");expect(writes).toEqual([]);
});
