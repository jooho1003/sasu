import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ membership: vi.fn(), rpc: vi.fn(), from: vi.fn(), rows: [] as unknown[], dbError: null as unknown }));
vi.mock("@/lib/supabase/membership", () => ({ requireMembership: mocks.membership }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc: mocks.rpc, from: mocks.from }) }));

import { POST } from "@/app/api/d/[dept]/sales-review/compare/route";

const dept = "22222222-2222-4222-8222-222222222222";
const ids = ["11111111-1111-4111-8111-111111111111", "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555"];
const selection = { request_item_id: ids[0], old_quote_item_id: ids[1], new_quote_item_id: ids[2], policy_item_id: ids[3] };
const params = { params: Promise.resolve({ dept }) };
const request = (body: unknown) => new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("sales literal comparison route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rows = ids.map((id, i) => ({ id, dept_id: dept,
      content: ["고객 요청", "공통\n예전 문구", "공통\n새 문구", "팀장 승인 원칙"][i], deleted_at: null,
      sources: { dept_id: dept, title: `제목 ${i}`, kind: "document", active: true, is_principles: i === 3 } }));
    mocks.dbError = null;
    mocks.membership.mockResolvedValue({ deptId: dept, role: "lead", consentedAt: "2026-09-30T00:00:00Z" });
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const query = { select: () => query, eq: () => query, is: () => query,
      in: async () => ({ data: mocks.rows, error: mocks.dbError }) };
    mocks.from.mockReturnValue(query);
  });

  it("returns only current cited differences with private cache headers", async () => {
    const response = await POST(request(selection), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.difference.old_only[0]).toEqual({ source_id: ids[1], quote: "예전 문구", href: `/d/${dept}/evidence/${ids[1]}` });
    expect(body.difference.new_only[0].quote).toBe("새 문구");
    expect(mocks.from).toHaveBeenCalledWith("items");
  });

  it("rejects member, demo, malformed and duplicated selection", async () => {
    mocks.membership.mockResolvedValueOnce({ deptId: dept, role: "member", consentedAt: "yes" });
    expect((await POST(request(selection), params)).status).toBe(403);
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
    expect((await POST(request(selection), params)).status).toBe(403);
    expect((await POST(request({ ...selection, dept_id: dept }), params)).status).toBe(400);
    expect((await POST(request({ ...selection, policy_item_id: ids[0] }), params)).status).toBe(400);
  });

  it("rejects hidden and oversized source rows without partial data", async () => {
    mocks.rows = mocks.rows.slice(0, 3);
    expect((await POST(request(selection), params)).status).toBe(404);
    mocks.rows = ids.map((id, i) => ({ id, dept_id: dept, content: "내용", deleted_at: null,
      sources: { dept_id: dept, title: "제목", kind: "document", active: i !== 2, is_principles: i === 3 } }));
    expect((await POST(request(selection), params)).status).toBe(404);
    mocks.rows = ids.map((id, i) => ({ id, dept_id: dept, content: i === 1 ? "가".repeat(100_001) : "내용", deleted_at: null,
      sources: { dept_id: dept, title: "제목", kind: "document", active: true, is_principles: i === 3 } }));
    expect((await POST(request(selection), params)).status).toBe(422);
  });
});
