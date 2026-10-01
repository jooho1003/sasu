// Design Ref: desktop-companion §4 E13 — RLS 조회 뒤 기존 구간 작업을 예약한다.
import { jsonResult, type Result } from "@/lib/companion/context";
import { requireDeviceContext } from "@/lib/companion/device-context";
import { CompanionReviewPartInput } from "@/lib/contracts";
import { kickWorker } from "@/lib/jobs";
import { registerReviewHandlers } from "@/lib/pipeline/review-material";
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const device = await requireDeviceContext(request);
  if (!device.ok) return jsonResult(device);

  const input = CompanionReviewPartInput.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success) {
    return jsonResult(
      failed(400, "invalid_input", "변환 구간을 확인해 주세요."),
    );
  }

  const { id } = await params;
  const review = await device.ctx.client
    .from("reviewed_materials")
    .select("id")
    .eq("id", id)
    .eq("dept_id", device.ctx.deptId)
    .maybeSingle<{ id: string }>();
  if (review.error) {
    return jsonResult(
      failed(
        500,
        "review_failed",
        "자료를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      ),
    );
  }
  if (!review.data) {
    return jsonResult(
      failed(404, "not_found", "자료를 찾을 수 없습니다."),
    );
  }

  const queued = await device.ctx.client.rpc("queue_review_part", {
    p_review: id,
    p_index: input.data.index,
  });
  if (queued.error) return jsonResult(mappedReviewFailure(queued.error));
  if (typeof queued.data !== "string") {
    return jsonResult(
      failed(
        500,
        "review_failed",
        "자료를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      ),
    );
  }

  registerReviewHandlers();
  kickWorker();
  return jsonResult({
    ok: true,
    status: 202,
    body: { job_id: queued.data },
  });
}
