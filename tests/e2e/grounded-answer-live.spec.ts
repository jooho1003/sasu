import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { embedTexts, formatVector } from "../../lib/embeddings";
import { answerLead } from "../../lib/answer-grounding";
import { SEED_LEAD, SEED_MEMBER, serviceClient, signInSeedUser } from "./support/auth";

// Opt-in, actual local Postgres/Auth/Next/Groq/Voyage. No intercepted responses.
test.skip(process.env.E2E_REVIEW_LIVE !== "1", "Run through scripts/review-qa.mjs grounded-answer-test");
test.setTimeout(240_000);
const output = "docs/verification/grounded-answer-selection-2026-09-23/live";
type Answer = { id: string; status: string; answer: string; citations: { quote: string; href: string }[] };

test("실제 DB: 질문 → 오래된 결정·문서·회의 원문 → 재열람·권한 차단", async ({ browser, context, page, baseURL }) => {
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):/);
  expect(baseURL).toBe("http://localhost:3011");
  mkdirSync(output, { recursive: true });
  const startedAt = new Date().toISOString();
  const ids = JSON.parse(readFileSync(".vercel/review-qa/ids.json", "utf8"));
  const dept = randomUUID(), source = randomUUID(), meetingSource = randomUUID(), privateSource = randomUUID();
  const item = randomUUID(), meetingItem = randomUUID(), privateItem = randomUUID(), oldDecision = randomUUID();
  const educationItem = randomUUID();
  const db = serviceClient(); // Synthetic fixture setup and evidence inspection only.
  const checked = async (result: { error: { code?: string } | null }) => {
    if (result.error) throw new Error(`fixture_database_${result.error.code ?? "error"}`);
  };
  await checked(await db.from("departments").insert({ id: dept, org_id: ids.org, name: `근거 답변 검증 ${dept.slice(0, 8)}` }));
  await checked(await db.from("members").insert([
    { user_id: ids.lead, dept_id: dept, role: "lead", display_name: "검증 팀장", consented_at: startedAt },
    { user_id: ids.member, dept_id: dept, role: "member", display_name: "검증 팀원", consented_at: startedAt },
  ]));
  const policy = "[합성 검증] 오로라 외주 견적은 비교 견적 두 곳을 확보하기 전에는\n승인하지 않습니다.";
  const meeting = "[합성 검증] 오로라 회의의 후속 작업은 구매팀이 금요일까지 비교 견적 두 곳을 확보하는 것입니다.";
  const secret = "[합성 검증] 오로라 비공개 예산 상한은 4,200만원입니다.";
  const education = "외부 교육비는 1인당 연 50만 원까지 지원합니다.\n\n단, 직무 필수 자격증 교육은 이 한도를 적용하지 않습니다.\n\n신청은 교육 시작 2주 전까지 합니다.";
  const outcome = "오로라 외주 계약을 보류했습니다.";
  const rationale = "비교 견적 두 곳이 없어 가격 적정성을 판단할 수 없었기 때문입니다.";
  const unrelated = ["탕비실 커피 원두 교체", "화분 물주기 담당 변경", "회의실 의자 교체", "독서 모임 요일 변경", "점심 식당 메뉴 선정"];
  const embedded = await embedTexts([policy, meeting, secret, `${outcome}\n${rationale}`, ...unrelated], "document");
  expect(embedded.model).toBe("voyage-4-lite");
  await checked(await db.from("sources").insert([
    { id: source, dept_id: dept, kind: "document", external_id: source, title: "합성 오로라 계약 원칙", active: true, visibility: "dept" },
    { id: meetingSource, dept_id: dept, kind: "meeting", external_id: meetingSource, title: "합성 오로라 회의", active: true, visibility: "dept" },
    { id: privateSource, dept_id: dept, kind: "document", external_id: privateSource, title: "합성 비공개 예산", active: true, visibility: "leads_only" },
  ]));
  for (const [index, content] of [policy, meeting, secret].entries()) {
    const id = [item, meetingItem, privateItem][index];
    await checked(await db.from("items").insert({ id, dept_id: dept, source_id: [source, meetingSource, privateSource][index], content, author: "합성 작성자" }));
    await checked(await db.rpc("complete_item_embedding", { p_item: id, p_version: 1, p_embedding: formatVector(embedded.vectors[index]), p_model: embedded.model }));
  }
  const educationEmbedding = await embedTexts([education], "document");
  await checked(await db.from("items").insert({ id: educationItem, dept_id: dept, source_id: source, content: education, author: "합성 작성자" }));
  await checked(await db.rpc("complete_item_embedding", { p_item: educationItem, p_version: 1, p_embedding: formatVector(educationEmbedding.vectors[0]), p_model: educationEmbedding.model }));
  await checked(await db.from("decisions").insert([
    { id: oldDecision, dept_id: dept, decided_by: ids.lead, decided_by_name: "검증 팀장", decided_at: "2020-01-01T00:00:00Z", outcome, rationale, embedding: formatVector(embedded.vectors[3]), embed_model: embedded.model },
    ...unrelated.map((text, index) => ({ id: randomUUID(), dept_id: dept, decided_by: ids.lead, decided_by_name: "검증 팀장", decided_at: startedAt, outcome: text, rationale: "일상 운영 개선", embedding: formatVector(embedded.vectors[index + 4]), embed_model: embedded.model })),
  ]));
  const lead = await signInSeedUser(context, baseURL!, SEED_LEAD);
  const memberContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const memberPage = await memberContext.newPage();
  const member = await signInSeedUser(memberContext, baseURL!, SEED_MEMBER);
  const api = `/api/d/${dept}`;
  const completed: { scenario: string; answerId?: string; elapsedMs?: number; status?: string; errorCode?: string | null }[] = [];
  const clientErrors: string[] = [];
  page.on("pageerror", () => clientErrors.push("browser_pageerror"));
  memberPage.on("pageerror", () => clientErrors.push("browser_pageerror"));
  async function ask(target: Page, question: string, scenario: string, mayRefuse = false): Promise<Answer> {
    await target.goto(`/d/${dept}/ask`);
    await target.getByRole("textbox", { name: "무엇이 궁금한가요?" }).fill(question);
    const started = Date.now();
    const responsePromise = target.waitForResponse(r => r.url().endsWith(`${api}/ask`) && r.request().method() === "POST");
    await target.getByRole("button", { name: "묻기", exact: true }).click();
    const submitted = await responsePromise;
    expect(submitted.status()).toBe(202);
    const { answer_id: answerId } = await submitted.json();
    let answer: Answer | undefined;
    await expect.poll(async () => {
      const response = await target.request.get(`${api}/answers/${answerId}`);
      expect(response.status()).toBe(200);
      answer = await response.json();
      return answer!.status;
    }, { timeout: 95_000, intervals: [1000, 2000] }).not.toBe("pending");
    expect(mayRefuse ? ["done", "refused"] : ["done"]).toContain(answer!.status);
    await expect(target.locator("article")).toBeVisible();
    if (answer!.status === "done") {
      expect(answer!.answer).toBe(answerLead(answer!.citations.length));
      await expect(target.locator("article")).toContainText(answer!.answer);
      const rendered = (await target.locator("article").innerText()).replace(/\s/g, "");
      for (const citation of answer!.citations) expect(rendered.split(citation.quote.replace(/\s/g, ""))).toHaveLength(2);
    }
    else expect(answer!.citations).toEqual([]);
    const stored = await db.from("citations").select("quote,ordinal").eq("owner_kind", "answer").eq("owner_id", answerId).order("ordinal");
    await checked(stored);
    expect(stored.data).toEqual(answer!.citations.map((c, i) => ({ quote: c.quote, ordinal: i + 1 })));
    completed.push({ scenario, answerId, elapsedMs: Date.now() - started });
    return answer!;
  }
  try {
    const question = "오로라 외주 계약을 보류한 과거 결정과 그 이유, 견적 승인 원칙, 회의 후속 작업은 무엇인가요?";
    const answer = await ask(page, question, "lead_old_decision_document_meeting");
    expect(answer.citations.some(c => c.href.endsWith(`#decision-${oldDecision}`))).toBe(true);
    expect(answer.citations.some(c => c.href.endsWith(`/evidence/${item}?answer=${answer.id}`))).toBe(true);
    expect(answer.citations.some(c => c.href.endsWith(`/evidence/${meetingItem}?answer=${answer.id}`))).toBe(true);
    expect(answer.citations.map(c => c.quote).join("\n")).toContain(policy);
    await page.screenshot({ path: `${output}/lead-answer.png`, fullPage: true });
    // The stored answer survives navigation and preserves citation numbering.
    await page.reload();
    await page.getByRole("region", { name: "내 질문 기록" }).getByRole("button").filter({ hasText: question }).click();
    await expect(page.locator("article")).toContainText(outcome);
    for (const [id, content, name] of [[item, policy, "document"], [meetingItem, meeting, "meeting"]]) {
      await page.locator(`article a[href$="/evidence/${id}?answer=${answer.id}"]`).click();
      await expect(page.getByRole("heading", { name: "원문 확인", exact: true })).toBeVisible();
      await expect(page.locator("blockquote")).toHaveText(content);
      await expect(page.locator("mark")).toHaveText(content);
      const evidencePath = `${api}/evidence/${id}?answer=${answer.id}`;
      const ownResponse = await page.request.get(evidencePath);
      const otherResponse = await memberPage.request.get(evidencePath);
      expect(ownResponse.status()).toBe(200);
      expect(otherResponse.status()).toBe(200);
      expect((await ownResponse.json()).highlight).toBe(content);
      expect((await otherResponse.json()).highlight).toBeNull();
      await memberPage.goto(`/d/${dept}/evidence/${id}?answer=${answer.id}`);
      await expect(memberPage.locator("blockquote")).toHaveText(content);
      await expect(memberPage.locator("mark")).toHaveCount(0);
      await page.screenshot({ path: `${output}/${name}-evidence.png`, fullPage: true });
      await page.getByRole("link", { name: "사수에게 묻기로 돌아가기" }).click();
      await page.getByRole("region", { name: "내 질문 기록" }).getByRole("button").filter({ hasText: question }).click();
    }
    await page.locator(`article a[href$="#decision-${oldDecision}"]`).click();
    await expect(page.locator(`#decision-${oldDecision}`)).toContainText(rationale);
    await page.screenshot({ path: `${output}/old-decision.png`, fullPage: true });
    completed.push({ scenario: "history_document_meeting_and_2020_ledger_links" });

    const privateAnswer = await ask(page, "오로라 비공개 예산 상한과 회의 후속 작업은 무엇인가요?", "lead_private_budget");
    expect(privateAnswer.citations.map(c => c.quote).join("\n")).toContain("4,200");
    const memberAnswer = await ask(memberPage, "오로라 비공개 예산 상한과 회의 후속 작업은 무엇인가요?", "member_private_query_safe", true);
    expect(JSON.stringify(memberAnswer)).not.toContain("4,200");
    expect(JSON.stringify(memberAnswer)).not.toMatch(/excluded|제외/);
    expect((await memberPage.request.get(`${api}/evidence/${privateItem}`)).status()).toBe(404);
    expect((await memberPage.request.get(`${api}/answers/${privateAnswer.id}`)).status()).toBe(404);
    const publicAnswer = await ask(memberPage, "오로라 회의의 후속 작업과 담당팀은 무엇인가요?", "member_public_meeting");
    expect(publicAnswer.citations.map(c => c.quote).join("\n")).toContain(meeting);
    await memberPage.screenshot({ path: `${output}/member-answer-mobile.png`, fullPage: true });
    expect(await memberPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const directPrivate = await member.supabase.from("items").select("id").eq("id", privateItem);
    await checked(directPrivate);
    expect(directPrivate.data).toEqual([]);
    const otherDept = await member.supabase.from("items").select("id").eq("dept_id", ids.other);
    await checked(otherDept);
    expect(otherDept.data).toEqual([]);
    completed.push({ scenario: "member_api_and_direct_rls_deny_private_other_dept_and_other_owner" });

    const educationAnswer = await ask(page, "직무 필수 자격증 교육비가 120만 원이면 지원 한도가 어떻게 되나요?", "conditions_and_exception", true);
    if (educationAnswer.status === "done") {
      expect(educationAnswer.citations.some(c => c.quote.includes("50만") && c.quote.includes("적용하지 않습니다") && c.quote.includes("\n\n"))).toBe(true);
      const citation = educationAnswer.citations.find(c => c.href.includes(`/evidence/${educationItem}?answer=`))!;
      expect(citation).toBeDefined();
      await page.goto(citation.href);
      await expect(page.locator("mark")).toHaveText(citation.quote);
      await page.screenshot({ path: `${output}/conditions-exception-evidence.png`, fullPage: true });
    }
    const educationStatus = await db.from("answers").select("error_code").eq("id", educationAnswer.id).single();
    await checked(educationStatus);
    completed.push({ scenario: "conditions_and_exception_result", status: educationAnswer.status, errorCode: educationStatus.data?.error_code ?? null });

    // Synthetic membership change exercises access revocation after answer creation.
    await checked(await db.from("members").update({ role: "member" }).eq("user_id", lead.session.user.id).eq("dept_id", dept));
    expect((await page.request.get(`${api}/evidence/${privateItem}`)).status()).toBe(404);
    const downgraded = await page.request.get(`${api}/answers/${privateAnswer.id}`);
    expect(downgraded.status()).toBe(404); // RLS hides the entire saved answer.
    expect(await downgraded.json()).toEqual({ error: "질문을 찾을 수 없습니다." });
    await checked(await db.from("members").update({ role: "lead" }).eq("user_id", lead.session.user.id).eq("dept_id", dept));
    completed.push({ scenario: "lead_demotion_revokes_saved_answer_and_original" });

    const removed = await page.request.delete(`${api}/settings/source?id=${source}`);
    expect(removed.status()).toBe(200);
    expect((await page.request.get(`${api}/evidence/${item}`)).status()).toBe(404);
    const deletedAnswer = await page.request.get(`${api}/answers/${answer.id}`);
    expect(deletedAnswer.status()).toBe(404);
    expect(await deletedAnswer.json()).toEqual({ error: "질문을 찾을 수 없습니다." });
    await page.goto(`/d/${dept}/evidence/${item}`);
    await expect(page.getByRole("alert").filter({ hasText: "이 원문을 확인할 수 없습니다" })).toBeVisible();
    await expect(page.locator("blockquote")).toHaveCount(0);
    await page.screenshot({ path: `${output}/deleted-evidence.png`, fullPage: true });
    completed.push({ scenario: "source_removal_hides_original_and_saved_answer" });
    expect(clientErrors).toEqual([]);
    const answerIds = completed.flatMap(row => row.answerId ? [row.answerId] : []);
    const jobs = await db.from("jobs").select("status").eq("kind", "answer").in("payload->>answerId", answerIds);
    await checked(jobs);
    expect(jobs.data).toHaveLength(5);
    expect(jobs.data?.every(row => row.status === "done")).toBe(true);
    const telemetry = await db.from("llm_calls").select("purpose,model,input_tokens,output_tokens").eq("dept_id", dept).gte("created_at", startedAt);
    await checked(telemetry);
    const calls = telemetry.data ?? [];
    writeFileSync(`${output}/llm-telemetry.json`, JSON.stringify({ startedAt, calls: calls.length, inputTokens: calls.reduce((sum, row) => sum + (row.input_tokens ?? 0), 0), outputTokens: calls.reduce((sum, row) => sum + (row.output_tokens ?? 0), 0), rows: calls, previous: { calls: 5, inputTokens: 5707, outputTokens: 4094 }, comparison: "Added conditions/exception query and evidence; scenarios are not identical." }, null, 2));
    writeFileSync(`${output}/result.json`, JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), database: "local Supabase PostgreSQL", mocks: false, dept, source, item, meetingItem, privateItem, oldDecision, embeddingModel: embedded.model, fixtureEmbeddings: embedded.vectors.length + educationEmbedding.vectors.length, automaticWorkerJobs: jobs.data?.length, completed, clientErrors }, null, 2));
  } finally {
    await memberContext.close();
  }
});
