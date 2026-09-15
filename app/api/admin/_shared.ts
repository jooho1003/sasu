import { adminErrorMessage, inviteUrl } from "@/lib/org-admin";
import { InviteCreated } from "@/lib/contracts";

const ERROR_CODES = [
  "already_lead", "already_member", "department_name_taken", "department_not_empty",
  "forbidden", "invalid_department_name", "invalid_display_name", "invalid_email",
  "invalid_limit", "invalid_range", "invite_email_mismatch", "invite_expired",
  "invite_limit", "invite_not_found", "invite_not_pending", "invite_pending",
  "invite_revoked", "invite_used", "last_lead", "not_authenticated", "not_lead",
  "not_member", "self_invite_forbidden",
] as const;

export function featureNotFound(): Response {
  return Response.json({ error: "not_found" }, { status: 404 });
}

export function stripAuthorityFields(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const safe = { ...(value as Record<string, unknown>) };
  for (const key of ["org_id", "dept_id", "created_by", "role", "asked_by", "decided_by"]) {
    Reflect.deleteProperty(safe, key);
  }
  return safe;
}

export async function requestBody(request: Request): Promise<unknown | null> {
  try {
    return stripAuthorityFields(await request.json());
  } catch {
    return null;
  }
}

export function rpcErrorResponse(error: { code?: string; message?: string }): Response {
  const code = ERROR_CODES.find((candidate) => error.message === candidate) ??
    (error.code === "42501" ? "forbidden" : "unknown");
  const status = error.code === "42501" ? 403 : error.code === "22023" ? 400 : error.code === "P0001" ? 409 : 500;
  return Response.json({ error: code, message: adminErrorMessage(code) }, { status });
}

export function createdInviteResponse(data: unknown, origin: string): Response {
  const row = Array.isArray(data) ? data[0] : data;
  const parsed = InviteCreated.safeParse(row);
  if (!parsed.success) return rpcErrorResponse({ code: "XX000" });
  return Response.json({
    inviteId: parsed.data.invite_id,
    inviteUrl: inviteUrl(origin, parsed.data.token),
    expiresAt: parsed.data.expires_at,
  }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
