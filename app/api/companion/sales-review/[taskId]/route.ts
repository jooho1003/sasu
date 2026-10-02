// Design Ref: desktop-companion §4 E16 — the device gets status and the web path, never result text.
import { jsonResult } from "@/lib/companion/context";
import { requireDeviceContext } from "@/lib/companion/device-context";
import { readSalesSourceReviewStatus } from "@/lib/sales-source-review-start";
import { z } from "zod";

export async function GET(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const device = await requireDeviceContext(request);
  if (!device.ok) return jsonResult(device);
  const { taskId } = await params;
  if (!z.uuid().safeParse(taskId).success) return jsonResult({ ok: false, status: 400, code: "invalid_input", error: "검토 번호를 확인해 주세요." });
  const result = await readSalesSourceReviewStatus(device.ctx, taskId);
  if (!result.ok) return jsonResult(result);
  return jsonResult({ ok: true, status: 200, body: { ...result.body, web_path: `/d/${encodeURIComponent(device.ctx.deptId)}/sales-review?task_id=${encodeURIComponent(taskId)}` } });
}
