import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn(), from: vi.fn(), insert: vi.fn(), select: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: mocks.client }));
import { insertUploadedItems } from "@/lib/adapters/upload";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.client.mockReturnValue({ from: mocks.from });
  mocks.from.mockReturnValue({ insert: mocks.insert });
  mocks.insert.mockReturnValue({ select: mocks.select });
  mocks.select.mockResolvedValue({ data: [{ id: "item" }], error: null });
});
it("원본 입력을 변경하지 않고 마스킹된 items INSERT만 실행한다", async () => {
  const row = { source_id: "source", dept_id: "dept", external_ref: "chunk-1", author_ext_id: null, author: "문서", spoken_at: null, content: "qa@example.com 010-1234-5678 예산 100만원" };
  const result = await insertUploadedItems([row]);
  expect(row.content).toContain("qa@example.com");
  expect(mocks.from).toHaveBeenCalledExactlyOnceWith("items");
  expect(mocks.insert).toHaveBeenCalledWith([{ ...row, content: expect.stringContaining("100만원") }]);
  const stored = mocks.insert.mock.calls[0][0][0].content as string;
  expect(stored).not.toContain("qa@example.com"); expect(stored).not.toContain("010-1234-5678");
  expect(mocks.select).toHaveBeenCalledExactlyOnceWith("id");
  expect(result).toEqual({ data: [{ id: "item" }], error: null });
});
it("저장 오류를 성공으로 숨기지 않는다", async () => {
  mocks.select.mockResolvedValue({ data: null, error: { code: "42501" } });
  expect(await insertUploadedItems([])).toEqual({ data: null, error: { code: "42501" } });
});
