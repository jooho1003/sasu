import { encryptSlackToken } from "@/lib/slack/installation";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), rpc: vi.fn(), context: vi.fn(), ingest: vi.fn(), from: vi.fn(), kick: vi.fn(), post: vi.fn(), after: vi.fn(), ephemeral: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => ({ ...mocks, rpc: (name: string, args: unknown) => name === "slack_installation_for_team" ? mocks.workspace(args) : mocks.rpc(name, args) }) }));
vi.mock("@/lib/jobs", () => ({ kickWorker: mocks.kick }));
vi.mock("@/lib/slack/post", () => ({ postMessage: mocks.post, postEphemeral: mocks.ephemeral }));
vi.mock("next/server", () => ({ after: mocks.after }));
import { POST } from "@/app/api/slack/events/route";

function request(type = "message", overrides: Record<string, unknown> = {}) {
  const body = JSON.stringify({ team_id: "TTEST", event_id: "E_SYNTHETIC", event: {
    type, channel: "CTEST", user: "UTEST", text: "합성 문의 연락처 qa@example.com", ts: "1726123456.123", ...overrides,
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
    vi.stubEnv("SLACK_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32,17).toString("base64"));
    mocks.workspace.mockResolvedValue({ data: { org_id: "org", team_id: "TTEST", encrypted_token: encryptSlackToken("xoxb-test", "org", "TTEST") }, error: null });
    vi.stubEnv("SLACK_SIGNING_SECRET", "synthetic-signing-secret");
    mocks.from.mockImplementation((table: string) => {
      if (table === "sources") return lookup({ id: "source-1", dept_id: "dept-1" });
      if (table === "members") return lookup({ user_id: "user-1", display_name: "합성 사용자", consented_at: "2026-09-12" });
      throw new Error("No direct event/item/answer writes allowed");
    });
    mocks.context.mockResolvedValue({ data: [{ id: "dept-1", name: "영업팀", consented: true }], error: null });
    mocks.ingest.mockResolvedValue({ data: { status: "saved" }, error: null });
    mocks.rpc.mockImplementation((name: string, ...args: unknown[]) => {
      if (name === "slack_question_context_for_team") return { abortSignal: mocks.context };
      const result = mocks.ingest(name, ...args);
      return Object.assign(result, { abortSignal: () => result });
    });
    mocks.after.mockImplementation((callback: () => unknown) => callback());
  });
  afterEach(() => vi.unstubAllEnvs());
  it("설치되지 않은 워크스페이스는 본문 조회·수집·발송을 하지 않는다", async () => {
    mocks.workspace.mockResolvedValue({ data: null, error: null });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.ingest).not.toHaveBeenCalled(); expect(mocks.post).not.toHaveBeenCalled();
  });
  it("서명된 앱 제거는 해당 워크스페이스 연결만 해제한다", async () => {
    expect((await POST(request("app_uninstalled"))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("revoke_slack_installation", { p_team: "TTEST" });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each(["message", "app_mention"])("%s는 마스킹 후 원자 RPC 하나에 전달한다", async type => {
    expect((await POST(request(type))).status).toBe(200);
    expect(mocks.ingest).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith(type === "message" ? "ingest_slack_atomic" : "ingest_slack_question_for_team", expect.objectContaining(type === "message" ? { p_event_id: "TTEST:E_SYNTHETIC", p_kind: "item" } : { p_event: "E_SYNTHETIC", p_dm: false }));
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("qa@example.com");
    expect(mocks.kick).toHaveBeenCalledOnce();
  });
  it("이미 커밋된 중복 이벤트는 워커를 다시 예약하지 않는다", async () => {
    mocks.ingest.mockResolvedValue({ data: false, error: null });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.kick).not.toHaveBeenCalled();
  });
  it("슬랙 질문 한도 초과는 이벤트를 보존하고 한 번만 스레드에 안내한다", async () => {
    mocks.ingest.mockResolvedValue({ data: { status: "rate_limited" }, error: null });
    mocks.post.mockResolvedValue({ channel: "C_TEST", ts: "1" });
    mocks.after.mockImplementation((callback: () => unknown) => callback());

    expect((await POST(request("app_mention"))).status).toBe(200);
    expect(mocks.kick).not.toHaveBeenCalled();
    expect(mocks.ephemeral).toHaveBeenCalledWith(expect.objectContaining({
      channel: "CTEST", thread_ts: "1726123456.123", user: "UTEST",
      text: "오늘 질문 한도(50회)를 모두 사용했습니다. 내일 다시 물어봐 주세요.",
    }));
  });
  it("트랜잭션 실패는 500이고 재전송에서 다시 저장을 시도한다", async () => {
    mocks.ingest.mockResolvedValueOnce({ data: null, error: { code: "XX000" } });
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
  it("수정 이벤트는 새 본문만 마스킹하며 previous_message는 전달하지 않는다", async () => {
    expect((await POST(request("message", { subtype: "message_changed", event_ts: "1726123459.000001", message: { ts: "1726123456.000001", user: "UTEST", text: "수정 qa@example.com" }, previous_message: { text: "원문 비밀" } }))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("apply_slack_change", expect.objectContaining({ p_deleted: false, p_ref: "1726123456.000001", p_content: "수정 [이메일]" }));
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("원문 비밀");
  });
  it("삭제는 작성자와 본문이 없어도 원본 식별자로 반영한다", async () => {
    await POST(request("message", { subtype: "message_deleted", event_ts: "1726123459.000001", deleted_ts: "1726123456.000001", user: undefined, text: undefined }));
    expect(mocks.rpc).toHaveBeenCalledWith("apply_slack_change", expect.objectContaining({ p_deleted: true, p_author: null, p_content: null }));
  });
  it("미동의 수정 본문을 SQL로 보내지 않는다", async () => {
    mocks.from.mockImplementation((table: string) => lookup(table === "sources" ? { id: "source-1", dept_id: "dept-1" } : { consented_at: null }));
    await POST(request("message", { subtype: "message_changed", event_ts: "1726123459.000001", message: { ts: "1726123456.000001", user: "UTEST", text: "미동의 원문" } }));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("서명 없는 요청은 DB 접근 전에 거부한다", async () => {
    expect((await POST(new Request("http://localhost/api/slack/events", { method: "POST", body: "{}" }))).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("DM message.im은 업무 수집 없이 질문으로 저장한다", async () => {
    expect((await POST(request("message", { channel: "D123", channel_type: "im" }))).status).toBe(200);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.ingest).toHaveBeenCalledWith("ingest_slack_question_for_team", expect.objectContaining({ p_dm: true, p_dept: "dept-1" }));
  });
  it.each(["thread_broadcast", "file_share"])("일반 채널 %s의 유효 본문은 기존 수집 경로를 유지한다", async subtype => {
    expect((await POST(request("message", { subtype }))).status).toBe(200);
    expect(mocks.ingest).toHaveBeenCalledWith("ingest_slack_atomic", expect.objectContaining({ p_kind: "item" }));
  });
  it.each([{ departments: [] }, { departments: [{ id: "dept-1", name: "영업팀", consented: false }] }])("미연결·미동의 멘션은 본문을 저장하지 않고 개인 안내한다", async ({ departments }) => {
    mocks.context.mockResolvedValue({ data: departments, error: null });
    expect((await POST(request("app_mention"))).status).toBe(200);
    expect(mocks.ingest).not.toHaveBeenCalled();
    expect(mocks.ephemeral).toHaveBeenCalledOnce();
    expect(JSON.stringify(mocks.ephemeral.mock.calls)).not.toContain("qa@example.com");
  });
  it("여러 부서 DM은 선택 안내 후 지정 부서로만 접수한다", async () => {
    mocks.context.mockResolvedValue({ data: [{ id: "dept-1", name: "영업팀", consented: true }, { id: "dept-2", name: "개발팀", consented: true }], error: null });
    await POST(request("message", { channel: "D123", channel_type: "im" }));
    expect(mocks.ingest).not.toHaveBeenCalled();
    expect(mocks.post).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining("어느 부서") }));
    await POST(request("message", { channel: "D123", channel_type: "im", text: "개발팀: 오늘 배포할까요?" }));
    expect(mocks.ingest).toHaveBeenCalledWith("ingest_slack_question_for_team", expect.objectContaining({ p_dept: "dept-2" }));
  });
  it.each([{ bot_id: "B123" }, { subtype: "message_changed" }, { subtype: "message_deleted" }])("봇·편집·삭제 이벤트는 질문으로 처리하지 않는다", async overrides => {
    await POST(request("app_mention", overrides));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("문맥 조회 오류는 저장·안내 없이 재전송 가능한 오류를 낸다", async () => {
    mocks.context.mockResolvedValue({ data: null, error: { code: "timeout" } });
    expect((await POST(request("app_mention"))).status).toBe(500);
    expect(mocks.ingest).not.toHaveBeenCalled();
    expect(mocks.ephemeral).not.toHaveBeenCalled();
  });
});
