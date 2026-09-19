import { expect, test } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { missingEnv, SEED_LEAD, signInSeedUser } from "./support/auth";
loadEnvConfig(process.cwd());
const dept="22222222-2222-4222-8222-222222222222", first="11111111-1111-4111-8111-111111111111", second="33333333-3333-4333-8333-333333333333";
test.describe("기간 제한 없는 후속 기능 · 합성 API · 업무 데이터 쓰기 없음",()=>{
  test.beforeEach(async({context,baseURL})=>{
    test.skip(missingEnv(["NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY","SEED_LEAD_EMAIL","SEED_LEAD_PASSWORD"]).length>0,"QA 로그인 필요");
    await signInSeedUser(context,baseURL!,SEED_LEAD);
  });
  for(const width of [1440,390]) {
    test(`Notion 자동 갱신 켜기·중지 ${width}px`,async({page})=>{
      let automatic=false;
      await page.setViewportSize({width,height:1000});
      await page.route(`**/api/d/${dept}/settings`,route=>route.fulfill({json:{current_user_id:first,role:"lead",members:[{user_id:first,display_name:"합성 담당자",role:"lead",slack_user_id:null,consented_at:"2026-09-16T00:00:00Z"}],channels:[],slack_users:[],channels_available:false,sources:[{id:first,kind:"notion_page",external_id:"notion-qa",title:"합성 업무 원칙",visibility:"dept",active:true,auto_sync:automatic,last_synced_at:"2026-09-16T00:00:00Z",last_error:null}]}}));
      await page.route(`**/api/d/${dept}/invites`,route=>route.fulfill({json:{invites:[]}}));
      await page.route(`**/api/d/${dept}/settings/notion`,route=>{const body=route.request().postDataJSON();expect(body.source_id).toBe(first);automatic=body.auto_sync;return route.fulfill({json:{ok:true}})});
      await page.goto(`/d/${dept}/settings`);await page.getByRole("group",{name:"설정 항목 선택"}).getByRole("button",{name:"연결 관리"}).click();
      await page.getByRole("button",{name:"자동 새로 고침 켜기"}).click();await expect(page.getByRole("button",{name:"자동 새로 고침 중지"})).toBeVisible();expect(automatic).toBe(true);
      await page.screenshot({path:`docs/verification/product-continuity-2026-09-16/notion-sync-${width}.png`,fullPage:true});
      await page.getByRole("button",{name:"자동 새로 고침 중지"}).click();await expect(page.getByRole("button",{name:"자동 새로 고침 켜기"})).toBeVisible();expect(automatic).toBe(false);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    });
    test(`질문 기록·후속 질문·새 대화 ${width}px`,async({page})=>{
      await page.setViewportSize({width,height:1000});
      const writes:unknown[]=[];
      await page.route(`**/api/d/${dept}/questions*`,route=>route.fulfill({json:{questions:[{id:first,question:"계약 승인 기준은 무엇인가요?",status:"done",created_at:"2026-09-16T00:00:00Z",parent_id:null}],next:null}}));
      await page.route(`**/api/d/${dept}/answers/*`,route=>route.fulfill({json:{id:route.request().url().split("/").at(-1),status:"done",answer:"담당자 확인 후 승인합니다.",refused:false,citations:[{quote:"담당자 확인 후 승인합니다.",author:"합성 담당자",source:"합성 원칙",href:"#"}]}}));
      await page.route(`**/api/d/${dept}/ask`,route=>{writes.push(route.request().postDataJSON());return route.fulfill({status:202,json:{answer_id:second}})});
      await page.goto(`/d/${dept}/ask`);
      await page.getByRole("region",{name:"내 질문 기록"}).getByRole("button",{name:/계약 승인 기준/}).click();
      await page.getByRole("button",{name:"이어서 질문하기"}).click();
      await expect(page.getByText("이어서 묻는 질문: 계약 승인 기준은 무엇인가요?")).toBeVisible();
      await page.getByLabel("무엇이 궁금한가요?").fill("그럼 담당자는 누구인가요?");
      await page.getByRole("button",{name:"묻기",exact:true}).click();
      await expect(page.locator("article")).toContainText("담당자 확인 후 승인합니다.");
      expect(writes).toEqual([{question:"그럼 담당자는 누구인가요?",parent_id:first}]);
      await page.screenshot({path:`docs/verification/product-continuity-2026-09-16/questions-${width}.png`,fullPage:true});
      await page.getByRole("button",{name:"새 질문으로 시작"}).click();
      await expect(page.getByText(/이어서 묻는 질문:/)).toHaveCount(0);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    });
    test(`결정 정정·원장 이력 ${width}px`,async({page})=>{
      await page.setViewportSize({width,height:1000}); let saved=false;
      const original={id:first,status:"direct",assignee_id:first,assignee_name:"합성 담당자",decided_by_name:"합성 담당자",decided_at:"2026-09-16T00:00:00Z",outcome:"기존 결정 결과",rationale:"기존 판단 근거",lead_time_min:null,has_evidence:false,citations:[],conflicts:[],history:[],can_correct:true};
      await page.route(`**/api/d/${dept}/ledger*`,route=>route.fulfill({json:{members:[],evidenceOptions:[],decisions:[saved?{...original,id:second,outcome:"정정된 결정 결과",rationale:"후속 검토 결과를 반영합니다.",history:[{...original,can_correct:false}]}:original]}}));
      await page.route(`**/api/d/${dept}/decisions/correct`,route=>{
        expect(route.request().postDataJSON()).toMatchObject({previous_id:first,outcome:"정정된 결정 결과",rationale:"후속 검토 결과를 반영합니다."});
        expect(route.request().postDataJSON().correction_id).toMatch(/^[0-9a-f-]{36}$/);
        saved=true; return route.fulfill({status:201,json:{id:second}});
      });
      await page.goto(`/d/${dept}/ledger`); await page.getByText("결정 고치기",{exact:true}).click();
      await page.getByLabel("고친 결정 결과").fill("정정된 결정 결과"); await page.getByLabel("왜 고치나요").fill("후속 검토 결과를 반영합니다.");
      await page.getByRole("button",{name:"고친 결정 남기기"}).click();
      await expect(page.getByRole("heading",{name:"정정된 결정 결과"})).toBeVisible();
      await page.getByText("정정 이력 1건",{exact:true}).click();
      await expect(page.getByRole("heading",{name:"기존 결정 결과"})).toBeVisible();
      await page.screenshot({path:`docs/verification/product-continuity-2026-09-16/correction-${width}.png`,fullPage:true});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    });
    test(`알림 예약·취소 ${width}px`,async({page,context,baseURL})=>{
      const {supabase}=await signInSeedUser(context,baseURL!,SEED_LEAD);
      const cards=await supabase.from("decision_requests").select("id").eq("dept_id",dept).in("status",["open","deferred"]).limit(1);
      test.skip(!cards.data?.length,"읽기 가능한 미완료 QA 카드 필요");
      const card=cards.data![0].id; let scheduled:string|null=null;
      await page.setViewportSize({width,height:1000});
      await page.route(`**/api/d/${dept}/cards/${card}/reminder`,route=>{
        if(route.request().method()==="POST") {scheduled=route.request().postDataJSON().scheduled_for;return route.fulfill({json:{ok:true}})}
        return route.fulfill({json:{reminders:scheduled?[{id:first,kind:"manual",state:"pending",scheduled_for:scheduled}]:[]}});
      });
      await page.goto(`/d/${dept}/cards/${card}`);
      await page.getByLabel("알림 시각 (한국 시간)").fill("2026-09-17T14:00");
      await page.getByRole("button",{name:"알림 예약"}).click();
      await expect(page.getByText(/예약 알림.*예약됨/)).toBeVisible(); expect(scheduled).toBe("2026-09-17T05:00:00.000Z");
      await page.screenshot({path:`docs/verification/product-continuity-2026-09-16/reminder-${width}.png`,fullPage:true});
      await page.getByRole("button",{name:"예약 취소"}).click(); await expect(page.getByRole("button",{name:"예약 취소"})).toHaveCount(0);expect(scheduled).toBeNull();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    });
  }
});
