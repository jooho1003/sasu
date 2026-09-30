import { ReviewRecordingStart } from "@/lib/contracts";
import { kickWorker } from "@/lib/jobs";
import { NO_STORE, recordingAccess, recordingFailure } from "@/lib/recording/recording-routes";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ dept: string; id: string }> },
) {
  const { dept, id } = await params;
  const access = await recordingAccess(dept);
  if (access.response) return access.response;
  if (!ReviewRecordingStart.shape.id.safeParse(id).success) return recordingFailure({ code: "22023" });
  const result = await access.client.rpc("finalize_review_recording", {
    p_dept: access.member.deptId,
    p_recording: id,
  });
  if (result.error) return recordingFailure(result.error);
  kickWorker();
  return Response.json(result.data, { status: 202, headers: NO_STORE });
}
