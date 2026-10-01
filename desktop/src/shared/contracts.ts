// Design Ref: desktop-companion §4·§7 — every server response is narrowed before crossing IPC.
import {
  CompanionContextResponse,
  CompanionDepartmentsResponse,
  CompanionInbox,
  CompanionLinkResponse,
  type CompanionContextResponse as CompanionContext,
  type CompanionDepartmentsResponse as CompanionDepartments,
  type CompanionInbox as CompanionInboxData,
  type CompanionLinkResponse as CompanionLink,
} from "@sasu/contracts";
import { z } from "zod";

const Uuid = z.string().uuid();
const DateTime = z.iso.datetime({ offset: true });

const AskStartResponse = z.strictObject({
  answer_id: Uuid,
  job_id: Uuid,
  truncated: z.boolean(),
});

const AnswerCitation = z.strictObject({
  quote: z.string().min(1),
  author: z.string().min(1),
  source: z.string().min(1),
  occurred_at: z.string().nullable(),
  href: z.string().min(1),
  low_confidence: z.boolean().optional(),
  boundary_review: z.boolean().optional(),
});
const AnswerResponse = z.strictObject({
  id: Uuid,
  status: z.enum(["pending", "done", "refused", "failed"]),
  answer: z.string().nullable(),
  refused: z.boolean(),
  citations: z.array(AnswerCitation),
});

const QuestionRow = z.strictObject({
  id: Uuid,
  question: z.string(),
  status: z.string().min(1),
  created_at: DateTime,
  parent_id: Uuid.nullable(),
});
const QuestionsResponse = z.strictObject({
  questions: z.array(QuestionRow),
  next: z
    .strictObject({ before: DateTime, before_id: Uuid })
    .nullable(),
});

const CardCitation = z.strictObject({
  quote: z.string().min(1),
  author: z.string().min(1),
  occurredAt: z.string().nullable(),
  source: z.string().min(1),
  href: z.string().min(1),
  lowConfidence: z.boolean(),
  boundaryReview: z.boolean(),
});
const DecisionRow = z.strictObject({
  id: Uuid,
  decided_by_name: z.string().min(1),
  decided_at: z.string().nullable(),
  outcome: z.string(),
  rationale: z.string(),
});
const CardResponse = z.strictObject({
  card: z.strictObject({
    id: Uuid,
    dept_id: Uuid,
    title: z.string().min(1),
    background: z.string(),
    recommendation: z.string().nullable(),
    deadline: z.string().nullable(),
    assignee_id: Uuid.nullable(),
    status: z.enum(["open", "decided", "deferred", "rejected", "needs_review"]),
    visibility: z.enum(["dept", "leads_only"]),
  }),
  citations: z.array(CardCitation),
  conflicts: z.array(
    z.strictObject({
      id: Uuid,
      prior_decision_id: Uuid,
      explanation: z.string(),
    }),
  ),
  decisions: z.array(DecisionRow),
});

const CardDecisionResponse = z.strictObject({
  ok: z.literal(true),
  duplicate: z.boolean().optional(),
  decision_id: Uuid.optional(),
  status: z.enum(["decided", "deferred", "rejected", "open"]).optional(),
  message: z.string().optional(),
});

const TranscriptResponse = z.strictObject({
  job_ids: z.array(Uuid),
  meeting_id: Uuid,
  summary_job_id: Uuid,
  accepted: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});
const ReviewCreatedResponse = z.strictObject({ id: Uuid });
const ReviewPartResponse = z.strictObject({ job_id: Uuid });
const CompanionMember = z.strictObject({
  user_id: Uuid,
  display_name: z.string().min(1).max(120),
  consented_at: DateTime,
});
const CompanionMembersResponse = z.strictObject({
  members: z.array(CompanionMember),
});
const SalesSourceCandidate = z.strictObject({
  item_id: Uuid,
  title: z.string().min(1),
  kind: z.string().min(1),
  quote: z.string().min(1),
  is_principles: z.boolean(),
});
const SalesSourcesResponse = z.strictObject({
  candidates: z.array(SalesSourceCandidate),
});
const SalesStartResponse = z.strictObject({ task_id: Uuid });
const SalesStatusResponse = z.strictObject({
  status: z.enum(["queued", "processing", "ready", "refused", "failed"]),
  web_path: z.string().startsWith("/d/"),
});

export type AskStart = z.infer<typeof AskStartResponse>;
export type Answer = z.infer<typeof AnswerResponse>;
export type Questions = z.infer<typeof QuestionsResponse>;
export type Card = z.infer<typeof CardResponse>;
export type CardDecision = z.infer<typeof CardDecisionResponse>;
export type TranscriptResult = z.infer<typeof TranscriptResponse>;
export type SalesSources = z.infer<typeof SalesSourcesResponse>;
export type SalesStatus = z.infer<typeof SalesStatusResponse>;
export type CompanionMembers = z.infer<typeof CompanionMembersResponse>;
export type ReviewUploadRequest = {
  review: {
    id: string;
    kind: "audio" | "document";
    title: string;
    filename: string;
    size: number;
    fingerprint: string;
    duration: number | null;
    visibility: "dept" | "leads_only";
    participants: string[];
    synthetic: boolean;
    consent_confirmed: true;
  };
  contentType: string;
  original: Uint8Array;
  parts: { index: number; seconds: number; bytes: Uint8Array }[];
};
export type DesktopSettings = {
  seen: string[];
  pet: "green" | "blue" | "purple";
  reduceMotion: boolean;
  panelPinned: boolean;
};

export function parseCompanionDepartments(value: unknown): CompanionDepartments {
  return CompanionDepartmentsResponse.parse(value);
}

export function parseCompanionLink(value: unknown): CompanionLink {
  return CompanionLinkResponse.parse(value);
}

export function parseCompanionContext(value: unknown): CompanionContext {
  return CompanionContextResponse.parse(value);
}

export function parseCompanionInbox(value: unknown): CompanionInboxData {
  return CompanionInbox.parse(value);
}

export function parseCompanionMembers(value: unknown): CompanionMembers {
  return CompanionMembersResponse.parse(value);
}

export function parseAskStart(value: unknown): AskStart {
  return AskStartResponse.parse(value);
}

export function parseAnswer(value: unknown): Answer {
  return AnswerResponse.parse(value);
}

export function parseQuestions(value: unknown): Questions {
  return QuestionsResponse.parse(value);
}

export function parseCard(value: unknown): Card {
  return CardResponse.parse(value);
}

export function parseCardDecision(value: unknown): CardDecision {
  return CardDecisionResponse.parse(value);
}

export function parseTranscriptResult(value: unknown): TranscriptResult {
  return TranscriptResponse.parse(value);
}

export function parseReviewCreated(value: unknown): { id: string } {
  return ReviewCreatedResponse.parse(value);
}

export function parseReviewPartQueued(value: unknown): { job_id: string } {
  return ReviewPartResponse.parse(value);
}

export function parseSalesSources(value: unknown): SalesSources {
  return SalesSourcesResponse.parse(value);
}

export function parseSalesStart(value: unknown): { task_id: string } {
  return SalesStartResponse.parse(value);
}

export function parseSalesStatus(value: unknown): SalesStatus {
  return SalesStatusResponse.parse(value);
}
