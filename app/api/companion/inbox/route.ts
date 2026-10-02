// Design Ref: desktop-companion §4 E05 — 기기 연결의 현재 사용자 받은 일만 반환한다.
import { loadInbox } from "@/lib/companion/inbox";
import { jsonResult } from "@/lib/companion/context";
import { requireDeviceContext } from "@/lib/companion/device-context";

export async function GET(request: Request) {
  const device = await requireDeviceContext(request);
  if (!device.ok) return jsonResult(device);

  return jsonResult(await loadInbox(device.ctx));
}
