import { authenticatedBotUserId, conversationMembers, postChannelMessage } from "@/lib/slack/post";
import { enqueue, kickWorker } from "@/lib/jobs";
import { registerSlackBackfillHandler } from "@/lib/pipeline/slack-backfill";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SourceBody = {
  external_id?: unknown;
  title?: unknown;
  visibility?: unknown;
  is_principles?: unknown;
};

function isVisibility(value: unknown): value is "dept" | "leads_only" {
  return value === "dept" || value === "leads_only";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  if (membership.role !== "lead") {
    return Response.json({ error: "Slack 채널 연결은 팀장만 할 수 있습니다." }, { status: 403 });
  }

  let body: SourceBody;
  try {
    body = (await request.json()) as SourceBody;
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const externalId = typeof body.external_id === "string" ? body.external_id.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const visibility = isVisibility(body.visibility) ? body.visibility : "dept";
  const isPrinciples = body.is_principles === true;
  if (!/^[CG][A-Z0-9]+$/u.test(externalId) || title.length === 0) {
    return Response.json({ error: "Slack 채널과 이름을 확인해주세요." }, { status: 400 });
  }

  let channelMemberIds: string[];
  try {
    const [members, botUserId] = await Promise.all([
      conversationMembers(externalId),
      authenticatedBotUserId(),
    ]);
    channelMemberIds = members.filter((memberId) => memberId !== botUserId);
  } catch {
    return Response.json({ error: "Slack 채널 멤버를 확인하지 못했습니다." }, { status: 502 });
  }

  const supabase = await createServerSupabaseClient();
  const memberResult = await supabase
    .from("members")
    .select("slack_user_id, display_name, consented_at")
    .eq("dept_id", membership.deptId);
  if (memberResult.error) {
    return Response.json({ error: "부서 멤버를 확인하지 못했습니다." }, { status: 500 });
  }

  const mappedMembers = new Map(
    (memberResult.data ?? [])
      .filter((member) => member.slack_user_id)
      .map((member) => [member.slack_user_id as string, member]),
  );
  const missingConsent = channelMemberIds.filter(
    (slackUserId) => !mappedMembers.get(slackUserId)?.consented_at,
  );
  if (missingConsent.length > 0) {
    return Response.json(
      { error: "채널 멤버 전원의 동의와 Slack 계정 연결이 먼저 필요합니다." },
      { status: 409 },
    );
  }

  const existingResult = await supabase
    .from("sources")
    .select("id")
    .eq("dept_id", membership.deptId)
    .eq("kind", "slack_channel")
    .eq("external_id", externalId)
    .maybeSingle<{ id: string }>();
  if (existingResult.error) {
    return Response.json({ error: "기존 채널 연결을 확인하지 못했습니다." }, { status: 500 });
  }

  const sourceResult = existingResult.data
    ? await supabase
        .from("sources")
        .update({ title, visibility, is_principles: isPrinciples, active: true, last_error: null })
        .eq("id", existingResult.data.id)
        .select("id")
        .single<{ id: string }>()
    : await supabase
        .from("sources")
        .insert({
          dept_id: membership.deptId,
          kind: "slack_channel",
          external_id: externalId,
          title,
          visibility,
          is_principles: isPrinciples,
          active: true,
        })
        .select("id")
        .single<{ id: string }>();

  if (sourceResult.error || !sourceResult.data) {
    return Response.json({ error: "Slack 채널을 저장하지 못했습니다." }, { status: 500 });
  }

  try {
    await postChannelMessage({
      channel: externalId,
      text: "사수가 이 채널을 수집합니다. 최근 7일 메시지를 포함하며, 동의하지 않은 멤버의 발언은 저장하지 않습니다.",
    });
  } catch {
    await supabase
      .from("sources")
      .update({ last_error: "slack_announcement_failed" })
      .eq("id", sourceResult.data.id);
    return Response.json({ error: "채널 공지를 게시하지 못했습니다." }, { status: 502 });
  }

  registerSlackBackfillHandler();
  const jobId = await enqueue(
    "slack_backfill",
    { sourceId: sourceResult.data.id },
    { dedupeKey: `${sourceResult.data.id}:${new Date().toISOString().slice(0, 10)}` },
  );
  kickWorker();

  return Response.json({ ok: true, source_id: sourceResult.data.id, job_id: jobId }, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  if (membership.role !== "lead") {
    return Response.json({ error: "입력 소스 제거는 팀장만 할 수 있습니다." }, { status: 403 });
  }

  const sourceId = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(sourceId)) {
    return Response.json({ error: "제거할 입력 소스를 확인해주세요." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("remove_source", { p_source: sourceId });
  if (result.error || !result.data) {
    return Response.json({ error: "입력 소스를 제거하지 못했습니다." }, { status: 500 });
  }

  const removedItems = Reflect.get(result.data, "removed_items");
  return Response.json({ ok: true, removed_items: typeof removedItems === "number" ? removedItems : 0 });
}
