import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ membership: vi.fn(), rpc: vi.fn(), from: vi.fn(), rows: [] as unknown[], dbError: null as unknown }));
vi.mock("@/lib/supabase/membership", () => ({ requireMembership: mocks.membership }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc: mocks.rpc, from: mocks.from }) }));

import { POST } from "@/app/api/d/[dept]/sales-review/checklist/route";

const dept = "22222222-2222-4222-8222-222222222222";
const ids = ["11111111-1111-4111-8111-111111111111", "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555"];
const selection = { request_item_id: ids[0], old_quote_item_id: ids[1], new_quote_item_id: ids[2], policy_item_id: ids[3] };
const params = { params: Promise.resolve({ dept }) };
const request = (body: unknown) => new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) });
const currentRows = () => ids.map((id, i) => ({ id, dept_id: dept, content: ["가격 요청", "기존 가격", "가격 변경", "가격은 팀장 승인 필요"][i], deleted_at: null,
  sources: { dept_id: dept, title: `제목 ${i}`, kind: "document", active: true, is_principles: i === 3 } }));

describe("sales condition checklist session route", () => {
  beforeEach(() => {
    vi.resetAllMocks(); mocks.rows = currentRows(); mocks.dbError = null;
    mocks.membership.mockResolvedValue({ deptId: dept, role: "lead", consentedAt: "yes" });
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const query = { select: () => query, eq: vi.fn(() => query), is: () => query, in: vi.fn(async () => ({ data: mocks.rows, error: mocks.dbError })) };
    mocks.from.mockReturnValue(query);
  });

  it("returns cited questions from the current session and a private noncached response", async () => {
    const response = await POST(request(selection), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.topics[0].evidence).toHaveLength(4);
    expect(body.topics[0].evidence[0]).toMatchObject({ role: "request", source_id: ids[0], quote: "가격 요청" });
    expect(body.topics[1].question).toBeNull();
    expect(mocks.from).toHaveBeenCalledWith("items");
    expect(mocks.from.mock.results[0].value.eq).toHaveBeenCalledWith("dept_id", dept);
    expect(mocks.from.mock.results[0].value.in).toHaveBeenCalledWith("id", Object.values(selection));
  });

  it.each([
    { role: "member", consentedAt: "yes" }, { role: "lead", consentedAt: null },
  ])("rejects unauthorized memberships before source lookup: %j", async membership => {
    mocks.membership.mockResolvedValueOnce({ deptId: dept, ...membership });
    const response = await POST(request(selection), params);
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([{ data: true, error: null }, { data: null, error: { code: "unavailable" } }])("fails closed for demo or demo lookup failure", async result => {
    mocks.rpc.mockResolvedValueOnce(result);
    expect((await POST(request(selection), params)).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects forged fields, duplicate IDs and malformed JSON before source lookup", async () => {
    expect((await POST(request({ ...selection, dept_id: dept }), params)).status).toBe(400);
    expect((await POST(request({ ...selection, policy_item_id: ids[0] }), params)).status).toBe(400);
    expect((await POST(new Request("http://localhost/api", { method: "POST", body: "{" }), params)).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rechecks hidden, deleted, inactive and non-principle rows on each request", async () => {
    for (const change of [
      (r: ReturnType<typeof currentRows>) => r.slice(0, 3),
      (r: ReturnType<typeof currentRows>) => { r[0].deleted_at = "now" as never; return r; },
      (r: ReturnType<typeof currentRows>) => { r[1].sources.active = false; return r; },
      (r: ReturnType<typeof currentRows>) => { r[3].sources.is_principles = false; return r; },
      (r: ReturnType<typeof currentRows>) => { r[0].dept_id = ids[0]; return r; },
    ]) {
      mocks.rows = change(currentRows());
      const response = await POST(request(selection), params);
      expect(response.status).toBe(404);
      expect(await response.json()).not.toHaveProperty("sources");
    }
  });

  it("returns full-request limit failures and DB errors without source contents", async () => {
    const rows = currentRows(); rows[0].content = "가격 " + "가".repeat(2_000); mocks.rows = rows;
    const tooLarge = await POST(request(selection), params);
    expect(tooLarge.status).toBe(422);
    expect(await tooLarge.json()).not.toHaveProperty("topics");
    mocks.dbError = { code: "unavailable" };
    const response = await POST(request(selection), params);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "원문을 확인하지 못했습니다." });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
