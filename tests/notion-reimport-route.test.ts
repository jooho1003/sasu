import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMembership: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  enqueue: vi.fn(),
  kickWorker: vi.fn(),
  registerNotionImportHandler: vi.fn(),
}));

vi.mock("@/lib/supabase/membership", () => ({ requireMembership: mocks.requireMembership }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.createServerSupabaseClient }));
vi.mock("@/lib/jobs", () => ({ enqueue: mocks.enqueue, kickWorker: mocks.kickWorker }));
vi.mock("@/lib/pipeline/notion-import", () => ({ registerNotionImportHandler: mocks.registerNotionImportHandler }));

import { POST } from "@/app/api/d/[dept]/settings/notion/route";

describe("Notion 재가져오기 권한", () => {
  beforeEach(() => vi.resetAllMocks());

  it("member의 source_id 재가져오기 요청은 데이터베이스 접근 전에 거부한다", async () => {
    mocks.requireMembership.mockResolvedValue({ deptId: "dept-1", role: "member" });

    const response = await POST(
      new Request("http://localhost/api/d/dept-1/settings/notion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source_id: "11111111-1111-4111-8111-111111111111" }),
      }),
      { params: Promise.resolve({ dept: "dept-1" }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
