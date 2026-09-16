import { expect, test } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { missingEnv, signInSeedUser } from "./support/auth";
loadEnvConfig(process.cwd());
test.describe("Slack 설치 화면 · 합성 API · 외부 설치 없음",()=>{
  test.beforeEach(async({context,baseURL})=>{
    test.skip(process.env.E2E_CONTINUITY_ADMIN!=="1"||missingEnv(["SEED_ORG_ADMIN_EMAIL","SEED_ORG_ADMIN_PASSWORD"]).length>0,"관리자 on 서버와 QA 로그인 필요");
    await signInSeedUser(context,baseURL!,{emailEnv:"SEED_ORG_ADMIN_EMAIL",passwordEnv:"SEED_ORG_ADMIN_PASSWORD"});
  });
  for(const width of [1440,390]) test(`설치 시작·완료 안내·재연결 ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:1000}); let installed=false,starts=0;
    await page.route("**/api/admin/slack",route=>route.fulfill({json:{configured:true,installation:installed?{team_id:"TQA",team_name:"합성 고객사",active:true,installed_at:"2026-09-16T00:00:00Z"}:null}}));
    await page.route("**/api/slack/oauth/start",route=>{starts++;expect(route.request().method()).toBe("POST");installed=true;return route.fulfill({status:303,headers:{location:"/admin/sources?slack=installed"},body:""})});
    await page.goto("/admin/sources");await page.getByRole("button",{name:"Slack에 사수 설치"}).click();
    await expect(page.getByText(/^Slack 설치가 완료되었습니다/)).toBeVisible();
    await expect(page.getByText("합성 고객사 · 연결됨")).toBeVisible();await expect(page.getByRole("button",{name:"Slack 다시 연결"})).toBeVisible();expect(starts).toBe(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`docs/verification/product-continuity-2026-09-16/slack-installation-${width}.png`,fullPage:true});
  });
});
