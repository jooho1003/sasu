import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { originalAccessError, requestOriginalAccess, requestOriginalSegmentAccess } from "@/lib/review-access";

const SEGMENT_PATTERN = /^(0|[1-9][0-9]?)$/;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ dept: string; id: string }> },
) {
  const { dept, id } = await params;
  const member = await requireMembership(dept);
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
  if (action !== "play_original" && action !== "download_original")
    return Response.json({ error: "재생 또는 내려받기를 선택해 주세요." }, { status: 400, headers });
  const segmentParam = url.searchParams.get("segment");
  if (segmentParam !== null && (!SEGMENT_PATTERN.test(segmentParam) || Number(segmentParam) > 29))
    return Response.json({ error: "구간 번호를 확인해 주세요." }, { status: 400, headers });
  try {
    const client = await createServerSupabaseClient();
    const grant = segmentParam !== null
      ? await requestOriginalSegmentAccess(client.rpc.bind(client), member.deptId, id, Number(segmentParam), action)
      : await requestOriginalAccess(client.rpc.bind(client), member.deptId, id, action);
    const storageClient = await createServerSupabaseClient({ reviewAccessToken: grant.token });
    const file = await storageClient.storage.from("review-materials").download(grant.path);
    if (file.error || !file.data)
      return Response.json({ error: "원본 접근이 만료되었거나 파일을 가져오지 못했습니다. 다시 시도해 주세요." }, { status: 422, headers });
    // No signed URL or service credential leaves this request. Treat documents as downloads.
    return new Response(file.data.stream(), { headers: {
      ...headers,
      "content-type": action === "play_original" && file.data.type.startsWith("audio/") ? file.data.type : "application/octet-stream",
      "content-length": String(file.data.size),
      "content-disposition": `${action === "play_original" ? "inline" : "attachment"}; filename="original"; filename*=UTF-8''${encodeURIComponent(grant.filename)}`,
    } });
  } catch (cause) {
    const error = originalAccessError(cause);
    return Response.json({ error: error.error }, { status: error.status, headers: { ...headers, ...(error.status === 429 ? { "retry-after": "60" } : {}) } });
  }
}
