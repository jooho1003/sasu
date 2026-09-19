import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { serviceClient, signInSeedUser, SEED_LEAD, requiredEnv } from "./support/auth";
import { trailerScenarios } from "../../fixtures/trailer/scenarios";
import { DEFAULT_TRAILER_RUBRIC } from "../../lib/trailer-generation";

const dept = "22222222-2222-4222-8222-222222222222";
const trailer = "33333333-3333-4333-8333-333333333333";

test("A: 초대 플래그가 꺼진 배포에서는 지원자 링크 API가 열리지 않는다", async ({ request }) => {
  test.skip(process.env.E2E_TRAILER_INVITES === "1", "활성 QA는 B에서 검증");
  const response = await request.get(`/api/d/${dept}/trailers/${trailer}/invites`);
  expect(response.status()).toBe(404);
});

test.describe("B: QA 조직의 발급·목록·철회", () => {
  test.skip(process.env.E2E_TRAILER_INVITES !== "1" || !/^http:\/\/(localhost|127\.0\.0\.1):/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""), "B 그룹은 실제 로컬 QA만 사용합니다.");

  test("발급·동의·3퀘스트·실제 채점·부서장 점수표·철회", async ({page,context,browser,baseURL}) => {
    test.setTimeout(240000);
    const service=serviceClient(), org=randomUUID(), dept=randomUUID(), trailer=randomUUID();
    const lead=await signInSeedUser(context,baseURL!,SEED_LEAD);
    expect((await service.from("orgs").insert({id:org,name:"합성 지원자 QA",trailer_publish_enabled:true,trailer_assessment_enabled:true})).error).toBeNull();
    expect((await service.from("departments").insert({id:dept,org_id:org,name:"지원자 QA"})).error).toBeNull();
    expect((await service.from("members").insert({dept_id:dept,user_id:lead.session.user.id,role:"lead",display_name:"합성 채용 담당자",consented_at:new Date().toISOString()})).error).toBeNull();
    const seeded=await service.from("trailers").insert({id:trailer,dept_id:dept,status:"published",source_decision_ids:[randomUUID()],scenarios:trailerScenarios,rubric:DEFAULT_TRAILER_RUBRIC,slug:randomUUID().replaceAll("-","").slice(0,22)}).select("scenarios_hash").single();
    expect(seeded.error).toBeNull();expect((await service.from("trailers").update({gate_passed_hash:seeded.data!.scenarios_hash,approval_hash:seeded.data!.scenarios_hash}).eq("id",trailer)).error).toBeNull();
    const candidate=await browser.newContext(), guest=await candidate.newPage();
    const evidence="docs/verification/trailer-candidate-links-2026-09-19";mkdirSync(evidence,{recursive:true});
    const email="synthetic-candidate@example.test";
    try {
      const issue=await context.request.post(`/api/d/${dept}/trailers/${trailer}/invites`,{data:{emails:[email]}});expect(issue.status()).toBe(200);
      const invite=(await issue.json()).invites[0];
      await guest.goto(`${baseURL}/t/i/${invite.token}`);await guest.getByLabel("이메일 주소").fill(email);await guest.getByRole("button",{name:"확인",exact:true}).click();
      await expect(guest.getByRole("button",{name:"동의하고 시작"})).toBeDisabled();
      await guest.setViewportSize({width:390,height:844});await guest.screenshot({path:`${evidence}/candidate-consent-390.png`,fullPage:true});await guest.setViewportSize({width:1440,height:960});
      await guest.getByRole("checkbox").check();await guest.getByRole("button",{name:"동의하고 시작"}).click();
      await guest.getByRole("button",{name:"오피스 입장하기"}).click();await guest.getByRole("button",{name:"목록형 모드로 전환"}).click();
      const detail=guest.getByRole("region",{name:"장소 상세"});
      const visit=async(name:string)=>{if(await guest.getByRole("dialog").isVisible()) await guest.getByRole("button",{name:"닫고 오피스로 돌아가기"}).click();await guest.getByRole("navigation",{name:"오피스 장소",exact:true}).getByRole("button",{name:new RegExp(name)}).click();};
      for(let index=0;index<3;index++){
        await visit("서고");await visit("팀장실");await detail.getByRole("checkbox").first().check();await detail.getByRole("radio").first().check();
        await detail.getByLabel("결정 이유").fill("공개된 업무 기준을 확인하고 일정과 협업의 영향을 비교해 결정했습니다.");
        await detail.getByRole("button",{name:"결정하고 기록실 열기"}).click();
        await detail.getByRole("button",{name:index===2?"최종 제출":"다음 퀘스트"}).click();
      }
      await expect(guest.getByRole("heading",{name:"제출이 끝났습니다"})).toBeVisible();
      await guest.screenshot({path:`${evidence}/candidate-submitted.png`,fullPage:true});
      const worker=await context.request.post("/api/jobs/run",{headers:{"x-jobs-secret":requiredEnv("JOBS_TRIGGER_SECRET")},timeout:120000});expect(worker.status()).toBe(200);
      await expect.poll(async()=>{const row=await service.from("trailer_attempts").select("status").eq("invite_id",invite.invite_id).maybeSingle();return row.data?.status;},{timeout:120000,intervals:[2000]}).toBe("scored");
      await page.goto(`/d/${dept}/trailers/${trailer}`);await page.getByRole("tab",{name:"지원자 제출",exact:true}).click();
      await expect(page.getByText(email,{exact:false})).toBeVisible();await expect(page.getByRole("button",{name:/점수순/})).toHaveCount(0);
      await page.screenshot({path:`${evidence}/lead-scores.png`,fullPage:true});
      guest.once("dialog",dialog=>dialog.accept());
      await guest.getByRole("button",{name:"내 제출 철회"}).click();await expect(guest.getByRole("heading",{name:"제출 철회",exact:true})).toBeVisible();
      expect((await service.from("trailer_attempts").select("id").eq("invite_id",invite.invite_id)).data).toEqual([]);
      const purged=await service.from("trailer_invites").select("email_normalized,email_hash,withdrawn_at").eq("id",invite.invite_id).single();expect(purged.data).toMatchObject({email_normalized:null,email_hash:null});expect(purged.data?.withdrawn_at).toBeTruthy();
      expect(await guest.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}))).toEqual({local:0,session:0});
      const calls=await service.from("llm_calls").select("id",{count:"exact",head:true}).eq("dept_id",dept).eq("purpose","trailer_score");expect(calls.count).toBeGreaterThanOrEqual(1);
      writeFileSync(`${evidence}/live-results.json`,JSON.stringify({database:"local Supabase",quests:3,scoreCalls:calls.count,withdrawalPurged:true},null,2));
    } finally {await candidate.close();await service.from("trailers").delete().eq("id",trailer);}
  });
});
