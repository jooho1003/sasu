import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ membership: vi.fn(), rpc: vi.fn(), kick: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/membership", () => ({ requireMembership: mocks.membership }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("@/lib/jobs", () => ({ kickWorker: mocks.kick }));

import { GET, POST } from "@/app/api/d/[dept]/sales-review/route";
import { POST as review } from "@/app/api/d/[dept]/sales-review/[taskId]/review/route";
import { POST as revise } from "@/app/api/d/[dept]/sales-review/[taskId]/revision/route";
import { buildSalesReview } from "@/lib/sales-review";

const dept = "22222222-2222-4222-8222-222222222222";
const taskId = "33333333-3333-4333-8333-333333333333";
const requestId = "44444444-4444-4444-8444-444444444444";
const params = { params: Promise.resolve({ dept }) };
const actionParams = { params: Promise.resolve({ dept, taskId }) };
const request = (body: unknown) => new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("synthetic sales review routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.membership.mockResolvedValue({ deptId: dept, role: "member", consentedAt: "2026-09-30T00:00:00Z" });
  });

  it("creates through session RPC and starts worker without a service client", async () => {
    mocks.rpc.mockResolvedValue({ data: taskId, error: null });
    const response = await POST(request({ focus: "price", request_id: requestId }), params);
    expect(response.status).toBe(202);
    expect(mocks.rpc).toHaveBeenCalledWith("request_sales_review", { p_dept: dept, p_focus: "price", p_request_id: requestId });
    expect(mocks.kick).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual({ task_id: taskId });
  });

  it("rejects authority fields and missing consent before a database call", async () => {
    const invalid = await POST(request({ focus: "price", request_id: requestId, requested_by: "forged" }), params);
    expect(invalid.status).toBe(400);
    mocks.membership.mockResolvedValue({ deptId: dept, role: "lead", consentedAt: null });
    const noConsent = await POST(request({ focus: "all", request_id: requestId }), params);
    expect(noConsent.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("shows only canonical grounded results", async () => {
    const result = buildSalesReview("all", { priority: "price", reply_style: "brief" });
    const rows = [
      { id: taskId, focus: "all", status: "ready", status_reason: null, result, created_at: "2026-09-30T00:00:00Z" },
      { id: requestId, focus: "all", status: "ready", status_reason: null, result: { ...result, comparison: [{ text: "가짜 사실", citations: [] }] }, created_at: "2026-09-30T00:00:00Z" },
    ];
    mocks.from.mockImplementation((table: string) => table === "sales_review_tasks"
      ? { select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: rows, error: null }) }) }) }) }
      : { select: () => ({ in: async () => ({ data: [], error: null }) }) });
    const response = await GET(new Request("http://localhost/api"), params);
    const body = await response.json();
    expect(body.tasks[0].result).toEqual(result);
    expect(body.tasks[1].result).toBeNull();
    expect(body.tasks[1].status).toBe("failed");
  });

  it("allows only lead review through the session RPC", async () => {
    const denied = await review(request({ action: "approve", reason_code: null }), actionParams);
    expect(denied.status).toBe(403);
    mocks.membership.mockResolvedValue({ deptId: dept, role: "lead", consentedAt: "2026-09-30T00:00:00Z" });
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: "ready", result: buildSalesReview("all", { priority: "price", reply_style: "brief" }) }, error: null }) }) }) }) });
    mocks.rpc.mockResolvedValue({ data: requestId, error: null });
    const allowed = await review(request({ action: "approve", reason_code: null }), actionParams);
    expect(allowed.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith("review_sales_task", { p_task: taskId, p_action: "approve", p_reason: null });
  });

  it("requires a fixed reason for rejection", async () => {
    mocks.membership.mockResolvedValue({ deptId: dept, role: "lead", consentedAt: "2026-09-30T00:00:00Z" });
    expect((await review(request({ action: "reject", reason_code: null }), actionParams)).status).toBe(400);
    expect((await review(request({ action: "approve", reason_code: "price" }), actionParams)).status).toBe(400);
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: "ready", result: buildSalesReview("all", { priority: "price", reply_style: "brief" }) }, error: null }) }) }) }) });
    mocks.rpc.mockResolvedValue({ data: requestId, error: null });
    expect((await review(request({ action: "reject", reason_code: "schedule" }), actionParams)).status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith("review_sales_task", { p_task: taskId, p_action: "reject", p_reason: "schedule" });
  });

  it("revises only through the session RPC and kicks the worker", async () => {
    mocks.rpc.mockResolvedValue({ data: requestId, error: null });
    expect((await revise(request({ request_id: requestId, dept_id: dept }), actionParams)).status).toBe(400);
    const response = await revise(request({ request_id: requestId }), actionParams);
    expect(response.status).toBe(202);
    expect(mocks.rpc).toHaveBeenCalledWith("request_sales_review_revision", { p_dept: dept, p_parent: taskId, p_request_id: requestId });
    expect(mocks.kick).toHaveBeenCalledTimes(1);
  });
});
