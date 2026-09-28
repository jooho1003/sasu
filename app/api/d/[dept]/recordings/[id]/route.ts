import { ReviewRecordingStart } from "@/lib/contracts";
import { NO_STORE, recordingAccess, recordingFailure } from "@/lib/recording/recording-routes";

type Context = { params: Promise<{ dept: string; id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { dept, id } = await params;
  const access = await recordingAccess(dept);
  if (access.response) return access.response;
  if (!ReviewRecordingStart.shape.id.safeParse(id).success) return recordingFailure({ code: "22023" });
  const result = await access.client.rpc("list_review_recordings", { p_dept: access.member.deptId, p_recording: id });
  if (result.error) return recordingFailure(result.error);
  const recording = result.data?.[0];
  if (!recording) return recordingFailure({ code: "P0002" });
  return Response.json({ recording }, { headers: NO_STORE });
}
