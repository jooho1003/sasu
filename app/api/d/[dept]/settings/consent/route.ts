import { withSlackDepartment } from "@/lib/slack/workspace";
import { CONSENT_SECTIONS, CONSENT_VERSION } from "@/lib/consent";
import { consentBlocks } from "@/lib/slack/blocks";
import { openDirectMessage, postMessage } from "@/lib/slack/post";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ConsentRequestMember = {
  slack_user_id: string | null;
  consented_at: string | null;
};

function appBaseUrl(): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/u, "");
  const vercelUrl =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ??
    process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;
  return "http://localhost:3000";
}

async function sendConsentRequests(
  membership: Awaited<ReturnType<typeof requireMembership>>,
): Promise<Response> {
  if (membership.role !== "lead") {
    return Response.json(
      { error: "동의 요청은 팀장만 보낼 수 있습니다." },
      { status: 403 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const membersResult = await supabase
    .from("members")
    .select("slack_user_id, consented_at")
    .eq("dept_id", membership.deptId)
    .is("consented_at", null);
  if (membersResult.error) {
    return Response.json(
      { error: "미동의 멤버를 확인하지 못했습니다." },
      { status: 500 },
    );
  }

  const members = (membersResult.data ?? []) as ConsentRequestMember[];
  const unconsentedMembers = members.filter(
    (member) => member.consented_at === null,
  );
  const unlinked = unconsentedMembers.filter(
    (member) => !member.slack_user_id,
  ).length;
  const targets = unconsentedMembers.filter(
    (member): member is ConsentRequestMember & { slack_user_id: string } =>
      Boolean(member.slack_user_id),
  );
  const consentUrl = `${appBaseUrl()}/consent?next=${encodeURIComponent(`/d/${membership.deptId}`)}`;
  const blocks = consentBlocks({ deptId: membership.deptId, consentUrl });
  const deliveryResults = await Promise.all(
    targets.map(async (member) => {
      try {
        const directMessage = await openDirectMessage(member.slack_user_id);
        await postMessage({
          channel: directMessage.id,
          text: CONSENT_SECTIONS.title,
          blocks,
        });
        return true;
      } catch {
        // 개별 DM 실패가 다른 멤버의 요청까지 막지 않도록 실제 성공 건수만 반환한다.
        return false;
      }
    }),
  );
  const sent = deliveryResults.filter(Boolean).length;

  const message = `${sent}명에게 보냈습니다 · 계정 미연결 ${unlinked}명`;
  return Response.json({ ok: true, sent, unlinked, message });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  let body: { action?: unknown; consented?: unknown } = {};
  try {
    body = (await request.json()) as {
      action?: unknown;
      consented?: unknown;
    };
  } catch {
    // 빈 body는 동의로 처리하지 않고 입력 오류로 거절한다.
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (body.action === "request") {
    if (membership.role !== "lead") return Response.json({ error: "동의 요청은 팀장만 보낼 수 있습니다." }, { status: 403 });
    return withSlackDepartment(await createServerSupabaseClient(), membership.deptId, () => sendConsentRequests(membership));
  }

  if (typeof body.consented !== "boolean") {
    return Response.json({ error: "동의 여부를 선택해주세요." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const result = await supabase
    .from("members")
    .update({
      consented_at: body.consented ? new Date().toISOString() : null,
      consent_version: body.consented ? CONSENT_VERSION : null,
    })
    .eq("user_id", membership.userId)
    .eq("dept_id", membership.deptId)
    .select("user_id, consented_at")
    .maybeSingle<{ user_id: string; consented_at: string | null }>();

  if (result.error || !result.data) {
    return Response.json({ error: "동의 상태를 저장하지 못했습니다." }, { status: 500 });
  }
  return Response.json({ ok: true, consented_at: result.data.consented_at });
}
