// 로컬 격리 QA 서버(:3011)에서 팀장·팀원으로 로그인 화면을 모두 열어 CSP 위반을 모은다.
// 서버는 SASU_CSP_ENFORCE=true(강제) 또는 미설정(Report-Only)으로 띄우고, 두 모드 모두 위반 0이어야 통과한다.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page, type Response as PageResponse } from "@playwright/test";

import { SEED_LEAD, SEED_MEMBER, serviceClient, signInSeedUser, type SeedCredentials } from "./support/auth";

const baseURL = process.env.E2E_BASE_URL ?? "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

test.skip(
  process.env.E2E_REVIEW_LIVE !== "1" || baseURL !== "http://localhost:3011" ||
    !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(supabaseUrl),
  "격리 로컬 QA 환경에서만 실행합니다.",
);

const mode = process.env.SASU_CSP_ENFORCE === "true" ? "enforce" : "report-only";
const policyHeader = mode === "enforce" ? "content-security-policy" : "content-security-policy-report-only";
const otherHeader = mode === "enforce" ? "content-security-policy-report-only" : "content-security-policy";
const evidenceDir = "docs/verification/csp-enforce-2026-10-03";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const cspConsole = /Content Security Policy|Refused to/u;

type Role = "lead" | "member";
type Violation = { effectiveDirective: string; disposition: string; blockedURI: string; sourceFile: string };
type RouteResult = {
  role: Role;
  route: string;
  status: number | null;
  finalPath: string | null;
  violations: Violation[];
  consoleCsp: string[];
  pageErrors: string[];
  note: string;
};
type Shared = { results: RouteResult[]; failures: string[]; headerChecked: boolean };
type VisitOptions = { minTabs?: number; optional?: boolean };
type Visitor = {
  page: Page;
  userId: string;
  visit: (route: string, path: string, options?: VisitOptions) => Promise<RouteResult>;
  skip: (route: string, note: string) => void;
};
type Row = Record<string, unknown>;
type Seed = { id: string | null; note: string };

function firstLine(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split("\n")[0].slice(0, 100);
}

// CSP 보고는 URL 말고 inline·eval·data 같은 토큰도 준다. URL은 쿼리를 떼고 경로까지만 남긴다.
function stripUrl(value: unknown, withOrigin: boolean): string {
  if (typeof value !== "string" || value === "") return "";
  if (!/^[a-z][a-z0-9+.-]*:/iu.test(value)) return value.slice(0, 40);
  try {
    const url = new URL(value);
    if (!/^(?:https?|wss?):$/u.test(url.protocol)) return url.protocol.slice(0, -1);
    return withOrigin ? `${url.origin}${url.pathname}` : url.pathname;
  } catch {
    return "";
  }
}

function newResult(role: Role, route: string, note = ""): RouteResult {
  return { role, route, status: null, finalPath: null, violations: [], consoleCsp: [], pageErrors: [], note };
}

function addNote(result: RouteResult, text: string) {
  result.note = result.note ? `${result.note}; ${text}` : text;
}

function addViolation(result: RouteResult, raw: unknown) {
  if (typeof raw !== "object" || raw === null) return;
  const value = raw as Record<string, unknown>;
  const violation: Violation = {
    effectiveDirective: String(value.effectiveDirective ?? "").slice(0, 60),
    disposition: String(value.disposition ?? "").slice(0, 20),
    blockedURI: stripUrl(value.blockedURI, true),
    sourceFile: stripUrl(value.sourceFile, false),
  };
  const key = JSON.stringify(violation);
  if (!result.violations.some((known) => JSON.stringify(known) === key)) result.violations.push(violation);
}

function checkPolicyHeaders(route: string, headers: Record<string, string>) {
  if (!headers[policyHeader]) {
    throw new Error(`${route}: ${policyHeader} 헤더가 없습니다. 서버의 SASU_CSP_ENFORCE와 테스트 실행 환경(${mode})이 같은지 확인하세요.`);
  }
  if (headers[otherHeader] !== undefined) throw new Error(`${route}: ${otherHeader} 헤더가 함께 내려옵니다.`);
}

// 화면 안 탭(role=tab, 설정 화면의 항목 선택 버튼)만 눌러 숨은 패널을 연다. 저장·요청 버튼은 누르지 않는다.
async function openTabs(page: Page, waitForTabs: boolean) {
  const tabs = page.locator('[role="tab"], button[aria-controls^="settings-"]');
  if (waitForTabs) await tabs.first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
  const found = await tabs.count();
  let opened = 0;
  for (let index = 0; index < found; index += 1) {
    try {
      await tabs.nth(index).click({ timeout: 5_000 });
      await page.waitForTimeout(800);
      opened += 1;
    } catch {
      // 가려졌거나 사라진 탭은 연 수에 넣지 않는다.
    }
  }
  return { found, opened };
}

// 역할마다 browser context를 따로 만들고, 같은 page로 화면을 차례로 연다. 위반은 가장 최근에 연 화면에 붙는다.
async function withRole(
  browser: Browser,
  role: Role,
  credentials: SeedCredentials,
  shared: Shared,
  body: (visitor: Visitor) => Promise<void>,
) {
  const context = await browser.newContext();
  try {
    const { session } = await signInSeedUser(context, baseURL, credentials);
    const active: { result: RouteResult | null } = { result: null };
    await context.exposeFunction("sasuReportCsp", (raw: unknown) => {
      if (active.result) addViolation(active.result, raw);
    });
    await context.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        const report = Reflect.get(window, "sasuReportCsp") as ((value: unknown) => Promise<void>) | undefined;
        void report?.({
          effectiveDirective: event.effectiveDirective,
          disposition: event.disposition,
          blockedURI: event.blockedURI,
          sourceFile: event.sourceFile,
        });
      });
    });
    const page = await context.newPage();
    page.on("console", (message) => {
      const text = message.text();
      if (!active.result || !cspConsole.test(text)) return;
      const line = text.replace(/\?[^\s'"]*/gu, "?…").slice(0, 200);
      if (!active.result.consoleCsp.includes(line)) active.result.consoleCsp.push(line);
    });
    page.on("pageerror", (error) => {
      const line = error.message.slice(0, 200);
      if (active.result && !active.result.pageErrors.includes(line)) active.result.pageErrors.push(line);
    });
    page.on("dialog", (dialog) => {
      void (dialog.type() === "beforeunload" ? dialog.accept() : dialog.dismiss());
    });

    const visit: Visitor["visit"] = (route, path, options = {}) =>
      test.step(`${role} ${route}`, async () => {
        const result = newResult(role, route);
        shared.results.push(result);
        active.result = result;
        let response: PageResponse | null = null;
        try {
          response = await page.goto(`${baseURL}${path}`, { timeout: 60_000 });
          result.status = response ? response.status() : null;
        } catch (error) {
          addNote(result, `goto_failed:${firstLine(error)}`);
          shared.failures.push(`${role} ${route}: 화면을 열지 못했습니다 (${firstLine(error)})`);
        }
        if (response) {
          if (!shared.headerChecked) {
            checkPolicyHeaders(route, response.headers());
            shared.headerChecked = true;
          }
          await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
          await page.waitForTimeout(500);
          result.finalPath = new URL(page.url()).pathname;
          if (result.status !== null && result.status >= 400) addNote(result, `http_${result.status}`);
          if (result.status !== null && result.status >= 500) shared.failures.push(`${role} ${route}: HTTP ${result.status}`);
          if (result.finalPath !== path.split("?")[0]) {
            addNote(result, "redirected");
            if (!options.optional) shared.failures.push(`${role} ${route}: ${result.finalPath}(으)로 이동해 화면을 열지 못했습니다`);
          }
          const tabs = await openTabs(page, options.minTabs !== undefined);
          if (tabs.found > 0) addNote(result, `tabs:${tabs.opened}/${tabs.found}`);
          if (options.minTabs !== undefined && tabs.opened < options.minTabs) {
            shared.failures.push(`${role} ${route}: 탭 ${options.minTabs}개 중 ${tabs.opened}개만 열렸습니다`);
          }
        }
        console.log(`[csp:${mode}] ${role} ${route} status=${result.status ?? "-"} violations=${result.violations.length} console=${result.consoleCsp.length}`);
        return result;
      });
    const skip: Visitor["skip"] = (route, note) => {
      shared.results.push(newResult(role, route, note));
    };
    await body({ page, userId: session.user.id, visit, skip });
  } finally {
    await context.close();
  }
}

async function seedRow(
  query: PromiseLike<{ data: Row[] | null; error: unknown }>,
  choose: (rows: Row[]) => Row | undefined,
): Promise<Seed> {
  try {
    const { data, error } = await query;
    if (error) return { id: null, note: "no_seed:query_failed" };
    const row = data?.length ? choose(data) : undefined;
    return typeof row?.id === "string" ? { id: row.id, note: "" } : { id: null, note: "no_seed" };
  } catch {
    return { id: null, note: "no_seed:query_failed" };
  }
}

// service client로 이 부서에 실제 있는 id를 하나씩 고른다. 팀장이 열 수 있는 것만 고른다.
async function findSeeds(service: SupabaseClient, dept: string, leadId: string) {
  const [card, review, item, retro, trailer] = await Promise.all([
    seedRow(
      service.from("decision_requests").select("id,status").eq("dept_id", dept)
        .order("opened_at", { ascending: false }).limit(20),
      (rows) => rows.find((row) => row.status === "open") ?? rows[0],
    ),
    seedRow(
      service.from("reviewed_materials").select("id,status").eq("dept_id", dept)
        .is("deleted_at", null).neq("status", "deleted").order("created_at", { ascending: false }).limit(20),
      (rows) => rows.find((row) => row.status === "ready") ?? rows[0],
    ),
    seedRow(
      service.from("items").select("id,sources!inner(active)").eq("dept_id", dept)
        .is("deleted_at", null).eq("sources.active", true).order("created_at", { ascending: false }).limit(1),
      (rows) => rows[0],
    ),
    seedRow(
      service.from("retro_days").select("id,user_id,visibility,status").eq("dept_id", dept)
        .order("retro_date", { ascending: false }).limit(50),
      (rows) => rows.find((row) => row.user_id === leadId) ??
        rows.find((row) => row.status === "confirmed" && row.visibility !== "self"),
    ),
    seedRow(
      service.from("trailers").select("id").eq("dept_id", dept).order("created_at", { ascending: false }).limit(1),
      (rows) => rows[0],
    ),
  ]);
  return { card, review, item, retro, trailer };
}

async function visitSeed(visitor: Visitor, route: string, seed: Seed, path: (id: string) => string) {
  if (seed.id) await visitor.visit(route, path(seed.id));
  else visitor.skip(route, seed.note);
}

// 조직 녹음 스위치(org_settings.browser_recording_enabled). service role은 쓰기 권한이 없어
// recording-product.spec처럼 로컬 DB 컨테이너에 psql로 쓴다. 원래 값(행 없음 포함)은 미리 읽어 둔다.
async function recordingSwitch(service: SupabaseClient, org: string) {
  expect(org).toMatch(uuidPattern);
  const container = process.env.SASU_TEST_DOCKER_DB_CONTAINER ?? "supabase_db_review-qa";
  expect(["supabase_db_sasu", "supabase_db_review-qa"]).toContain(container);
  const current = await service.from("org_settings").select("browser_recording_enabled").eq("org_id", org).maybeSingle();
  expect(current.error).toBeNull();
  const original: boolean | null = current.data ? current.data.browser_recording_enabled === true : null;
  const run = (sql: string): string | null => {
    try {
      execFileSync("docker", ["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-q", "-c", sql], { stdio: "pipe" });
      return null;
    } catch (error) {
      return firstLine(error);
    }
  };
  return {
    on: () => run(`insert into public.org_settings (org_id, browser_recording_enabled) values ('${org}', true) ` +
      "on conflict (org_id) do update set browser_recording_enabled = true"),
    restore: () => run(original === null
      ? `delete from public.org_settings where org_id = '${org}'`
      : `update public.org_settings set browser_recording_enabled = ${original ? "true" : "false"} where org_id = '${org}'`),
  };
}

function writeResults(results: RouteResult[]) {
  mkdirSync(evidenceDir, { recursive: true });
  const body = { mode, checkedAt: new Date().toISOString(), results };
  writeFileSync(`${evidenceDir}/routes-${mode}.json`, `${JSON.stringify(body, null, 2)}\n`);
}

test(`로그인 화면 전체가 CSP ${mode} 모드에서 위반 없이 열린다`, async ({ browser }) => {
  test.setTimeout(600_000);
  const { dept, org } = JSON.parse(readFileSync(".vercel/review-qa/ids.json", "utf8")) as { dept: string; org: string };
  expect(dept).toMatch(uuidPattern);
  const service = serviceClient();
  const recording = await recordingSwitch(service, org);
  const shared: Shared = { results: [], failures: [], headerChecked: false };
  const openDept = (visitor: Visitor, suffix: string, options?: VisitOptions) =>
    visitor.visit(`/d/:dept${suffix}`, `/d/${dept}${suffix}`, options);

  try {
    await withRole(browser, "lead", SEED_LEAD, shared, async (lead) => {
      for (const suffix of ["", "/ask", "/ledger", "/documents", "/roles", "/reviews", "/reviews/glossary"]) {
        await openDept(lead, suffix);
      }

      // 녹음 화면은 조직 스위치가 켜져 있어야 열린다. 방문이 끝나면 바로 원래 값으로 되돌린다.
      const switchError = recording.on();
      try {
        if (switchError) {
          shared.failures.push(`lead /d/:dept/reviews/record: 녹음 스위치를 켜지 못했습니다 (${switchError})`);
          lead.skip("/d/:dept/reviews/record", "recording_switch_failed");
        } else {
          const record = await openDept(lead, "/reviews/record");
          addNote(record, "recording_switch_on");
          const opened = await lead.page.getByLabel("회의 제목").first()
            .waitFor({ state: "visible", timeout: 10_000 }).then(() => true, () => false);
          if (!opened) shared.failures.push("lead /d/:dept/reviews/record: 녹음 화면(회의 제목 입력)이 열리지 않았습니다");
        }
      } finally {
        const restoreError = recording.restore();
        if (restoreError) {
          shared.failures.push(`org_settings.browser_recording_enabled를 원래 값으로 되돌리지 못했습니다. 직접 확인하세요 (${restoreError})`);
        }
      }

      await openDept(lead, "/retention");
      await openDept(lead, "/settings", { minTabs: 3 });
      await openDept(lead, "/sales-review");
      await openDept(lead, "/retros");
      await lead.visit("/consent", "/consent");

      // 조직 관리자 화면은 /admin이 열릴 때만 본다. 권한이 없으면 200 안내 화면이 나온다.
      const admin = await lead.visit("/admin", "/admin", { optional: true });
      const noAdminAccess = admin.finalPath === "/admin"
        ? await lead.page.getByRole("heading", { name: "조직 관리자 권한이 없습니다" }).count()
        : 0;
      const adminSections = ["members", "sources", "security", "audit"];
      if (admin.status === 200 && admin.finalPath === "/admin" && noAdminAccess === 0) {
        for (const section of adminSections) await lead.visit(`/admin/${section}`, `/admin/${section}`);
      } else {
        addNote(admin, "admin_unavailable");
        for (const section of adminSections) lead.skip(`/admin/${section}`, "admin_unavailable");
      }

      const seeds = await findSeeds(service, dept, lead.userId);
      await visitSeed(lead, "/d/:dept/cards/:id", seeds.card, (id) => `/d/${dept}/cards/${id}`);
      await visitSeed(lead, "/d/:dept/reviews/:id", seeds.review, (id) => `/d/${dept}/reviews/${id}`);
      await visitSeed(lead, "/d/:dept/evidence/:id", seeds.item, (id) => `/d/${dept}/evidence/${id}`);
      await visitSeed(lead, "/d/:dept?item=:id", seeds.item, (id) => `/d/${dept}?item=${id}`);
      await visitSeed(lead, "/d/:dept/retros/:id", seeds.retro, (id) => `/d/${dept}/retros/${id}`);

      // 예고편은 SASU_TRAILER_PUBLISH_ENABLED가 꺼져 있으면 404다(http_404로 남는다).
      await openDept(lead, "/trailers");
      await openDept(lead, "/trailers/new");
      await visitSeed(lead, "/d/:dept/trailers/:id", seeds.trailer, (id) => `/d/${dept}/trailers/${id}`);
    });

    await withRole(browser, "member", SEED_MEMBER, shared, async (member) => {
      for (const suffix of ["", "/ask", "/ledger", "/documents", "/roles", "/reviews", "/reviews/glossary", "/retention"]) {
        await openDept(member, suffix);
      }
      await openDept(member, "/settings", { minTabs: 2 });
      await openDept(member, "/sales-review");
      await openDept(member, "/retros");
    });
  } finally {
    // 서버 모드와 테스트 모드가 같다고 확인된 뒤에만 증거 파일을 남긴다.
    if (shared.headerChecked) writeResults(shared.results);
  }

  const failures = [...shared.failures];
  for (const result of shared.results) {
    for (const violation of result.violations) {
      failures.push(`${result.role} ${result.route}: ${violation.effectiveDirective} (${violation.disposition}) ` +
        `blocked=${violation.blockedURI || "-"} source=${violation.sourceFile || "-"}`);
    }
    for (const line of result.consoleCsp) failures.push(`${result.role} ${result.route}: console ${line}`);
  }
  expect(failures, `CSP ${mode} 점검 실패 ${failures.length}건\n${failures.join("\n")}`).toEqual([]);
});
