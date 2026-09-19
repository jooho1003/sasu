import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), register: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/jobs", () => ({ registerHandler: mocks.register }));
import { purgeTrailerInvites, registerTrailerPurgeHandler } from "@/lib/pipeline/trailer-purge";

describe("지원자 자료 자동 파기", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it("공통 SQL 파기 경로를 한 번 호출하고 건수만 반환한다", async () => {
    mocks.rpc.mockResolvedValue({ data: 3, error: null });
    expect(await purgeTrailerInvites()).toBe(3);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("purge_expired_trailer_invites");
  });
  it("DB 오류 원문을 전파하지 않고 job 재시도용 코드만 반환한다", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "candidate@example.com" } });
    await expect(purgeTrailerInvites()).rejects.toMatchObject({ message: "job_failed", error_code: "job_failed" });
  });
  it("등록된 핸들러는 파기 건수만 기록한다", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      mocks.rpc.mockResolvedValue({ data: 2, error: null });
      registerTrailerPurgeHandler();
      expect(mocks.register.mock.calls[0][0]).toBe("purge_trailer_invites");
      await mocks.register.mock.calls[0][1]({});
      expect(log).toHaveBeenCalledExactlyOnceWith("trailer_invites_purged", { count: 2 });
    } finally { log.mockRestore(); }
  });
});
