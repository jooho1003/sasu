import { describe, expect, it, vi } from "vitest";
import { originalAccessError, requestOriginalAccess } from "@/lib/review-access";

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
