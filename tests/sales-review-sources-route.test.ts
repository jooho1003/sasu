import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ membership: vi.fn(), rpc: vi.fn(), from: vi.fn(), rows: [] as unknown[], dbError: null as unknown }));
vi.mock("@/lib/supabase/membership", () => ({ requireMembership: mocks.membership }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc: mocks.rpc, from: mocks.from }) }));

import { GET, POST } from "@/app/api/d/[dept]/sales-review/sources/route";

const dept = "22222222-2222-4222-8222-222222222222";
const ids = ["11111111-1111-4111-8111-111111111111", "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555"];
const selection = { request_item_id: ids[0], old_quote_item_id: ids[1], new_quote_item_id: ids[2], policy_item_id: ids[3] };
const params = { params: Promise.resolve({ dept }) };
const request = (body: unknown) => new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("real sales review source route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rows = ids.map((id, i) => ({ id, dept_id: dept, content: `자료 ${i}의 실제 원문입니다.`, deleted_at: null,
      sources: { dept_id: dept, title: `제목 ${i}`, kind: "document", active: true, is_principles: i === 3 } }));
    mocks.dbError = null;
    mocks.membership.mockResolvedValue({ deptId: dept, role: "lead", consentedAt: "2026-09-30T00:00:00Z" });
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const query = {
      select: () => query, eq: () => query, is: () => query, order: () => query,
      limit: async () => ({ data: mocks.rows, error: mocks.dbError }),
      in: async () => ({ data: mocks.rows, error: mocks.dbError }),
    };
    mocks.from.mockReturnValue(query);
  });

  it("shows current RLS candidates and previews four direct source links", async () => {
    const list = await GET(new Request("http://localhost/api"), params);
    expect(list.status).toBe(200);
    expect(list.headers.get("cache-control")).toBe("private, no-store");
    expect((await list.json()).candidates).toHaveLength(4);
    const preview = await POST(request(selection), params);
    expect(preview.status).toBe(200);
    expect((await preview.json()).sources.policy.href).toBe(`/d/${dept}/evidence/${ids[3]}`);
    expect(mocks.from).toHaveBeenCalledWith("items");
  });

  it("includes an older principles item beyond the recent item window", async () => {
    mocks.from.mockImplementation(() => {
      let onlyPrinciples = false;
      const query = {
        select: () => query,
        eq: (column: string) => { if (column === "sources.is_principles") onlyPrinciples = true; return query; },
        is: () => query, order: () => query,
        limit: async () => ({ data: onlyPrinciples ? [mocks.rows[3]] : mocks.rows.slice(0, 3), error: null }),
      };
      return query;
    });
    const response = await GET(new Request("http://localhost/api"), params);
    expect(response.status).toBe(200);
    expect((await response.json()).candidates.map((candidate: { item_id: string }) => candidate.item_id)).toEqual(ids);
  });

  it("refuses member, missing consent, and demo before reading items", async () => {
    mocks.membership.mockResolvedValueOnce({ deptId: dept, role: "member", consentedAt: "yes" });
    expect((await GET(new Request("http://localhost/api"), params)).status).toBe(403);
    mocks.membership.mockResolvedValueOnce({ deptId: dept, role: "lead", consentedAt: null });
    expect((await POST(request(selection), params)).status).toBe(403);
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
    expect((await GET(new Request("http://localhost/api"), params)).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects forged fields, duplicate IDs, missing RLS rows and removed policy", async () => {
    expect((await POST(request({ ...selection, dept_id: dept }), params)).status).toBe(400);
    expect((await POST(request({ ...selection, policy_item_id: ids[0] }), params)).status).toBe(400);
    mocks.rows = mocks.rows.slice(0, 3);
    expect((await POST(request(selection), params)).status).toBe(404);
    mocks.rows = ids.map((id, i) => ({ id, dept_id: dept, content: `자료 ${i}`, deleted_at: null,
      sources: { dept_id: dept, title: `자료 ${i}`, kind: "document", active: true, is_principles: false } }));
    expect((await POST(request(selection), params)).status).toBe(404);
  });
});
