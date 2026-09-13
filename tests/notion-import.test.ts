import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchNotionPage: vi.fn(),
  createServiceSupabaseClient: vi.fn(),
  enqueue: vi.fn(),
  registerHandler: vi.fn(),
}));

vi.mock("@/lib/notion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notion")>()),
  fetchNotionPage: mocks.fetchNotionPage,
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: mocks.createServiceSupabaseClient,
}));
vi.mock("@/lib/jobs", () => ({
  enqueue: mocks.enqueue,
  registerHandler: mocks.registerHandler,
}));

import { importNotionSource } from "@/lib/pipeline/notion-import";

const source = {
  id: "source-1",
  dept_id: "dept-1",
  external_id: "12345678-1234-1234-1234-123412341234",
  title: "원칙",
  active: true,
  kind: "notion_page",
};

function paragraph(id: string, content: string) {
  return { id, type: "paragraph", paragraph: { rich_text: [{ plain_text: content }] } };
}

function useClient(existingItems: Array<{ id: string; external_ref: string; content: string; deleted_at: string | null }>) {
  const updates: Array<{ table: string; values: Record<string, unknown>; ids: string[] }> = [];
  const upsert = vi.fn(() => ({
    select: vi.fn(async () => ({
      data: [
        { id: "item-existing", external_ref: "block-existing" },
        { id: "item-new", external_ref: "block-new" },
      ],
      error: null,
    })),
  }));

  const sourceLookup = { eq: vi.fn(), maybeSingle: vi.fn(async () => ({ data: source, error: null })) };
  sourceLookup.eq.mockReturnValue(sourceLookup);
  const itemLookup = { eq: vi.fn(async () => ({ data: existingItems, error: null })) };

  const client = {
    from: vi.fn((table: string) => {
      if (table === "sources") {
        return {
          select: vi.fn(() => sourceLookup),
          update: (values: Record<string, unknown>) => ({
            eq: vi.fn(async () => {
              updates.push({ table, values, ids: [] });
              return { error: null };
            }),
          }),
        };
      }
      if (table === "items") {
        return {
          select: vi.fn(() => itemLookup),
          upsert,
          update: (values: Record<string, unknown>) => ({
            in: vi.fn(async (_column: string, ids: string[]) => {
              updates.push({ table, values, ids });
              return { error: null };
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
  };
  mocks.createServiceSupabaseClient.mockReturnValue(client);
  return { updates, upsert };
}

describe("Notion 재가져오기", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.enqueue.mockResolvedValue("job-1");
  });

  it("이번 결과에 없는 활성 블록은 원문을 보존한 채 소프트 삭제한다", async () => {
    const fake = useClient([
      { id: "item-existing", external_ref: "block-existing", content: "유지", deleted_at: null },
      { id: "item-removed", external_ref: "block-removed", content: "사라짐", deleted_at: null },
    ]);
    mocks.fetchNotionPage.mockResolvedValue({ title: "새 원칙", blocks: [paragraph("block-existing", "유지")] });

    await expect(importNotionSource(source.id)).resolves.toEqual({ inserted: 0, updated: 0, deleted: 1 });

    expect(fake.updates).toContainEqual({
      table: "items",
      values: { deleted_at: expect.any(String), embedding: null },
      ids: ["item-removed"],
    });
  });

  it("변경된 블록은 pending 으로 되돌리고 재임베딩 job을 넣는다", async () => {
    useClient([{ id: "item-existing", external_ref: "block-existing", content: "이전 원칙", deleted_at: null }]);
    mocks.fetchNotionPage.mockResolvedValue({ title: "새 원칙", blocks: [paragraph("block-existing", "바뀐 원칙")] });

    await expect(importNotionSource(source.id)).resolves.toEqual({ inserted: 0, updated: 1, deleted: 0 });

    expect(mocks.enqueue).toHaveBeenCalledWith("embed", { itemId: "item-existing" }, { dedupeKey: "item-existing" });
  });

  it("페이지네이션을 포함한 Notion 호출이 실패하면 삭제를 실행하지 않는다", async () => {
    const fake = useClient([{ id: "item-removed", external_ref: "block-removed", content: "보존", deleted_at: null }]);
    mocks.fetchNotionPage.mockRejectedValue(Object.assign(new Error("failed"), { error_code: "notion_api_failed" }));

    await expect(importNotionSource(source.id)).rejects.toMatchObject({ error_code: "notion_api_failed" });

    expect(fake.updates.some((update) => update.table === "items")).toBe(false);
  });
});
