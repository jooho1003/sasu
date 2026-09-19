export const UI_LABELS = {
  ledger: "결정 기록",
  reviews: "올린 자료",
  roles: "문서 점수표",
  retention: "기록 보관",
  settings: "설정",
  lead: "팀장",
  dept: "부서 공개",
  leadsOnly: "팀장만",
  self: "본인만",
  synthetic: "가상",
  masking: "가리기",
  sync: "새로 가져오기",
} as const;
export const STATUS_LABELS: Record<string, string> = {
  open: "열림", deferred: "미룸", needs_review: "확인 필요", scoring: "점수 계산 중", scored: "점수 계산 완료", failed: "실패", idle: "대기 중", running: "실행 중",
};
export function statusLabel(value: string): string { return STATUS_LABELS[value] ?? "확인 필요"; }
