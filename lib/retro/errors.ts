const messages: Record<string, [number, string]> = {
  share_consent_required: [409, "회고를 공개하려면 공개 동의가 필요합니다."],
  invalid_note: [400, "500자 이내의 글이나 10메가바이트 이하의 음성 파일을 선택해 주세요."],
  note_limit: [400, "하루에 한 줄 기록을 20개까지 남길 수 있습니다."],
  connection_not_found: [404, "연결을 찾을 수 없습니다."],
  invalid_connection: [400, "연결할 계정과 자료 범위를 확인해 주세요."],
  connector_not_configured: [503, "이 서비스의 계정 연결을 준비 중입니다."],
  connector_auth_failed: [400, "계정을 확인하지 못했습니다. 다시 연결해 주세요."],
  connector_scope_denied: [400, "개인 계정의 읽기 권한과 선택한 자료를 확인해 주세요."],
  connector_failed: [502, "연결한 서비스에 요청하지 못했습니다. 잠시 뒤 다시 시도해 주세요."],
  rate_limited: [429, "가져오기는 1분에 한 번 할 수 있습니다. 잠시 뒤 다시 시도해 주세요."],
  stale_retro: [409, "다른 곳에서 먼저 저장했습니다. 새로고침 후 다시 시도해 주세요."],
  cited_activity_changed: [409, "이미 근거로 쓴 활동은 바꿀 수 없습니다. 새 참조로 추가해 주세요."],
  visibility_narrower_source: [409, "원문의 볼 수 있는 사람 범위를 넘어 공유할 수 없습니다."],
  not_confirmed: [409, "회고를 먼저 확정해 주세요."],
  citation_invalid: [409, "원문 근거를 확인할 수 없습니다. 초안을 다시 만들어 주세요."],
  consent_required: [403, "동의한 부서 구성원만 회고를 만들 수 있습니다."],
  demo_org: [403, "체험판에서는 만들 수 없습니다."],
  retro_not_found: [404, "회고를 찾을 수 없습니다."],
  invalid_bundle: [400, "회고 파일의 형식·날짜·한도를 확인해 주세요."],
  activity_limit: [400, "하루에 활동을 500개까지 담을 수 있습니다."],
  bundle_too_large: [413, "1메가바이트 이하의 회고 파일을 선택해 주세요."],
  server_only_kind: [400, "사수 내부 활동은 서버에서만 수집합니다."],
  duplicate_ref: [400, "같은 활동이 중복되어 있습니다."],
  date_out_of_range: [400, "오늘 전후 7일 안의 회고를 선택해 주세요."],
  invalid_retro: [400, "회고 내용과 원문 근거를 확인해 주세요."],
};
export function retroError(error: unknown) {
  const raw = typeof error === "string" ? error : error && typeof error === "object" && "message" in error ? String(error.message) : "unknown";
  const code = Object.hasOwn(messages, raw) ? raw : "unknown";
  const [status, message] = messages[code] ?? [500, "회고를 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요."];
  return { code, status, error: message };
}
