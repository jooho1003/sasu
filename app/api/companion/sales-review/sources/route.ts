// Design Ref: desktop-companion §4 E14 — Bearer context only; source authority remains current RLS.
import { jsonResult } from "@/lib/companion/context";
import { requireDeviceContext } from "@/lib/companion/device-context";
import { loadSalesSourceCandidates } from "@/lib/sales-review-sources";

export async function GET(request: Request) {
  const device = await requireDeviceContext(request);
  if (!device.ok) return jsonResult(device);
  return jsonResult(await loadSalesSourceCandidates(device.ctx));
}
