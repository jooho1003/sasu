import { RecordingSave, ReviewRecordingStart } from "@/lib/contracts";
import { NO_STORE, recordingAccess, recordingFailure } from "@/lib/recording/recording-routes";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ dept: string; id: string }> },
) {
  const { dept, id } = await params;
  const access = await recordingAccess(dept);
  if (access.response) return access.response;
  if (!ReviewRecordingStart.shape.id.safeParse(id).success) return recordingFailure({ code: "22023" });
  const input = RecordingSave.safeParse(await request.json().catch(() => null));
  if (!input.success) return recordingFailure({ code: "22023" });
  const result = await access.client.rpc(input.data.capture.levels ? "create_review_recording_with_profile" : "create_review_recording", {
    p_dept: access.member.deptId,
    p_recording: id,
    p_manifest: input.data.manifest,
    p_capture: input.data.capture,
  });
  if (result.error) return recordingFailure(result.error);
  return Response.json(result.data, { status: 201, headers: NO_STORE });
}
