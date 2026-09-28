import { ReviewRecordingStart } from "@/lib/contracts";
import { activeRecordingKey } from "@/lib/recording/recording-key";
import { NO_STORE, recordingAccess, recordingFailure } from "@/lib/recording/recording-routes";

type Context = { params: Promise<{ dept: string }> };

export async function GET(_request: Request, { params }: Context) {
  const access = await recordingAccess((await params).dept);
  if (access.response) return access.response;
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
  const result = await access.client.rpc("start_review_recording", {
    p_dept: access.member.deptId, p_input: input.data, p_key_version: keyVersion,
  });
  if (result.error) return recordingFailure(result.error);
  return Response.json(result.data, { status: 201, headers: NO_STORE });
}
