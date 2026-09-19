import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ membership: vi.fn(), rpc: vi.fn(), download: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/supabase/membership", () => ({ requireMembership: mocks.membership }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.create }));
import { GET } from "@/app/api/d/[dept]/reviews/[id]/original/route";
const context = { params: Promise.resolve({ dept: "requested-dept", id: "review" }) };
const request = (action = "play_original") => new Request(`https://sasu.test/api/d/requested-dept/reviews/review/original?action=${action}`);
describe("원본 API의 세션 접근권 전달", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.membership.mockResolvedValue({ deptId: "validated-dept" });
    mocks.create.mockResolvedValue({ rpc: mocks.rpc, storage: { from: () => ({ download: mocks.download }) } });
    mocks.rpc.mockResolvedValue({ data: { token: "opaque-ticket", path: "database/path/original", kind: "audio", filename: "합성 음성.wav" }, error: null });
    mocks.download.mockResolvedValue({ data: new Blob(["synthetic audio bytes"], { type: "audio/wav" }), error: null });
  });
  it("검증된 부서·DB 경로·접근권만 쓰며 URL/토큰 대신 no-store 바이트를 응답한다", async () => {
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("authorize_review_access", { p_dept: "validated-dept", p_review: "review", p_action: "play_original" });
    expect(mocks.create).toHaveBeenLastCalledWith({ reviewAccessToken: "opaque-ticket" });
    expect(mocks.download).toHaveBeenCalledWith("database/path/original");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-type")).toBe("audio/wav");
    expect(await response.text()).toBe("synthetic audio bytes");
  });
  it.each([["42501", "original_download_disabled", 403], ["P0001", "rate_limited", 429], ["P0002", "original_unavailable", 404]])("거부된 접근은 Storage를 호출하지 않는다 (%s)", async (code, message, status) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message } });
    const response = await GET(request("download_original"), context);
    expect(response.status).toBe(status);
    expect(mocks.download).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
    if (status === 429) expect(response.headers.get("retry-after")).toBe("60");
  });
  it("행위 조작을 거부하며 파일 조회 실패 시 원문·접근권을 노출하지 않는다", async () => {
    expect((await GET(request("export"), context)).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.download.mockResolvedValue({ data: null, error: { message: "private path opaque-ticket" } });
    const response = await GET(request(), context);
    expect(response.status).toBe(422);
    expect(await response.text()).not.toContain("opaque-ticket");
  });
  it("다운로드는 실행 가능한 콘텐츠를 attachment/octet-stream으로 반환한다", async () => {
    mocks.download.mockResolvedValue({ data: new Blob(["<script>private</script>"], { type: "text/html" }), error: null });
    const response = await GET(request("download_original"), context);
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment;/);
  });
  it("이진 원본의 null 바이트와 전체 길이를 보존한다", async () => {
    const bytes = new Uint8Array(32044);
    bytes.set([82, 73, 70, 70]); bytes[32043] = 255;
    mocks.download.mockResolvedValue({ data: new Blob([bytes], { type: "audio/wav" }), error: null });
    const response = await GET(request(), context);
    expect(response.headers.get("content-length")).toBe("32044");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });
});
