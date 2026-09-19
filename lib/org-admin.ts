const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_ERROR = "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";

function parseDate(value: string): number | null {
  if (!DATE_PATTERN.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10) === value
    ? timestamp
    : null;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return null;
  }
  return email;
}

export function answerStatsRange(input: {
  from?: string;
  to?: string;
  today: string;
}): { from: string; to: string } | { error: "invalid_range" } {
  const today = parseDate(input.today);
  if (today === null) return { error: "invalid_range" };

  const fromValue = input.from ?? formatDate(today - 13 * DAY_MS);
  const toValue = input.to ?? input.today;
  const from = parseDate(fromValue);
  const to = parseDate(toValue);
  if (from === null || to === null || to < from || to - from > 30 * DAY_MS) {
    return { error: "invalid_range" };
  }
  return { from: fromValue, to: toValue };
}

export function inviteUrl(origin: string, token: string): string {
  return new URL(`/invite/${encodeURIComponent(token)}`, origin).toString();
}

const ADMIN_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  "already_lead": "이미 팀장입니다. 다른 멤버를 고르세요.",
  "already_member": "이미 이 부서에 속한 멤버입니다. 멤버 목록에서 확인하세요.",
  "department_name_taken": "같은 이름의 부서가 있습니다. 다른 이름을 적으세요.",
  "department_not_empty": "멤버가 있어 첫 팀장을 초대할 수 없습니다. 부서 설정에서 팀장을 정하세요.",
  "forbidden": "이 요청을 처리할 권한이 없습니다. 조직 관리자에게 확인하세요.",
  "invalid_department_name": "부서 이름의 길이가 맞지 않습니다. 1자 이상 40자 이하로 적으세요.",
  "invalid_display_name": "표시 이름이 올바르지 않습니다. 사용할 이름을 다시 적으세요.",
  "invalid_email": "이메일 주소가 올바르지 않습니다. 주소를 다시 확인하세요.",
  "invalid_limit": "보려는 개수가 올바르지 않습니다. 목록을 새로 고쳐 주세요.",
  "invalid_range": "기간을 확인할 수 없습니다. 시작일이 종료일보다 앞서는 31일 이내 기간을 고르세요.",
  "invite_email_mismatch": "로그인한 이메일과 초대받은 이메일이 다릅니다. 초대받은 이메일로 로그인하세요.",
  "invite_expired": "초대 기한이 지났습니다. 팀장에게 새 초대를 요청하세요.",
  "invite_limit": "아직 안 받은 초대가 너무 많습니다. 기존 초대를 정리하세요.",
  "invite_not_found": "초대를 찾을 수 없습니다. 초대한 사람에게 링크를 다시 요청하세요.",
  "invite_not_pending": "이미 처리되었거나 취소된 초대입니다. 부서 목록에서 결과를 확인하세요.",
  "invite_pending": "이 이메일로 보낸 초대가 있습니다. 기존 초대를 확인하세요.",
  "invite_revoked": "취소된 초대입니다. 팀장에게 새 초대를 요청하세요.",
  "invite_used": "이미 사용한 초대입니다. 로그인한 뒤 부서 목록을 확인하세요.",
  "last_lead": "팀장은 한 명은 있어야 합니다. 먼저 다른 팀장을 정하세요.",
  "not_authenticated": "로그인이 필요합니다. 로그인한 뒤 다시 시도하세요.",
  "not_lead": "해당 멤버는 팀장이 아닙니다. 멤버 목록을 새로 고쳐 주세요.",
  "not_member": "해당 부서의 멤버를 찾을 수 없습니다. 멤버 목록을 새로 고쳐 주세요.",
  "self_invite_forbidden": "본인을 첫 팀장으로 초대할 수 없습니다. 다른 담당자를 초대하세요."
};

export function adminErrorMessage(code: string): string {
  return ADMIN_ERROR_MESSAGES[code] ?? DEFAULT_ERROR;
}
