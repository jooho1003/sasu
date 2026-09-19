import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), post: vi.fn(), update: vi.fn(), permalink: vi.fn(), register: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => ({ rpc: (...args: unknown[]) => ({ abortSignal: () => mocks.rpc(...args) }) }) }));
vi.mock("@/lib/slack/post", () => ({ postMessage: mocks.post, updateMessage: mocks.update, getMessagePermalink: mocks.permalink }));
vi.mock("@/lib/jobs", () => ({ registerHandler: mocks.register }));
import { deliverSlackAnswer } from "@/lib/pipeline/slack-answer-delivery";
const row = { answer_id: "answer-1", channel: "D123", thread_ts: "1.1", message_ts: null as string | null, status: "pending", scope: "user", dept_id: "dept-1", answer: null as string | null, citations: [] as unknown[] };
describe("Slack 답변 전달", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "claim_slack_answer_delivery" ? { ...row } : true, error: null }));
    mocks.post.mockResolvedValue({ channel: "D123", ts: "2.2" });
    mocks.update.mockResolvedValue(undefined);
  });
  it("처리 안내 timestamp를 저장하고 pending 답변을 보내지 않는다", async () => {
    await deliverSlackAnswer("answer-1");
    expect(mocks.post).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining("찾아보고"), thread_ts: "1.1" }));
    expect(mocks.rpc).toHaveBeenCalledWith("finish_slack_answer_delivery", expect.objectContaining({ p_message_ts: "2.2", p_sent: false }));
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("기존 처리 안내를 실패 상태로 갱신하고 새 메시지는 만들지 않는다", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ...row, message_ts: "2.2", status: "failed" }, error: null });
    await deliverSlackAnswer("answer-1");
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ ts: "2.2", text: expect.stringContaining("완료하지 못했습니다") }));
  });
  it("SQL에서 전체 검증된 답변만 DM 권한 문구와 함께 갱신한다", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ...row, message_ts: "2.2", status: "done", answer: "오늘 배포합니다.", citations: [{ quote: "오늘 배포합니다.", author: "팀장", occurredAt: null, source: "문서", href: null }] }, error: null });
    await deliverSlackAnswer("answer-1");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining("내가 볼 수 있는 부서 기록만") }));
    expect(mocks.rpc).toHaveBeenCalledWith("finish_slack_answer_delivery", expect.objectContaining({ p_sent: true }));
  });
  it("권한 회수·이미 전달된 답변은 외부 호출하지 않는다", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    await deliverSlackAnswer("answer-1");
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("갱신 실패를 재시도에 전달하고 DB 답변을 변경하지 않는다", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ...row, message_ts: "2.2", status: "refused" }, error: null });
    mocks.update.mockRejectedValue({ error_code: "slack_rate_limited" });
    await expect(deliverSlackAnswer("answer-1")).rejects.toMatchObject({ error_code: "slack_rate_limited" });
    expect(mocks.rpc).toHaveBeenCalledWith("release_slack_answer_delivery", expect.objectContaining({ p_error: "slack_rate_limited" }));
    expect(mocks.rpc.mock.calls.some(([name]) => name === "complete_answer")).toBe(false);
  });
  it("DB claim 실패·lease 경합에서는 게시하지 않는다", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000" } });
    await expect(deliverSlackAnswer("answer-1")).rejects.toThrow();
    mocks.rpc.mockResolvedValueOnce({ data: { busy: true }, error: null });
    await expect(deliverSlackAnswer("answer-1")).rejects.toThrow();
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it("처리 안내 저장 실패에는 생성 본문을 보내지 않는다", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ...row, status: "done", answer: "비공개 생성 문장" }, error: null });
    mocks.rpc.mockResolvedValueOnce({ data: false, error: { code: "XX000" } });
    await expect(deliverSlackAnswer("answer-1")).rejects.toThrow();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.post.mock.calls)).not.toContain("비공개 생성 문장");
  });
});
