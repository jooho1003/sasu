// Design Ref: desktop-companion §4 E12 — 웹과 같은 자료 등록 RPC와 오류 문구를 쓴다.
import { supportedDocumentExtension } from "@/lib/adapters/document";
import { jsonResult, type Result } from "@/lib/companion/context";
import { requireDeviceContext } from "@/lib/companion/device-context";
import { ReviewCreate } from "@/lib/contracts";
import { reviewError } from "@/lib/reviews";

function failed<T>(status: number, code: string, error: string): Result<T> {
  return { ok: false, status, code, error };
}

function mappedReviewFailure<T>(error: unknown): Result<T> {
  const mapped = reviewError(error);
  const code =
    mapped.status === 403
      ? "lead_only"
      : mapped.status === 409
        ? "review_conflict"
        : mapped.status === 422
          ? "invalid_input"
          : "review_failed";
  return failed(mapped.status, code, mapped.error);
}

export async function POST(request: Request) {
  const device = await requireDeviceContext(request);
  if (!device.ok) return jsonResult(device);

  const input = ReviewCreate.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success) {
    return jsonResult(
      failed(
        400,
        "invalid_input",
        "파일 정보·동의·지원 한도를 확인해 주세요.",
      ),
    );
  }
  if (
    input.data.kind === "document" &&
    (!supportedDocumentExtension(input.data.filename) ||
      input.data.size > 20 * 1024 * 1024)
  ) {
    return jsonResult(
      failed(
        400,
        "invalid_input",
        "20메가바이트 이하 .txt 파일, .md 파일, .csv 파일, .json 파일, .pdf 파일, .docx 파일를 선택해 주세요.",
      ),
    );
  }
  if (
    input.data.kind === "audio" &&
    (input.data.size > 50 * 1024 * 1024 || input.data.duration === null || input.data.duration > 30 * 60)
  ) {
    return jsonResult(
      failed(
        400,
        "invalid_input",
        "음성은 50메가바이트와 30분 이하만 올릴 수 있습니다.",
      ),
    );
  }

  const created = await device.ctx.client.rpc("create_review", {
    p_dept: device.ctx.deptId,
    p_input: input.data,
  });
  if (created.error) return jsonResult(mappedReviewFailure(created.error));
  if (typeof created.data !== "string") {
    return jsonResult(
      failed(
        500,
        "review_failed",
        "자료를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      ),
    );
  }

  return jsonResult({ ok: true, status: 201, body: { id: created.data } });
}
