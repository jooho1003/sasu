import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/trailer-approval.json";
import { TrailerScenario } from "@/lib/contracts";
import { buildSyntheticAttempts } from "@/lib/trailer-synthetic";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), after: vi.fn(), worker: vi.fn() }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/worker", () => ({ runWorkerOnce: mocks.worker }));
vi.mock("@/lib/supabase/public", () => ({ createPublicSupabaseClient: () => ({ rpc: mocks.rpc }) }));
import { POST as submit } from "@/app/api/t/i/submit/route";
import { POST as withdraw } from "@/app/api/t/i/withdraw/route";

const scenarios = TrailerScenario.array().parse(fixture.scenarios);
const submissions = buildSyntheticAttempts("t", scenarios)[0].submissions;
const body = { token: "a".repeat(64), email: "candidate@example.com", consent_version: "1", submissions };
const opened = { scenarios, apply_url: null, org_display_name: "합성 조직", state: "ready", consent_version: body.consent_version, expires_at: "2026-09-25T00:00:00.000Z" };
const request = (value: unknown) => new Request("http://localhost/api/t/i/submit", { method: "POST", body: JSON.stringify(value) });

describe("지원자 제출·철회", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("SASU_TRAILER_PUBLISH_ENABLED", "true");
    vi.stubEnv("SASU_TRAILER_INVITES_ENABLED", "true");
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "trailer_invite_open" ? opened : [{attempt_id:"private-attempt-id"}], error: null }));
  });
  afterEach(() => vi.unstubAllEnvs());
  it("플래그 off와 잘못된 입력은 DB 전에 거부한다", async () => {
    expect((await submit(request({}))).status).toBe(400);
    vi.stubEnv("SASU_TRAILER_INVITES_ENABLED", "false");
    expect((await submit(request(body))).status).toBe(404);
    expect((await withdraw(request(body))).status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("헤더 없이 전송된 64KB 초과 본문도 거부한다", async () => {
    const response = await submit(request({ ...body, padding: "한".repeat(23000) }));
    expect(response.status).toBe(413);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("현재 시나리오와 다른 제출은 저장하지 않는다", async () => {
    const response = await submit(request({ ...body, submissions: [{ ...submissions[0], scenario_id: "other" }] }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_attempt" });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["consent_required", "already_submitted"])("RPC의 %s를 노출 가능한 코드로 반환한다", async (code) => {
    mocks.rpc.mockResolvedValueOnce({ data: opened, error: null }).mockResolvedValueOnce({ data: null, error: { message: code } });
    const response = await submit(request(body));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: code });
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("SQL 저장 뒤 워커를 예약하고 지원자에게 내부 id를 보내지 않는다", async () => {
    const response = await submit(request(body));
    expect(response.status).toBe(202);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ state: "submitted" });
    expect(mocks.rpc).toHaveBeenLastCalledWith("submit_trailer_invite_attempt", { p_token: body.token, p_email: body.email, p_submissions: submissions });
    expect(mocks.after).toHaveBeenCalledOnce();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.worker).toHaveBeenCalledOnce();
  });
  it("본인 철회는 공통 파기 RPC만 호출한다", async () => {
    const response = await withdraw(request({ token: body.token, email: body.email }));
    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("withdraw_trailer_invite_attempt", { p_token: body.token, p_email: body.email });
  });
  it("요청 경로는 service role·enqueue를 사용하지 않는다", () => {
    for (const name of ["submit", "withdraw"]) {
      const source = readFileSync(`app/api/t/i/${name}/route.ts`, "utf8");
      expect(source).not.toMatch(/createServiceSupabaseClient|\benqueue\s*\(/);
    }
  });
});
