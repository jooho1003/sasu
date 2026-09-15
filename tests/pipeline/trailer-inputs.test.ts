import { describe, expect, it } from "vitest";
import { loadTrailerInputs } from "@/lib/pipeline/trailer-inputs";
import type { createServiceSupabaseClient } from "@/lib/supabase/service";

function client(decisionDept = "dept", visibility = "dept") {
  const reads: { table: string; columns: string; filters: [string, unknown][] }[] = [];
  const data: Record<string, unknown> = {
    decisions: [{ id: "decision", dept_id: decisionDept, visibility, outcome: "결정 요약", rationale: "결정 사유", request_id: "card" }],
    decision_requests: [{ id: "card", title: "카드 제목", background: "NEVER_PROMPT" }],
    sources: [{ id: "principle", title: "원칙", is_principles: true, active: true, visibility: "dept" }, { id: "private", title: "비공개 소스", is_principles: true, active: true, visibility: "leads_only" }],
    items: [{ content: "공개 원칙" }], members: [{ display_name: "김가람" }],
    departments: { name: "부서 이름" }, orgs: { name: "조직 이름" },
  };
  const fake = { from: (table: string) => {
    const read = { table, columns: "", filters: [] as [string, unknown][] }; reads.push(read);
    const builder = {
      select: (columns: string) => { read.columns = columns; return builder; },
      eq: (key: string, value: unknown) => { read.filters.push([key, value]); return builder; },
      in: (key: string, value: unknown) => { read.filters.push([key, value]); return builder; },
      is: (key: string, value: unknown) => { read.filters.push([key, value]); return builder; },
      order: () => builder,
      maybeSingle: async () => ({ data: data[table], error: null }),
      then: (resolve: (result: unknown) => unknown) => resolve({ data: data[table] ?? [], error: null }),
    }; return builder;
  } };
  return { client: fake as unknown as ReturnType<typeof createServiceSupabaseClient>, reads };
}
const trailer = { dept_id: "dept", org_id: "org", source_decision_ids: ["decision"], banned_terms: ["금지 회사"] };
describe("예고편 워커 입력 조회", () => {
  it.each([["other", "dept"], ["dept", "leads_only"]])("다른 부서 또는 비공개 결정 %s/%s을 거부한다", async (dept, visibility) => {
    await expect(loadTrailerInputs(client(dept, visibility).client, trailer)).rejects.toMatchObject({ error_code: "trailer_decisions_invalid" });
  });
  it("카드 배경과 원시 발언을 읽지 않고 공개 원칙만 포함한다", async () => {
    const fake = client(); const result = await loadTrailerInputs(fake.client, trailer);
    expect(JSON.stringify(result)).not.toContain("NEVER_PROMPT");
    expect(result.principles).toEqual(["공개 원칙"]);
    expect(result.properNouns).toEqual(expect.arrayContaining(["김가람", "조직 이름", "부서 이름", "금지 회사"]));
    expect(fake.reads.find((read) => read.table === "decision_requests")?.columns).not.toContain("background");
    expect(fake.reads.find((read) => read.table === "items")?.filters).toContainEqual(["source_id", ["principle"]]);
    expect(fake.reads.find((read) => read.table === "items")?.filters).toContainEqual(["deleted_at", null]);
  });
});
