import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  membership: vi.fn(), client: vi.fn(), rpc: vi.fn(), list: vi.fn(),
}));
vi.mock("@/lib/supabase/membership", () => ({ requireMembership: mock.membership }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mock.client }));

import { DELETE, GET, POST } from "@/app/api/d/[dept]/glossary/route";

const DEPT = "a1111111-1111-4111-8111-111111111111";
const ID = "b2222222-2222-4222-8222-222222222222";
const context = { params: Promise.resolve({ dept: DEPT }) };

describe("department glossary route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.membership.mockResolvedValue({ deptId: DEPT, role: "lead" });
    mock.client.mockResolvedValue({
      from: () => ({ select: () => ({ eq: () => ({ order: mock.list }) }) }),
      rpc: mock.rpc,
    });
    mock.list.mockResolvedValue({ data: [{ id: ID, term: "사수", reading: null, note: null, updated_at: "2026-09-29" }], error: null });
    mock.rpc.mockResolvedValue({ data: ID, error: null });
  });

  it("reads only the validated membership department", async () => {
    const response = await GET(new Request(`http://localhost/api/d/${DEPT}/glossary`), context);
    expect(response.status).toBe(200);
    expect((await response.json()).entries).toHaveLength(1);
    expect(mock.membership).toHaveBeenCalledWith(DEPT);
  });

  it("rejects a member edit before opening a database client", async () => {
    mock.membership.mockResolvedValue({ deptId: DEPT, role: "member" });
    const response = await POST(new Request(`http://localhost/api/d/${DEPT}/glossary`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: null, term: "사수", reading: null, note: null }),
    }), context);
    expect(response.status).toBe(403);
    expect(mock.client).not.toHaveBeenCalled();
  });

  it("uses membership department for lead edits even if body supplies another department", async () => {
    const response = await POST(new Request(`http://localhost/api/d/${DEPT}/glossary`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: null, term: "사수", reading: null, note: null, dept_id: ID }),
    }), context);
    expect(response.status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();

    const valid = await POST(new Request(`http://localhost/api/d/${DEPT}/glossary`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: null, term: "사수", reading: null, note: null }),
    }), context);
    expect(valid.status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith("save_dept_glossary", expect.objectContaining({ p_dept: DEPT }));
  });

  it("deletes through the session RPC", async () => {
    const response = await DELETE(new Request(`http://localhost/api/d/${DEPT}/glossary`, {
      method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: ID }),
    }), context);
    expect(response.status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith("delete_dept_glossary", { p_dept: DEPT, p_id: ID });
  });
});
