import { ReviewRecordingStart } from "@/lib/contracts";
import { activeRecordingKey } from "@/lib/recording/recording-key";
import { NO_STORE, recordingAccess, recordingFailure } from "@/lib/recording/recording-routes";

type Context = { params: Promise<{ dept: string }> };

export async function GET(request: Request, { params }: Context) {
  const access = await recordingAccess((await params).dept);
  if (access.response) return access.response;
  if (new URL(request.url).searchParams.get("recent") === "1") {
    const recent = await access.client.from("review_recordings")
      .select("id,title,state,started_at,expires_at,continues_recording_id")
      .eq("dept_id", access.member.deptId).eq("created_by", access.member.userId)
      .in("state", ["active", "saving", "completed"])
      .order("started_at", { ascending: false }).limit(20);
    if (recent.error) return recordingFailure(recent.error);
    return Response.json({ recordings: recent.data ?? [] }, { headers: NO_STORE });
  }
  const result = await access.client.rpc("list_review_recordings", { p_dept: access.member.deptId });
  if (result.error) return recordingFailure(result.error);
  return Response.json({ recordings: result.data }, { headers: NO_STORE });
}

export async function POST(request: Request, { params }: Context) {
  const access = await recordingAccess((await params).dept);
  if (access.response) return access.response;
  const input = ReviewRecordingStart.safeParse(await request.json().catch(() => null));
  if (!input.success) return recordingFailure({ code: "22023" });
  let keyVersion: number;
  try {
    keyVersion = activeRecordingKey(process.env).version;
  } catch {
    return Response.json({ error: "녹음 키를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503, headers: NO_STORE });
  }
  const { continues_recording_id, ...plainInput } = input.data;
  const result = await access.client.rpc(continues_recording_id ? "start_continued_review_recording" : "start_review_recording", {
    p_dept: access.member.deptId,
    p_input: continues_recording_id ? input.data : plainInput,
    p_key_version: keyVersion,
  });
  if (result.error) return recordingFailure(result.error);
  return Response.json(result.data, { status: 201, headers: NO_STORE });
}
