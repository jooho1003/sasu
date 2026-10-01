import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { ActorContext } from "@/lib/companion/context";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), kick: vi.fn() }));
vi.mock("@/lib/jobs", () => ({ kickWorker: mocks.kick }));

import { readSalesSourceReviewStatus, startSalesSourceReview } from "@/lib/sales-source-review-start";

const userId = "11111111-1111-4111-8111-111111111111";
const deptId = "22222222-2222-4222-8222-222222222222";
const ids = [1, 2, 3, 4].map((value) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`);
const input = {
  request_item_id: ids[0], old_quote_item_id: ids[1], new_quote_item_id: ids[2], policy_item_id: ids[3], request_id: userId,
};
const rows = ids.map((item_id, index) => ({ position: index + 1, item_id, title: "조건", kind: "document", content: "가격은 승인 후에 확정합니다.", version: "v" }));
const ctx = { client: { rpc: mocks.rpc, from: mocks.from }, userId, deptId, role: "lead" as const, consentedAt: "yes" } as unknown as ActorContext;

describe("sales source review shared start", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "is_demo_department" ? false : name === "sales_source_review_inputs" ? rows : userId, error: null }));
  });

  it("uses current inputs, their hashes, and one worker entry point", async () => {
    const result = await startSalesSourceReview(ctx, input);
    expect(result).toEqual({ ok: true, status: 202, body: { task_id: userId } });
    expect(mocks.rpc).toHaveBeenCalledWith("request_sales_source_review", {
      p_dept: deptId, p_ids: ids, p_request_id: userId,
      p_versions: rows.map((row) => createHash("sha256").update(row.content).digest("hex")),
    });
    expect(mocks.kick).toHaveBeenCalledOnce();
  });

  it.each([{ role: "member" as const, consentedAt: "yes", code: "lead_only" }, { role: "lead" as const, consentedAt: null, code: "consent_required" }])("rejects ineligible actors", async ({ role, consentedAt, code }) => {
    const result = await startSalesSourceReview({ ...ctx, role, consentedAt }, input);
    expect(result).toMatchObject({ ok: false, status: 403, code });
  });

  it("maps demo and SQL errors without a worker", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(startSalesSourceReview(ctx, input)).resolves.toMatchObject({ ok: false, status: 403, code: "demo" });
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "is_demo_department" ? false : name === "sales_source_review_inputs" ? rows : null, error: name === "request_sales_source_review" ? { message: "sales_source_daily_limit" } : null }));
    await expect(startSalesSourceReview(ctx, input)).resolves.toMatchObject({ ok: false, status: 429, code: "sales_daily_limit" });
    expect(mocks.kick).not.toHaveBeenCalled();
  });

  it("returns only the current actor's task status", async () => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { status: "processing" }, error: null }) };
    mocks.from.mockReturnValue(query);
    await expect(readSalesSourceReviewStatus(ctx, userId)).resolves.toEqual({ ok: true, status: 200, body: { status: "processing" } });
    expect(mocks.from).toHaveBeenCalledWith("sales_source_reviews");
  });
});
