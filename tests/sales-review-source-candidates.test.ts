import { describe, expect, it, vi } from "vitest";
import { loadSalesSourceCandidates } from "@/lib/sales-review-sources";

const deptId = "22222222-2222-4222-8222-222222222222";
const row = { id: "11111111-1111-4111-8111-111111111111", dept_id: deptId, content: "현재 원문입니다.", deleted_at: null, sources: { dept_id: deptId, title: "견적", kind: "document", active: true, is_principles: false } };

function query(data: unknown[], error: unknown = null) {
  const value = { eq: vi.fn(() => value), is: vi.fn(() => value), order: vi.fn(() => value), limit: vi.fn(async () => ({ data, error })) };
  return value;
}

describe("sales review source candidates", () => {
  it("loads recent and policy candidates through the actor RLS client", async () => {
    const recent = query([row]);
    const policy = query([{ ...row, id: "33333333-3333-4333-8333-333333333333", sources: { ...row.sources, is_principles: true } }]);
    const client = { from: vi.fn().mockReturnValueOnce({ select: () => recent }).mockReturnValueOnce({ select: () => policy }), rpc: vi.fn().mockResolvedValue({ data: false, error: null }) };
    const result = await loadSalesSourceCandidates({ client: client as never, userId: "44444444-4444-4444-8444-444444444444", deptId, role: "lead", consentedAt: "yes" });
    expect(result).toMatchObject({ ok: true, status: 200 });
    if (result.ok) expect(result.body.candidates).toHaveLength(2);
  });

  it("rejects member, missing consent, and demo departments", async () => {
    const client = { from: vi.fn(), rpc: vi.fn().mockResolvedValue({ data: true, error: null }) };
    await expect(loadSalesSourceCandidates({ client: client as never, userId: deptId, deptId, role: "member", consentedAt: "yes" })).resolves.toMatchObject({ ok: false, status: 403, code: "lead_only" });
    await expect(loadSalesSourceCandidates({ client: client as never, userId: deptId, deptId, role: "lead", consentedAt: null })).resolves.toMatchObject({ ok: false, status: 403, code: "consent_required" });
    await expect(loadSalesSourceCandidates({ client: client as never, userId: deptId, deptId, role: "lead", consentedAt: "yes" })).resolves.toMatchObject({ ok: false, status: 403, code: "demo" });
  });
});
