export type RuleSignal = {
  isDecisionCandidate: boolean;
  reasons: string[];
  deadlineHint: Date | null;
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const QUESTION_MARK = /[?？]/;
const REQUEST_EXPRESSION =
  /(?:할까요|(?:해|아|어)도\s*(?:돼요|되나요|될까요)|확인\s*부탁|검토\s*부탁)/;
const DEFERRED_TAG = /(?:^|[\s[#])보류(?=$|[\s\]#:：-])/;

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
