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
  already_lead: "이미 부서장인 멤버입니다.",
  already_member: "이미 이 부서에 속한 멤버입니다.",
  department_name_taken: "같은 이름의 부서가 이미 있습니다.",
  department_not_empty: "멤버가 있는 부서에는 첫 부서장을 초대할 수 없습니다.",
  forbidden: "이 요청을 처리할 권한이 없습니다.",
  invalid_department_name: "부서 이름은 1자 이상 40자 이하로 입력해 주세요.",
  invalid_display_name: "표시 이름을 확인해 주세요.",
  invalid_email: "올바른 이메일 주소를 입력해 주세요.",
  invalid_limit: "조회 개수를 확인해 주세요.",
  invalid_range: "조회 기간은 최대 31일이며 시작일이 종료일보다 늦을 수 없습니다.",
  invite_email_mismatch: "로그인한 이메일과 초대받은 이메일이 다릅니다.",
  invite_expired: "초대 유효기간이 지났습니다.",
  invite_limit: "대기 중인 초대가 너무 많습니다. 기존 초대를 정리해 주세요.",
  invite_not_found: "초대를 찾을 수 없습니다.",
  invite_not_pending: "이미 처리되었거나 취소된 초대입니다.",
  invite_pending: "이 이메일로 보낸 초대가 이미 대기 중입니다.",
  invite_revoked: "취소된 초대입니다.",
  invite_used: "이미 사용된 초대입니다.",
  last_lead: "부서에는 최소 한 명의 부서장이 필요합니다.",
  not_authenticated: "로그인이 필요합니다.",
  not_lead: "해당 멤버는 부서장이 아닙니다.",
  not_member: "해당 부서의 멤버를 찾을 수 없습니다.",
  self_invite_forbidden: "본인을 첫 부서장으로 초대할 수 없습니다.",
};

export function adminErrorMessage(code: string): string {
  return ADMIN_ERROR_MESSAGES[code] ?? DEFAULT_ERROR;
}
