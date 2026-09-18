import {
  TrailerInviteEmail,
  TrailerInviteOpen,
  TrailerInviteRow,
  type TrailerInviteOpen as TrailerInviteOpenType,
  type TrailerInviteRow as TrailerInviteRowType,
} from "@/lib/contracts";
import { validateScenario } from "@/lib/trailer";

export const TRAILER_INVITE_CONSENT_VERSION = "2026-09-18.1";

const EMAIL_SPLITTER = /[\s,]+/;
const STATUS_LABELS: Record<TrailerInviteRowType["status"], string> = {
  pending: "미열람",
  opened: "열람",
  consented: "동의",
  submitted: "제출",
  scored: "검토 완료",
  expired: "만료",
  revoked: "철회",
  withdrawn: "본인 철회",
  purged: "파기 완료",
};

export function normalizeInviteEmails(raw: string): { emails: string[]; invalid: string[] } {
  const values = raw.split(EMAIL_SPLITTER).filter(Boolean);
  if (values.length > 20) throw new Error("invite_batch_too_large");

  const emails: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const parsed = TrailerInviteEmail.safeParse(value);
    if (!parsed.success) {
      invalid.push(value);
      continue;
    }
    if (!seen.has(parsed.data)) {
      seen.add(parsed.data);
      emails.push(parsed.data);
    }
  }
  return { emails, invalid };
}

export function maskInviteEmail(email: string): string {
  const normalized = TrailerInviteEmail.safeParse(email);
  if (!normalized.success) return "***";
  const [local, domain] = normalized.data.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}

export function parseTrailerInviteOpen(data: unknown): TrailerInviteOpenType | null {
  const parsed = TrailerInviteOpen.safeParse(data);
  if (!parsed.success) return null;
  try {
    return { ...parsed.data, scenarios: parsed.data.scenarios.map(validateScenario) };
  } catch {
    return null;
  }
}

export function parseTrailerInviteRows(data: unknown): TrailerInviteRowType[] {
  return TrailerInviteRow.array().parse(data);
}

export function inviteStatusLabel(status: TrailerInviteRowType["status"]): string {
  return STATUS_LABELS[status];
}

export function inviteErrorCode(error: unknown): "invite_unavailable" | "consent_required" | "already_submitted" | "invalid_attempt" | "unknown" {
  if (!error || typeof error !== "object") return "unknown";
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  if (message === "invite_unavailable") return "invite_unavailable";
  if (message === "consent_required") return "consent_required";
  if (message === "already_submitted") return "already_submitted";
  if (message === "invalid_attempt") return "invalid_attempt";
  return "unknown";
}
