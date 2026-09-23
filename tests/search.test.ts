import { describe, expect, it, vi } from "vitest";

import { recentDecisionsAs, searchAs, searchDecisionsAs } from "@/lib/search";

describe("권한 검색", () => {
  it.each(["user", "channel"] as const)("결정 검색은 %s 권한과 질문 벡터·단어를 SQL에 전달한다", async scope => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: "old-decision" }], error: null });
    await expect(searchDecisionsAs({ rpc }, { userId: "user", deptId: "dept", queryVector: [1, 0], queryText: "오래된 견적 결정", limit: 8, scope })).resolves.toEqual([{ id: "old-decision" }]);
    expect(rpc).toHaveBeenCalledWith("search_decisions_as", { p_user: "user", p_dept: "dept", p_query: "[1,0]", p_text: "오래된 견적 결정", p_limit: 8, p_scope: scope });
  });
  it("결정 검색 오류는 최근 결정으로 조용히 대체하지 않는다", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "private" } });
    await expect(searchDecisionsAs({ rpc }, { userId: "user", deptId: "dept", queryVector: [1], queryText: "질문", limit: 8 })).rejects.toThrow("Search database operation failed");
  });
  it("채널은 SQL의 제한된 검색 RPC만 호출한다", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    await searchAs({ rpc }, { userId: "lead", deptId: "dept", queryVector: [0.1], limit: 8, scope: "channel" });
    await recentDecisionsAs({ rpc }, { userId: "lead", deptId: "dept", limit: 3, scope: "channel" });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["search_channel_as", "recent_channel_decisions_as"]);
  });
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
