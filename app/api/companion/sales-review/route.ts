// Design Ref: desktop-companion §4 E15 — only AG-07's four selected current sources start work.
import { jsonResult, type Result } from "@/lib/companion/context";
import { requireDeviceContext } from "@/lib/companion/device-context";
import { SalesSourceReviewRequest } from "@/lib/contracts";
import { startSalesSourceReview } from "@/lib/sales-source-review-start";

function invalidInput(): Result<never> {
  return { ok: false, status: 400, code: "invalid_input", error: "서로 다른 원문 4건과 요청 번호를 확인해 주세요." };
}

export async function POST(request: Request) {
  const device = await requireDeviceContext(request);
  if (!device.ok) return jsonResult(device);
  const input = SalesSourceReviewRequest.safeParse(await request.json().catch(() => null));
  if (!input.success) return jsonResult(invalidInput());
  return jsonResult(await startSalesSourceReview(device.ctx, input.data));
}
