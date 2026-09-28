import { describe, expect, it, vi } from "vitest";
import { originalAccessError, requestOriginalAccess, requestOriginalSegmentAccess } from "@/lib/review-access";

describe("원본 접근권", () => {
  it("사용자·경로를 클라이언트에서 만들지 않고 세션 RPC 결과만 사용한다", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { token: "ticket", path: "dept/review/original", kind: "audio", filename: "test.wav" }, error: null });
    const result = await requestOriginalAccess(rpc, "dept", "review", "play_original");
    expect(rpc).toHaveBeenCalledWith("authorize_review_access", { p_dept: "dept", p_review: "review", p_action: "play_original" });
    expect(result).toEqual({ token: "ticket", path: "dept/review/original", kind: "audio", filename: "test.wav" });
  });
  it("권한·횟수 오류를 유지하고 잘못된 성공 응답을 거부한다", async () => {
    const denied = { code: "42501", message: "original_download_disabled" };
    await expect(requestOriginalAccess(vi.fn().mockResolvedValue({ data: null, error: denied }), "d", "r", "download_original")).rejects.toEqual(denied);
    await expect(requestOriginalAccess(vi.fn().mockResolvedValue({ data: { token: "" }, error: null }), "d", "r", "play_original")).rejects.toThrow("invalid_access_response");
  });
  it.each([
    [{ code: "P0001", message: "rate_limited" }, 429],
    [{ code: "42501", message: "original_download_disabled" }, 403],
    [{ code: "42501", message: "review_editor_required" }, 403],
    [{ code: "P0002", message: "original_unavailable" }, 404],
    [{ code: "22023" }, 400],
    [{ message: "sensitive raw text" }, 500],
  ])("정해진 오류만 사용자에게 전달한다", (error, status) => {
    const mapped = originalAccessError(error);
    expect(mapped.status).toBe(status);
    expect(mapped.error).not.toContain("sensitive raw text");
  });
});

describe("구간 원본 접근권", () => {
  it("세션 RPC로 구간 접근권을 요청하고 검증된 결과만 반환한다", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { token: "ticket", path: "dept/review/original-segments/3-1.wav", kind: "audio", filename: "3.wav", segment_index: 3, sample_count: 960_000 },
      error: null,
    });
    const result = await requestOriginalSegmentAccess(rpc, "dept", "review", 3, "play_original");
    expect(rpc).toHaveBeenCalledWith("authorize_review_segment_access", { p_dept: "dept", p_review: "review", p_index: 3, p_action: "play_original" });
    expect(result).toEqual({ token: "ticket", path: "dept/review/original-segments/3-1.wav", kind: "audio", filename: "3.wav", segment_index: 3, sample_count: 960_000 });
  });
  it("오류를 그대로 전달하고 잘못된 성공 응답은 거부한다", async () => {
    const denied = { code: "22023", message: "segment_required" };
    await expect(
      requestOriginalSegmentAccess(vi.fn().mockResolvedValue({ data: null, error: denied }), "d", "r", 0, "play_original"),
    ).rejects.toEqual(denied);
    await expect(
      requestOriginalSegmentAccess(
        vi.fn().mockResolvedValue({ data: { token: "t", path: "p", kind: "document", filename: "f", segment_index: 0, sample_count: 1 }, error: null }),
        "d", "r", 0, "play_original",
      ),
    ).rejects.toThrow("invalid_access_response");
  });
});
