import { loadEnvConfig } from "@next/env";
import { fileURLToPath } from "node:url";

import { createServiceSupabaseClient } from "../lib/supabase/service";

loadEnvConfig(process.cwd());

const IDS = {
  org: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  salesDept: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  devDept: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
} as const;

type DemoDepartment = {
  id: string;
  name: string;
  sources: Array<{
    id: string;
    kind: "slack_channel" | "meeting" | "notion_page";
    external_id: string;
    title: string;
    visibility: "dept" | "leads_only";
    is_principles: boolean;
  }>;
  items: Array<{
    id: string;
    source_id: string;
    external_ref: string;
    author: string;
    content: string;
    label: "decision" | "action" | "info" | "chatter";
  }>;
  request: {
    id: string;
    origin_item_id: string;
    title: string;
    background: string;
    recommendation: string;
    visibility: "dept" | "leads_only";
  };
  priorDecision: {
    id: string;
    outcome: string;
    rationale: string;
    item_id: string;
  };
  answers: Array<{
    id: string;
    question_key: string;
    question: string;
    answer: string;
    generic_answer: string;
    item_id: string;
  }>;
};

const SALES: DemoDepartment = {
  id: IDS.salesDept,
  name: "영업 사수",
  sources: [
    { id: "10000000-0000-4000-8000-000000000101", kind: "notion_page", external_id: "demo-sales-principles", title: "영업 원칙 문서", visibility: "dept", is_principles: true },
    { id: "10000000-0000-4000-8000-000000000102", kind: "slack_channel", external_id: "demo-sales-channel", title: "#영업-결정", visibility: "dept", is_principles: false },
    { id: "10000000-0000-4000-8000-000000000103", kind: "meeting", external_id: "demo-sales-meeting", title: "주간 영업회의", visibility: "leads_only", is_principles: false },
  ],
  items: [
    { id: "10000000-0000-4000-8000-000000000111", source_id: "10000000-0000-4000-8000-000000000101", external_ref: "sales-principle-1", author: "영업 원칙", content: "연 10% 이상 가격이 오르면 기존 거래를 자동 연장하지 않고 재입찰을 검토합니다.", label: "info" },
    { id: "10000000-0000-4000-8000-000000000112", source_id: "10000000-0000-4000-8000-000000000102", external_ref: "sales-slack-1", author: "민서", content: "외주사 B 견적이 12% 올랐습니다. 이번 견적을 받아도 될까요? 오늘 17시까지 방향이 필요합니다.", label: "decision" },
    { id: "10000000-0000-4000-8000-000000000113", source_id: "10000000-0000-4000-8000-000000000103", external_ref: "sales-meeting-1", author: "영업 리드", content: "경영회의 원칙에 따라 10% 이상 인상은 재입찰을 우선 검토하기로 보류했습니다.", label: "decision" },
    { id: "10000000-0000-4000-8000-000000000114", source_id: "10000000-0000-4000-8000-000000000102", external_ref: "sales-slack-2", author: "지후", content: "고객 인터뷰 일정은 다음 주 화요일 오전으로 잡았습니다.", label: "action" },
  ],
  request: { id: "10000000-0000-4000-8000-000000000121", origin_item_id: "10000000-0000-4000-8000-000000000112", title: "외주사 B 12% 인상 견적을 받아들일까요?", background: "슬랙에서 외주사 B의 견적 인상에 대한 결정을 요청했고, 오늘 17시까지 방향이 필요합니다.", recommendation: "부서 원칙에 따라 재입찰을 우선 검토하고, 예외 사유가 있으면 근거를 남기는 방향을 권합니다.", visibility: "leads_only" },
  priorDecision: { id: "10000000-0000-4000-8000-000000000122", outcome: "고객 인터뷰를 다음 주로 확정", rationale: "신규 고객군의 요구를 먼저 확인한 뒤 제안 범위를 좁히기로 했습니다.", item_id: "10000000-0000-4000-8000-000000000114" },
  answers: [
    { id: "10000000-0000-4000-8000-000000000131", question_key: "vendor-price", question: "외주사 B 견적을 받아도 되나요?", answer: "현재 기록에는 12% 인상안이 있고, 영업 원칙은 10% 이상 인상 시 재입찰 검토입니다. 예외가 필요하다면 팀장 결정이 먼저입니다.", generic_answer: "견적을 비교하고 예산과 일정 영향을 확인한 뒤 담당자 승인을 받으세요.", item_id: "10000000-0000-4000-8000-000000000112" },
    { id: "10000000-0000-4000-8000-000000000132", question_key: "interview", question: "고객 인터뷰는 언제 하나요?", answer: "기록상 고객 인터뷰는 다음 주 화요일 오전으로 잡혀 있습니다.", generic_answer: "캘린더에서 참석자와 목적을 확인하고 초대장을 보내세요.", item_id: "10000000-0000-4000-8000-000000000114" },
    { id: "10000000-0000-4000-8000-000000000133", question_key: "pricing", question: "가격을 올릴 때 기준이 있나요?", answer: "연 10% 이상 가격이 오르면 기존 거래를 자동 연장하지 않고 재입찰을 검토합니다.", generic_answer: "원가와 시장 가격을 확인하고 고객에게 변경 근거를 안내하세요.", item_id: "10000000-0000-4000-8000-000000000111" },
    { id: "10000000-0000-4000-8000-000000000134", question_key: "owner", question: "이 안건의 결정자는 누구인가요?", answer: "공개된 기록만으로 담당자를 확정할 수 없습니다. 현재 카드는 팀장 검토가 필요한 상태입니다.", generic_answer: "프로젝트 책임자와 예산 승인권자를 확인하세요.", item_id: "10000000-0000-4000-8000-000000000112" },
    { id: "10000000-0000-4000-8000-000000000135", question_key: "deadline", question: "언제까지 결정해야 하나요?", answer: "슬랙 기록에 오늘 17시까지 방향이 필요하다고 남아 있습니다.", generic_answer: "요청자와 마감 시각을 합의해 기록하세요.", item_id: "10000000-0000-4000-8000-000000000112" },
    { id: "10000000-0000-4000-8000-000000000136", question_key: "principle", question: "우리 부서 원칙은 무엇인가요?", answer: "10% 이상 가격 인상은 재입찰을 검토한다는 원칙이 있습니다.", generic_answer: "팀의 최신 원칙 문서를 확인하고 예외 조건을 기록하세요.", item_id: "10000000-0000-4000-8000-000000000111" },
  ],
};

const DEVELOPMENT: DemoDepartment = {
  id: IDS.devDept,
  name: "개발 사수",
  sources: [
    { id: "20000000-0000-4000-8000-000000000101", kind: "notion_page", external_id: "demo-dev-principles", title: "개발 원칙 문서", visibility: "dept", is_principles: true },
    { id: "20000000-0000-4000-8000-000000000102", kind: "slack_channel", external_id: "demo-dev-channel", title: "#개발-결정", visibility: "dept", is_principles: false },
    { id: "20000000-0000-4000-8000-000000000103", kind: "meeting", external_id: "demo-dev-meeting", title: "주간 개발회의", visibility: "leads_only", is_principles: false },
  ],
  items: [
    { id: "20000000-0000-4000-8000-000000000111", source_id: "20000000-0000-4000-8000-000000000101", external_ref: "dev-principle-1", author: "개발 원칙", content: "장애 대응은 원인 분석보다 먼저 영향 범위와 롤백 가능 여부를 확인합니다.", label: "info" },
    { id: "20000000-0000-4000-8000-000000000112", source_id: "20000000-0000-4000-8000-000000000102", external_ref: "dev-slack-1", author: "도윤", content: "이번 배포를 오늘 진행해도 될까요? 롤백 플랜 확인이 필요합니다.", label: "decision" },
    { id: "20000000-0000-4000-8000-000000000113", source_id: "20000000-0000-4000-8000-000000000103", external_ref: "dev-meeting-1", author: "개발 리드", content: "영향 범위가 확인되기 전에는 배포하지 않는 방향으로 보류했습니다.", label: "decision" },
    { id: "20000000-0000-4000-8000-000000000114", source_id: "20000000-0000-4000-8000-000000000102", external_ref: "dev-slack-2", author: "서연", content: "스테이징 로그 대시보드 링크를 문서에 추가했습니다.", label: "action" },
  ],
  request: { id: "20000000-0000-4000-8000-000000000121", origin_item_id: "20000000-0000-4000-8000-000000000112", title: "롤백 플랜 확인 전 배포를 진행할까요?", background: "개발 채널에서 오늘 배포 여부를 물었고, 영향 범위와 롤백 계획 확인이 남아 있습니다.", recommendation: "영향 범위와 롤백 가능 여부를 확인한 뒤 배포하는 방향을 권합니다.", visibility: "leads_only" },
  priorDecision: { id: "20000000-0000-4000-8000-000000000122", outcome: "스테이징 로그 대시보드 추가", rationale: "운영 배포 전에 확인 가능한 관측성을 확보하기로 했습니다.", item_id: "20000000-0000-4000-8000-000000000114" },
  answers: [
    { id: "20000000-0000-4000-8000-000000000131", question_key: "vendor-price", question: "외주사 B 견적을 받아도 되나요?", answer: "개발 사수에는 외주사 견적에 관한 기록이 없습니다. 개발 부서 원칙과 관련된 질문을 선택해 주세요.", generic_answer: "견적을 비교하고 예산과 일정 영향을 확인한 뒤 담당자 승인을 받으세요.", item_id: "20000000-0000-4000-8000-000000000111" },
    { id: "20000000-0000-4000-8000-000000000132", question_key: "interview", question: "고객 인터뷰는 언제 하나요?", answer: "개발 사수에는 고객 인터뷰 일정 기록이 없습니다.", generic_answer: "캘린더에서 참석자와 목적을 확인하고 초대장을 보내세요.", item_id: "20000000-0000-4000-8000-000000000114" },
    { id: "20000000-0000-4000-8000-000000000133", question_key: "pricing", question: "가격을 올릴 때 기준이 있나요?", answer: "개발 부서의 기록에는 가격 원칙이 없습니다.", generic_answer: "원가와 시장 가격을 확인하고 고객에게 변경 근거를 안내하세요.", item_id: "20000000-0000-4000-8000-000000000111" },
    { id: "20000000-0000-4000-8000-000000000134", question_key: "owner", question: "이 안건의 결정자는 누구인가요?", answer: "배포 안건은 개발 리드가 검토하고, 영향 범위와 롤백 계획을 먼저 확인합니다.", generic_answer: "프로젝트 책임자와 예산 승인권자를 확인하세요.", item_id: "20000000-0000-4000-8000-000000000112" },
    { id: "20000000-0000-4000-8000-000000000135", question_key: "deadline", question: "언제까지 결정해야 하나요?", answer: "현재 기록에는 오늘 배포 여부를 결정해야 한다는 요청이 있습니다.", generic_answer: "요청자와 마감 시각을 합의해 기록하세요.", item_id: "20000000-0000-4000-8000-000000000112" },
    { id: "20000000-0000-4000-8000-000000000136", question_key: "principle", question: "장애 대응 원칙은 무엇인가요?", answer: "원인 분석보다 먼저 영향 범위와 롤백 가능 여부를 확인합니다.", generic_answer: "팀의 최신 원칙 문서를 확인하고 예외 조건을 기록하세요.", item_id: "20000000-0000-4000-8000-000000000111" },
  ],
};

const DEMO_DEPARTMENTS = [SALES, DEVELOPMENT];

async function removeExistingDemoData(
  client: ReturnType<typeof createServiceSupabaseClient>,
): Promise<void> {
  const departmentIds = DEMO_DEPARTMENTS.map((department) => department.id);
  const citationOwnerIds = DEMO_DEPARTMENTS.flatMap((department) => [
    department.request.id,
    department.priorDecision.id,
    ...department.answers.map((answer) => answer.id),
  ]);
  const conflictRequestIds = DEMO_DEPARTMENTS.map((department) => department.request.id);
  const itemIds = DEMO_DEPARTMENTS.flatMap((department) => department.items.map((item) => item.id));
  const { error: citationError } = await client.from("citations").delete().in("owner_id", citationOwnerIds);
  if (citationError) throw new Error("demo citation cleanup failed");
  const { error: conflictError } = await client.from("conflicts").delete().in("request_id", conflictRequestIds);
  if (conflictError) throw new Error("demo conflict cleanup failed");
  const { error: classificationError } = await client.from("classifications").delete().in("item_id", itemIds);
  if (classificationError) throw new Error("demo classification cleanup failed");
  const tables = ["decisions", "decision_requests", "answers", "items", "meetings", "sources", "members"] as const;
  for (const table of tables) {
    const { error } = await client.from(table).delete().in("dept_id", departmentIds);
    if (error) throw new Error(`demo cleanup failed: ${table}`);
  }
  const { error: departmentError } = await client.from("departments").delete().in("id", departmentIds);
  if (departmentError) throw new Error("demo department cleanup failed");
  const { error: orgError } = await client.from("orgs").delete().eq("id", IDS.org);
  if (orgError) throw new Error("demo org cleanup failed");
}

async function seedDepartment(
  client: ReturnType<typeof createServiceSupabaseClient>,
  department: DemoDepartment,
): Promise<void> {
  const { error: departmentError } = await client.from("departments").insert({
    id: department.id,
    org_id: IDS.org,
    name: department.name,
    template: "general",
  });
  if (departmentError) throw new Error("demo department seed failed");

  const { error: sourceError } = await client.from("sources").insert(
    department.sources.map((source) => ({ dept_id: department.id, ...source, active: true })),
  );
  if (sourceError) throw new Error("demo source seed failed");

  const { error: itemError } = await client.from("items").insert(
    department.items.map((item) => ({
      id: item.id,
      source_id: item.source_id,
      dept_id: department.id,
      external_ref: item.external_ref,
      author_ext_id: `demo-${department.id.slice(0, 4)}`,
      author: item.author,
      content: item.content,
      embed_status: "done",
      embed_model: "demo",
    })),
  );
  if (itemError) throw new Error("demo item seed failed");

  const { error: classificationError } = await client.from("classifications").insert(
    department.items.map((item) => ({
      item_id: item.id,
      label: item.label,
      method: "rule",
      confidence: 0.95,
      reasoning: "합성 데모 데이터",
    })),
  );
  if (classificationError) throw new Error("demo classification seed failed");

  const { error: requestError } = await client.from("decision_requests").insert({
    id: department.request.id,
    dept_id: department.id,
    title: department.request.title,
    background: department.request.background,
    recommendation: department.request.recommendation,
    visibility: department.request.visibility,
    status: "open",
    origin_item_id: department.request.origin_item_id,
  });
  if (requestError) throw new Error("demo request seed failed");

  const { error: decisionError } = await client.from("decisions").insert({
    id: department.priorDecision.id,
    dept_id: department.id,
    decided_by_name: `${department.name} 리드`,
    outcome: department.priorDecision.outcome,
    rationale: department.priorDecision.rationale,
    lead_time_min: 42,
  });
  if (decisionError) throw new Error("demo decision seed failed");

  const requestCitation = department.items.find((item) => item.id === department.request.origin_item_id);
  if (!requestCitation) throw new Error("demo request citation seed failed");
  const { error: requestCitationError } = await client.from("citations").insert({
    owner_kind: "decision_request",
    owner_id: department.request.id,
    item_id: requestCitation.id,
    quote: requestCitation.content,
  });
  if (requestCitationError) throw new Error("demo request citation seed failed");

  const priorItem = department.items.find((item) => item.id === department.priorDecision.item_id);
  if (!priorItem) throw new Error("demo decision citation seed failed");
  const { error: decisionCitationError } = await client.from("citations").insert({
    owner_kind: "decision",
    owner_id: department.priorDecision.id,
    item_id: priorItem.id,
    quote: priorItem.content,
  });
  if (decisionCitationError) throw new Error("demo decision citation seed failed");

  const { error: conflictError } = await client.from("conflicts").insert({
    request_id: department.request.id,
    prior_decision_id: department.priorDecision.id,
    explanation: "과거 결정의 근거와 이번 안건을 함께 확인해야 합니다.",
  });
  if (conflictError) throw new Error("demo conflict seed failed");

  const { error: answerError } = await client.from("answers").insert(
    department.answers.map((answer) => ({
      id: answer.id,
      dept_id: department.id,
      question_key: answer.question_key,
      question: answer.question,
      answer: answer.answer,
      generic_answer: answer.generic_answer,
      status: "done",
      refused: false,
      verified: true,
    })),
  );
  if (answerError) throw new Error("demo answer seed failed");

  const answerCitations = department.answers.map((answer) => {
    const item = department.items.find((candidate) => candidate.id === answer.item_id);
    if (!item) throw new Error("demo answer citation seed failed");
    return { owner_kind: "answer", owner_id: answer.id, item_id: item.id, quote: item.content };
  });
  const { error: answerCitationError } = await client.from("citations").insert(answerCitations);
  if (answerCitationError) throw new Error("demo answer citation seed failed");
}

async function main(): Promise<void> {
  const client = createServiceSupabaseClient();
  await removeExistingDemoData(client);
  const { error: orgError } = await client.from("orgs").insert({
    id: IDS.org,
    name: "온새미로 주식회사",
    is_demo: true,
  });
  if (orgError) throw new Error("demo org seed failed");
  for (const department of DEMO_DEPARTMENTS) {
    await seedDepartment(client, department);
  }
  console.log("seed-demo complete: demo_org=1 departments=2 prepared_answers=12");
}

const isEntrypoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntrypoint) {
  main().catch((error: unknown) => {
    console.error("seed-demo failed:", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  });
}
