// Design Ref: desktop-companion §4 E12 — the device bearer and RLS scope this minimal participant list.
import { jsonResult, type Result } from "@/lib/companion/context";
import { requireDeviceContext } from "@/lib/companion/device-context";

function leadOnly(): Result<never> {
  return { ok: false, status: 403, code: "lead_only", error: "팀장만 참여자 목록을 볼 수 있습니다." };
}

export async function GET(request: Request) {
  const device = await requireDeviceContext(request);
  if (!device.ok) return jsonResult(device);
  if (device.ctx.role !== "lead") return jsonResult(leadOnly());
  const result = await device.ctx.client
    .from("members")
    .select("user_id, display_name, consented_at")
    .eq("dept_id", device.ctx.deptId)
    .not("consented_at", "is", null)
    .order("display_name");
  if (result.error) {
    return jsonResult({ ok: false, status: 500, code: "members_failed", error: "참여자 목록을 불러오지 못했습니다. 잠시 뒤 다시 해 주세요." });
  }
  return jsonResult({ ok: true, status: 200, body: { members: result.data } });
}
