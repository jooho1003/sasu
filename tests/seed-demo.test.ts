import { describe, expect, it, vi } from "vitest";

import { weightedScore } from "../lib/agent-role";
import { DocumentSummary } from "../lib/contracts";
import { MASK_PATTERNS } from "../lib/mask";
import { verifyDocumentSummary } from "../lib/pipeline/document-summary";
import { DEMO_NOTION_EXCLUSIONS, DEMO_NOTION_ROOTS, DEMO_NOTION_SOURCES, DEMO_REVIEWER_ID } from "@/lib/demo-access";
import { DEMO_AGENT_ROLE, DEMO_DEPARTMENTS, DEMO_DOCUMENT_SUMMARIES, DEMO_DEPLOY_REVIEW_SOURCE_ID, DEMO_MEMBERS, DEMO_RETENTION_EXPORTS, DEMO_RETENTION_SETTINGS, DEMO_TRAILER_SLUG, seedDemoTrailer, seedDemoAttempts } from "../scripts/seed-demo";

describe("게스트 데모 시드", () => {
  it("부서 간 소스·항목·카드·답변 ID가 충돌하지 않는다", () => {
    for (const values of [DEMO_DEPARTMENTS.flatMap(d => d.sources), DEMO_DEPARTMENTS.flatMap(d => d.items), DEMO_DEPARTMENTS.flatMap(d => [d.request, ...(d.extraRequests ?? [])]), DEMO_DEPARTMENTS.flatMap(d => d.answers)]) {
      expect(new Set(values.map(value => value.id)).size).toBe(values.length);
    }
  });
  it("우선 대상 5개 부서와 기존 영업·개발 데모를 함께 보존한다", () => {
    for (const name of ["기획팀 사수", "인사팀 사수", "프론트개발팀 사수", "백엔드개발팀 사수", "디자인팀 사수", "영업 사수", "개발 사수"]) {
      const department = DEMO_DEPARTMENTS.find(entry => entry.name === name);
      expect(department, name).toBeDefined();
      expect(department!.answers.length).toBeGreaterThanOrEqual(5);
      expect(department!.sources.some(source => source.is_principles)).toBe(true);
    }
  });
  it("합성 Notion root 2개와 카운트·소스 목록을 함께 준비한다", () => {
    expect(DEMO_NOTION_ROOTS).toHaveLength(2);
    expect(DEMO_NOTION_SOURCES).toHaveLength(9);
    expect(DEMO_NOTION_EXCLUSIONS).toHaveLength(1);
    for (const root of DEMO_NOTION_ROOTS) {
      const sources = DEMO_NOTION_SOURCES.filter((source) => source.root_id === root.id);
      expect(sources).toHaveLength(root.discovered_count);
      expect(sources.filter((source) => source.active && source.last_synced_at && !source.last_error)).toHaveLength(root.completed_count);
      expect(sources.filter((source) => source.active && !source.last_synced_at && !source.last_error)).toHaveLength(root.pending_count);
      expect(sources.filter((source) => source.active && source.last_error)).toHaveLength(root.failed_count);
      expect(DEMO_NOTION_EXCLUSIONS.filter((entry) => entry.dept_id === root.dept_id)).toHaveLength(root.excluded_count);
      expect(root.card_candidates).toBe(false);
    }
  });
  it("데모 공개 링크는 22자리이며 스냅샷이 없으면 DB에 접근하지 않는다", async () => {
    expect(DEMO_TRAILER_SLUG).toMatch(/^[a-z0-9]{22}$/);
    const from = vi.fn();
    await seedDemoTrailer({ from } as unknown as Parameters<typeof seedDemoTrailer>[0], "tests/fixtures/not-present.snapshot.json");
    await seedDemoAttempts({ from } as unknown as Parameters<typeof seedDemoAttempts>[0], "tests/fixtures/not-present.snapshot.json");
    expect(from).not.toHaveBeenCalled();
  });
  it("모든 데모 부서에 기존 구성원과 자동 로그인 심사위원 부서장을 준비한다", () => {
    for (const department of DEMO_DEPARTMENTS) {
      const members = DEMO_MEMBERS.filter((member) => member.dept_id === department.id);
      expect(members).toHaveLength(4);
      expect(members.filter((member) => member.role === "lead")).toHaveLength(2);
      expect(members.filter((member) => member.consented)).toHaveLength(3);
      expect(members.find((member) => member.user_id === DEMO_REVIEWER_ID)).toMatchObject({
        role: "lead",
        consented: true,
        display_name: "심사위원 데모",
      });
    }
    expect(new Set(DEMO_MEMBERS.map((member) => member.user_id)).size).toBe(22);
    expect(DEMO_MEMBERS.find((member) => member.user_id === DEMO_AGENT_ROLE.created_by)?.role).toBe("lead");
  });

  it("모든 데모 부서의 기록 보존 설정을 미리 준비한다", () => {
    expect(DEMO_RETENTION_SETTINGS).toHaveLength(DEMO_DEPARTMENTS.length);
    expect(new Set(DEMO_RETENTION_SETTINGS.map((settings) => settings.dept_id))).toEqual(
      new Set(DEMO_DEPARTMENTS.map((department) => department.id)),
    );
    expect(
      DEMO_RETENTION_SETTINGS.every(
        (settings) =>
          settings.plan === "paid" &&
          settings.retention_days === 365 &&
          settings.checked_by === DEMO_REVIEWER_ID,
      ),
    ).toBe(true);
    expect(DEMO_RETENTION_EXPORTS).toHaveLength(DEMO_DEPARTMENTS.length);
    expect(DEMO_RETENTION_EXPORTS.every((entry) => entry.record_count > 0)).toBe(true);
    for (const department of DEMO_DEPARTMENTS) {
      expect(
        DEMO_MEMBERS.filter(
          (member) => member.dept_id === department.id && member.slack_user_id,
        ),
      ).toHaveLength(1);
    }
  });
  it("디자인팀은 인용 가능한 합성 데이터와 권한 차등을 갖는다", () => {
    const design = DEMO_DEPARTMENTS.find((department) => department.name === "디자인팀 사수");

    expect(design).toBeDefined();
    expect(design?.id).toMatch(/^eeeeeeee-/);
    expect(design?.sources.filter((source) => source.kind === "slack_channel" && source.visibility === "dept")).toHaveLength(1);
    expect(design?.sources.filter((source) => source.kind === "meeting")).toHaveLength(1);
    expect(design?.sources.filter((source) => source.is_principles)).toHaveLength(1);
    expect(design?.sources.filter((source) => source.visibility === "leads_only")).toHaveLength(1);
    expect(design?.items).toHaveLength(24);
    expect([design?.request, ...(design?.extraRequests ?? [])]).toHaveLength(2);
    expect([design?.priorDecision, ...(design?.extraPriorDecisions ?? [])]).toHaveLength(3);

    for (const request of [design?.request, ...(design?.extraRequests ?? [])]) {
      for (const itemId of request?.citation_item_ids ?? []) {
        expect(design?.items.find((item) => item.id === itemId)).toBeDefined();
      }
    }
  });

  it("모든 준비된 답변과 카드 인용은 같은 팀 원문에 포함된다", () => {
    for (const department of DEMO_DEPARTMENTS) {
      for (const request of [department.request, ...(department.extraRequests ?? [])]) {
        for (const itemId of request.citation_item_ids) {
          expect(department.items.find((item) => item.id === itemId)?.content).toBeTruthy();
        }
      }
      for (const answer of department.answers) {
        if (answer.refused) {
          expect(answer.item_ids).toEqual([]);
          continue;
        }
        expect(answer.item_ids.length).toBeGreaterThan(0);
        for (const itemId of answer.item_ids) {
          expect(department.items.find((item) => item.id === itemId)?.content).toBeTruthy();
        }
      }
    }
  });

  it("영업 가격 답변과 충돌 결정은 같은 가격·재입찰 맥락을 직접 뒷받침한다", () => {
    const sales = DEMO_DEPARTMENTS.find((department) => department.name === "영업 사수");
    const vendorAnswer = sales?.answers.find((answer) => answer.question_key === "vendor-price");

    expect(sales?.priorDecision.outcome).toContain("재입찰");
    expect(sales?.conflict_explanation).toContain("12%");
    expect(sales?.conflict_explanation).toContain("10%");
    expect(vendorAnswer?.item_ids).toEqual([
      "10000000-0000-4000-8000-000000000112",
      "10000000-0000-4000-8000-000000000111",
    ]);
  });

  it("개발 부서에 없는 가격·고객 질문은 무관한 인용 없이 거절한다", () => {
    const development = DEMO_DEPARTMENTS.find((department) => department.name === "개발 사수");
    for (const key of ["vendor-price", "interview", "pricing"]) {
      const answer = development?.answers.find((candidate) => candidate.question_key === key);
      expect(answer?.refused).toBe(true);
      expect(answer?.item_ids).toEqual([]);
    }
  });

  it("개발팀 역할 점수표는 각 지원서 원문 인용과 코드 계산 점수를 갖는다", () => {
    const development = DEMO_DEPARTMENTS.find((department) => department.id === DEMO_AGENT_ROLE.dept_id);

    expect(development).toBeDefined();
    expect(DEMO_AGENT_ROLE.visibility).toBe("dept");
    expect(DEMO_AGENT_ROLE.results).toHaveLength(3);

    for (const result of DEMO_AGENT_ROLE.results) {
      const sourceItems = development?.items.filter((item) => item.source_id === result.source_id) ?? [];
      for (const criterion of result.result.criteria) {
        if (criterion.evidence === "no_evidence") {
          expect(criterion.score).toBeNull();
          expect(criterion.citations).toEqual([]);
          continue;
        }
        expect(criterion.citations.length).toBeGreaterThan(0);
        for (const citation of criterion.citations) {
          expect(sourceItems.find((item) => item.id === citation.item_id)?.content).toContain(citation.quote);
        }
      }
      expect(result.weighted_score).toBe(weightedScore(result.result.criteria));
    }
    expect(DEMO_AGENT_ROLE.results.map((result) => result.weighted_score)).toEqual([5, 1.67, 0.67]);
    expect(DEMO_AGENT_ROLE.results.map((result) => result.weighted_score)).toEqual(
      [...DEMO_AGENT_ROLE.results].sort((left, right) => (right.weighted_score ?? 0) - (left.weighted_score ?? 0)).map((result) => result.weighted_score),
    );
  });

  it("합성 배포 점검 회의록은 개발 부서 문서이며 네 구역이 모두 채워진다", () => {
    const development = DEMO_DEPARTMENTS.find((department) => department.id === DEMO_AGENT_ROLE.dept_id);
    const source = development?.sources.find((entry) => entry.id === DEMO_DEPLOY_REVIEW_SOURCE_ID);
    const document = DEMO_DOCUMENT_SUMMARIES.find((entry) => entry.source_id === DEMO_DEPLOY_REVIEW_SOURCE_ID);

    expect(source).toMatchObject({ title: "배포 점검 회의록 (합성)", kind: "document", visibility: "dept", is_principles: false });
    expect(development?.items.filter((item) => item.source_id === DEMO_DEPLOY_REVIEW_SOURCE_ID)).toHaveLength(5);
    const summary = DocumentSummary.parse(document?.summary);
    expect(summary.key_points.length).toBeGreaterThanOrEqual(1);
    expect(summary.decisions.length).toBeGreaterThanOrEqual(1);
    expect(summary.actions.length).toBeGreaterThanOrEqual(1);
    expect(summary.open_questions.length).toBeGreaterThanOrEqual(1);
  });

  it("문서 요약 시드(지원서 3건 + 합성 문서)는 계약 전체 형태이며 검증에서 하나도 버려지지 않는다", () => {
    const development = DEMO_DEPARTMENTS.find((department) => department.id === DEMO_AGENT_ROLE.dept_id);

    expect(DEMO_AGENT_ROLE.documents).toHaveLength(3);
    expect(DEMO_DOCUMENT_SUMMARIES).toHaveLength(4);
    for (const document of DEMO_DOCUMENT_SUMMARIES) {
      const items = new Map(
        (development?.items ?? []).filter((item) => item.source_id === document.source_id).map((item) => [item.id, item.content]),
      );
      const summary = DocumentSummary.parse(document.summary);
      const verified = verifyDocumentSummary(summary, items);

      expect(verified.dropped).toBe(0);
      expect(verified.valid).toEqual(summary);
      expect(verified.valid.citations.length).toBeGreaterThan(0);
      expect(verified.valid.key_points.length).toBeGreaterThan(0);
    }
  });

  it("지원서 결과에는 합불 판정이 없고 합성 시드에는 마스킹 대상 문자열이 없다", () => {
    const forbiddenKeys = ["pass", "fail", "hire", "recommend"];
    const serializedResults = JSON.stringify(DEMO_AGENT_ROLE.results).toLowerCase();
    for (const key of forbiddenKeys) expect(serializedResults).not.toContain(`\"${key}\"`);

    const development = DEMO_DEPARTMENTS.find((department) => department.id === DEMO_AGENT_ROLE.dept_id);
    const serializedSeed = JSON.stringify({ development, role: DEMO_AGENT_ROLE });
    for (const { re } of MASK_PATTERNS) {
      const flags = re.flags.replace("g", "");
      expect(new RegExp(re.source, flags).test(serializedSeed)).toBe(false);
    }
  });
});
