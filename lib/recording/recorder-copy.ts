export type RecorderTone = "info" | "warning" | "error";
export type RecorderStage = "setup" | "starting" | "recording" | "paused" | "stopped" | "saving" | "done";

const UNKNOWN_ERROR = "녹음 작업을 완료하지 못했습니다. 다시 시도해 주세요.";
const PERMISSION_ERROR = "화면 공유나 마이크를 허용하지 않아 녹음을 시작하지 못했습니다. 다시 시작하거나 주소창의 사이트 설정에서 허용해 주세요.";
const ERROR_TEXT: Record<string, string> = {
  shared_audio_missing: "공유한 화면에서 소리를 찾지 못했습니다. 공유 창에서 오디오 공유를 켜고 다시 시작해 주세요.",
  microphone_missing: "마이크를 찾지 못했습니다. 마이크 연결과 브라우저 권한을 확인해 주세요.",
  input_ended: "녹음 입력이 끊겼습니다. 화면 공유와 마이크를 다시 선택해 주세요.",
  storage_space_insufficient: "이 기기의 저장 공간이 부족합니다. 64MB 이상 비운 뒤 다시 시도해 주세요.",
  recording_storage_unavailable: "브라우저 저장소를 사용할 수 없습니다. 일반 창에서 열거나 사이트 데이터 차단을 해제해 주세요.",
  recording_worker_timeout: "녹음 준비가 늦어지고 있습니다. 페이지를 새로 고침한 뒤 다시 시도해 주세요.",
  recording_other_tab: "다른 탭에서 녹음 중입니다. 그 탭의 녹음을 마친 뒤 다시 시도해 주세요.",
  recording_key_forbidden: "녹음 권한을 확인하지 못했습니다. 참석자 동의 상태와 조직의 녹음 설정을 확인해 주세요.",
  recording_unavailable: "녹음이 폐기·만료됐거나 참석자 동의가 바뀌어 더 열 수 없습니다. 녹음 목록을 다시 확인해 주세요.",
  recording_key_unavailable: "녹음 키를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  recording_recovery_changed: "이 기기의 녹음 기록이 바뀌었습니다. 녹음 목록을 다시 확인해 주세요.",
  recording_levels_invalid: "녹음 소리 정보를 확인하지 못했습니다. 다시 저장해 주세요.",
  recording_bundle_invalid: "원본 구간을 합치지 못했습니다. 다시 내려받아 주세요.",
};

export function recorderErrorText(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
  if (/[가-힣]/.test(message)) return message;
  if ((cause instanceof Error && cause.name === "NotAllowedError") || message.startsWith("Permission denied"))
    return PERMISSION_ERROR;
  if (cause instanceof TypeError && message === "Failed to fetch")
    return "서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.";
  return ERROR_TEXT[message] ?? UNKNOWN_ERROR;
}

const STOP_REASON_TEXT: Record<string, string> = {
  duration_limit: "30분이 되어 녹음을 마쳤습니다. 먼저 저장한 뒤 이 회의 이어서 녹음을 선택해 주세요.",
  page_left: "녹음 화면을 떠나 녹음이 중단됐습니다. 확인된 구간을 살펴보고 저장해 주세요.",
  input_ended: "화면 공유나 마이크 연결이 끊겨 녹음이 중단됐습니다. 입력을 다시 선택해 주세요.",
  capture_suspended: "절전 상태나 브라우저 멈춤으로 녹음이 중단됐습니다. 확인된 구간을 살펴보고 저장해 주세요.",
  capture_input_stalled: "5초 넘게 소리 데이터를 받지 못해 녹음이 중단됐습니다. 입력 연결을 확인해 주세요.",
  capture_backlog: "이 기기가 소리를 제때 처리하지 못해 녹음이 중단됐습니다. 확인된 구간을 살펴보고 저장해 주세요.",
  storage_backlog: "이 기기가 소리를 제때 저장하지 못해 녹음이 중단됐습니다. 확인된 구간을 살펴보고 저장해 주세요.",
  storage_failed: "이 기기에 소리를 저장하지 못해 녹음이 중단됐습니다. 저장 공간을 확인해 주세요.",
  capture_worker_timeout: "녹음 처리 시간이 너무 길어 중단됐습니다. 페이지를 새로 고침한 뒤 다시 시도해 주세요.",
  capture_worker_failed: "녹음 처리에 문제가 생겨 중단됐습니다. 페이지를 새로 고침한 뒤 다시 시도해 주세요.",
  capture_processor_failed: "소리 처리에 문제가 생겨 녹음이 중단됐습니다. 페이지를 새로 고침한 뒤 다시 시도해 주세요.",
  capture_lease_lost: "다른 탭이 녹음을 가져가 중단됐습니다. 다른 탭의 녹음을 확인해 주세요.",
  profile_storage_failed: "녹음 소리 정보를 저장하지 못했습니다. 확인된 구간을 살펴보고 저장해 주세요.",
  recording_setup_failed: "녹음을 준비하지 못했습니다. 페이지를 새로 고침한 뒤 다시 시도해 주세요.",
};

export function stopReasonNotice(reason: string): { tone: RecorderTone; text: string } {
  return {
    tone: reason === "duration_limit" ? "info" : "warning",
    text: STOP_REASON_TEXT[reason] ?? "녹음이 중단됐습니다. 확인된 구간을 살펴보고 저장해 주세요.",
  };
}

const SESSION_LABELS: Record<string, string> = {
  active: "저장 전",
  saving: "서버에서 확인 중",
  completed: "저장 완료",
  discarded: "폐기됨",
  expired: "기한 만료",
  revoked: "참석자 동의 변경으로 취소됨",
};

export function sessionStateLabel(state: string): string {
  return SESSION_LABELS[state] ?? "확인 필요";
}

export function recorderStage(input: {
  selected: boolean; starting: boolean;
  snapshotState: "recording" | "paused" | "stopping" | "interrupted" | "stopped" | null;
  sessionState: string | null;
}): RecorderStage {
  if (input.sessionState === "completed") return "done";
  if (input.sessionState === "saving") return "saving";
  if (input.starting) return "starting";
  if (!input.selected) return "setup";
  if (input.snapshotState === "recording" || input.snapshotState === "stopping") return "recording";
  if (input.snapshotState === "paused") return "paused";
  return "stopped";
}

export function missingTestConditions(input: { consent: boolean; supported: boolean }): string[] {
  const missing: string[] = [];
  if (!input.consent) missing.push("참석자 전원의 녹음 동의를 확인해 주세요.");
  if (!input.supported) missing.push("최신 크롬이나 엣지 브라우저에서 열어 주세요.");
  return missing;
}

export function missingStartConditions(input: {
  consent: boolean; heardTest: boolean; title: string; supported: boolean; secure: boolean;
}): string[] {
  const missing: string[] = [];
  if (!input.title.trim()) missing.push("회의 제목을 입력해 주세요.");
  if (!input.consent) missing.push("참석자 전원의 녹음 동의를 확인해 주세요.");
  if (!input.heardTest) missing.push("5초 테스트를 듣고 필요한 소리가 모두 들리는지 확인해 주세요.");
  if (!input.supported) missing.push("최신 크롬이나 엣지 브라우저에서 열어 주세요.");
  if (!input.secure) missing.push("보안 연결로 페이지를 열어 주세요.");
  return missing;
}

export function signalDetected(recentLevels: readonly number[], threshold = 0.002): boolean {
  return recentLevels.some((level) => level >= threshold);
}

type CalendarParts = { year: number; month: number; day: number; hour: number; minute: number };
function calendarParts(date: Date, timeZone: string): CalendarParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute") };
}

export function formatExpiry(expiresAt: string, now: Date, timeZone = "Asia/Seoul"): string {
  const expires = new Date(expiresAt);
  if (Number.isNaN(expires.getTime())) return "기한을 확인해 주세요.";
  const target = calendarParts(expires, timeZone);
  const current = calendarParts(now, timeZone);
  const dayKey = (parts: CalendarParts) => Date.UTC(parts.year, parts.month - 1, parts.day);
  const dayOffset = (dayKey(target) - dayKey(current)) / 86_400_000;
  const dayText = dayOffset === 0 ? "오늘" : dayOffset === 1 ? "내일" : `${target.month}월 ${target.day}일`;
  const period = target.hour < 12 ? "오전" : "오후";
  const hour = target.hour % 12 || 12;
  return `${dayText} ${period} ${hour}:${String(target.minute).padStart(2, "0")}까지`;
}

export function recorderTabTitle(stage: RecorderStage | "interrupted", recordedSeconds: number, baseTitle: string): string {
  if (stage === "interrupted") return `⚠ 녹음 중단 · ${baseTitle}`;
  if (stage !== "recording" && stage !== "paused") return baseTitle;
  const seconds = Math.max(0, Math.floor(recordedSeconds));
  const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return stage === "recording" ? `● 녹음 중 ${duration} · ${baseTitle}` : `❚❚ 잠시 멈춤 ${duration} · ${baseTitle}`;
}
