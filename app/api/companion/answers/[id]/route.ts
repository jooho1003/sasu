// Design Ref: desktop-companion §4 E07 — 웹과 같은 답변·근거 재검사를 사용한다.
import { readAnswerView } from "@/lib/answer-view";
import { jsonResult } from "@/lib/companion/context";
import { requireDeviceContext } from "@/lib/companion/device-context";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const device = await requireDeviceContext(request);
  if (!device.ok) return jsonResult(device);

  const { id } = await params;
  return jsonResult(await readAnswerView(device.ctx, id));
}
