// Design Ref: desktop-companion §4 E10 — 결정 권한·멱등은 웹 공용 함수를 사용한다.
import { decideCard, type DecideBody } from "@/lib/card-decide";
import { jsonResult, type Result } from "@/lib/companion/context";
import { requireDeviceContext } from "@/lib/companion/device-context";

function invalidInput(): Result<never> {
  return {
    ok: false,
    status: 400,
    error: "요청 형식이 올바르지 않습니다.",
    code: "invalid_input",
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const device = await requireDeviceContext(request);
  if (!device.ok) return jsonResult(device);

  let body: DecideBody;
  try {
    body = (await request.json()) as DecideBody;
  } catch {
    return jsonResult(invalidInput());
  }

  const { id } = await params;
  return jsonResult(await decideCard(device.ctx, id, body));
}
