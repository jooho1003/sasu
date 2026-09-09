import { describe, expect, it, vi } from "vitest";

import { searchAs } from "@/lib/search";

describe("권한 검색", () => {
  it("search_as RPC에 사용자·부서·벡터를 전달한다", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: "item-1", content: "근거" }],
      error: null,
    });

    await expect(
      searchAs(
        { rpc },
        {
          userId: "user-1",
          deptId: "dept-1",
          queryVector: [0.1, 0.2],
          limit: 8,
        },
      ),
    ).resolves.toEqual([{ id: "item-1", content: "근거" }]);
    expect(rpc).toHaveBeenCalledWith("search_as", {
      p_user: "user-1",
      p_dept: "dept-1",
      p_query: "[0.1,0.2]",
      p_limit: 8,
    });
  });

  it("RPC 오류를 원문 없이 검색 오류로 변환한다", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "민감한 DB details" },
    });

    await expect(
      searchAs(
        { rpc },
        { userId: "user-1", deptId: "dept-1", queryVector: [0.1], limit: 8 },
      ),
    ).rejects.toThrow("Search database operation failed");
  });
});
