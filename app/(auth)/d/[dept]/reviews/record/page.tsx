import Link from "next/link";
import { MeetingRecorder } from "@/components/meeting-recorder";
import { requirePageMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function Page({ params, searchParams }: {
  params: Promise<{ dept: string }>;
  searchParams: Promise<{ continues?: string | string[] }>;
}) {
  const [{ dept }, query] = await Promise.all([params, searchParams]);
  const member = await requirePageMembership(dept, `/d/${dept}/reviews/record`);
  if (member.role !== "lead" || !member.consentedAt) {
    return <main className="workspace-page"><h1>회의 녹음</h1><p>동의한 팀장만 녹음을 시작할 수 있습니다.</p><Link href={`/d/${member.deptId}/reviews`}>올린 자료 확인</Link></main>;
  }
  const client = await createServerSupabaseClient();
  let recordingEnabled = false;
  try {
    const settings = await client.rpc("review_org_settings", { p_dept: member.deptId });
    recordingEnabled = !settings.error && settings.data?.browser_recording_enabled === true;
  } catch {
    // Fail closed when the organization setting cannot be read.
  }
  if (!recordingEnabled) {
    return <main className="workspace-page"><h1>회의 녹음</h1><p>조직에서 웹 회의 녹음을 껐습니다. 파일 가져오기를 이용해 주세요.</p><Link href={`/d/${member.deptId}/reviews`}>올린 자료 확인</Link></main>;
  }
  return <MeetingRecorder deptId={member.deptId} userId={member.userId}
    initialContinuesId={typeof query.continues === "string" ? query.continues : null} />;
}
