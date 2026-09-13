const KST_MONTH_DAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "numeric",
  day: "numeric",
  timeZone: "Asia/Seoul",
});

export function formatConflictBadge(decidedAt: string | null): string {
  if (!decidedAt) {
    return "과거 결정과 충돌";
  }

  const date = new Date(decidedAt);
  if (Number.isNaN(date.getTime())) {
    return "과거 결정과 충돌";
  }

  const parts = KST_MONTH_DAY_FORMATTER.formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return month && day
    ? `${month}월 ${day}일 결정과 충돌`
    : "과거 결정과 충돌";
}
