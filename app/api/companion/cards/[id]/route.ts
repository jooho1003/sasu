// Design Ref: desktop-companion §4 E09 — 카드·근거는 웹 공용 조회를 사용한다.
import { loadCardView } from "@/lib/card-view";
import { jsonResult } from "@/lib/companion/context";
import { requireDeviceContext } from "@/lib/companion/device-context";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const device = await requireDeviceContext(request);
  if (!device.ok) return jsonResult(device);

  const { id } = await params;
  return jsonResult(await loadCardView(device.ctx, id));
}
