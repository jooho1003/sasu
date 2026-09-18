import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ run: vi.fn(), runBulk: vi.fn() }));
vi.mock("@/lib/worker", () => ({ runWorkerOnce: mocks.run, runWorkerBulk: mocks.runBulk }));
import { maxDuration, POST } from "@/app/api/jobs/run/route";

describe("워커 HTTP 인증 경계", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("JOBS_TRIGGER_SECRET", "synthetic-worker-secret");
    mocks.run.mockResolvedValue({ claimed: 0, done: 0, failed: 0 });
    mocks.runBulk.mockResolvedValue({ claimed: 0, done: 0, failed: 0 });
  });
  afterEach(() => vi.unstubAllEnvs());
  const request = (secret?: string, query = "") => new Request(`http://localhost/api/jobs/run${query}`, {
    method: "POST", headers: secret ? { "x-jobs-secret": secret } : {},
  });
  it.each([undefined, "wrong", "synthetic-worker-secret-extra"])("잘못된 secret %s는 워커 실행 전에 거부한다", async secret => {
    expect((await POST(request(secret))).status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("미설정 secret은 fail closed", async () => {
    vi.stubEnv("JOBS_TRIGGER_SECRET", "");
    expect((await POST(request())).status).toBe(500);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("인증된 요청만 공통 워커를 호출한다", async () => {
    const response = await POST(request("synthetic-worker-secret"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ claimed: 0, done: 0, failed: 0 });
    expect(mocks.run).toHaveBeenCalledOnce();
    expect(mocks.runBulk).not.toHaveBeenCalled();
  });
  it("bulk lane은 별도 반복 워커만 호출하고 최대 실행 시간을 300초로 선언한다", async () => {
    const response = await POST(request("synthetic-worker-secret", "?lane=bulk"));
    expect(response.status).toBe(200);
    expect(mocks.runBulk).toHaveBeenCalledOnce();
    expect(mocks.run).not.toHaveBeenCalled();
    expect(maxDuration).toBe(300);
  });
  it("알 수 없는 lane은 워커를 실행하지 않는다", async () => {
    expect((await POST(request("synthetic-worker-secret", "?lane=slow"))).status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.runBulk).not.toHaveBeenCalled();
  });
  it("내부 실패는 원문 없는 에러 코드로 응답한다", async () => {
    mocks.run.mockRejectedValue(new Error("synthetic sensitive error details"));
    const response = await POST(request("synthetic-worker-secret"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "worker_failed" });
  });
});
