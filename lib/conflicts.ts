const KST_MONTH_DAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "numeric",
  day: "numeric",
  timeZone: "Asia/Seoul",
});

export function formatConflictBadge(decidedAt: string | null): string {
  if (!decidedAt) {
    return "예전 결정과 다름";
  }

  const date = new Date(decidedAt);
  if (Number.isNaN(date.getTime())) {
    return "예전 결정과 다름";
  }

  const parts = KST_MONTH_DAY_FORMATTER.formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return month && day
    ? `${month}월 ${day}일 결정과 충돌`
    : "예전 결정과 다름";
}
