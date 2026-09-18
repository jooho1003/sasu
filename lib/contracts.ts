import { z } from "zod";

export const DecisionCorrectionInput = z.object({
  previous_id: z.uuid(), correction_id: z.uuid(), outcome: z.string().trim().min(1).max(300), rationale: z.string().trim().min(1).max(1_000),
}).strict();
export const CardReminderInput = z.object({ scheduled_for: z.iso.datetime().nullable() }).strict();
export const AskQuestionInput = z.object({ question: z.string().trim().min(5), parent_id: z.uuid().nullable().optional() });

const NonEmptyString = z.string().min(1);
const NullableString = z
  .string()
  .nullable()
  .refine((value) => value === null || value.length > 0, {
    message: "빈 문자열은 허용하지 않습니다.",
  });

export const Citation = z
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

export type Citation = z.infer<typeof Citation>;

const Conflict = z.strictObject({
  decision_id: NonEmptyString,
  explanation: NonEmptyString,
});

const MeetingSummaryItem = z.strictObject({
  item_id: NonEmptyString,
  text: NonEmptyString,
});

export const DocumentSummary = z.strictObject({
  citations: z.array(Citation).min(1),
  overview: NonEmptyString,
  key_points: z.array(MeetingSummaryItem),
  decisions: z.array(MeetingSummaryItem),
  actions: z.array(MeetingSummaryItem),
  open_questions: z.array(MeetingSummaryItem),
});

export type DocumentSummary = z.infer<typeof DocumentSummary>;

export const AgentRoleCriterion = z.strictObject({
  key: z.string().regex(/^[a-z0-9_]{1,40}$/),
  label: z.string().min(1).max(40),
  description: z.string().min(1).max(300),
  weight: z.number().int().min(1).max(5),
});

export type AgentRoleCriterion = z.infer<typeof AgentRoleCriterion>;

export const AgentRoleDefinition = z
  .strictObject({
    name: z.string().min(1).max(60),
    instruction: z.string().min(1).max(2000),
    visibility: z.enum(["dept", "leads_only"]),
    criteria: z.array(AgentRoleCriterion).min(1).max(10),
  })
  .superRefine(({ criteria }, context) => {
    const keys = new Set<string>();
    for (const [index, criterion] of criteria.entries()) {
      if (keys.has(criterion.key)) {
        context.addIssue({
          code: "custom",
          path: ["criteria", index, "key"],
          message: "기준 key는 중복될 수 없습니다.",
        });
      }
      keys.add(criterion.key);
    }
  });

export type AgentRoleDefinition = z.infer<typeof AgentRoleDefinition>;

export const AgentRoleEvaluation = z.strictObject({
  criteria: z.array(z.strictObject({
    key: NonEmptyString,
    score: z.number().int().min(0).max(5).nullable(),
    rationale: NullableString,
    citations: z.array(Citation),
  })),
  summary: NonEmptyString,
});

export type AgentRoleEvaluation = z.infer<typeof AgentRoleEvaluation>;

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

export const MergeConfirmation = z.strictObject({
  same_decision: z.boolean(),
  reason: NonEmptyString,
});

export type MergeConfirmation = z.infer<typeof MergeConfirmation>;

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

const TrailerText = z.string().trim().min(1).max(2000);
const TrailerId = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/);

export const TrailerScenario = z.strictObject({
  id: TrailerId,
  title: TrailerText,
  summary: TrailerText,
  facts: z.array(z.strictObject({
    id: TrailerId,
    place: z.enum(["library", "meeting", "messenger", "finance", "partner"]),
    label: TrailerText,
    text: TrailerText,
  })).min(1).max(30),
  dialogues: z.array(z.strictObject({
    id: TrailerId,
    place: z.enum(["finance", "partner"]),
    question: TrailerText,
    fact_id: TrailerId,
    quote: TrailerText,
  })).min(1).max(20),
  choices: z.array(z.strictObject({ id: TrailerId, label: TrailerText })).min(2).max(5),
  ending: z.strictObject({ choice_id: TrailerId, fact_id: TrailerId, quote: TrailerText }),
});

export type TrailerScenario = z.infer<typeof TrailerScenario>;

export const TrailerGenerationDraft = z.strictObject({
  id: z.string(), title: z.string(), summary: z.string(),
  facts: z.array(z.strictObject({ id: z.string(), place: z.enum(["library", "meeting", "messenger", "finance", "partner"]), label: z.string(), text: z.string() })),
  dialogues: z.array(z.strictObject({ id: z.string(), place: z.enum(["finance", "partner"]), question: z.string(), fact_id: z.string(), quote: z.string() })),
  choices: z.array(z.strictObject({ id: z.string(), label: z.string() })),
  ending: z.strictObject({ choice_id: z.string(), fact_id: z.string(), quote: z.string() }),
});
export type TrailerGenerationDraft = z.infer<typeof TrailerGenerationDraft>;

export const TrailerGateReport = z.strictObject({ passed: z.boolean(), violations: z.array(z.strictObject({ path: z.string(), rule: z.enum(["overlap", "proper_noun", "mask", "schema"]) })) });
export type TrailerGateReport = z.infer<typeof TrailerGateReport>;

export const TrailerSubmission = z.strictObject({
  choice_id: TrailerId,
  reason: z.string().trim().min(1).max(1000),
  fact_ids: z.array(TrailerId).min(1).max(30),
});

export type TrailerSubmission = z.infer<typeof TrailerSubmission>;

export const TrailerAttemptEvent = z.strictObject({ seq: z.number().int().min(1), kind: z.enum(["open_fact", "ask_dialogue", "choose", "submit"]), ref: TrailerId });
export const TrailerAttemptSubmission = z.strictObject({ scenario_id: TrailerId, choice_id: TrailerId, reason: z.string().trim().min(1).max(1000), fact_ids: z.array(TrailerId).min(1).max(30), events: z.array(TrailerAttemptEvent).max(200) });
export type TrailerAttemptSubmission = z.infer<typeof TrailerAttemptSubmission>;
const TrailerScoreEvidence = z.strictObject({ scenario_id: z.string(), kind: z.enum(["reason_quote", "event", "fact"]), quote: z.string().nullable(), seq: z.number().int().nullable(), fact_id: z.string().nullable() });
const TrailerQuestionBasis = z.strictObject({ scenario_id: z.string(), kind: z.enum(["reason_quote", "event", "fact", "unchecked_dialogue", "unchecked_fact"]), ref: z.string().nullable(), quote: z.string().nullable(), seq: z.number().int().nullable() });
const TrailerInterviewQuestion = z.strictObject({ question: z.string(), basis: z.array(TrailerQuestionBasis) });
export const TrailerScoreDraft = z.strictObject({ criteria: z.array(z.strictObject({ key: z.string(), score: z.number().int().nullable(), rationale: z.string().nullable(), evidence: z.array(TrailerScoreEvidence) })), interview_questions: z.array(TrailerInterviewQuestion) });
export type TrailerScoreDraft = z.infer<typeof TrailerScoreDraft>;
export const TrailerAttemptResult = z.strictObject({ rubric_snapshot: z.array(AgentRoleCriterion), criteria: z.array(z.strictObject({ key: z.string(), label: z.string(), weight: z.number().int().min(1).max(5), score: z.number().int().min(0).max(5).nullable(), rationale: z.string().nullable(), evidence_status: z.enum(["ok", "no_evidence"]), evidence: z.array(TrailerScoreEvidence) })), interview_questions: z.array(TrailerInterviewQuestion) });
export type TrailerAttemptResult = z.infer<typeof TrailerAttemptResult>;

export const TrailerInviteToken = z.string().regex(/^[0-9a-f]{64}$/);
export type TrailerInviteToken = z.infer<typeof TrailerInviteToken>;

export const TrailerInviteEmail = z.string().trim().toLowerCase().email().max(254);
export type TrailerInviteEmail = z.infer<typeof TrailerInviteEmail>;

export const TrailerInviteOpen = z.strictObject({
  scenarios: z.array(TrailerScenario).min(1).max(3),
  apply_url: z.url().refine((url) => new URL(url).protocol === "https:").nullable(),
  org_display_name: z.string().trim().min(1),
  state: z.enum(["consent_required", "ready", "submitted", "withdrawn"]),
  consent_version: z.string().trim().min(1),
  expires_at: z.iso.datetime(),
});
export type TrailerInviteOpen = z.infer<typeof TrailerInviteOpen>;

const TrailerInviteStatus = z.enum(["pending", "opened", "consented", "submitted", "scored", "expired", "revoked", "withdrawn", "purged"]);
export const TrailerInviteRow = z.strictObject({
  invite_id: z.uuid(),
  email: z.string().nullable(),
  status: TrailerInviteStatus,
  expires_at: z.iso.datetime(),
  first_opened_at: z.iso.datetime().nullable(),
  consented_at: z.iso.datetime().nullable(),
  submitted_at: z.iso.datetime().nullable(),
  attempt_status: z.string().nullable(),
  weighted_score: z.number().nullable(),
});
export type TrailerInviteRow = z.infer<typeof TrailerInviteRow>;

export const TrailerInviteIssued = z.strictObject({
  invite_id: z.uuid().nullable(),
  email: z.string().nullable(),
  token: TrailerInviteToken.nullable(),
  expires_at: z.iso.datetime().nullable(),
  skipped_reason: z.enum(["invalid_email", "duplicate", "active_exists"]).nullable(),
});
export type TrailerInviteIssued = z.infer<typeof TrailerInviteIssued>;

export const CreateTrailerInvitesBody = z.strictObject({ emails: z.array(z.string()).min(1).max(20) });
export type CreateTrailerInvitesBody = z.infer<typeof CreateTrailerInvitesBody>;

export const SubmitTrailerInviteBody = z.strictObject({
  token: TrailerInviteToken,
  email: TrailerInviteEmail,
  consent_version: z.string().trim().min(1),
  submissions: z.array(TrailerAttemptSubmission).min(1).max(3),
});
export type SubmitTrailerInviteBody = z.infer<typeof SubmitTrailerInviteBody>;

export const TrailerInviteOpenBody = z.strictObject({ token: TrailerInviteToken, email: TrailerInviteEmail });
export type TrailerInviteOpenBody = z.infer<typeof TrailerInviteOpenBody>;

const Uuid = z.uuid();
const Timestamp = NonEmptyString;
const Count = z.number().int().nonnegative();
const MemberRole = z.enum(["lead", "member"]);

const AdminDepartmentOverview = z.strictObject({
  dept_id: Uuid,
  name: NonEmptyString,
  lead_names: z.array(NonEmptyString),
  member_count: Count,
  consented_count: Count,
  active_source_count: Count,
  decisions_30d: Count,
  answers_30d: Count,
});

export const AdminOverview = z.strictObject({
  org_name: NonEmptyString,
  departments: z.array(AdminDepartmentOverview),
  llm_calls_this_month: Count,
    trailer_publish_enabled: z.boolean().default(false),
    published_trailers: z.array(z.strictObject({ trailer_id: Uuid, dept_name: NonEmptyString, title: NonEmptyString, published_at: Timestamp, public_path: z.string().regex(/^\/t\/[a-z0-9]{22}$/) })).default([]),
});
export type AdminOverview = z.infer<typeof AdminOverview>;

const AdminMemberFields = {
  display_name: NonEmptyString,
  dept_id: Uuid,
  dept_name: NonEmptyString,
  role: MemberRole,
  consented_at: NullableString,
  consent_version: z.number().int().nullable(),
  slack_linked: z.boolean(),
};

export const AdminMemberRow = z.strictObject({
  user_id: Uuid,
  email: z.email(),
  ...AdminMemberFields,
});
export type AdminMemberRow = z.infer<typeof AdminMemberRow>;

export const DemoAdminMemberRow = z.strictObject(AdminMemberFields);
export type DemoAdminMemberRow = z.infer<typeof DemoAdminMemberRow>;

export const AdminInviteRow = z.strictObject({
  invite_id: Uuid,
  dept_id: Uuid,
  dept_name: NonEmptyString,
  email: z.email(),
  role: MemberRole,
  invited_by_role: z.enum(["org_admin", "lead"]),
  expires_at: Timestamp,
  created_at: Timestamp,
});
export type AdminInviteRow = z.infer<typeof AdminInviteRow>;

export const LeadInviteRow = z.strictObject({
  invite_id: Uuid,
  email: z.email(),
  role: MemberRole,
  expires_at: Timestamp,
  created_at: Timestamp,
  created_by_label: NonEmptyString,
});
export type LeadInviteRow = z.infer<typeof LeadInviteRow>;

export const AdminSourceRow = z.strictObject({
  source_id: Uuid,
  dept_id: Uuid,
  dept_name: NonEmptyString,
  kind: NonEmptyString,
  title: NullableString,
  visibility: z.enum(["dept", "leads_only"]),
  is_principles: z.boolean(),
  active: z.boolean().nullable(),
  item_count: Count,
  last_synced_at: NullableString,
  has_error: z.boolean(),
});
export type AdminSourceRow = z.infer<typeof AdminSourceRow>;

export const AdminAnswerStatRow = z.strictObject({
  day: z.iso.date(),
  dept_id: Uuid,
  dept_name: NonEmptyString,
  answered: Count,
  refused: Count,
  failed: Count,
  cited_dept: Count,
  cited_leads_only: Count,
  cited_decisions: Count,
});
export type AdminAnswerStatRow = z.infer<typeof AdminAnswerStatRow>;

export const AdminEventRow = z.strictObject({
  event_id: Count,
  created_at: Timestamp,
  actor_label: NonEmptyString,
  action: z.enum([
    "department_create",
    "first_lead_invite",
    "member_invite",
    "invite_revoke",
    "invite_accept",
    "lead_promote",
    "lead_demote",
    "member_remove",
  ]),
  dept_name: NonEmptyString,
  target_user_label: NonEmptyString,
});
export type AdminEventRow = z.infer<typeof AdminEventRow>;

export const InvitePreview = z.strictObject({
  org_name: NonEmptyString,
  dept_name: NonEmptyString,
  role: MemberRole,
  email_masked: NonEmptyString,
  status: z.enum(["valid", "accepted", "revoked", "expired"]),
});
export type InvitePreview = z.infer<typeof InvitePreview>;

export const InviteCreated = z.strictObject({
  invite_id: Uuid,
  token: NonEmptyString,
  expires_at: Timestamp,
});
export type InviteCreated = z.infer<typeof InviteCreated>;

export const CreateDepartmentBody = z.strictObject({
  name: z.string().trim().min(1).max(40),
});
export type CreateDepartmentBody = z.infer<typeof CreateDepartmentBody>;

export const InviteEmailBody = z.strictObject({ email: z.email() });
export type InviteEmailBody = z.infer<typeof InviteEmailBody>;

export const AcceptInviteBody = z.strictObject({
  token: NonEmptyString,
  displayName: z.string().trim().min(1).max(60),
});
export type AcceptInviteBody = z.infer<typeof AcceptInviteBody>;

export const MemberTargetBody = z.strictObject({
  userId: Uuid,
  deptId: Uuid,
});
export type MemberTargetBody = z.infer<typeof MemberTargetBody>;

export const ReviewSection = z.object({
  id: z.string().min(1).max(100), text: z.string().max(20_000), original_text: z.string().max(20_000),
  origin: z.enum(["extracted", "transcribed", "user"]), edited: z.boolean(),
  location: z.string().max(200).nullable(), start_seconds: z.number().nonnegative().nullable(), end_seconds: z.number().nonnegative().nullable(),
});
export type ReviewSection = z.infer<typeof ReviewSection>;
export const ReviewEdit = z.object({
  revision: z.number().int().positive(), title: z.string().trim().min(1).max(120),
  sections: z.array(z.object({id:z.string().min(1).max(100),text:z.string().max(20_000)})).max(1000),
});
export const ReviewCreate = z.object({
  id: z.uuid(), kind: z.enum(["audio", "document"]), title:z.string().trim().min(1).max(120),
  filename:z.string().min(1).max(200), size:z.number().int().positive().max(50*1024*1024),
  fingerprint:z.string().regex(/^[a-f0-9]{64}$/), duration:z.number().positive().max(1800).nullable(),
  visibility:z.enum(["dept","leads_only"]), participants:z.array(z.uuid()).max(100), synthetic:z.boolean(), consent_confirmed:z.literal(true),
});
export type ReviewedMaterial = {
  id:string; dept_id:string; kind:"audio"|"document"; title:string; filename:string; visibility:"dept"|"leads_only";
  fingerprint:string; duration:number|null; file_size:number; original_path:string|null; status:string; status_reason:string|null;
  revision:number; sections:ReviewSection[]; published_revision:number|null; published_source_id:string|null;
  created_at:string; updated_at:string; confirmed_at:string|null; original_deleted_at:string|null;
};
export type ReviewPart = { id:string; part_index:number; start_seconds:number|null; end_seconds:number|null; status:string; error_code:string|null; attempt:number };

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
