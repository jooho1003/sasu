import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  serviceClient,
  signInSeedUser,
  SEED_LEAD,
  SEED_MEMBER,
  requiredEnv,
} from "./support/auth";
import { localDate } from "../../lib/retro/bundle";
import { RETRO_SECTIONS, verifyRetroDraft } from "../../lib/retro/verify";
import { RetroRevisionRow } from "../../lib/contracts";

const liveDrafts = process.env.E2E_RETRO_CONNECTORS_LIVE === "1";

test.skip(
  !/^http:\/\/(localhost|127\.0\.0\.1):/.test(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  ),
  "로컬 Supabase에서만 합성 자료를 쓴다",
);
test("개발·기획 3일: 파일·내부 활동·한 줄 기록, 검토·확정·공개 철회·연결 해제", async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  test.setTimeout(liveDrafts ? 600000 : 120000);
  const admin = serviceClient(),
    owner = await signInSeedUser(context, baseURL!, SEED_LEAD);
  const peerContext = await browser.newContext(),
    peer = await signInSeedUser(peerContext, baseURL!, SEED_MEMBER);
  const org = randomUUID(),
    depts = [randomUUID(), randomUUID()],
    days: string[] = [],
    errors: string[] = [];
  const evidence = liveDrafts ? "docs/verification/model-resume-2026-09-23/retro" : "docs/verification/retro-connectors-2026-09-19";
  const generatedDays: { department: string; offset: number; items: number; citations: number }[] = [];
  mkdirSync(evidence, { recursive: true });
  page.on("pageerror", (e) => errors.push(e.name));
  page.on("dialog", (d) => d.accept());
  expect(
    (await admin.from("orgs").insert({ id: org, name: "합성 회고 연결 검증" }))
      .error,
  ).toBeNull();
  expect(
    (
      await admin
        .from("departments")
        .insert(
          depts.map((id, i) => ({
            id,
            org_id: org,
            name: i ? "기획 연결 검증" : "개발 연결 검증",
            retro_preset: i ? "planning" : "development",
          })),
        )
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.from("members").insert(
        depts.flatMap((dept_id) => [
          {
            dept_id,
            user_id: owner.session.user.id,
            role: "lead",
            display_name: "합성 작성자",
            // Synthetic identity for internal activity attribution. This fresh org has no Slack installation.
            slack_user_id: "U_CONNECTOR_OWNER",
            consented_at: new Date().toISOString(),
          },
          {
            dept_id,
            user_id: peer.session.user.id,
            role: "member",
            display_name: "합성 팀원",
            consented_at: new Date().toISOString(),
          },
        ]),
      )
    ).error,
  ).toBeNull();
  const today = localDate(new Date(), "Asia/Seoul");
  try {
    for (const [index, dept] of depts.entries()) {
      const source = randomUUID();
      expect(
        (
          await admin
            .from("sources")
            .insert({
              id: source,
              dept_id: dept,
              kind: "slack_channel",
              title: "합성 업무 채널",
              external_id: source,
              visibility: "dept",
            })
        ).error,
      ).toBeNull();
      for (let offset = 2; offset >= 0; offset--) {
        const date = localDate(
            new Date(Date.parse(today + "T12:00:00+09:00") - offset * 86400000),
            "Asia/Seoul",
          ),
          id = randomUUID(),
          at = date + "T01:00:00Z";
        days.push(id);
        expect(
          (
            await admin
              .from("items")
              .insert({
                id: randomUUID(),
                dept_id: dept,
                source_id: source,
                external_ref: date,
                author_ext_id: "U_CONNECTOR_OWNER",
                content: "업무 기준을 확인했습니다.",
                spoken_at: at,
              })
          ).error,
        ).toBeNull();
        const bundle = {
          activities: [
            {
              kind: index ? "doc_change" : "git_commit",
              ref: date,
              title: "합성 변경 기록",
              text: "검토 기준을 정리했습니다.",
              at,
              meta: {},
            },
          ],
        };
        expect(
          (
            await owner.supabase.rpc("create_retro_day", {
              p_dept: dept,
              p_day: id,
              p_date: date,
              p_tz: "Asia/Seoul",
              p_collector: "local-e2e",
              p_bundle: bundle,
            })
          ).error,
        ).toBeNull();
        // Stage all evidence first. Live mode explicitly enqueues a fresh generation below.
        expect(
          (
            await admin
              .from("jobs")
              .delete()
              .eq("kind", "retro_draft")
              .contains("payload", { dayId: id })
          ).error,
        ).toBeNull();
        const endpoint = `/api/d/${dept}/retros/${id}`;
        let data = await (await context.request.get(endpoint)).json();
        expect(data.activities.map((a: { kind: string }) => a.kind)).toEqual(
          expect.arrayContaining([
            index ? "doc_change" : "git_commit",
            "slack_message",
          ]),
        );
        await page.goto(`/d/${dept}/retros/${id}`);
        await page
          .getByLabel("한 줄 추가", { exact: true })
          .fill("담당자와 검토 순서를 정했습니다.");
        await page
          .getByRole("button", { name: "한 줄 저장하기", exact: true })
          .click();
        await expect(
          page.getByLabel("한 줄 추가", { exact: true }),
        ).toHaveValue("");
        data = await (await context.request.get(endpoint)).json();
        const note = data.activities.find(
          (a: { kind: string }) => a.kind === "manual_note",
        );
        expect(note).toBeTruthy();
        if (liveDrafts) {
          await page.getByRole("button", { name: "다시 생성", exact: true }).click();
          const worker = await context.request.post("/api/jobs/run", {
            headers: { "x-jobs-secret": requiredEnv("JOBS_TRIGGER_SECRET") }, timeout: 120000,
          });
          expect(worker.status()).toBe(200);
          await expect.poll(async () => {
            const current = await (await context.request.get(endpoint)).json();
            return { status: current.day.status, reason: current.day.status_reason };
          }, { timeout: 120000, intervals: [2000] }).toEqual({ status: "draft", reason: null });
          data = await (await context.request.get(endpoint)).json();
          const revision = RetroRevisionRow.parse(data.revision);
          expect(revision.origin).toBe("draft");
          const verified = verifyRetroDraft(revision, data.activities);
          expect(verified.valid).toBe(true);
          expect(verified.dropped).toBe(0);
          expect(verified.body).toEqual(revision.body);
          const generatedItems = RETRO_SECTIONS.flatMap(section => revision.body[section]);
          expect(generatedItems.length).toBeGreaterThan(0);
          expect(generatedItems.every(item => item.citations.length > 0)).toBe(true);
          // Both per-sentence and top-level quotes must still match the available activities.
          expect(verified.citations).toEqual(revision.citations);
          generatedDays.push({ department: index ? "planning" : "development", offset,
            items: generatedItems.length, citations: verified.citations.length });
          await page.reload();
          await expect(page.getByRole("region", { name: "회고 본문" })).toBeVisible();
          if (offset === 0) {
            await page.setViewportSize({ width: 390, height: 960 });
            await page.screenshot({ path: `${evidence}/${index ? "planning" : "development"}-ai-draft.png`, fullPage: true });
          }
        }
        const text = "담당자와 검토 순서를 정했습니다.",
          body = {
            did: [{ text, citations: [{ activity_id: note.id, quote: text }] }],
            learned: [],
            decided: [],
            next: [],
          };
        expect(
          (
            await context.request.patch(endpoint, {
              data: {
                revision: data.day.revision,
                title: `${index ? "기획" : "개발"} 합성 회고 ${date}`,
                body,
                topics: [index ? "기획" : "개발", "검토"],
              },
            })
          ).status(),
        ).toBe(200);
        await page.reload();
        await page.getByRole("button", { name: "확정", exact: true }).click();
        await expect
          .poll(
            async () =>
              (await (await context.request.get(endpoint)).json()).day.status,
          )
          .toBe("confirmed");
        expect((await peerContext.request.get(endpoint)).status()).toBe(404);
        if (offset === 0) {
          await page.getByLabel("볼 수 있는 사람").selectOption("dept");
          await expect
            .poll(async () =>
              (await peerContext.request.get(endpoint)).status(),
            )
            .toBe(200);
          expect(
            (
              await peerContext.request.get(
                `/api/d/${depts[1 - index]}/retros/${id}`,
              )
            ).status(),
          ).toBe(404);
          const exported = await context.request.get(endpoint + "/export");
          expect(exported.status()).toBe(200);
          expect(await exported.text()).toContain("[^A1]");
          for (const width of [1440, 390]) {
            await page.setViewportSize({ width, height: 960 });
            await page.screenshot({
              path: `${evidence}/${index ? "planning" : "development"}-${width}.png`,
              fullPage: true,
            });
            expect(
              await page.evaluate(
                () => document.documentElement.scrollWidth > innerWidth,
              ),
            ).toBe(false);
          }
        }
      }
      await page.goto(`/d/${dept}/retros`);
      const timeline = page.getByRole("region", { name: "회고 타임라인" });
      await expect(timeline.getByRole("article")).toHaveCount(3);
      await page.getByRole("combobox", { name: "주제", exact: true }).selectOption(index ? "기획" : "개발");
      await expect(timeline.getByRole("article")).toHaveCount(3);
      await page.getByRole("combobox", { name: "주제", exact: true }).selectOption("디자인");
      await expect(timeline.getByRole("article")).toHaveCount(0);
      await page.goto(`/d/${dept}/settings`);
      await expect(
        page.getByRole("heading", { name: "회고에 쓸 기록 연결" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "공개 동의 거두기" }).click();
      await expect(
        page.getByText("공개 동의를 거뒀습니다.", { exact: true }),
      ).toBeVisible();
      expect(
        (
          await peerContext.request.get(`/api/d/${dept}/retros/${days.at(-1)}`)
        ).status(),
      ).toBe(404);
      expect(
        (
          await peer.supabase.rpc("set_retro_preset", {
            p_dept: dept,
            p_preset: "design",
          })
        ).error,
      ).toBeTruthy();
      // Seed only a local credential placeholder to exercise deletion; never pull it.
      const connection = randomUUID();
      expect(
        (
          await admin
            .from("retro_connections")
            .insert({
              id: connection,
              dept_id: dept,
              user_id: owner.session.user.id,
              provider: "github",
              account_label: "합성 연결",
              encrypted_secret: "v2.local-fixture",
              config: { repositories: ["synthetic/repo"] },
            })
        ).error,
      ).toBeNull();
      expect(
        (
          await admin
            .from("retro_activities")
            .insert({
              day_id: days.at(-1),
              connection_id: connection,
              kind: "github_pr",
              ref: connection,
              title: "합성 연결 활동",
              text: "",
              at: today + "T01:00:00Z",
            })
        ).error,
      ).toBeNull();
      await page.getByRole("button", { name: "목록 새로고침하기" }).click();
      await page
        .getByRole("button", { name: "연결 끊기", exact: true })
        .click();
      await expect(
        page.getByText("연결과 가져온 활동을 지웠습니다.", { exact: true }),
      ).toBeVisible();
      expect(
        (
          await admin
            .from("retro_activities")
            .select("id")
            .eq("connection_id", connection)
        ).data,
      ).toEqual([]);
      expect(
        (
          await admin
            .from("retro_connections")
            .select("encrypted_secret")
            .eq("id", connection)
            .single()
        ).data?.encrypted_secret,
      ).toBe("");
      await page.screenshot({
        path: `${evidence}/settings-${index}.png`,
        fullPage: true,
      });
    }
    const calls = await admin
      .from("llm_calls")
      .select("id", { count: "exact", head: true })
      .in("dept_id", depts);
    if (liveDrafts) {
      expect(calls.count).toBeGreaterThanOrEqual(6);
      expect(generatedDays).toHaveLength(6);
    } else expect(calls.count).toBe(0);
    expect(errors).toEqual([]);
    writeFileSync(
      `${evidence}/local-pilot-results.json`,
      JSON.stringify(
        {
          database: "local Supabase",
          departments: 2,
          daysPerDepartment: 3,
          flow: liveDrafts ? "C file RPC + B internal + D manual -> actual AI draft -> reviewed edit -> confirm -> share -> withdraw -> revoke" : "C file RPC + B internal + D manual -> manually reviewed revision -> confirm -> share -> withdraw -> revoke",
          realExternalProviderCalls: 0,
          llmCalls: calls.count,
          generatedDays,
          errors,
        },
        null,
        2,
      ),
    );
  } finally {
    for (const id of days)
      await owner.supabase.rpc("delete_retro_day", { p_day: id });
    await peerContext.close();
  }
});
