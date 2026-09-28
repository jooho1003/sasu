import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const NO_STORE = { "cache-control": "private, no-store, max-age=0" };

export function recordingFailure(error: { code?: string; message?: string } | null) {
  const messages: Record<string, [number, string]> = {
    browser_recording_disabled: [403, "조직에서 웹 회의 녹음을 껐습니다. 파일 가져오기를 이용해 주세요."],
    recording_not_saved: [409, "먼저 녹음을 저장해 주세요."],
    recording_failed: [409, "원본 확인에 실패했습니다. 녹음을 폐기하고 다시 녹음해 주세요."],
    recording_already_saved: [409, "저장이 끝난 녹음입니다. 자료 검토함에서 확인해 주세요."],
  };
  const byMessage = messages[error?.message ?? ""];
  if (byMessage) {
    const [status, message] = byMessage;
    return Response.json({ error: message }, { status, headers: NO_STORE });
  }
  const failures: Record<string, [number, string]> = {
    "42501": [403, "녹음 권한과 참여자 동의, 조직 설정을 확인해 주세요."],
    P0002: [404, "녹음 기록을 찾을 수 없습니다."],
    "40001": [409, "같은 녹음 번호의 정보가 다릅니다. 기존 기록을 확인해 주세요."],
    "23505": [409, "이미 이어서 녹음한 기록이 있습니다. 기존 기록을 확인해 주세요."],
    "55000": [409, "이미 끝난 녹음입니다. 현재 상태를 확인해 주세요."],
    "54000": [429, "진행 중인 녹음이 많습니다. 기존 녹음을 저장하거나 폐기해 주세요."],
    "22023": [400, "녹음 정보와 동의 항목을 확인해 주세요."],
  };
  const [status, message] = failures[error?.code ?? ""] ?? [500, "녹음 기록을 처리하지 못했습니다. 다시 시도해 주세요."];
  return Response.json({ error: message }, { status, headers: NO_STORE });
}

export async function recordingAccess(dept: string) {
  const member = await requireMembership(dept);
  if (member.role !== "lead" || !member.consentedAt) return { response: recordingFailure({ code: "42501" }) } as const;
  const client = await createServerSupabaseClient();
  return { member, client } as const;
}
