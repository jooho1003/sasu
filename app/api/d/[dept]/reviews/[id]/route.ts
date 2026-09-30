import { ReviewEdit, type ReviewedMaterial } from "@/lib/contracts";
import { kickWorker } from "@/lib/jobs";
import { reviewError, reviewExport } from "@/lib/reviews";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { originalAccessError } from "@/lib/review-access";

type Context = { params: Promise<{ dept: string; id: string }> };
async function accessible(context: Context) {
  const { dept, id } = await context.params;
  const member = await requireMembership(dept);
  const client = await createServerSupabaseClient();
  const result = await client
    .from("reviewed_materials")
    .select("*")
    .eq("id", id)
    .eq("dept_id", member.deptId)
    .maybeSingle<ReviewedMaterial>();
  return { client, review: result.data, error: result.error, member };
}
export async function GET(request: Request, context: Context) {
  const { client, review, error, member } = await accessible(context);
  if (error)
    return Response.json(
      { error: "자료를 불러오지 못했습니다." },
      { status: 500 },
    );
  if (!review)
    return Response.json(
      { error: "자료를 찾을 수 없습니다." },
      { status: 404 },
    );
  const format = new URL(request.url).searchParams.get("format");
  if (format === "txt" || format === "md") {
    const access = await client.rpc("authorize_review_access", { p_dept: review.dept_id, p_review: review.id, p_action: "export" });
    if (access.error) {
      const failure = originalAccessError(access.error);
      return Response.json({ error: failure.error }, { status: failure.status, headers: { "cache-control": "no-store" } });
    }
    return new Response(reviewExport(review, format), {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="review.${format}"`,
      },
    });
  }
  const [parts, history, settings, retention, segments] = await Promise.all([
    client
      .from("review_parts")
      .select(
        "id,part_index,start_seconds,end_seconds,status,error_code,attempt,updated_at,lease_until",
      )
      .eq("review_id", review.id)
      .order("part_index"),
    client
      .from("review_revisions")
      .select("revision,title,created_at,edited_by")
      .eq("review_id", review.id)
      .order("revision", { ascending: false })
      .limit(50),
    client.rpc("review_org_settings", { p_dept: review.dept_id }),
    client.from("retention_settings").select("review_original_days").eq("dept_id", review.dept_id).maybeSingle(),
    client
      .from("review_original_segments")
      .select("segment_index,attempt,status,error_code,object_path,updated_at")
      .eq("review_id", review.id)
      .order("segment_index"),
  ]);
  if (parts.error || history.error || settings.error || retention.error || segments.error)
    return Response.json(
      { error: "자료 처리 상태를 확인하지 못했습니다." },
      { status: 500 },
    );
  const capture = review.capture_metadata;
  const previousId = typeof capture?.continues_review_id === "string" ? capture.continues_review_id : null;
  const [previous, next] = review.original_layout === "audio_segments" ? await Promise.all([
    previousId ? client.from("reviewed_materials").select("id,title").eq("id", previousId)
      .eq("dept_id", review.dept_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    client.from("reviewed_materials").select("id,title").eq("dept_id", review.dept_id)
      .contains("capture_metadata", { continues_review_id: review.id }).limit(1).maybeSingle(),
  ]) : [{ data: null, error: null }, { data: null, error: null }];
  if (previous.error || next.error)
    return Response.json({ error: "이어진 회의 기록을 확인하지 못했습니다." }, { status: 500 });
  // Even if the scheduled sweep is delayed, don't render an endless spinner.
  const visibleParts = (parts.data ?? []).map((p) =>
    ["queued", "processing"].includes(p.status) &&
    Date.now() - new Date(p.updated_at).getTime() > 120_000
      ? { ...p, status: "failed", error_code: "timeout" }
      : p,
  );
  return Response.json(
    {
      review: {
        ...review,
        status:
          review.status === "processing" &&
          visibleParts.some((p) => p.status === "failed")
            ? "failed"
            : review.status,
      },
      parts: visibleParts,
      history: history.data,
      original_download_allowed: settings.data?.allow_original_download === true,
      original_expires_at: review.confirmed_at && retention.data?.review_original_days
        ? new Date(new Date(review.confirmed_at).getTime() + retention.data.review_original_days * 86400000).toISOString() : null,
      segments: (segments.data ?? []).map((segment) => ({
        index: segment.segment_index,
        attempt: segment.attempt,
        path: segment.object_path,
        status: segment.status,
        error_code: segment.error_code,
        updated_at: segment.updated_at,
      })),
      continuation: { previous: previous.data, next: next.data },
      can_continue: review.original_layout === "audio_segments" && review.created_by === member.userId &&
        member.role === "lead" && !!member.consentedAt && settings.data?.browser_recording_enabled === true,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
export async function PATCH(request: Request, context: Context) {
  const { client, review } = await accessible(context);
  if (!review)
    return Response.json(
      { error: "자료를 찾을 수 없습니다." },
      { status: 404 },
    );
  const parsed = ReviewEdit.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "제목과 텍스트 길이를 확인해 주세요." },
      { status: 400 },
    );
  const result = await client.rpc("save_review", {
    p_review: review.id,
    p_revision: parsed.data.revision,
    p_title: parsed.data.title,
    p_sections: parsed.data.sections,
  });
  if (result.error) {
    const error = reviewError(result.error);
    return Response.json(error, { status: error.status });
  }
  return Response.json({ revision: result.data });
}
export async function POST(request: Request, context: Context) {
  const { client, review } = await accessible(context);
  if (!review)
    return Response.json(
      { error: "자료를 찾을 수 없습니다." },
      { status: 404 },
    );
  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.action !== "string" ||
    !Number.isInteger(body.revision)
  )
    return Response.json(
      { error: "작업과 자료 버전을 확인해 주세요." },
      { status: 400 },
    );
  const result =
    body.action === "publish"
      ? await client.rpc("publish_review", {
          p_review: review.id,
          p_revision: body.revision,
        })
      : await client.rpc("review_action", {
          p_review: review.id,
          p_revision: body.revision,
          p_action: body.action,
        });
  if (result.error) {
    const error = body.action === "reextract" ? originalAccessError(result.error) : reviewError(result.error);
    return Response.json(error, { status: error.status });
  }
  if (["publish", "delete", "delete_original"].includes(body.action))
    kickWorker();
  return Response.json({
    ok: true,
    source_id: body.action === "publish" ? result.data : null,
  });
}
