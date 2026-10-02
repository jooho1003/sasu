import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(), rpc: vi.fn(), insertUploadedItems: vi.fn(), enqueue: vi.fn(), kickWorker: vi.fn(),
  classify: vi.fn(), embed: vi.fn(), meeting: vi.fn(),
}));

vi.mock("@/lib/adapters/upload", () => ({ insertUploadedItems: mocks.insertUploadedItems }));
vi.mock("@/lib/jobs", () => ({ enqueue: mocks.enqueue, kickWorker: mocks.kickWorker }));
vi.mock("@/lib/pipeline/classify", () => ({ registerClassifyHandler: mocks.classify }));
vi.mock("@/lib/pipeline/embed", () => ({ registerEmbedHandler: mocks.embed }));
vi.mock("@/lib/pipeline/meeting-summary", () => ({ registerMeetingSummaryHandler: mocks.meeting }));

import { ingestTranscript } from "@/lib/transcript-upload";

const ctx = { client: { from: mocks.from, rpc: mocks.rpc }, userId: "lead", deptId: "dept-1", role: "lead" as const, consentedAt: "2026-10-02" };

function query(data: unknown, error: unknown = null) {
  const result = { data, error };
  const q = { select: () => q, eq: () => q, insert: () => q, single: async () => result,
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
  return q;
}

describe("ingestTranscript", () => {
  it("미동의 화자의 발언을 수집 어댑터로 보내지 않는다", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    mocks.from.mockImplementation((table: string) => query(
      table === "members"
        ? [{ user_id: "u1", display_name: "동의", slack_user_id: "U1", consented_at: "2026-10-02" }, { user_id: "u2", display_name: "미동의", slack_user_id: "U2", consented_at: null }]
        : { id: "source-1" },
    ));
    mocks.insertUploadedItems.mockResolvedValue({ data: [{ id: "item-1" }], error: null });
    mocks.enqueue.mockResolvedValue("job-1");

    const file = new File(["동의: 저장할 발언\n미동의: 저장하면 안 되는 발언"], "meeting.txt", { type: "text/plain" });
    const result = await ingestTranscript(ctx as never, file, { title: "회의", visibility: "dept" });

    expect(result).toMatchObject({ ok: true, status: 202, body: { job_ids: ["job-1", "job-1"] } });
    expect(mocks.insertUploadedItems).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ author: "동의", content: "저장할 발언" })]));
    expect(JSON.stringify(mocks.insertUploadedItems.mock.calls)).not.toContain("저장하면 안 되는 발언");
  });
});
