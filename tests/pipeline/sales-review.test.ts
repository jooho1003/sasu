import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: null as ReturnType<typeof fakeClient> | null, structured: vi.fn(), register: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => mocks.client?.client }));
vi.mock("@/lib/llm", () => ({ llm: { structured: mocks.structured } }));
vi.mock("@/lib/jobs", () => ({ registerHandler: mocks.register }));

import { registerSalesReviewHandler, runSalesReview } from "@/lib/pipeline/sales-review";
import { safeSalesReviewResult } from "@/lib/sales-review";

const taskId = "11111111-1111-4111-8111-111111111111";
const deptId = "22222222-2222-4222-8222-222222222222";

function fakeClient(status: string) {
  const writes: Array<Record<string, unknown>> = [];
  let readDone = false;
  const client = {
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        update: (values: Record<string, unknown>) => { writes.push(values); return builder; },
        maybeSingle: async () => {
          if (!readDone) {
            readDone = true;
            return { data: { id: taskId, dept_id: deptId, focus: "all", status, case_version: 1 }, error: null };
          }
          return { data: { id: taskId }, error: null };
        },
      };
      return builder;
    },
  };
  return { client, writes };
}

describe("sales review worker", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it("uses structured selection and stores only canonical cited sentences", async () => {
    mocks.client = fakeClient("queued");
    mocks.structured.mockResolvedValue({ data: { priority: "price", reply_style: "brief" } });
    await runSalesReview(taskId);
    expect(mocks.structured).toHaveBeenCalledWith("sales_quote_review", expect.anything(), expect.anything(), { deptId });
    const stored = mocks.client.writes.find((write) => write.status === "ready");
    expect(stored).toBeDefined();
    expect(safeSalesReviewResult(stored?.result)).not.toBeNull();
    expect(JSON.stringify(stored?.result)).not.toContain("승인됐습니다");
  });

  it("does not call the model for terminal tasks", async () => {
    mocks.client = fakeClient("failed");
    await runSalesReview(taskId);
    expect(mocks.structured).not.toHaveBeenCalled();
    expect(mocks.client.writes).toHaveLength(0);
  });

  it("registers the job kind", () => {
    registerSalesReviewHandler();
    expect(mocks.register).toHaveBeenCalledWith("run_sales_review", expect.any(Function));
  });
});
