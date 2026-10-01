// Design Ref: desktop-companion §4 E06 — 질문 저장과 작업 시작은 웹 공용 함수를 쓴다.
import { startAsk } from "@/lib/ask-start";
import { jsonResult, type Result } from "@/lib/companion/context";
import { requireDeviceContext } from "@/lib/companion/device-context";
import { AskQuestionInput } from "@/lib/contracts";

function invalidInput(): Result<never> {
  return {
    ok: false,
    status: 400,
    error: "질문을 5자 이상 입력해 주세요.",
    code: "invalid_input",
  };
}

export async function POST(request: Request) {
  const device = await requireDeviceContext(request);
  if (!device.ok) return jsonResult(device);

  const input = AskQuestionInput.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success) return jsonResult(invalidInput());

  return jsonResult(await startAsk(device.ctx, input.data));
}
