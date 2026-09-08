import { z } from "zod";

const NonEmptyString = z.string().min(1);
const NullableString = z
  .string()
  .nullable()
  .refine((value) => value === null || value.length > 0, {
    message: "빈 문자열은 허용하지 않습니다.",
  });

const Citation = z
  .strictObject({
    item_id: NullableString,
    decision_id: NullableString,
    quote: NonEmptyString,
  })
  .superRefine(({ item_id, decision_id }, context) => {
    if ((item_id === null) === (decision_id === null)) {
      context.addIssue({
        code: "custom",
        message: "item_id와 decision_id 중 정확히 하나가 필요합니다.",
      });
    }
  })
  .describe("item_id와 decision_id 중 정확히 하나만 값이어야 합니다.");

const Conflict = z.strictObject({
  decision_id: NonEmptyString,
  explanation: NonEmptyString,
});

const MeetingSummaryItem = z.strictObject({
  item_id: NonEmptyString,
  text: NonEmptyString,
});

export const IngestItem = z.strictObject({
  source_id: NonEmptyString,
  external_ref: NullableString,
  author_ext_id: NullableString,
  author: NullableString,
  spoken_at: NullableString,
  content: NonEmptyString,
});

export type IngestItem = z.infer<typeof IngestItem>;

export const Classification = z.strictObject({
  label: z.enum(["decision", "action", "info", "chatter", "unclassified"]),
  confidence: z.number().min(0).max(1).nullable(),
  deadline_hint: NullableString,
  assignee_hint: NullableString,
  reasoning: NonEmptyString,
});

export type Classification = z.infer<typeof Classification>;

// citations가 첫 필드인 것은 모델에게 근거 우선 작성을 유도하는 관행일 뿐이다.
// JSON Schema의 properties 순서는 생성 순서를 보장하지 않으며, 실제 방어는
// 카드 파이프라인의 원문 문자열 포함 검증이 맡는다.
export const CardDraft = z.strictObject({
  citations: z.array(Citation).min(1),
  title: NonEmptyString,
  background: NonEmptyString,
  deadline: NullableString,
  assignee_hint: NullableString,
  recommendation: NonEmptyString,
  conflicts: z.array(Conflict),
});

export type CardDraft = z.infer<typeof CardDraft>;

// 위와 마찬가지로 citations의 필드 순서 자체는 강제 장치가 아니다.
export const AnswerDraft = z.strictObject({
  citations: z.array(Citation).min(1),
  answer: NonEmptyString,
  refused: z.boolean(),
  refusal_reason: NullableString,
});

export type AnswerDraft = z.infer<typeof AnswerDraft>;

export const MeetingSummary = z.strictObject({
  decisions: z.array(MeetingSummaryItem),
  deferred: z.array(MeetingSummaryItem),
  actions: z.array(MeetingSummaryItem),
});

export type MeetingSummary = z.infer<typeof MeetingSummary>;

type JsonSchemaObject = Record<string, unknown>;

function isJsonSchemaObject(value: unknown): value is JsonSchemaObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function enforceStrictObjects(node: unknown): void {
  if (Array.isArray(node)) {
    node.forEach(enforceStrictObjects);
    return;
  }

  if (!isJsonSchemaObject(node)) {
    return;
  }

  if (isJsonSchemaObject(node.properties)) {
    node.additionalProperties = false;
    node.required = Object.keys(node.properties);
  }

  Object.values(node).forEach(enforceStrictObjects);
}

export function toStrictJsonSchema(
  name: string,
  schema: z.ZodType,
): object {
  const generated = z.toJSONSchema(schema, { target: "draft-7" });
  const strictSchema = { ...generated };

  Reflect.deleteProperty(strictSchema, "$schema");
  strictSchema.title = name;
  enforceStrictObjects(strictSchema);

  return strictSchema;
}
