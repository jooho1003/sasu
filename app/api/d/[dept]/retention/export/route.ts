import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { reviewError } from "@/lib/reviews";
import { buildRetentionBundle } from "@/lib/retention";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const member = await requireMembership(dept);
  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.source_id !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(body.from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(body.to) ||
    body.from >= body.to ||
    !["json", "md"].includes(body.format)
  )
    return Response.json(
      { error: "채널과 시작·종료 날짜를 확인해 주세요." },
      { status: 400 },
    );
  const client = await createServerSupabaseClient();
  const source = await client
    .from("sources")
    .select("id,title")
    .eq("id", body.source_id)
    .eq("dept_id", member.deptId)
    .eq("kind", "slack_channel")
    .maybeSingle();
  if (!source.data)
    return Response.json(
      { error: "채널을 찾을 수 없습니다." },
      { status: 404 },
    );
  const from = `${body.from}T00:00:00+09:00`,
    to = `${body.to}T00:00:00+09:00`;
  const records = await client.rpc("retention_records", {
    p_source: source.data.id,
    p_from: from,
    p_to: to,
  });
  if (records.error) {
    const error = reviewError(records.error);
    return Response.json(error, { status: error.status });
  }
  if (records.data.length > 5000)
    return Response.json(
      {
        error:
          "기록이 5,000건을 넘습니다. 기간을 나누어 다시 생성해 주세요. 일부만 내보내지 않았습니다.",
      },
      { status: 422 },
    );
  const bundle = buildRetentionBundle({
    sourceId: source.data.id,
    title: source.data.title ?? "슬랙 채널",
    from,
    to,
    records: records.data,
  });
  const logged = await client.rpc("record_retention_export", {
    p_source: source.data.id,
    p_from: from,
    p_to: to,
    p_count: bundle.manifest.count,
    p_checksum: bundle.manifest.sha256.records,
  });
  if (logged.error)
    return Response.json(
      { error: "내보내기 기록을 저장하지 못했습니다." },
      { status: 500 },
    );
  return new Response(
    body.format === "md" ? bundle.markdown : JSON.stringify(bundle, null, 2),
    {
      headers: {
        "content-type":
          body.format === "md"
            ? "text/markdown; charset=utf-8"
            : "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="slack-records.${body.format}"`,
        "cache-control": "no-store",
      },
    },
  );
}
