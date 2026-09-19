const messages: Record<string, [number, string]> = {
  stale_retro: [409, "다른 곳에서 먼저 저장됐어요. 새로고침 후 다시 시도해 주세요."],
  cited_activity_changed: [409, "이미 인용한 활동은 바꿀 수 없습니다. 새 참조로 추가해 주세요."],
  visibility_narrower_source: [409, "인용한 원본의 공개 범위보다 넓게 공유할 수 없습니다."],
  not_confirmed: [409, "회고를 먼저 확정해 주세요."],
  citation_invalid: [409, "인용 근거를 확인할 수 없습니다. 다시 생성해 주세요."],
  consent_required: [403, "동의한 부서 구성원만 회고를 만들 수 있습니다."],
  demo_org: [403, "체험판에서는 만들 수 없어요."],
  retro_not_found: [404, "회고를 찾을 수 없습니다."],
  invalid_bundle: [400, "회고 파일의 형식·날짜·한도를 확인해 주세요."],
  activity_limit: [400, "하루에 활동을 500개까지 담을 수 있습니다."],
  bundle_too_large: [413, "1MB 이하의 회고 파일을 선택해 주세요."],
  server_only_kind: [400, "사수 내부 활동은 서버에서만 수집합니다."],
  duplicate_ref: [400, "같은 활동이 중복되어 있습니다."],
  date_out_of_range: [400, "오늘 전후 7일 안의 회고를 선택해 주세요."],
  invalid_retro: [400, "회고 내용과 인용을 확인해 주세요."],
};
export function retroError(error: unknown) {
  const raw = typeof error === "string" ? error : error && typeof error === "object" && "message" in error ? String(error.message) : "unknown";
  const code = Object.hasOwn(messages, raw) ? raw : "unknown";
  const [status, message] = messages[code] ?? [500, "회고를 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요."];
  return { code, status, error: message };
}
