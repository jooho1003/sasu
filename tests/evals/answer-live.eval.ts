import { answerLead, isParagraphRange } from "@/lib/answer-grounding";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { loadEnvConfig } from "@next/env";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Case = { id: string; question: string; items: { content: string; source_kind: string; source_title: string }[];
  decisions: { outcome: string; rationale: string }[]; refused: boolean; expected: string[]; decisionRequired?: boolean };
const item = (content: string, source_kind = "document", source_title = "합성 업무 기준") => ({ content, source_kind, source_title });
const wrap = (text: string) => text.match(/.{1,40}/gu)!.join("\n");
const longDocument = `${wrap("접수된 문서는 담당 부서가 순서대로 확인합니다. 보관 위치와 검토 순서를 기록합니다. ".repeat(40).slice(0, 1060))}\n\n대금 지급 기한은 검수 완료 후 60일입니다.\n검수 완료일은 납품 확인서에 기록합니다.\n\n${wrap("자료 분류와 보관에 관한 안내입니다. 담당자는 문서의 작성 시각과 확인 순서를 기록합니다. ".repeat(40).slice(0, 1060))}`;
const cases: Case[] = [
  ...[
    ["A01", "최대 할인율은 얼마인가요?", "표준 계약의 최대 할인율은 10%입니다.", false, "10%"],
    ["A02", "무료 체험은 며칠인가요?", "무료 체험 기간은 14일입니다.", false, "14"],
    ["A03", "주문 최소 수량은 몇 개인가요?", "주문 최소 수량은 80개입니다.", false, "80"],
    ["A04", "리뷰 담당 부서는 어디인가요?", "신규 계약의 최종 리뷰 담당 부서는 재무팀입니다.", false, "재무팀"],
    ["A05", "고객사의 내년 매출 목표는 얼마인가요?", "회의실 예약 담당은 운영팀입니다.", true, ""],
    ["A06", "배포 정책을 알려주세요.", "", true, ""],
    ["A07", "12% 인상 견적은 승인 가능한가요?", "인상률 10% 이상이면\n승인하지 않습니다.\n\n재입찰은 구매팀이 진행합니다.", false, "승인하지않습니다"],
  ].map(([id, question, evidence, refused, expected]) => ({ id: id as string, question: question as string,
    items: evidence ? [item(evidence as string)] : [], decisions: [], refused: refused as boolean, expected: [expected as string] })),
  { id: "A08", question: "검수 후 대금은 언제까지 지급하나요?", items: [item(longDocument)], decisions: [], refused: false, expected: ["60일"] },
  { id: "A09", question: "직무 필수 자격증 교육비가 120만 원이면 지원 한도가 어떻게 되나요?",
    items: [item("외부 교육비는 1인당 연 50만 원까지 지원합니다.\n\n단, 직무 필수 자격증 교육은 이 한도를 적용하지 않습니다.\n\n신청은 교육 시작 2주 전까지 합니다.")], decisions: [], refused: false, expected: ["50만", "적용하지않습니다"] },
  { id: "A10", question: "B사 재계약은 왜 보류했나요?", items: [
    ...["회의실을 예약했습니다.", "휴게실 정리를 마쳤습니다.", "장비 재고를 확인했습니다.", "점심 모임을 안내합니다.", "사무용품을 주문했습니다.", "주간 일정표를 올렸습니다.", "자료 보관 위치를 확인했습니다."].map(text => item(text, "slack_channel", "합성 업무 채널")),
    item("B사 재계약 여부는 결정 기록의 보류 사유를 따릅니다.", "meeting", "합성 계약 회의"),
  ], decisions: [
    { outcome: "회의실 정리", rationale: "정리 순서를 확정했습니다." },
    { outcome: "장비 교체", rationale: "사용 기간이 지났습니다." },
    { outcome: "일정표 공개", rationale: "팀에서 함께 확인합니다." },
    { outcome: "B사 재계약 보류", rationale: "납기 지연이 3회 발생했기 때문입니다." },
  ], refused: false, expected: ["납기지연"], decisionRequired: true },
];
loadEnvConfig(process.cwd());
const selected = process.env.SASU_ANSWER_EVAL_CASES?.split(",");
const state = vi.hoisted(() => ({ client: null as unknown, items: [] as Record<string, unknown>[], decisions: [] as Record<string, unknown>[], row: {} as Record<string, unknown> }));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => state.client }));
vi.mock("@/lib/jobs", () => ({ registerHandler: vi.fn() }));
vi.mock("@/lib/embeddings", () => ({ embedText: async () => ({ vector: [0.1] }) }));
vi.mock("@/lib/search", () => ({ searchAs: async () => state.items, searchDecisionsAs: async () => state.decisions }));
vi.mock("@/lib/slack/post", () => ({ postMessage: () => { throw new Error("Live evaluation must not send Slack messages"); } }));
import { answerQuestion } from "@/lib/pipeline/answer";

const rows: Record<string, unknown>[] = [];
let saved: Record<string, unknown> = {};
let calls = 0, inputTokens = 0, outputTokens = 0;
beforeAll(async () => {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is required");
  const isolated = process.env.SASU_ANSWER_EVAL_ISOLATED === "1";
  const telemetry = isolated ? null : (await vi.importActual<typeof import("@/lib/supabase/service")>("@/lib/supabase/service")).createServiceSupabaseClient();
  state.client = {
    from(table: string) {
      if (table === "llm_calls") return { insert: async (row: { input_tokens: number; output_tokens: number }) => {
        calls++; inputTokens += row.input_tokens ?? 0; outputTokens += row.output_tokens ?? 0;
        return telemetry ? telemetry.from("llm_calls").insert(row) : { data: null, error: null };
      } };
      if (table !== "answers") throw new Error("Unexpected evaluation table");
      const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: state.row, error: null }) };
      return query;
    },
    rpc(name: string, args: Record<string, unknown>) {
      if (name !== "complete_answer") throw new Error("Unexpected evaluation RPC");
      saved = args;
      return Promise.resolve({ data: true, error: null });
    },
  };
});
it.each(cases.filter(row => !selected || selected.includes(row.id)).map(row => ({ id: row.id, row })))("$id", async ({ row }) => {
  state.items = row.items.map((i, n) => ({ ...i, id: `synthetic-${row.id}-item-${n}`, source_visibility: "dept" }));
  state.decisions = row.decisions.map((d, n) => ({ ...d, id: `synthetic-${row.id}-decision-${n}` }));
  const sources = new Map([...state.items.map(i => [String(i.id), String(i.content)] as const), ...state.decisions.map(d => [String(d.id), `${d.outcome}\n${d.rationale}`] as const)]);
  state.row = { id: row.id, question: row.question, asked_by: "synthetic-user", status: "pending" };
  saved = {};
  const before = { calls, inputTokens, outputTokens }, started = performance.now();
  let errorCode: string | null = null;
  try { await answerQuestion(row.id); } catch (error) {
    errorCode = error && typeof error === "object" && "error_code" in error ? String(error.error_code) : "evaluation_failed";
  }
  const citations = (saved.p_citations ?? []) as { item_id: string | null; decision_id: string | null; quote: string }[];
  const citationValid = citations.every(c => {
    const text = sources.get(c.item_id ?? c.decision_id ?? "");
    return text !== undefined && isParagraphRange(text, c.quote);
  });
  const facts = citations.map(c => c.quote).join("\n").replace(/\s/g, "");
  const factPresent = row.refused || row.expected.every(value => facts.includes(value));
  const decisionPresent = !row.decisionRequired || citations.some(c => c.decision_id !== null);
  const correct = errorCode === null && saved.p_refused === row.refused && citationValid && factPresent && decisionPresent && (row.refused || (citations.length > 0 && saved.p_answer === answerLead(citations.length)));
  rows.push({ id: row.id, correct, expectedRefused: row.refused, actualRefused: saved.p_refused, citationValid, factPresent, decisionPresent, errorCode,
    calls: calls - before.calls, inputTokens: inputTokens - before.inputTokens, outputTokens: outputTokens - before.outputTokens, durationMs: Math.round(performance.now() - started) });
  expect(correct).toBe(true);
});
afterAll(() => {
  const report = { generatedAt: new Date().toISOString(), synthetic: true, independentlyReviewed: false,
    scope: `actual answerQuestion + Groq; retrieval/embedding/persistence mocked; telemetry ${process.env.SASU_ANSWER_EVAL_ISOLATED === "1" ? "local only" : "attempted"}; no Slack sends`,
    model: "openai/gpt-oss-120b", total: rows.length, passed: rows.filter(row => row.correct).length, calls, inputTokens, outputTokens, rows };
  const path = resolve(process.env.SASU_ANSWER_EVAL_REPORT ?? "docs/verification/evaluation-results/answer-selection-live.json");
  if (path === resolve("docs/verification/evaluation-results/answer-grounded-live.json")) throw Error("historical_report_read_only");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ total: rows.length, passed: report.passed, calls }));
});
