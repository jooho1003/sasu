import { beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../fixtures/trailer-approval.json";
const mocks = vi.hoisted(() => ({ enqueue: vi.fn(), register: vi.fn(), inputs: vi.fn(), rpc: vi.fn(), client: null as unknown }));
vi.mock("@/lib/jobs", () => ({ enqueue: mocks.enqueue, registerHandler: mocks.register }));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => mocks.client }));
vi.mock("@/lib/pipeline/trailer-inputs", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/pipeline/trailer-inputs")>(), loadTrailerInputs: mocks.inputs }));
import { checkTrailerGate, registerTrailerGateHandler } from "@/lib/pipeline/trailer-gate";
function setup(nextStatus = "checking") {
  let reads = 0;
  mocks.client = { rpc: mocks.rpc, from: () => { const builder = { select: () => builder, eq: () => builder, maybeSingle: async () => ({ error: null, data: { id: "t", org_id: "org", dept_id: "dept", status: ++reads === 1 ? "checking" : nextStatus, scenarios: fixture.scenarios, updated_at: reads === 1 ? "v1" : "v2", source_decision_ids: [], banned_terms: [] } }) }; return builder; } };
}
describe("예고편 검사 워커", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.inputs.mockResolvedValue({ decisions: [], principles: [], properNouns: [] }); mocks.rpc.mockResolvedValue({ data: "recorded", error: null }); });
  it("검사 결과는 경로·규칙만 저장한다", async () => { setup(); await checkTrailerGate("t"); expect(mocks.rpc).toHaveBeenCalledWith("record_trailer_gate", { p_trailer: "t", p_report: { passed: true, violations: [] }, p_passed: true, p_seen_updated_at: "v1" }); });
  it.each(["checking", "review"])("stale 응답 뒤 상태 %s에 따라 재등록한다", async (state) => { setup(state); mocks.rpc.mockResolvedValue({ data: "stale", error: null }); await checkTrailerGate("t"); expect(mocks.enqueue).toHaveBeenCalledTimes(state === "checking" ? 1 : 0); });
  it("공통 워커에 등록한다", () => { registerTrailerGateHandler(); expect(mocks.register).toHaveBeenCalledWith("check_trailer_gate", expect.any(Function)); });
});
