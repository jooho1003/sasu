export type RuleSignal = {
  isDecisionCandidate: boolean;
  reasons: string[];
  deadlineHint: Date | null;
};

export type NonDecisionLabel = "action" | "info" | "chatter";

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const QUESTION_MARK = /[?？]/;
const REQUEST_EXPRESSION =
  /(?:할까요|(?:해|아|어)도\s*(?:돼요|되나요|될까요)|확인\s*부탁|검토\s*부탁)/;
const DEFERRED_TAG = /(?:^|[\s[#])보류(?=$|[\s\]#:：-])/;
const ACTION_EXPRESSION =
  /(?:해s*주세요|받아s*주세요|확인해s*주세요|검토해s*주세요|정리해s*주세요|공유해s*주세요|보내s*주세요|예약해s*주세요|진행해s*주세요|제출해s*주세요|담당자는|담당자\s*[:：]|까지\s+[^.!?？\n]*(?:받아|확인|정리|공유|제출|예약|완료|진행))/;
const CHATTER_EXPRESSION =
  /(?:점심|저녁|아침|커피|간식|날씨|주말|퇴근|맛점|ㅋㅋ|ㅎㅎ|어때요\??)\s*$/;

type KstDateParts = { year: number; month: number; day: number; weekday: number };

function kstDateParts(date: Date): KstDateParts {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

function endOfKstDay(year: number, month: number, day: number): Date | null {
  const candidate = new Date(
    Date.UTC(year, month - 1, day, 23, 59, 59, 999) - KST_OFFSET_MS,
  );
  const parts = kstDateParts(candidate);

  if (parts.year !== year || parts.month !== month || parts.day !== day) {
    return null;
  }

  return candidate;
}

function addKstDays(parts: KstDateParts, days: number): Date {
  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days, 23, 59, 59, 999) -
      KST_OFFSET_MS,
  );
}

function inferYearlessDeadline(
  month: number,
  day: number,
  spokenAt: Date,
  parts: KstDateParts,
): Date | null {
  const thisYear = endOfKstDay(parts.year, month, day);

  if (thisYear === null) {
    return null;
  }

  if (thisYear.getTime() >= spokenAt.getTime()) {
    return thisYear;
  }

  return endOfKstDay(parts.year + 1, month, day);
}

function explicitDateDeadline(
  content: string,
  spokenAt: Date,
  parts: KstDateParts,
): { matched: boolean; deadline: Date | null } {
  const iso = content.match(/(?<!\d)((?:19|20)\d{2})-(\d{1,2})-(\d{1,2})(?!\d)/);
  if (iso) {
    return {
      matched: true,
      deadline: endOfKstDay(Number(iso[1]), Number(iso[2]), Number(iso[3])),
    };
  }

  const korean = content.match(/(?<!\d)(\d{1,2})월\s*(\d{1,2})일/);
  if (korean) {
    return {
      matched: true,
      deadline: inferYearlessDeadline(
        Number(korean[1]),
        Number(korean[2]),
        spokenAt,
        parts,
      ),
    };
  }

  const slash = content.match(/(?<!\d)(\d{1,2})\/(\d{1,2})(?!\d)/);
  if (slash) {
    return {
      matched: true,
      deadline: inferYearlessDeadline(
        Number(slash[1]),
        Number(slash[2]),
        spokenAt,
        parts,
      ),
    };
  }

  return { matched: false, deadline: null };
}

function deadlineFromContent(
  content: string,
  spokenAt: Date,
): { matched: boolean; deadline: Date | null } {
  const parts = kstDateParts(spokenAt);

  if (content.includes("오늘까지")) {
    return { matched: true, deadline: addKstDays(parts, 0) };
  }

  if (content.includes("내일까지")) {
    return { matched: true, deadline: addKstDays(parts, 1) };
  }

  if (content.includes("이번 주까지")) {
    const daysUntilSunday = (7 - parts.weekday) % 7;
    return { matched: true, deadline: addKstDays(parts, daysUntilSunday) };
  }

  if (/금요일(?:까지)?/.test(content)) {
    const daysUntilFriday = (5 - parts.weekday + 7) % 7;
    return { matched: true, deadline: addKstDays(parts, daysUntilFriday) };
  }

  return explicitDateDeadline(content, spokenAt, parts);
}

export function classifyByRules(input: {
  content: string;
  spokenAt: Date;
  hasReplyWithin12h?: boolean;
}): RuleSignal {
  const { content, spokenAt, hasReplyWithin12h } = input;
  const reasons: string[] = [];
  const isQuestionRequest = REQUEST_EXPRESSION.test(content);

  if (isQuestionRequest) {
    reasons.push("question_request");
  }

  const deadline = deadlineFromContent(content, spokenAt);
  if (deadline.matched) {
    reasons.push("deadline");
  }

  if (DEFERRED_TAG.test(content)) {
    reasons.push("deferred");
  }

  if (hasReplyWithin12h === false && QUESTION_MARK.test(content)) {
    reasons.push("unanswered_question_12h");
  }

  return {
    isDecisionCandidate: reasons.length > 0,
    reasons,
    deadlineHint: deadline.deadline,
  };
}

/**
 * 결정 후보가 아닌 짧은 기록을 값싼 규칙으로 더 세분화한다.
 * 결정 후보는 기존 신호를 우선하고, 이 함수는 카드 승격을 만들지 않는다.
 */
export function classifyNonDecisionByRules(content: string): {
  label: NonDecisionLabel;
  reasoning: string;
} {
  const normalized = content.trim();

  if (CHATTER_EXPRESSION.test(normalized)) {
    return { label: "chatter", reasoning: "일상 대화 또는 가벼운 잡담 표현입니다." };
  }

  if (ACTION_EXPRESSION.test(normalized)) {
    return { label: "action", reasoning: "담당자에게 실행을 요청하는 표현입니다." };
  }

  return { label: "info", reasoning: "결정·실행 요청 없이 현황이나 참고 정보를 공유합니다." };
}
