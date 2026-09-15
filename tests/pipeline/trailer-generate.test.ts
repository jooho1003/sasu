import { beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../fixtures/trailer-approval.json";
const mocks = vi.hoisted(() => ({ structured: vi.fn(), enqueue: vi.fn(), register: vi.fn(), inputs: vi.fn(), client: null as unknown }));
vi.mock("@/lib/llm", () => ({ llm: { structured: mocks.structured } }));
vi.mock("@/lib/jobs", () => ({ enqueue: mocks.enqueue, registerHandler: mocks.register }));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => mocks.client }));
vi.mock("@/lib/pipeline/trailer-inputs", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/pipeline/trailer-inputs")>(), loadTrailerInputs: mocks.inputs }));
import { generateTrailer, registerTrailerGenerateHandler } from "@/lib/pipeline/trailer-generate";

const trailer = { id: "t", org_id: "org", dept_id: "dept", status: "generating", updated_at: "v1", source_decision_ids: ["d1", "d2", "d3"], banned_terms: [] };
function setup(status = "generating", matched = true) {
  const writes: Record<string, unknown>[] = []; const filters: [string, unknown][] = [];
  mocks.client = { from: () => { let updating = false; const builder = {
    select: () => builder, eq: (key: string, value: unknown) => { filters.push([key, value]); return builder; },
    update: (values: Record<string, unknown>) => { updating = true; writes.push(values); return builder; },
    maybeSingle: async () => ({ error: null, data: updating ? matched ? { updated_at: "v2" } : null : { ...trailer, status } }),
  }; return builder; } };
  return { writes, filters };
}
describe("예고편 생성 워커", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.inputs.mockResolvedValue({ decisions: [1, 2, 3].map((id) => ({ id: `d${id}`, outcome: "가상 결정", rationale: "가상 사유", cardTitle: "가상 제목" })), principles: [] }); mocks.structured.mockResolvedValue({ data: fixture.scenarios[0] }); });
  it("결정 3건을 순서대로 생성하고 조건부 저장 후 검사 작업을 넣는다", async () => {
    const fake = setup(); await generateTrailer("t");
    expect(mocks.structured).toHaveBeenCalledTimes(3);
    expect(fake.filters).toContainEqual(["updated_at", "v1"]);
    expect(fake.writes[0].status).toBe("checking");
    expect(mocks.enqueue).toHaveBeenCalledWith("check_trailer_gate", { trailerId: "t" }, { dedupeKey: "t:v2" });
  });
  it("무효 초안은 1회만 재생성한다", async () => {
    setup(); mocks.structured.mockResolvedValueOnce({ data: {} }); await generateTrailer("t"); expect(mocks.structured).toHaveBeenCalledTimes(4);
  });
  it("무효 초안 2회면 결과를 저장하지 않는다", async () => {
    const fake = setup(); mocks.structured.mockResolvedValue({ data: {} });
    await expect(generateTrailer("t")).rejects.toMatchObject({ error_code: "invalid_scenario" });
    expect(mocks.structured).toHaveBeenCalledTimes(2); expect(fake.writes).toEqual([]); expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("상태가 바뀌면 LLM을 호출하지 않고 조건부 저장이 실패하면 후속 작업을 넣지 않는다", async () => {
    setup("review"); await generateTrailer("t"); expect(mocks.structured).not.toHaveBeenCalled();
    setup("generating", false); await generateTrailer("t"); expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("공통 워커에 등록한다", () => { registerTrailerGenerateHandler(); expect(mocks.register).toHaveBeenCalledWith("generate_trailer", expect.any(Function)); });
});
