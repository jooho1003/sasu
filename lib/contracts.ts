import { z } from "zod";

// Configure before constructing schemas: even Zod's eval capability probe
// raises a CSP violation. Keep the server parser's existing compilation mode.
if (typeof window !== "undefined") z.config({ jitless: true });

export const RetroActivityKind = z.enum([
  "git_commit", "claude_session", "claude_prompt", "codex_session", "memory_change", "doc_change", "web_visit", "web_search",
  "sasu_decision", "sasu_answer", "sasu_card", "sasu_review", "slack_message", "meeting_attended", "notion_page_changed",
  "manual_note", "voice_note", "figma_version", "figma_comment", "notion_edit", "notion_comment", "gdrive_edit", "gdrive_comment", "gdrive_rename",
  "confluence_edit", "confluence_comment", "github_pr", "github_review", "github_push", "jira_transition", "jira_worklog", "linear_change", "crm_call", "crm_meeting",
  "crm_email", "crm_note", "crm_deal", "calendar_event", "ticket_handled", "ticket_closed", "ats_stage", "ats_interview", "social_post", "video_publish", "metric_snapshot", "department_snapshot",
]);
export const RetroActivity = z.strictObject({ kind: RetroActivityKind, ref: z.string().min(1).max(200), title: z.string().min(1).max(200), at: z.iso.datetime({ offset: true }), text: z.string().max(500), meta: z.record(z.string(), z.union([z.string().max(500), z.number().finite(), z.boolean()])).default({}) });
export type RetroActivity = z.infer<typeof RetroActivity>;
export const RetroBundle = z.strictObject({ version: z.literal(1), date: z.iso.date(), tz: z.string().min(1).max(64), collected_at: z.iso.datetime({ offset: true }), collector: z.strictObject({ name: z.literal("sasu-retro-collect"), version: z.string().min(1).max(20) }), activities: z.array(RetroActivity).max(500) });
export type RetroBundle = z.infer<typeof RetroBundle>;
export const RetroCitation = z.strictObject({ activity_id: z.string().min(1), quote: z.string().min(1).max(500) });
export const RetroItem = z.strictObject({ citations: z.array(RetroCitation).min(1).max(20), text: z.string().min(1).max(2000) });
export const RetroBody = z.strictObject({ did: z.array(RetroItem).max(200), learned: z.array(RetroItem).max(200), decided: z.array(RetroItem).max(200), next: z.array(RetroItem).max(200) });
export type RetroBody = z.infer<typeof RetroBody>;
export const RetroDraft = z.strictObject({ citations: z.array(RetroCitation).min(1).max(200), title: z.string().min(1).max(60), highlight: z.string().min(1).max(500).nullable(), topics: z.array(z.string().min(1).max(50)).min(1).max(5), body: RetroBody });
export type RetroDraft = z.infer<typeof RetroDraft>;
export const RetroEdit = z.strictObject({ revision: z.number().int().nonnegative(), title: z.string().min(1).max(60), body: RetroBody, topics: z.array(z.string().min(1).max(50)).max(5) });
export const RetroDayRow = z.object({ id: z.uuid(), dept_id: z.uuid(), user_id: z.uuid(), retro_date: z.iso.date(), tz: z.string(), visibility: z.enum(["self", "dept", "leads_only"]), status: z.enum(["collecting", "drafting", "draft", "needs_review", "confirmed", "failed"]), status_reason: z.string().nullable(), activity_count: z.number().int(), revision: z.number().int(), confirmed_revision: z.number().int().nullable(), confirmed_at: z.string().nullable(), topics: z.array(z.string()), generation: z.number().int(), updated_at: z.string(), display_name: z.string().optional(), title: z.string().nullable().optional() });
export type RetroDayRow = z.infer<typeof RetroDayRow>;
export const RetroActivityRow = RetroActivity.extend({ id: z.uuid(), day_id: z.uuid(), connection_id: z.uuid().nullable().optional(), source_visibility: z.enum(["dept", "leads_only"]).nullable(), excluded: z.boolean() });
export type RetroActivityRow = z.infer<typeof RetroActivityRow>;
export const RetroRevisionRow = z.object({ day_id: z.uuid(), revision: z.number().int(), origin: z.enum(["draft", "edit", "confirm"]), title: z.string(), body: RetroBody, topics: z.array(z.string()), highlight: z.string().nullable(), citations: z.array(RetroCitation), created_at: z.string() });
export type RetroRevisionRow = z.infer<typeof RetroRevisionRow>;

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

export const SalesReviewFocus = z.enum(["all", "price", "schedule"]);
export type SalesReviewFocus = z.infer<typeof SalesReviewFocus>;
export const SalesReviewRejectReason = z.enum(["price", "schedule"]);
export type SalesReviewRejectReason = z.infer<typeof SalesReviewRejectReason>;
export const SalesReviewPriority = z.enum(["price", "schedule", "sso"]);
export const SalesReviewChoice = z.strictObject({
  priority: SalesReviewPriority,
  reply_style: z.enum(["brief", "detailed"]),
});
export type SalesReviewChoice = z.infer<typeof SalesReviewChoice>;
export const SalesReviewSourceId = z.enum(["S1", "S2", "S3", "S4"]);
export const SalesReviewCitation = z.strictObject({ source_id: SalesReviewSourceId, quote: z.string().min(1) });
export const SalesReviewLine = z.strictObject({ text: z.string().min(1), citations: z.array(SalesReviewCitation).min(1) });
export const SalesReviewResult = z.strictObject({
  case_version: z.literal(1),
  focus: SalesReviewFocus,
  priority: SalesReviewPriority,
  reply_style: SalesReviewChoice.shape.reply_style,
  total_delta_krw: z.number().int(),
  comparison: z.array(SalesReviewLine).min(1),
  policy_flags: z.array(SalesReviewLine).min(1),
  questions: z.array(SalesReviewLine).min(1),
  reply_draft: z.array(SalesReviewLine).min(1),
});
export type SalesReviewResult = z.infer<typeof SalesReviewResult>;

export const SalesReviewSourceSelection = z.strictObject({
  request_item_id: z.uuid(),
  old_quote_item_id: z.uuid(),
  new_quote_item_id: z.uuid(),
  policy_item_id: z.uuid(),
});
export type SalesReviewSourceSelection = z.infer<typeof SalesReviewSourceSelection>;

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

// 모델은 번호만 고른다. 인용 텍스트는 서버가 원문에서 자른다(ADR-067).
// citations 이름은 게이트웨이의 빈 근거 거절 판정에도 사용한다.
export const AnswerSelection = z.strictObject({
  evidence: z.number().int().min(1),
  first_paragraph: z.number().int().min(1),
  last_paragraph: z.number().int().min(1),
});

export const AnswerDraft = z.strictObject({
  citations: z.array(AnswerSelection).max(8),
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
  expires_at: z.iso.datetime({ offset: true }),
});
export type TrailerInviteOpen = z.infer<typeof TrailerInviteOpen>;

export const TrailerInviteStatus = z.enum(["pending", "opened", "consented", "submitted", "scored", "expired", "revoked", "withdrawn", "purged"]);
export const TrailerInviteRow = z.strictObject({
  invite_id: z.uuid(),
  email: z.string().nullable(),
  status: TrailerInviteStatus,
  expires_at: z.iso.datetime({ offset: true }),
  first_opened_at: z.iso.datetime({ offset: true }).nullable(),
  consented_at: z.iso.datetime({ offset: true }).nullable(),
  submitted_at: z.iso.datetime({ offset: true }).nullable(),
  attempt_id: z.uuid().nullable(),
  attempt_status: z.string().nullable(),
  weighted_score: z.number().nullable(),
});
export type TrailerInviteRow = z.infer<typeof TrailerInviteRow>;

export const TrailerInviteIssued = z.strictObject({
  invite_id: z.uuid().nullable(),
  email: z.string().nullable(),
  token: TrailerInviteToken.nullable(),
  expires_at: z.iso.datetime({ offset: true }).nullable(),
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
export const MemberRole = z.enum(["lead", "member"]);

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
    "review_settings_update",
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
  confidence: z.enum(["normal", "low"]).nullable().optional(), boundary_review: z.boolean().optional(),
});

export const DeptGlossaryInput = z.strictObject({
  id: z.uuid().nullable(),
  term: z.string().trim().min(1).max(100),
  reading: z.string().trim().min(1).max(100).nullable(),
  note: z.string().trim().min(1).max(300).nullable(),
});

export const RecordingAccuracyEvidence = z.strictObject({
  trials: z.array(z.strictObject({
    mode: z.enum(["microphone", "tab", "system"]),
    glossary: z.enum(["before", "after"]),
    os: z.string().min(1),
    browser: z.string().min(1),
    file_path: z.string().min(1),
    file_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    duration_seconds: z.number().finite().positive(),
    reference: z.string().min(1),
    hypothesis: z.string(),
    terms: z.array(z.strictObject({ reference: z.string().min(1), recognized: z.string() })),
    sections: z.array(z.strictObject({ error: z.boolean(), flagged: z.boolean() })),
  })),
  meetings: z.array(z.strictObject({
    id: z.string().min(1),
    labels: z.array(z.string().min(1)),
    before: z.array(z.string().min(1)),
    after: z.array(z.string().min(1)),
  })),
});
export type RecordingAccuracyEvidence = z.infer<typeof RecordingAccuracyEvidence>;
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
// Recording v1 fixes 16 kHz / mono / PCM16 LE with a 44-byte WAV header.
// Client declarations contain no storage paths or authorization identifiers.
export const ReviewRecordingStart = z.strictObject({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  input_method: z.enum(["microphone", "system_and_microphone"]),
  visibility: z.enum(["dept", "leads_only"]),
  participants: z.array(z.string().uuid()).max(100).refine((ids) => new Set(ids).size === ids.length),
  consent_confirmed: z.literal(true),
  meeting_provider: z.enum(["in_person", "meet", "zoom", "other"]),
  continues_recording_id: z.string().uuid().nullable().optional(),
});
export type ReviewRecordingStart = z.infer<typeof ReviewRecordingStart>;

export const RecordingOriginalSegment = z.strictObject({
  index: z.number().int().min(0).max(29),
  sample_count: z.number().int().min(1).max(960_000),
  bytes: z.number().int().min(46).max(1_920_044),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).refine((segment) => segment.bytes === 44 + segment.sample_count * 2, { message: "recording_segment_size_invalid" });
export type RecordingOriginalSegment = z.infer<typeof RecordingOriginalSegment>;
export const RecordingManifest = z.strictObject({
  version: z.literal(1),
  segments: z.array(RecordingOriginalSegment).min(1).max(30),
}).refine(({ segments }) => segments.every((segment, index) => segment.index === index &&
  (index === segments.length - 1 || segment.sample_count === 960_000)) &&
  segments.reduce((total, segment) => total + segment.sample_count, 0) <= 28_800_000 &&
  segments.reduce((total, segment) => total + segment.bytes, 0) <= 64 * 1024 * 1024,
{ message: "recording_manifest_invalid" });
export type RecordingManifest = z.infer<typeof RecordingManifest>;
// Descriptive only: SQL stores it with the session's consent snapshot and never
// uses it for authorization or completion. Captured may exceed the retained prefix.
export const RecordingCaptureMetadata = z.strictObject({
  paused: z.boolean(),
  interrupted: z.boolean(),
  captured_samples: z.number().int().min(1).max(28_800_000),
  levels: z.strictObject({ microphone: z.string().max(2400).regex(/^[A-Za-z0-9+/]*={0,2}$/),
    system: z.string().max(2400).regex(/^[A-Za-z0-9+/]*={0,2}$/).nullable() }).optional(),
  clipping_ratio: z.number().min(0).max(1).optional(),
  health: z.strictObject({
    checkpoint_delays: z.number().int().min(0).max(1800),
    max_pending_samples: z.number().int().min(0).max(1_000_000),
    backlog_stops: z.number().int().min(0).max(1),
    max_sample_wall_gap_ms: z.number().int().min(0).max(1_800_000),
    microphone_reselects: z.number().int().min(0).max(100),
  }).optional(),
}).refine((value) => {
  const fields = [value.levels, value.clipping_ratio, value.health];
  return fields.every((field) => field === undefined) || fields.every((field) => field !== undefined);
}, { message: "recording_profile_incomplete" });
export type RecordingCaptureMetadata = z.infer<typeof RecordingCaptureMetadata>;
export const RecordingSave = z.strictObject({ manifest: RecordingManifest, capture: RecordingCaptureMetadata })
  .refine(({ manifest, capture }) => capture.captured_samples >= manifest.segments.reduce((total, segment) => total + segment.sample_count, 0),
    { message: "recording_capture_invalid" });
export type RecordingSave = z.infer<typeof RecordingSave>;
export const RecordingSegmentState = z.object({
  index: z.number().int().min(0).max(29),
  attempt: z.number().int().min(1).max(3),
  path: z.string().min(1),
  status: z.enum(["awaiting_upload", "verifying", "verified", "failed"]),
  error_code: z.string().nullable(),
});
export type RecordingSegmentState = z.infer<typeof RecordingSegmentState>;
export const RecordingSaveResult = z.object({
  review_id: z.string().uuid(),
  state: z.enum(["saving", "completed"]),
  segments: z.array(RecordingSegmentState).min(1).max(30),
});
export type RecordingSaveResult = z.infer<typeof RecordingSaveResult>;
export type ReviewedMaterial = {
  id:string; dept_id:string; kind:"audio"|"document"; title:string; filename:string; visibility:"dept"|"leads_only";
  fingerprint:string; duration:number|null; file_size:number; original_path:string|null; status:string; status_reason:string|null;
  revision:number; sections:ReviewSection[]; published_revision:number|null; published_source_id:string|null;
  created_at:string; updated_at:string; confirmed_at:string|null; original_deleted_at:string|null;
  original_layout?:string; capture_metadata?:Record<string,unknown>|null; created_by?:string;
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
// ADR-058: identifiers/authority come from the session RPC, never from the browser.
export const OriginalAccessGrant = z.object({
  token: z.string().min(1), path: z.string().min(1),
  kind: z.enum(["audio", "document"]), filename: z.string().min(1),
});
// ADR-070 decision 6: one grant, one ticket, one verified segment.
export const OriginalSegmentAccessGrant = OriginalAccessGrant.extend({
  kind: z.literal("audio"),
  segment_index: z.number().int().min(0).max(29),
  sample_count: z.number().int().min(1).max(960_000),
});
export const ReviewOrgSettings = z.object({
  browser_recording_enabled: z.boolean(), allow_original_download: z.boolean(),
});
export const ReviewAccessEvent = z.object({
  id: z.number(), review_id: z.string(), dept_id: z.string(), actor_id: z.string(),
  action: z.enum(["play_original", "download_original", "export", "reextract"]),
  created_at: z.string(),
});
// ADR-059: synthetic hiring practice; no candidate/server persistence.
export const HiringFile = z.object({ name: z.string().min(1).max(120), size: z.number().int().positive().max(2 * 1024 * 1024) });
export const HiringMission = z.object({
  id: z.string(), deptId: z.uuid(), team: z.string(), role: z.string(), title: z.string(), brief: z.string(),
  timebox: z.string(), facts: z.array(z.object({ id: z.string(), label: z.string(), text: z.string() })).min(3),
  stages: z.array(z.object({ id: z.string(), label: z.string(), prompt: z.string() })).length(3),
  deliverables: z.array(z.string()).min(3), criteria: z.array(z.string()).min(3),
  sample: z.object({ approach: z.string(), artifact: z.string(), filename: z.string() }),
});
export type HiringMission = z.infer<typeof HiringMission>;
export const HiringSubmission = z.object({
  approach: z.string().trim().min(30).max(6000), artifact: z.string().trim().max(40000),
  factIds: z.array(z.string()).min(1), checkpoints: z.array(z.object({ stageId: z.string(), note: z.string().trim().min(10).max(2000) })).length(3),
  file: HiringFile.nullable(),
});
export type HiringSubmission = z.infer<typeof HiringSubmission>;

// ADR-064: URLs and credentials are never accepted as collection scope.
export const RetroConnectionProvider = z.enum(["github", "figma", "google_calendar", "notion", "jira", "confluence", "linear", "salesmap", "hubspot", "pipedrive", "intercom", "zendesk", "wanted", "stibee", "mailchimp", "meta", "youtube", "ga4"]);
export type RetroConnectionProvider = z.infer<typeof RetroConnectionProvider>;
export const RetroConnectionConfig = z.strictObject({
  repositories: z.array(z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)).max(10).optional(),
  files: z.array(z.string().regex(/^[A-Za-z0-9_-]{5,100}$/)).max(10).optional(),
  pages: z.array(z.uuid()).max(10).optional(),
  pageIds: z.array(z.string().regex(/^\d{1,30}$/)).max(10).optional(),
  issues: z.array(z.uuid()).max(10).optional(),
  projects: z.array(z.string().regex(/^[A-Z][A-Z0-9_]{1,30}$/)).max(10).optional(),
  subdomain: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/).optional(),
  cloudId: z.uuid().optional(),
  propertyId: z.string().regex(/^\d{1,20}$/).optional(),
  pageId: z.string().regex(/^\d{1,30}$/).optional(),
});
export type RetroConnectionConfig = z.infer<typeof RetroConnectionConfig>;
export const RetroConnectionInput = z.strictObject({ provider: RetroConnectionProvider, config: RetroConnectionConfig, secret: z.string().min(1).max(8000), consent: z.literal(true) });
export const RetroOAuthStart = z.strictObject({ dept: z.string().min(1).max(100), config: RetroConnectionConfig, consent: z.literal(true) });
export const RetroCredential = z.strictObject({
  accessToken: z.string().min(1).max(8000), refreshToken: z.string().min(1).max(8000).nullable(),
  expiresAt: z.number().int().positive().nullable(), subjectId: z.string().min(1).max(150),
  authKind: z.enum(["token", "oauth"]), scopes: z.array(z.string().max(200)).max(30),
});
export type RetroCredential = z.infer<typeof RetroCredential>;

// UI names mirror existing database states; wire values remain unchanged.
export const CardStatus = z.enum(["open","decided","deferred","rejected","needs_review","merged"]);
export const AnswerStatus = z.enum(["pending","done","refused","failed"]);
export const ItemLabel = Classification.shape.label;
export const Visibility = AgentRoleDefinition.shape.visibility;
export const TrailerStatus = z.enum(["generating","checking","review","published","unpublished","failed"]);
export const InviteAttempt = z.enum(["scoring","scored","failed"]);
export const ReviewStatus = z.enum(["uploading","processing","ready","failed","cancelled","deleted"]);
export const JobStatus = z.enum(["queued","running","done","failed"]);
export const NotionRootState = z.enum(["pending","discovering","idle","paused_consent","paused_limit","failed","disabled"]);
export const AnswerDeliveryState = z.enum(["pending","sent","failed","cancelled"]);
