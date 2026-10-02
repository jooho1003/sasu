// Design Ref: desktop-companion §4 E11 — 4MB 요청 경계 뒤 웹 공용 전사 수집을 사용한다.
import { jsonResult, type Result } from "@/lib/companion/context";
import { requireDeviceContext } from "@/lib/companion/device-context";
import { CompanionTranscriptMeta } from "@/lib/contracts";
import { ingestTranscript } from "@/lib/transcript-upload";

const MAX_COMPANION_TRANSCRIPT_BYTES = 4 * 1024 * 1024;

function failed<T>(status: number, code: string, error: string): Result<T> {
  return { ok: false, status, code, error };
}

function tooLarge(): Result<never> {
  return failed(
    413,
    "too_large",
    "받아쓴 글 파일은 4메가바이트 이하이어야 합니다.",
  );
}

export async function POST(request: Request) {
  const device = await requireDeviceContext(request);
  if (!device.ok) return jsonResult(device);

  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    /^\d+$/u.test(contentLength) &&
    Number(contentLength) > MAX_COMPANION_TRANSCRIPT_BYTES
  ) {
    return jsonResult(tooLarge());
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonResult(
      failed(400, "invalid_input", "받아쓴 글 파일을 선택해 주세요."),
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonResult(
      failed(400, "invalid_input", "받아쓴 글 파일을 선택해 주세요."),
    );
  }
  if (file.size > MAX_COMPANION_TRANSCRIPT_BYTES) {
    return jsonResult(tooLarge());
  }

  const titleValue = form.get("title");
  const visibilityValue = form.get("visibility");
  const meta = CompanionTranscriptMeta.safeParse({
    title:
      typeof titleValue === "string" && titleValue.trim()
        ? titleValue
        : file.name,
    visibility: visibilityValue === null ? "dept" : visibilityValue,
  });
  if (!meta.success) {
    return jsonResult(
      failed(400, "invalid_input", "받아쓴 글 정보를 확인해 주세요."),
    );
  }

  return jsonResult(await ingestTranscript(device.ctx, file, meta.data));
}
