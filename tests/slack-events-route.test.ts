import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), kick: vi.fn(), post: vi.fn(), after: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => mocks }));
vi.mock("@/lib/jobs", () => ({ kickWorker: mocks.kick }));
vi.mock("@/lib/slack/post", () => ({ postMessage: mocks.post }));
vi.mock("next/server", () => ({ after: mocks.after }));
import { POST } from "@/app/api/slack/events/route";

function request(type = "message") {
  const body = JSON.stringify({ event_id: "E_SYNTHETIC", event: {
    type, channel: "C_TEST", user: "U_TEST", text: "합성 문의 연락처 qa@example.com", ts: "1726123456.123",
  } });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = "v0=" + createHmac("sha256", "synthetic-signing-secret").update(`v0:${timestamp}:${body}`).digest("hex");
  return new Request("http://localhost/api/slack/events", { method: "POST", body,
    headers: { "x-slack-request-timestamp": timestamp, "x-slack-signature": signature } });
}
function lookup(data: unknown, error: unknown = null) {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data, error }) };
  return query;
}
describe("Slack 이벤트의 원자 저장 배선", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("SLACK_SIGNING_SECRET", "synthetic-signing-secret");
    mocks.from.mockImplementation((table: string) => {
      if (table === "sources") return lookup({ id: "source-1", dept_id: "dept-1" });
      if (table === "members") return lookup({ user_id: "user-1", display_name: "합성 사용자", consented_at: "2026-09-12" });
      throw new Error("No direct event/item/answer writes allowed");
    });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
  });
  afterEach(() => vi.unstubAllEnvs());
  it.each(["message", "app_mention"])("%s는 마스킹 후 원자 RPC 하나에 전달한다", async type => {
    expect((await POST(request(type))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("ingest_slack_atomic", expect.objectContaining({ p_event_id: "E_SYNTHETIC", p_kind: type === "message" ? "item" : "answer" }));
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("qa@example.com");
    expect(mocks.kick).toHaveBeenCalledOnce();
  });
  it("이미 커밋된 중복 이벤트는 워커를 다시 예약하지 않는다", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.kick).not.toHaveBeenCalled();
  });
  it("슬랙 질문 한도 초과는 이벤트를 보존하고 한 번만 스레드에 안내한다", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "rate_limited" }, error: null });
    mocks.post.mockResolvedValue({ channel: "C_TEST", ts: "1" });
    mocks.after.mockImplementation((callback: () => unknown) => callback());

    expect((await POST(request("app_mention"))).status).toBe(200);
    expect(mocks.kick).not.toHaveBeenCalled();
    expect(mocks.post).toHaveBeenCalledWith(expect.objectContaining({
      channel: "C_TEST", thread_ts: "1726123456.123",
      text: "오늘 질문 한도(50회)를 모두 사용했습니다. 내일 다시 물어봐 주세요.",
    }));
  });
  it("트랜잭션 실패는 500이고 재전송에서 다시 저장을 시도한다", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000" } });
    expect((await POST(request())).status).toBe(500);
    expect(mocks.kick).not.toHaveBeenCalled();
    expect((await POST(request())).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
  it("미동의 발언은 RPC로도 보내지 않는다", async () => {
    mocks.from.mockImplementation((table: string) => lookup(table === "sources" ? { id: "source-1", dept_id: "dept-1" } : { consented_at: null }));
    expect((await POST(request())).status).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("조회 실패는 완료 마커를 남기지 않는다", async () => {
    mocks.from.mockReturnValue(lookup(null, { code: "XX000" }));
    expect((await POST(request())).status).toBe(500);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("서명 없는 요청은 DB 접근 전에 거부한다", async () => {
    expect((await POST(new Request("http://localhost/api/slack/events", { method: "POST", body: "{}" }))).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
