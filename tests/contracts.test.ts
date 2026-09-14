import { describe, expect, it } from "vitest";

import {
  AnswerDraft,
  AgentRoleDefinition,
  AgentRoleEvaluation,
  CardDraft,
  Classification,
  DocumentSummary,
  IngestItem,
  MeetingSummary,
  MergeConfirmation,
  toStrictJsonSchema,
} from "@/lib/contracts";

const ITEM_ID = "11111111-1111-4111-8111-111111111111";
const DECISION_ID = "22222222-2222-4222-8222-222222222222";

type JsonSchemaNode = {
  type?: string | string[];
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchemaNode;
  anyOf?: JsonSchemaNode[];
  oneOf?: JsonSchemaNode[];
  allOf?: JsonSchemaNode[];
  $defs?: Record<string, JsonSchemaNode>;
  definitions?: Record<string, JsonSchemaNode>;
};

function visitSchema(
  node: JsonSchemaNode,
  visitor: (node: JsonSchemaNode) => void,
): void {
  visitor(node);

  Object.values(node.properties ?? {}).forEach((child) =>
    visitSchema(child, visitor),
  );

  if (node.items) {
    visitSchema(node.items, visitor);
  }

  for (const keyword of ["anyOf", "oneOf", "allOf"] as const) {
    node[keyword]?.forEach((child) => visitSchema(child, visitor));
  }

  Object.values(node.$defs ?? {}).forEach((child) =>
    visitSchema(child, visitor),
  );
  Object.values(node.definitions ?? {}).forEach((child) =>
    visitSchema(child, visitor),
  );
}

function withoutKey<T extends object, K extends keyof T>(
  value: T,
  key: K,
): Omit<T, K> {
  const copy = { ...value };
  Reflect.deleteProperty(copy, key);
  return copy;
}

const itemCitation = {
  item_id: ITEM_ID,
  decision_id: null,
  quote: "외주사 B 견적은 재입찰이 필요합니다.",
};

describe("IngestItem", () => {
  const valid = {
    source_id: ITEM_ID,
    external_ref: "1710000000.000100",
    author_ext_id: "U12345",
    author: "김사수",
    spoken_at: "2026-09-08T09:00:00.000Z",
    content: "오늘까지 견적을 확인해 주세요.",
  };

  it("정상 입력과 nullable DB 필드를 파싱한다", () => {
    expect(IngestItem.parse(valid)).toEqual(valid);
    expect(
      IngestItem.parse({
        ...valid,
        external_ref: null,
        author_ext_id: null,
        author: null,
        spoken_at: null,
      }),
    ).toBeTruthy();
  });

  it("필수 필드 누락과 타입 불일치를 거부한다", () => {
    const missingContent = withoutKey(valid, "content");

    expect(IngestItem.safeParse(missingContent).success).toBe(false);
    expect(
      IngestItem.safeParse({ ...valid, source_id: 123 }).success,
    ).toBe(false);
  });
});

describe("Classification", () => {
  const valid = {
    label: "decision" as const,
    confidence: 0.92,
    deadline_hint: "2026-09-11T08:00:00.000Z",
    assignee_hint: "김팀장",
    reasoning: "결정 요청과 마감 표현이 함께 있습니다.",
  };

  it("정상 입력과 허용 label을 파싱한다", () => {
    expect(Classification.parse(valid)).toEqual(valid);
    for (const label of [
      "decision",
      "action",
      "info",
      "chatter",
      "unclassified",
    ]) {
      expect(Classification.safeParse({ ...valid, label }).success).toBe(true);
    }
  });

  it("deadline_hint가 null인 입력을 허용한다", () => {
    expect(
      Classification.safeParse({
        ...valid,
        confidence: null,
        deadline_hint: null,
        assignee_hint: null,
      }).success,
    ).toBe(true);
  });

  it("필수 필드 누락과 타입 불일치를 거부한다", () => {
    const missingReasoning = withoutKey(valid, "reasoning");

    expect(Classification.safeParse(missingReasoning).success).toBe(false);
    expect(
      Classification.safeParse({ ...valid, label: "unknown" }).success,
    ).toBe(false);
    expect(
      Classification.safeParse({ ...valid, confidence: "high" }).success,
    ).toBe(false);
  });
});

describe("CardDraft", () => {
  const valid = {
    citations: [itemCitation],
    title: "외주사 B 견적 재입찰 여부",
    background: "견적이 기존 원칙의 인상 한도를 넘었습니다.",
    deadline: "2026-09-11T08:00:00.000Z",
    assignee_hint: "김팀장",
    recommendation: "재입찰을 검토하세요.",
    conflicts: [
      {
        decision_id: DECISION_ID,
        explanation: "연 10% 이상 인상 시 재입찰한다는 결정과 충돌합니다.",
      },
    ],
  };

  it("정상 입력과 nullable 힌트를 파싱한다", () => {
    expect(CardDraft.parse(valid)).toEqual(valid);
    expect(
      CardDraft.safeParse({
        ...valid,
        deadline: null,
        assignee_hint: null,
      }).success,
    ).toBe(true);
  });

  it("citations 0개인 CardDraft를 거부한다", () => {
    expect(CardDraft.safeParse({ ...valid, citations: [] }).success).toBe(false);
  });

  it("인용에서 item_id와 decision_id 중 정확히 하나만 허용한다", () => {
    expect(
      CardDraft.safeParse({
        ...valid,
        citations: [
          { item_id: ITEM_ID, decision_id: DECISION_ID, quote: "인용" },
        ],
      }).success,
    ).toBe(false);
    expect(
      CardDraft.safeParse({
        ...valid,
        citations: [{ item_id: null, decision_id: null, quote: "인용" }],
      }).success,
    ).toBe(false);
  });

  it("필수 필드 누락과 타입 불일치를 거부한다", () => {
    const missingBackground = withoutKey(valid, "background");

    expect(CardDraft.safeParse(missingBackground).success).toBe(false);
    expect(
      CardDraft.safeParse({ ...valid, conflicts: "없음" }).success,
    ).toBe(false);
  });
});

describe("MergeConfirmation", () => {
  const valid = {
    same_decision: true,
    reason: "두 기록 모두 외주사 B의 12% 인상 견적 수락 여부를 다룹니다.",
  };

  it("동일 미결 결정 판정과 이유를 파싱한다", () => {
    expect(MergeConfirmation.parse(valid)).toEqual(valid);
  });

  it("모든 필드가 필수이고 추가 필드를 거부한다", () => {
    expect(
      MergeConfirmation.safeParse(withoutKey(valid, "reason")).success,
    ).toBe(false);
    expect(
      MergeConfirmation.safeParse({ ...valid, ignored: true }).success,
    ).toBe(false);
  });
});

describe("AnswerDraft", () => {
  const valid = {
    citations: [itemCitation],
    answer: "외주사 B 견적은 재입찰 검토 대상으로 결정되었습니다.",
    refused: false,
    refusal_reason: null,
  };

  it("정상 입력을 파싱한다", () => {
    expect(AnswerDraft.parse(valid)).toEqual(valid);
  });

  it("citations 0개인 AnswerDraft를 거부한다", () => {
    expect(AnswerDraft.safeParse({ ...valid, citations: [] }).success).toBe(
      false,
    );
  });

  it("필수 필드 누락과 타입 불일치를 거부한다", () => {
    const missingRefused = withoutKey(valid, "refused");

    expect(AnswerDraft.safeParse(missingRefused).success).toBe(false);
    expect(AnswerDraft.safeParse({ ...valid, answer: 123 }).success).toBe(false);
  });
});

describe("MeetingSummary", () => {
  const valid = {
    decisions: [{ item_id: ITEM_ID, text: "외주사 B는 재입찰한다." }],
    deferred: [{ item_id: ITEM_ID, text: "최종 견적 확인은 보류한다." }],
    actions: [{ item_id: ITEM_ID, text: "재무팀이 견적을 재확인한다." }],
  };

  it("각 항목에 item_id 인용이 있는 정상 입력을 파싱한다", () => {
    expect(MeetingSummary.parse(valid)).toEqual(valid);
  });

  it("필수 필드 누락과 타입 불일치를 거부한다", () => {
    const missingActions = withoutKey(valid, "actions");

    expect(MeetingSummary.safeParse(missingActions).success).toBe(false);
    expect(
      MeetingSummary.safeParse({
        ...valid,
        deferred: [{ item_id: 123, text: "보류" }],
      }).success,
    ).toBe(false);
  });
});

describe("DocumentSummary", () => {
  const valid = {
    citations: [itemCitation],
    overview: "정산 정책과 담당 업무를 정리한 문서입니다.",
    key_points: [{ item_id: ITEM_ID, text: "정산일은 매월 25일입니다." }],
    decisions: [],
    actions: [{ item_id: ITEM_ID, text: "담당자는 세금계산서를 확인합니다." }],
    open_questions: [],
  };

  it("인용과 업무 섹션을 파싱한다", () => {
    expect(DocumentSummary.parse(valid)).toEqual(valid);
  });

  it("인용이 없으면 거부한다", () => {
    expect(DocumentSummary.safeParse({ ...valid, citations: [] }).success).toBe(false);
  });
});

describe("toStrictJsonSchema", () => {
  const schemas = [
    toStrictJsonSchema("classification", Classification),
    toStrictJsonSchema("card_draft", CardDraft),
    toStrictJsonSchema("answer_draft", AnswerDraft),
    toStrictJsonSchema("meeting_summary", MeetingSummary),
    toStrictJsonSchema("document_summary", DocumentSummary),
    toStrictJsonSchema("merge_confirmation", MergeConfirmation),
    toStrictJsonSchema("agent_role_evaluation", AgentRoleEvaluation),
  ] as JsonSchemaNode[];

  it("산출물의 모든 object에 additionalProperties:false가 있다", () => {
    for (const schema of schemas) {
      visitSchema(schema, (node) => {
        const types = Array.isArray(node.type) ? node.type : [node.type];
        if (types.includes("object")) {
          expect(node.additionalProperties).toBe(false);
        }
      });
    }
  });

  it("산출물에 optional 필드가 없다 (required == properties 키 전부)", () => {
    for (const schema of schemas) {
      visitSchema(schema, (node) => {
        if (node.properties) {
          expect([...(node.required ?? [])].sort()).toEqual(
            Object.keys(node.properties).sort(),
          );
        }
      });
    }
  });

  it("deadline_hint를 nullable union으로 표현한다", () => {
    const schema = toStrictJsonSchema(
      "classification",
      Classification,
    ) as JsonSchemaNode;

    expect(schema.properties?.deadline_hint?.type).toEqual([
      "string",
      "null",
    ]);
  });

  it("중첩 object와 array item에도 strict 요건을 재귀 적용한다", () => {
    const schema = toStrictJsonSchema(
      "card_draft",
      CardDraft,
    ) as JsonSchemaNode;
    const citationItem = schema.properties?.citations?.items;

    expect(citationItem?.additionalProperties).toBe(false);
    expect([...(citationItem?.required ?? [])].sort()).toEqual([
      "decision_id",
      "item_id",
      "quote",
    ]);
    expect(citationItem?.properties?.item_id?.type).toEqual([
      "string",
      "null",
    ]);
  });
});

describe("AgentRole contracts", () => {
  const valid = {
    name: "지원서 검토",
    instruction: "직무 경험을 검토합니다.",
    visibility: "leads_only" as const,
    criteria: [{ key: "experience", label: "경험", description: "관련 경험", weight: 3 }],
  };

  it("기준 key 중복과 범위를 거부한다", () => {
    expect(AgentRoleDefinition.safeParse(valid).success).toBe(true);
    expect(AgentRoleDefinition.safeParse({ ...valid, criteria: [...valid.criteria, valid.criteria[0]] }).success).toBe(false);
    expect(AgentRoleDefinition.safeParse({ ...valid, criteria: [{ ...valid.criteria[0], key: "대문자" }] }).success).toBe(false);
  });

  it("평가에는 점수·근거·인용만 있고 모든 필드가 필수다", () => {
    const evaluation = {
      criteria: [{ key: "experience", score: 4, rationale: "근거", citations: [itemCitation] }],
      summary: "요약",
    };
    expect(AgentRoleEvaluation.safeParse(evaluation).success).toBe(true);
    expect(AgentRoleEvaluation.safeParse({ ...evaluation, criteria: [{ ...evaluation.criteria[0], rationale: null }] }).success).toBe(true);
    expect(AgentRoleEvaluation.safeParse({ ...evaluation, criteria: [{ ...evaluation.criteria[0], rationale: "" }] }).success).toBe(false);
    expect(AgentRoleEvaluation.safeParse({ ...evaluation, recommendation: "합격" }).success).toBe(false);
  });
});
